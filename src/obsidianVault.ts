import fs, { glob } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export type Note = {
  path: string;
  foundInDir?: string;
  frontmatterData: Record<string, any>;
};

export class ObsidianVault {
  vaultPath = "";
  attachmentsPath = "";
  templatesFolderPath: string | null = null;

  static async getForNote(notePath: string): Promise<ObsidianVault> {
    return getVaultPath(notePath).then(ObsidianVault.newFromVaultPath);
  }

  static async newFromVaultPath(vaultPath: string): Promise<ObsidianVault> {
    const [attachmentsPath, templatesFolderPath] = await Promise.all([
      getAttachmentsPath(vaultPath),
      getTemplatesFolderPath(vaultPath),
    ]);

    const vault = new ObsidianVault();
    vault.vaultPath = vaultPath;
    vault.attachmentsPath = attachmentsPath;
    vault.templatesFolderPath = templatesFolderPath;
    return vault;
  }

  getAttachmentPath(
    obsidianUrl: string,
    { absolute }: { absolute: boolean } = { absolute: false },
  ): string {
    let absolutePath = path.join(this.attachmentsPath, obsidianUrl);
    if (obsidianUrl.includes("/")) {
      absolutePath = path.join(this.vaultPath, obsidianUrl);
    }
    if (absolute) {
      return absolutePath;
    }
    return path
      .relative(this.vaultPath, absolutePath)
      .split(path.sep)
      .join("/");
  }

  getNoteAbsolutePath(obsidianUrl: string): string {
    return path.join(this.vaultPath, `${obsidianUrl}.md`);
  }

  async findNotesByTag(tags: string[]): Promise<Note[]> {
    return this.findNotesWithFilter("**/*.md", (data) => {
      if (!data.tags) {
        return false;
      }

      if (typeof data.tags === "string") {
        return tags.includes(data.tags);
      } else if (Array.isArray(data.tags)) {
        return data.tags.some((tag) => tags.includes(tag));
      } else {
        throw `unknown data.tags type: ${data.tags}`;
      }
    });
  }

  async findNotesByFolder(folderPath: string): Promise<Note[]> {
    // Normalize the folder path (handle both forward slashes and backslashes)
    const normalizedFolderPath = folderPath
      .split(/[/\\]/)
      .filter(Boolean)
      .join("/");
    // Construct glob pattern to match files in the folder and its subfolders
    const globPattern = `${normalizedFolderPath}/**/*.md`;

    return this.findNotesWithFilter(globPattern, () => true).then((notes) =>
      notes.map((note: Note) => ({
        ...note,
        foundInDir: folderPath,
      })),
    );
  }

  private getExcludeDirectories(): string[] {
    const excludeDirectories = [
      ".obsidian",
      ".git",
      ".stfolder",
      this.attachmentsPath,
    ];
    if (this.templatesFolderPath) {
      excludeDirectories.push(this.templatesFolderPath);
    }
    return excludeDirectories;
  }

  private async findNotesWithFilter(
    globPattern: string,
    filter: (data: Record<string, any>, entryPath: string) => boolean,
  ): Promise<Note[]> {
    const result = [];
    const excludeDirectories = this.getExcludeDirectories();

    for await (const entry of glob(globPattern, {
      cwd: this.vaultPath,
      exclude: excludeDirectories,
    })) {
      const entryPath = path.join(this.vaultPath, entry);
      const content = (await fs.readFile(entryPath)).toString();
      const { data: frontmatterData } = matter(content);

      if (!filter(frontmatterData, entryPath)) {
        continue;
      }

      result.push({
        path: entryPath,
        frontmatterData,
      });
    }
    return result;
  }
}

async function getVaultPath(notePath: string) {
  const dir = path.resolve(path.dirname(notePath));
  return searchVaultPath(dir, 0);
}

async function getAttachmentsPath(vaultPath: string): Promise<string> {
  const settingsPath = path.join(vaultPath, ".obsidian", "app.json");
  const settings = JSON.parse((await fs.readFile(settingsPath)).toString());
  if (settings.attachmentFolderPath) {
    return path.join(vaultPath, settings.attachmentFolderPath);
  }
  return vaultPath;
}

async function getTemplatesFolderPath(
  vaultPath: string,
): Promise<string | null> {
  const templatesConfigPath = path.join(
    vaultPath,
    ".obsidian",
    "templates.json",
  );
  let templatesConfig: { folder?: string };
  try {
    templatesConfig = JSON.parse(
      (await fs.readFile(templatesConfigPath)).toString(),
    );
  } catch {
    return null;
  }
  if (templatesConfig.folder) {
    return path.join(vaultPath, templatesConfig.folder);
  }
  return null;
}

async function searchVaultPath(
  dirAbsolutePath: string,
  depth: number,
): Promise<string> {
  if (depth > 10) {
    throw "reached maximum depth, obsidian vault not found. Is your note inside an obsidian vault?";
  }
  const possibleVaultPath = path.join(dirAbsolutePath, ".obsidian");
  try {
    await fs.access(possibleVaultPath);
  } catch {
    const parent = path.dirname(dirAbsolutePath);
    return searchVaultPath(parent, depth + 1);
  }
  return dirAbsolutePath;
}
