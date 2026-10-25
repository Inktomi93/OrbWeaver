// Voice assignment needs semantic review; exact opening text and location keep an adjudicated choice on its intended element.
import type { Codemod, Edit, GetSelector, RuleConfig } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { readFileSync } from "fs";
import { join, relative } from "path";

interface Replacement {
  readonly file: string;
  readonly line: number;
  readonly before: string;
  readonly after: string;
}

const OPENING: RuleConfig<TSX> = { rule: { any: [{ kind: "jsx_opening_element" }, { kind: "jsx_self_closing_element" }] } };
export const getSelector: GetSelector<TSX> = () => OPENING;

function replacements(file: string): Replacement[] {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error("Voice map must be an array of adjudicated openings");
  }
  return parsed.map((row: unknown) => {
    if (row === null || typeof row !== "object") {
      throw new Error("Voice map entry must be an object");
    }
    const entry = row as Record<string, unknown>;
    const { file: source, line, before, after } = entry;
    if (typeof source !== "string" || typeof line !== "number" || typeof before !== "string" || typeof after !== "string") {
      throw new Error("Voice map entry needs file, line, before and after");
    }
    return { file: source, line, before, after };
  });
}

const codemod: Codemod<TSX> = (root, options) => {
  const file = relative(options.targetDir, root.filename());
  const rows = replacements(join(options.targetDir, options.params["map"] ?? "codemod-voice-map.json")).filter((row) => row.file === file);
  const edits: Edit[] = [];
  for (const node of options.matches ?? root.root().findAll(OPENING)) {
    const row = rows.find((entry) => entry.line === node.range().start.line + 1 && entry.before === node.text());
    if (row !== undefined) {
      edits.push(node.replace(row.after));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : root.root().commitEdits(edits));
};

export default codemod;
