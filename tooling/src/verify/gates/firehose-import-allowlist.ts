// D162: the unclamped all-chat stream may be named only by the server composition root and its transport
// barrel. Canonical origin prevents a same-name foreign symbol from becoming a false firehose finding;
// exact central grants replace the legacy directory/path allowlist.
import { defineGate } from "../contract/policy.ts";
import { FIREHOSE_SYMBOL, firehoseImportFact } from "../lib/firehose-import-fact.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const OPERATION = "all-chat-firehose-reference";
const MESSAGE =
  `the all-chats firehose \`${FIREHOSE_SYMBOL}\` is importable ONLY by the composition root (entry/compose). It is ` +
  "UNCLAMPED BY TYPE: no chatId, no caller, no per-member history-floor verdict — it fans every room's canon " +
  "`view` payloads and raw `delta` transcript text process-wide. Any per-USER surface fed from it ships a " +
  "join-history leak (D162 — the plugin fan-out precedent).";
const FIX =
  "tail the per-chat stream (`subscribeChatEvents`) behind the member-gated `chatEventBounds` probe, or " +
  "consume the firehose in `entry/compose` and hand your subscriber a HOST-authority injected op. If a new " +
  "server-side, host-authority consumer is genuinely right, wire it at the composition root and review that exact file centrally.";

export const gate = defineGate({
  id: "firehose-import-allowlist",
  family: "firehose-import-allowlist",
  authority: "reviewed-grant",
  severity: "error",
  population: ["@server"],
  analysis: "types",
  execution: "entire-population",
  facts: [firehoseImportFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const { references } = ctx.fact(firehoseImportFact);
      ctx.receipt({ kind: "population", source: "firehose-import-allowlist-sources", members: ctx.files.length });
      reportReviewedGrantCandidates(
        ctx.report,
        references.map(({ node, file, name, unreadable }) => ({
          node,
          subject: file,
          operation: OPERATION,
          unreadable,
          token: name,
          offset: node.getText().indexOf(name),
        })),
        { message: MESSAGE, fix: FIX, unreadableMessage: `${MESSAGE} The named module door could not be resolved, so it fails closed.` },
      );
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/chat-events-bus.ts": `export function ${FIREHOSE_SYMBOL}(): void {}\n`,
        "packages/server/src/domain/buddy/observer.ts": `import { ${FIREHOSE_SYMBOL} } from "../../transport/trpc/chat-events-bus.ts";\nexport const o = ${FIREHOSE_SYMBOL};\n`,
      },
      grant: { subject: "packages/server/src/domain/buddy/observer.ts", operation: OPERATION },
      expect: { count: 1, token: FIREHOSE_SYMBOL },
      why: "a domain tails the canonical unclamped stream through its barrel; the import and later identifier remain one legacy import finding",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/chat-events-bus.ts": `export function ${FIREHOSE_SYMBOL}(): void {}\n`,
        "packages/server/src/infra/relay.ts": `export { ${FIREHOSE_SYMBOL} } from "../transport/trpc/chat-events-bus.ts";\n`,
      },
      grant: { subject: "packages/server/src/infra/relay.ts", operation: OPERATION },
      expect: { count: 1, token: FIREHOSE_SYMBOL },
      why: "a re-export laundering the canonical firehose into a new module remains a named-symbol finding",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/chat-events-bus.ts": `export function ${FIREHOSE_SYMBOL}(): void {}\n`,
        "packages/server/src/domain/hub/observer.ts": `import * as events from "../../transport/trpc/chat-events-bus.ts";\nexport const o = events.${FIREHOSE_SYMBOL};\n`,
      },
      grant: { subject: "packages/server/src/domain/hub/observer.ts", operation: OPERATION },
      expect: { count: 1, token: FIREHOSE_SYMBOL },
      why: "the namespace dot spelling reaches the same canonical firehose despite having no ImportSpecifier",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/chat-events-bus.ts": `export function ${FIREHOSE_SYMBOL}(): void {}\n`,
        "packages/server/src/domain/hub/bracket-observer.ts": `import * as events from "../../transport/trpc/chat-events-bus.ts";\nexport const o = events["${FIREHOSE_SYMBOL}"];\n`,
      },
      grant: { subject: "packages/server/src/domain/hub/bracket-observer.ts", operation: OPERATION },
      expect: { count: 1, token: FIREHOSE_SYMBOL },
      why: "the namespace bracket spelling is the same canonical reference",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/unreadable.ts": `import { ${FIREHOSE_SYMBOL} } from "./missing.ts";\n` },
      grant: { subject: "packages/server/src/domain/unreadable.ts", operation: OPERATION },
      expect: { count: 1, token: FIREHOSE_SYMBOL },
      why: "an unreadable relative named door fails closed instead of laundering the security-sensitive symbol",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/foreign.ts": `export function ${FIREHOSE_SYMBOL}(): void {}\n`,
        "packages/server/src/domain/consumer.ts": `import { ${FIREHOSE_SYMBOL} } from "./foreign.ts";\nexport const x = ${FIREHOSE_SYMBOL};\n`,
      },
      why: "a same-named export outside the canonical chat-events-bus home is a different symbol",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/chat-events-bus.ts": `export function ${FIREHOSE_SYMBOL}(): void {}\n`,
        "packages/server/src/domain/buddy/observer.ts":
          'import { subscribeChatEvents } from "../../transport/trpc/chat-events-bus.ts";\nexport const o = subscribeChatEvents;\n',
      },
      why: "the member-clamped per-chat stream remains legal",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/chat-events-bus.ts": `export function ${FIREHOSE_SYMBOL}(): void {}\n`,
        "packages/server/src/domain/buddy/observer.ts":
          'import * as events from "../../transport/trpc/chat-events-bus.ts";\nexport const o = events.subscribeChatEvents;\n',
      },
      why: "a different namespace member remains outside the exact firehose vocabulary",
    },
  ],
});
