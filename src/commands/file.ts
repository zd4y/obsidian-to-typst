import { ObsidianVault } from "../obsidianVault.js";
import { obsidianFileToTypstString, printTypst } from "../ofmToTypst.js";
import type { Template } from "liquidjs";

export type FileCommandOptions = {
  path: string;
  frontmatterTemplate?: Template[];
};

export async function runFileCommand({
  path,
  frontmatterTemplate,
}: FileCommandOptions) {
  const obsidianVault = await ObsidianVault.getForNote(path);
  const result = await obsidianFileToTypstString(
    obsidianVault,
    path,
    frontmatterTemplate,
  );
  console.error("done");
  printTypst(result);
}
