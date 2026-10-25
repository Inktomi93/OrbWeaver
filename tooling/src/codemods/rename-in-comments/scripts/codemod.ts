// Renames exact names inside comments by a map read from the target directory, so prose that cites a renamed
// variable or attribute follows the rename. Code and string literals are untouched; their own codemods own them.

import type { Codemod, Edit, GetSelector, RuleConfig } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_MAP_FILE = "codemod-comment-map.json";

// Every grammar this runs on (TypeScript, TSX, CSS) names its comment node `comment`.
const COMMENT: RuleConfig<TS> = { rule: { kind: "comment" } };

export const getSelector: GetSelector<TS> = () => COMMENT;

function readMap(targetDir: string, mapFile: string): ReadonlyMap<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, mapFile), "utf8"));
  const names = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>)["names"] : undefined;
  if (names === null || typeof names !== "object" || Array.isArray(names)) {
    throw new Error(`${mapFile}: expected { "names": { "old": "new" } }`);
  }
  return new Map(
    Object.entries(names).map(([from, to]) => {
      if (typeof to !== "string") {
        throw new Error(`${mapFile}: names.${from} maps to a non-string`);
      }
      return [from, to] as const;
    }),
  );
}

function escapeRegExp(name: string): string {
  return name.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const codemod: Codemod<TS> = (root, options) => {
  const map = readMap(options.targetDir, options.params["map"] ?? DEFAULT_MAP_FILE);
  // A name matches whole: not inside a longer name on either side.
  const patterns = [...map].map(([from, to]) => [new RegExp(`(?<![\\w-])${escapeRegExp(from)}(?![\\w-])`, "gu"), to] as const);
  const rootNode = root.root();
  const comments = options.matches ?? rootNode.findAll(COMMENT);
  const edits: Edit[] = [];
  for (const comment of comments) {
    const text = comment.text();
    let next = text;
    for (const [pattern, to] of patterns) {
      next = next.replace(pattern, to);
    }
    if (next !== text) {
      edits.push(comment.replace(next));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
