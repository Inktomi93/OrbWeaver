// The D162 firehose's canonical declaration. The name-keyed import boundary itself is the
// `orb/firehose-import-allowlist` selector in eslint.config.js; this fact is what tells the health policy that
// selector still has a symbol to ban.

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
          declared ||= source.getFunction(FIREHOSE_SYMBOL) !== undefined;
        }
      },
      finish: () => {
        ctx.receipt({ kind: "population", source: "firehose-import-source-files", members: ctx.files.length });
        return { declared };
      },
    };
  },
});
