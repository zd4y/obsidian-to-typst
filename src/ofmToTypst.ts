import fs from "node:fs/promises";
import path from "node:path";
import remarkOfm from "@moritzrs/remark-ofm";
import type { Root, RootContent } from "mdast";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import matter from "gray-matter";
import type { ObsidianVault } from "./obsidianVault.js";
import { Liquid, type Template } from "liquidjs";

export const liquidEngine = new Liquid();

export async function obsidianFileToTypstString(
  obsidianVault: ObsidianVault,
  path: string,
  frontmatterTemplate?: Template[],
) {
  const content = await fs.readFile(path, "utf8");
  return obsidianStringToTypst(obsidianVault, content, frontmatterTemplate);
}

async function obsidianStringToTypst(
  obsidianVault: ObsidianVault,
  content: string,
  frontmatterTemplate?: Template[],
): Promise<string> {
  // Extract frontmatter data
  const { data: frontmatterData, content: contentWithoutFrontmatter } = matter(content);

  // Render frontmatter template if provided
  let renderedFrontmatterTemplate = "";
  if (frontmatterTemplate) {
    renderedFrontmatterTemplate = await liquidEngine.render(
      frontmatterTemplate,
      frontmatterData,
    );
    renderedFrontmatterTemplate += "\n"
  }

  const root = remark().use(remarkGfm).use(remarkOfm).parse(contentWithoutFrontmatter);

  if (root.type !== "root") {
    throw "unexpected";
  }

  const state: NodeToTypstStringState = {
    acc: renderedFrontmatterTemplate,
    obsidianVault,
  };
  await nodeToTypstString(root, state);
  return state.acc;
}

type NodeToTypstStringState = {
  acc: string;
  insideList?: "ordered" | "unordered";
  obsidianVault: ObsidianVault;
};

async function nodeToTypstString(
  node: RootContent | Root,
  state: NodeToTypstStringState,
) {
  switch (node.type) {
    case "root":
    case "paragraph": {
      for (const childNode of node.children) {
        await nodeToTypstString(childNode, state);
      }
      state.acc += "\n\n";
      break;
    }
    case "text": {
      state.acc += node.value.replaceAll("$", "\\$");
      break;
    }
    case "link": {
      if (node.title !== null) {
        throw "unimplemented: link title";
      }
      state.acc += `#link("${node.url}")`;
      if (node.children.length > 0) {
        state.acc += "[";
        for (const childNode of node.children) {
          await nodeToTypstString(childNode, state);
        }
        state.acc += "]";
      }
      break;
    }
    case "heading": {
      state.acc += "=".repeat(node.depth);
      state.acc += " ";
      for (const childNode of node.children) {
        await nodeToTypstString(childNode, state);
      }
      state.acc += "\n";
      break;
    }
    case "strong": {
      state.acc += "*";
      for (const childNode of node.children) {
        await nodeToTypstString(childNode, state);
      }
      state.acc += "*";
      break;
    }
    case "code": {
      state.acc += "```";
      state.acc += `${node.lang ?? ""}\n${node.value}\n`;
      state.acc += "```\n\n";
      break;
    }
    case "blockquote": {
      state.acc += "#quote(block:true)[\n";
      for (const childNode of node.children) {
        await nodeToTypstString(childNode, state);
      }
      state.acc += "]\n\n";
      break;
    }
    case "inlineCode": {
      state.acc += "`";
      state.acc += node.value;
      state.acc += "`";
      break;
    }
    case "emphasis": {
      state.acc += "_";
      for (const childNode of node.children) {
        await nodeToTypstString(childNode, state);
      }
      state.acc += "_";
      break;
    }
    case "list": {
      state.insideList = node.ordered ? "ordered" : "unordered";
      for (const childNode of node.children) {
        await nodeToTypstString(childNode, state);
      }
      break;
    }
    case "listItem": {
      if (state.insideList === "ordered") {
        state.acc += "+ ";
      } else if (state.insideList === "unordered") {
        state.acc += "- ";
      } else {
        throw "unexpected";
      }

      for (const childNode of node.children) {
        await nodeToTypstString(childNode, state);
      }
      break;
    }
    case "html": {
      if (node.value === "<br>") {
        state.acc += "\n";
      } else {
        console.error("ignoring html");
      }
      break;
    }
    case "image": {
      if (node.title) {
        throw "unimplemented: node.title";
      }
      const url = state.obsidianVault.getAttachmentPath(node.url);
      state.acc += `#image("${url}"`;
      if (node.alt) {
        state.acc += `, alt: "${node.alt}"`;
      }
      state.acc += ")";
      break;
    }
    case "ofmWikilink": {
      console.error(`warning: ignoring wikilink: ${JSON.stringify(node)}`);
      console.error(
        "warning: ignoring wikilink hash, idk what it is TODO check documentation",
      );
      state.acc += node.value;
      break;
    }
    case "ofmCallout": {
      console.error("ignoring callout kind");
      state.acc += `#quote(block:true)[\n== ${node.title}\n`;
      for (const childNode of node.children) {
        await nodeToTypstString(childNode, state);
      }
      state.acc += "]\n\n";
      break;
    }
    case "ofmWikiembedding": {
      const ext = path.extname(node.url);
      const url = state.obsidianVault.getAttachmentPath(node.url);
      if (ext === "") {
        const embedPath = state.obsidianVault.getNoteAbsolutePath(node.url);
        const embedContent = await obsidianFileToTypstString(
          state.obsidianVault,
          embedPath,
        );
        state.acc += embedContent;
        state.acc += "\n";
      } else if (ext === ".pdf") {
        const absolutePath = state.obsidianVault.getAttachmentPath(node.url, {
          absolute: true,
        });
        let doc = null;
        try {
          doc = await getDocument(absolutePath).promise;
        } catch (err) {
          console.error("error: failed to open pdf:", err);
        }
        if (doc) {
          // Add each page of the pdf, currently only the first page is added
          // see https://github.com/typst/typst/issues/6644
          for (let i = 0; i < doc.numPages; i++) {
            state.acc += `#image("${url}", page: ${i + 1})\n`;
          }
        }
      } else if ([".png", ".jpg", ".jpeg", ".gif", ".svg"].includes(ext)) {
        state.acc += `#image("${url}")`;
      } else {
        console.error(`warning: ignoring unimplemented: embed extension: ${ext}`);
        break;
      }
      break;
    }
    case "table": {
      const colnum = node.align?.length ?? node.children[0]?.children.length;
      if (colnum === undefined) {
        throw "unexpected";
      }
      state.acc += `#table(columns: ${colnum}`;
      if (node.align) {
        const align = node.align.map((alignment) => alignment || "start");
        state.acc += `, align: (${align.join(", ")}),`;
      }
      state.acc += "\n";
      for (const childNode of node.children) {
        await nodeToTypstString(childNode, state);
      }
      state.acc += ")";
      break;
    }
    case "tableRow": {
      for (const childNode of node.children) {
        await nodeToTypstString(childNode, state);
      }
      state.acc += "\n";
      break;
    }
    case "tableCell": {
      state.acc += "[";
      for (const childNode of node.children) {
        await nodeToTypstString(childNode, state);
      }
      state.acc += "], ";
      break;
    }
    case "delete": {
      state.acc += "#strike[";
      for (const childNode of node.children) {
        await nodeToTypstString(childNode, state);
      }
      state.acc += "]";
      break;
    }
    default: {
      console.error(node);
      throw `unimplemented: type ${node.type}`;
    }
  }
}

export function printTypst(s: string) {
  console.log('#set page("us-letter")');
  console.log('#set text(font: "Arial")');
  console.log(s);
}
