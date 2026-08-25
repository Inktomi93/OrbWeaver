// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are TS fixture snippets
// (verb-file exports), not secrets.
// Gate: verb-naming (Core-0 §4/§7) — a verb file exports a callable runtime create<Pascal(base)>.
// COMMENT POSTURE: comment-SAFE — exported AST declarations and callable initializers only.
// domain/<f>/verbs/**/<verb>.ts must export `create<Pascal(verb)>(ctx, deps?)` (e.g. create.ts →
// createCreate, bulk-archive.ts → createBulkArchive). index.ts barrels are exempt.
import { Node } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { unwrapExpression } from "../lib/ast-read.ts";

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

function isCallableRuntimeExport(sf: Parameters<NonNullable<GateDescriptor["visitFile"]>>[0], name: string): boolean {
  return (sf.getExportedDeclarations().get(name) ?? []).some((declaration) => {
    if (Node.isFunctionDeclaration(declaration)) {
      return true;
    }
    if (!Node.isVariableDeclaration(declaration)) {
      return false;
    }
    const initializer = declaration.getInitializer();
    if (initializer === undefined) {
      return false;
    }
    const value = unwrapExpression(initializer);
    return Node.isArrowFunction(value) || Node.isFunctionExpression(value) || value.getType().getCallSignatures().length > 0;
  });
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
    if (!isCallableRuntimeExport(sf, expected)) {
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
    {
      files: "export type createStartChat = () => void;\n",
      at: "packages/server/src/domain/chat/verbs/start-chat.ts",
      why: "a type-only export has the expected spelling but provides no callable runtime verb factory",
    },
    {
      files: "export const createStartChat = 1;\n",
      at: "packages/server/src/domain/chat/verbs/start-chat.ts",
      why: "a non-callable runtime constant has the expected spelling but is not a verb factory",
    },
    {
      files: "export const createStartChat: () => void = 1 as never;\n",
      at: "packages/server/src/domain/chat/verbs/start-chat.ts",
      why: "a callable annotation cannot turn a non-callable runtime initializer into a verb factory — judge the value that will execute, not its declared call signature",
    },
  ],
  mustPass: [
    {
      files: "export const createStartChat = (ctx: unknown) => ctx;\n",
      at: "packages/server/src/domain/chat/verbs/start-chat.ts",
      why: "the verb file exports create<Pascal(base)> = createStartChat — the sanctioned shape, passes",
    },
    {
      files: "function buildStartChat() { return () => undefined; }\nexport const createStartChat = buildStartChat;\n",
      at: "packages/server/src/domain/chat/verbs/start-chat.ts",
      why: "a runtime alias whose initializer resolves to a callable value remains a sanctioned verb factory",
    },
    {
      files: 'export { createStartChat } from "./start-chat";\n',
      at: "packages/server/src/domain/chat/verbs/index.ts",
      why: "an index.ts barrel in a verbs/ dir is exempt (base === 'index') — passes without a create<Pascal> export",
    },
  ],
};
