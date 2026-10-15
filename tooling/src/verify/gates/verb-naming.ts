// Gate: verb-naming — each server verb module exports the callable create<Pascal(filename)> factory.
// Export and callable identity use the compiler surface; comments and same-spelled types are inert.
//
// FAMILY: a declared SINGLETON under its own id. `lib/ast-read.ts#unwrapExpression` is a shared PRIMITIVE,
// not a family reader, and no sibling policy reads a verb module's exported factory name.
// POPULATION PORT: a CORRECTION. Legacy `scanRoot` was
// `/\/packages\/server\/src\/domain\/[^/]+\/(?:[^/]+\/)*verbs\/(?:[^/]+\/)*[^/]+\.ts$/u` over `/${p}`,
// which admits a verbs BARREL. Re-derived 2026-09-12 over the same 7,537-path compiler-source candidate
// set: 469 legacy vs 458 final, ZERO admitted only by the final and 11 only by legacy — every one a
// `verbs/**/index.ts`. A barrel re-exports factories rather than declaring one, so the legacy predicate
// could only ever have false-positived on them; `notNamed: ["index.ts"]` is that fix — a narrowing with a
// stated reason, not a port.
// LEGACY SHA: (e4eafd1741^) — the conversion's parent.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `verb-naming` descriptor at 4e228d8529520aa26268b17a74e83cd6b4e468bc, the parent of the conversion `e4eafd1741`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,350 harness
// candidates at that tree (`git ls-tree` ∩ `floor/compiler/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 469 and
// final `population` admits 458. legacy − final = 11 `verbs/**/index.ts` barrels — the recorded
// `notNamed: ["index.ts"]` correction. final − legacy = ∅. Controls: inside
// `packages/server/src/domain/admin/verbs/__cbbhr_in_create-user.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

function pascal(kebab: string): string {
  return kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
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
  create: (ctx) => {
    const sources: SourceFile[] = [];
    return {
      visitFile: (sourceFile) => {
        if (ctx.nativeTypes === undefined) {
          throw new Error("native runtime export context is unavailable");
        }
        sources.push(sourceFile);
        ctx.nativeTypes.request({ kind: "runtime-exports", nodes: [sourceFile] });
      },
      evaluate: () => {
        if (ctx.nativeTypes === undefined) {
          throw new Error("native runtime export context is unavailable");
        }
        const exports = ctx.nativeTypes.runtimeExports(sources);
        for (const source of sources) {
          const expected = `create${pascal(source.getBaseNameWithoutExtension())}`;
          const declarations = exports.get(source);
          if (declarations === undefined) {
            throw new Error("native runtime export source is unavailable");
          }
          const callable = declarations.some(
            (entry) =>
              entry.name === expected &&
              (entry.declaration.kind === SyntaxKind.FunctionDeclaration ||
                (entry.declaration.kind === SyntaxKind.VariableDeclaration &&
                  entry.initializer !== null &&
                  (entry.initializer.kind === SyntaxKind.ArrowFunction ||
                    entry.initializer.kind === SyntaxKind.FunctionExpression ||
                    entry.initializer.callable))),
          );
          if (!callable) {
            ctx.report.file(ctx.relativePath(source), { line: 1, column: 1, token: `expected ${expected}` });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "packages/server/src/domain/chat/verbs/start-chat.ts": "export const wrongName = 1;\n" },
      expect: { count: 1, token: "expected createStartChat" },
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
