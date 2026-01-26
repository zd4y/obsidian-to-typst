import type { MappedOption } from "../cliUtils.js";
import { ObsidianVault, type Note } from "../obsidianVault.js";
import { processNotes } from "./shared.js";
import type { CommandOptions } from "./shared.js";

type FolderCommandOptions = CommandOptions & {
  folders: string[];
};

export async function runFolderCommand(options: FolderCommandOptions) {
  const obsidianVault = await ObsidianVault.newFromVaultPath(options.vault);
  const notes = (
    await Promise.all(
      options.folders.map(obsidianVault.findNotesByFolder.bind(obsidianVault)),
    )
  ).flat();
  const getters = {
    titleField: makeMappedOptionGetter(options.titleField),
    titleTemplate: makeMappedOptionGetter(options.titleTemplate),
    frontmatterTemplate: makeMappedOptionGetter(options.frontmatterTemplate),
  };
  await processNotes(obsidianVault, notes, options, getters);
}

function makeMappedOptionGetter<T>(map: MappedOption<T>) {
  return (note: Note) => {
    if (!note.foundInDir) {
      throw new Error(`unexpected error`);
    }
    return map[note.foundInDir];
  };
}
