// Rewrites a relative module specifier that climbs two or more directories inside a package's `src` to that package's
// `#src/<path>` subpath import. A target outside the importer's own `src` root keeps its relative spelling.

import type { Codemod, Edit, GetSelector, RuleConfig } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { dirname, join, normalize } from "path";

const DEEP_SPECIFIER: RuleConfig<TS> = {
  rule: {
    kind: "string",
    regex: String.raw`^["'](?:\.\./){2,}`,
    any: [
      { inside: { kind: "import_statement" } },
      { inside: { kind: "export_statement" } },
      { inside: { kind: "arguments", inside: { kind: "call_expression", has: { field: "function", kind: "import" } } } },
    ],
  },
};

/** Every static or dynamic module specifier that starts two directories up. */
export const getSelector: GetSelector<TS> = () => DEEP_SPECIFIER;

// The package `src` root that holds a repository-relative path, or null when the path is in no package's `src`.
const SRC_ROOT = /^(?:.*\/)?packages\/[^/]+\/src\//u;

const codemod: Codemod<TS> = (root, options) => {
  const file = root.relativeFilename().replaceAll("\\", "/");
  const srcRoot = SRC_ROOT.exec(file)?.[0];
  if (srcRoot === undefined) {
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const edits: Edit[] = [];
  for (const specifier of options.matches ?? rootNode.findAll(DEEP_SPECIFIER)) {
    const text = specifier.text();
    const quote = text[0] ?? '"';
    const target = normalize(join(dirname(file), text.slice(1, -1))).replaceAll("\\", "/");
    if (target.startsWith(srcRoot)) {
      edits.push(specifier.replace(`${quote}#src/${target.slice(srcRoot.length)}${quote}`));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
