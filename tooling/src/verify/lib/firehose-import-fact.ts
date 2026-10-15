// The D162 firehose's canonical declaration. The name-keyed import boundary itself is the
// `orb/firehose-import-allowlist` selector in eslint.config.js; this fact is what tells the health policy that
// selector still has a symbol to ban.

import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";

export const FIREHOSE_SYMBOL = "subscribeAllChatEvents";
const FIREHOSE_HOME = "/packages/server/src/transport/trpc/chat-events-bus.ts";

export const firehoseImportFact = defineFact({
  id: "firehose-import",
  population: ["@server"],
  analysis: "types",
  resources: [],
  create: (ctx) => {
    const sources: SourceFile[] = [];
    return {
      visitFile: (source) => {
        if (source.getFilePath().replaceAll("\\", "/").endsWith(FIREHOSE_HOME)) {
          if (ctx.nativeTypes === undefined) {
            throw new Error("native runtime export context is unavailable");
          }
          sources.push(source);
          ctx.nativeTypes.request({ kind: "runtime-exports", nodes: [source] });
        }
      },
      finish: () => {
        let declared = false;
        if (sources.length > 0) {
          if (ctx.nativeTypes === undefined) {
            throw new Error("native runtime export context is unavailable");
          }
          const exports = ctx.nativeTypes.runtimeExports(sources);
          for (const source of sources) {
            const declarations = exports.get(source);
            if (declarations === undefined) {
              throw new Error("native runtime export source is unavailable");
            }
            declared ||= declarations.some(
              (entry) =>
                entry.name === FIREHOSE_SYMBOL &&
                entry.declaration.file === entry.file &&
                (entry.declaration.kind === SyntaxKind.FunctionDeclaration || entry.declaration.kind === SyntaxKind.VariableDeclaration) &&
                entry.callable,
            );
          }
        }
        ctx.receipt({ kind: "population", source: "firehose-import-source-files", members: ctx.files.length });
        return { declared };
      },
    };
  },
});
