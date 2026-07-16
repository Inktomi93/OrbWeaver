// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are TS fixture snippets
// (verb-file exports), not secrets.
// A domain verb file must export create<Pascal(base)>(ctx).
// Gate: verb-naming (core/Core-0-Architecture-and-Structure.md §4/§7) — one verb per file, named for the file. Each
// domain/<f>/verbs/**/<verb>.ts must export `create<Pascal(verb)>(ctx, deps?)` (e.g. create.ts →
// createCreate, bulk-archive.ts → createBulkArchive). index.ts barrels are exempt.
import type { GateDescriptor } from "../contract.ts";

const VERB_FILE = /\/packages\/server\/src\/domain\/[^/]+\/(?:[^/]+\/)*verbs\/(?:[^/]+\/)*[^/]+\.ts$/u;

function pascal(kebab: string): string {
  return kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

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
    {
      files: 'export { createStartChat } from "./start-chat";\n',
      at: "packages/server/src/domain/chat/verbs/index.ts",
      why: "an index.ts barrel in a verbs/ dir is exempt (base === 'index') — passes without a create<Pascal> export",
    },
  ],
};
