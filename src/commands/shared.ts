import type { Template } from "liquidjs";
import type { MappedOption } from "../cliUtils.js";
import { ObsidianVault, type Note } from "../obsidianVault.js";
import {
  liquidEngine,
  obsidianFileToTypstString,
  printTypst,
} from "../ofmToTypst.js";
import path from "node:path";

export type CommandOptions = {
  vault: string;
  year?: number;
  sortBy?: string;
  titleField: MappedOption<string>;
  titleTemplate: MappedOption<Template[]>;
  frontmatterTemplate: MappedOption<Template[]>;
};

type MappedOptionGetter<T> = (note: Note) => T | undefined;

export type MappedOptionGetters = {
  titleField: MappedOptionGetter<string>;
  titleTemplate: MappedOptionGetter<Template[]>;
  frontmatterTemplate: MappedOptionGetter<Template[]>;
};

export async function processNotes(
  obsidianVault: ObsidianVault,
  notes: Note[],
  options: CommandOptions,
  getters: MappedOptionGetters,
): Promise<void> {
  if (notes.length == 0) {
    console.error("zero notes found");
    return;
  }

  if (options.year) {
    notes = filterByYear(notes, options.year);
  }

  if (options.sortBy) {
    notes = sort(notes, options.sortBy);
  }

  const result = await generateTypst(obsidianVault, notes, getters);
  printTypst(result);
}

function filterByYear(notes: Note[], year: number): Note[] {
  const dateField = guessDateField(notes[0]!);
  if (!dateField) {
    throw `could not guess the date field`;
  }
  return notes.filter((note) => {
    return note.frontmatterData[dateField].getFullYear() === year;
  });
}

function sort(notes: Note[], sortBy: string): Note[] {
  return notes.sort((a, b) => {
    if (a.frontmatterData[sortBy] < b.frontmatterData[sortBy]) return -1;
    if (a.frontmatterData[sortBy] > b.frontmatterData[sortBy]) return 1;
    return 0;
  });
}

async function generateTypst(
  obsidianVault: ObsidianVault,
  notes: Note[],
  getters: MappedOptionGetters,
): Promise<string> {
  const typstStringPromises = notes.map(async (note: Note) => {
    const frontmatterTemplate = getters.frontmatterTemplate(note);
    const noteTitle = await getNoteTitle(note, getters);
    const typstStr = await obsidianFileToTypstString(
      obsidianVault,
      note.path,
      frontmatterTemplate,
    );
    return `= ${noteTitle}\n` + typstStr;
  });
  const typstStrings = await Promise.all(typstStringPromises);
  return typstStrings.reduce((prev: string, cur: string) => prev + cur, "");
}

function guessDateField(note: Note) {
  const dateFields = [];
  for (let [k, v] of Object.entries(note.frontmatterData)) {
    if (v instanceof Date) {
      dateFields.push(k);
    }
  }
  if (dateFields.length == 0) {
    return null;
  }
  if (dateFields.length > 1) {
    throw "more than one field could be considered a date, could not guess which field to use";
  }
  return dateFields[0];
}

async function getNoteTitle(
  note: Note,
  getters: MappedOptionGetters,
): Promise<string> {
  const titleField = getters.titleField(note);
  const titleTemplate = getters.titleTemplate(note);
  if (titleField && titleTemplate) {
    throw new Error(`found two possible title options for note ${note.path}`);
  }
  if (titleField) {
    const title = note.frontmatterData[titleField];
    if (!title) {
      throw `note does not include title field ${titleField}: ${note.path}`;
    }
    return title;
  }
  if (titleTemplate) {
    // Render the title template with the note's frontmatter data
    return liquidEngine.render(titleTemplate, note.frontmatterData);
  }
  return path.basename(note.path, ".md").replaceAll("$", "\\$");
}
