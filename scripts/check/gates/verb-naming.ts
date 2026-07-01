// Gate: verb-naming (core/Core-0-Architecture-and-Structure.md §4/§7) — one verb per file, named for the file. Each
// domain/<f>/verbs/**/<verb>.ts must export `create<Pascal(verb)>(ctx, deps?)` (e.g. create.ts →
// createCreate, bulk-archive.ts → createBulkArchive). index.ts barrels are exempt.
import type { Check, Violation } from "../harness.ts";

const VERB_FILE =
  /\/packages\/server\/src\/domain\/[^/]+\/(?:[^/]+\/)*verbs\/(?:[^/]+\/)*[^/]+\.ts$/u;

function pascal(kebab: string): string {
  return kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

export const verbNaming: Check = {
  name: "verb-naming",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!VERB_FILE.test(path)) {
        continue;
      }
      const base = sf.getBaseNameWithoutExtension();
      if (base === "index") {
        continue;
      }
      const expected = `create${pascal(base)}`;
      const exports = sf.getExportedDeclarations();
      if (!exports.has(expected)) {
        const found = [...exports.keys()].join(", ");
        violations.push({
          file: relPath(root, path),
          line: 0,
          message: `verb file must export ${expected}(ctx, deps?) — one verb per file, named for the file (§4/§7). Exports found: ${found.length > 0 ? found : "(none)"}.`,
        });
      }
    }
    return violations;
  },
};
