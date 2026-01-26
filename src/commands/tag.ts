import type { MappedOption } from "../cliUtils.js";
import { ObsidianVault, type Note } from "../obsidianVault.js";
import { processNotes } from "./shared.js";
import type { CommandOptions } from "./shared.js";

type TagCommandOptions = CommandOptions & {
  tags: string[];
};

export async function runTagCommand(options: TagCommandOptions) {
  const obsidianVault = await ObsidianVault.newFromVaultPath(options.vault);
  const notes = await obsidianVault.findNotesByTag(options.tags);
  const getters = {
    titleField: makeMappedOptionGetter(options.titleField, "title-field"),
    titleTemplate: makeMappedOptionGetter(
      options.titleTemplate,
      "title-template",
    ),
    frontmatterTemplate: makeMappedOptionGetter(
      options.frontmatterTemplate,
      "frontmatter-template",
    ),
  };
  await processNotes(obsidianVault, notes, options, getters);
}

function makeMappedOptionGetter<T>(map: MappedOption<T>, mapName: string) {
  return (note: Note) => {
    const tags = note.frontmatterData.tags.filter((tag: string) =>
      Object.keys(map).includes(tag),
    );
    if (tags.length > 1) {
      throw `note ${note.path} has two tags and was supplied a ${mapName} for both of them`;
    }
    return map[tags[0]];
  };
}
