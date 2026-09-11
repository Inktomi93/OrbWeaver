// Gate: verb-naming — each server verb module exports the callable create<Pascal(filename)> factory.
// Export and callable identity use the compiler surface; comments and same-spelled types are inert.
import type { SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";

function pascal(kebab: string): string {
  return kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function isCallableRuntimeExport(sourceFile: SourceFile, name: string): boolean {
  return (sourceFile.getExportedDeclarations().get(name) ?? []).some((declaration) => {
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

const MESSAGE =
  "a domain verb file does not export `create<Pascal(filename)>(ctx, deps?)` — one verb per file, named for the file (Core-0-Architecture-and-Structure.md §4/§7).";

export const gate = defineGate({
  id: "verb-naming",
  family: "verb-naming",
  authority: "hard",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/domain/*/**/verbs/**/*.ts"], notNamed: ["index.ts"], ext: ["ts"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "rename the exported factory to `create<Pascal(filename)>` (create.ts → createCreate, bulk-archive.ts → createBulkArchive).",
  create: (ctx) => ({
    visitFile: (sourceFile) => {
      ctx.checker();
      const expected = `create${pascal(sourceFile.getBaseNameWithoutExtension())}`;
      if (!isCallableRuntimeExport(sourceFile, expected)) {
        ctx.report.file(ctx.relativePath(sourceFile), { line: 1, column: 1, token: `expected ${expected}` });
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: { "packages/server/src/domain/chat/verbs/start-chat.ts": "export const wrongName = 1;\n" },
      expect: { token: "expected createStartChat" },
      why: "a verb module exports the wrong runtime name",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/chat/verbs/start-chat.ts": "export type createStartChat = () => void;\n" },
      expect: { count: 1, token: "expected createStartChat" },
      why: "a same-spelled type is not a runtime verb factory",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = 1;\n" },
      expect: { count: 1, token: "expected createStartChat" },
      why: "a non-callable runtime constant is not a verb factory",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat: () => void = 1 as never;\n" },
      expect: { count: 1, token: "expected createStartChat" },
      why: "a callable annotation cannot make the runtime initializer callable",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = (ctx: unknown) => ctx;\n" },
      why: "the module exports the callable factory named for its file",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts":
          "function buildStartChat() { return () => undefined; }\nexport const createStartChat = buildStartChat;\n",
      },
      why: "a stable local alias of a callable runtime value remains a verb factory",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/verbs/index.ts": 'export { createStartChat } from "./start-chat";\n',
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = () => undefined;\n",
      },
      why: "the index barrel carve is declared by population while an admitted legal verb keeps the proof nonempty",
    },
  ],
});
