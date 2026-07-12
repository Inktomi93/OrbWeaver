// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are TS fixture snippets
// (verb-file exports), not secrets.
// Gate: verb-naming (core/Core-0-Architecture-and-Structure.md §4/§7) — one verb per file, named for the file. Each
// domain/<f>/verbs/**/<verb>.ts must export `create<Pascal(verb)>(ctx, deps?)` (e.g. create.ts →
// createCreate, bulk-archive.ts → createBulkArchive). index.ts barrels are exempt.
import type { GateDescriptor } from "../contract.ts";
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
          message: `verb file must export ${expected}(ctx, deps?) — one verb per file, named for the file (Core-0-Architecture-and-Structure.md §4/§7). Exports found: ${found.length > 0 ? found : "(none)"}.`,
        });
      }
    }
    return violations;
  },
};

// ── SINGLE-PASS CONTRACT FORM (§1.2 — a per-FILE presence gate via visitFile) ──────────────────────
// The legacy predicate as a per-file hook: a domain verb file must export create<Pascal(base)>(ctx). Uses
// the SourceFile's exported-declarations (symbol level — the Program is created lazily on first query, the
// shared checker tax §2.3). File-level finding (line 0). scanRoot mirrors the legacy VERB_FILE. Not
// fsBacked (pure AST). Byte-identical to the legacy Check. Kept ALONGSIDE the legacy Check.
export const gate: GateDescriptor = {
  name: "verb-naming",
  docRow: "core/Core-0-Architecture-and-Structure.md §4/§7",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a domain verb file does not export `create<Pascal(filename)>(ctx, deps?)` — one verb per file, named for the file (Core-0-Architecture-and-Structure.md §4/§7).",
  fix: "rename the exported factory to `create<Pascal(filename)>` (create.ts → createCreate, bulk-archive.ts → createBulkArchive).",
  scanRoot: (p) => VERB_FILE.test(`/${p}`),
  visitFile: (sf, ctx) => {
    const base = sf.getBaseNameWithoutExtension();
    if (base === "index") {
      return;
    }
    const expected = `create${pascal(base)}`;
    if (!sf.getExportedDeclarations().has(expected)) {
      ctx.report({
        file: relPath(ctx.root, sf.getFilePath()),
        line: 0,
        column: 0,
        token: `expected ${expected}`,
      });
    }
  },
  mustFlag: [
    {
      files: "export const wrongName = 1;\n",
      at: "packages/server/src/domain/chat/verbs/start-chat.ts",
      why: "a verb file exporting the wrong name (not createStartChat) — one verb per file, named for it",
    },
  ],
  mustPass: [
    {
      files: "export const createStartChat = (ctx: unknown) => ctx;\n",
      at: "packages/server/src/domain/chat/verbs/start-chat.ts",
      why: "the verb file exports create<Pascal(base)> = createStartChat — the sanctioned shape, passes",
    },
  ],
};
