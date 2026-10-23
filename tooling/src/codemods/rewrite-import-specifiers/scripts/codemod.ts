// Rewrites module specifiers by an exact map, for package moves and door collapses.

import type { Codemod, Edit, GetSelector, RuleConfig } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

// The map lives in the target directory so a directory fixture can carry its own; the sandbox allows that read.
const DEFAULT_MAP_FILE = "codemod-import-map.json";

const MODULE_SPECIFIER: RuleConfig<TS> = {
  rule: {
    kind: "string",
    any: [
      { inside: { kind: "import_statement" } },
      { inside: { kind: "export_statement" } },
      { inside: { kind: "arguments", inside: { kind: "call_expression", has: { field: "function", kind: "import" } } } },
    ],
  },
};

/** Every static or dynamic module specifier; the map decides which ones change. */
export const getSelector: GetSelector<TS> = () => MODULE_SPECIFIER;

function readMap(targetDir: string, mapFile: string): ReadonlyMap<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, mapFile), "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${mapFile}: expected an object of old specifier to new specifier`);
  }
  const entries = Object.entries(parsed).map(([from, to]) => {
    if (typeof to !== "string") {
      throw new Error(`${mapFile}: ${from} maps to a non-string`);
    }
    return [from, to] as const;
  });
  return new Map(entries);
}

const codemod: Codemod<TS> = (root, options) => {
  const map = readMap(options.targetDir, options.params["map"] ?? DEFAULT_MAP_FILE);
  const rootNode = root.root();
  const specifiers = options.matches ?? rootNode.findAll(MODULE_SPECIFIER);
  const edits: Edit[] = [];
  for (const specifier of specifiers) {
    const text = specifier.text();
    const quote = text[0] ?? '"';
    const target = map.get(text.slice(1, -1));
    if (target !== undefined) {
      edits.push(specifier.replace(`${quote}${target}${quote}`));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
