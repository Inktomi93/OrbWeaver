// The D162 firehose's canonical declaration. The name-keyed import boundary itself is the
// `orb/firehose-import-allowlist` selector in eslint.config.js; this fact is what tells the health policy that
// selector still has a symbol to ban.

import { Node } from "ts-morph";
import { inventoryExports } from "../../floor/code-facts/semantic-inventory-reader.ts";
import { defineFact } from "../contract/fact.ts";

export const FIREHOSE_SYMBOL = "subscribeAllChatEvents";
const FIREHOSE_HOME = "/packages/server/src/transport/trpc/chat-events-bus.ts";

export const firehoseImportFact = defineFact({
  id: "firehose-import",
  population: ["@server"],
  analysis: "types",
  resources: [],
  create: (ctx) => {
    let declared = false;
    return {
      visitFile: (source) => {
        if (source.getFilePath().replaceAll("\\", "/").endsWith(FIREHOSE_HOME)) {
          declared ||= (inventoryExports(source).get(FIREHOSE_SYMBOL) ?? []).some(
            (declaration) =>
              declaration.getSourceFile() === source &&
              (Node.isFunctionDeclaration(declaration) || Node.isVariableDeclaration(declaration)) &&
              declaration.getType().getCallSignatures().length > 0,
          );
        }
      },
      finish: () => {
        ctx.receipt({ kind: "population", source: "firehose-import-source-files", members: ctx.files.length });
        return { declared };
      },
    };
  },
});
