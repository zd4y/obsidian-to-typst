import { runFileCommand } from "./commands/file.js";
import { runTagCommand } from "./commands/tag.js";
import { runFolderCommand } from "./commands/folder.js";
import {
  command,
  run,
  string,
  positional,
  option,
  subcommands,
  number,
  optional,
  restPositionals,
  multioption,
} from "cmd-ts";
import {
  ReadFileToTemplate,
  ReadMappedOption,
  ReadMappedOptionToString,
  ReadMappedOptionToTemplateFromString,
} from "./cliUtils.js";

const file = command({
  name: "file",
  description: "convert an obsidian markdown file to typst",
  args: {
    path: positional({
      type: string,
      description: "the markdown file to convert inside an obsidian vault",
    }),
    frontmatterTemplate: option({
      type: optional(ReadFileToTemplate),
      long: "frontmatter-template",
      description:
        "path to a liquid template file that uses frontmatter data to generate typst content",
    }),
  },
  handler: runFileCommand,
});

export const commonOptions = {
  vault: option({
    type: string,
    short: "v",
    long: "vault",
    description: "the path of the obsidian vault",
  }),
  year: option({
    type: optional(number),
    short: "y",
    long: "year",
    description: "filter notes by year",
  }),
  titleField: multioption({
    type: ReadMappedOptionToString,
    long: "title-field",
    description:
      "the field in the frontmatter of each note to use as the title. By default, the file name is used",
  }),
  titleTemplate: multioption({
    type: ReadMappedOptionToTemplateFromString,
    long: "title-template",
    description:
      "a liquid template string to use as the title, rendered with frontmatter data. Cannot be used together with --title-field",
  }),
  sortBy: option({
    type: optional(string),
    long: "sort-by",
    description: "the field to use for sorting the notes",
  }),
  frontmatterTemplate: multioption({
    type: ReadMappedOption(ReadFileToTemplate),
    long: "frontmatter-template",
    description:
      "path to a liquid template file that uses frontmatter data to generate typst content",
  }),
};

const tag = command({
  name: "tag",
  description:
    "create a typst file from all files in the obsidian vault with a given tag",
  args: {
    tags: restPositionals({
      type: string,
      description: "the tag to search for",
    }),
    ...commonOptions,
  },
  handler: runTagCommand,
});

const folder = command({
  name: "folder",
  description:
    "create a typst file from all files in the obsidian vault within a given folder",
  args: {
    folders: restPositionals({
      type: string,
      description:
        "the folder path to search for (e.g., my-folder/my-inner-folder)",
    }),
    ...commonOptions,
  },
  handler: runFolderCommand,
});

const app = subcommands({
  name: "obsidian-to-typst",
  cmds: { file, tag, folder },
});

run(app, process.argv.slice(2)).catch((err) => {
  console.error(`Error: ${err}`);
});
