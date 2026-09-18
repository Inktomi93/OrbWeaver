// A renamed or moved firehose declaration cannot silently retire the D162 name-keyed boundary.
import { defineGate } from "../contract/policy.ts";
import { FIREHOSE_SYMBOL, firehoseImportFact } from "../lib/firehose-import-fact.ts";

export const gate = defineGate({
  id: "firehose-import-allowlist-health",
  family: "firehose-import-allowlist",
  authority: "hard",
  severity: "error",
  population: ["@server"],
  analysis: "types",
  execution: "entire-population",
  facts: [firehoseImportFact],
  resources: [],
  message: `\`${FIREHOSE_SYMBOL}\` is no longer declared at the canonical chat-events-bus home; the D162 policy is now blind.`,
  fix: "retarget the shared firehose vocabulary and canonical home at the renamed declaration, preserving every import, re-export, and namespace arm.",
  create: (ctx) => ({
    evaluate: () => {
      ctx.receipt({ kind: "population", source: "firehose-import-allowlist-health-sources", members: ctx.files.length });
      if (!ctx.fact(firehoseImportFact).declared) {
        const anchor = ctx.files[0];
        if (anchor === undefined) {
          throw new Error("firehose-import-allowlist-health: no admitted source anchor");
        }
        ctx.report.file(ctx.relativePath(anchor), { line: 1 });
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: { "packages/server/src/entry/compose/automation-watcher.ts": "export const x = 1;\n" },
      expect: { count: 1 },
      why: "the canonical firehose declaration disappeared or moved, so every name-keyed arm must fail loud",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "packages/server/src/transport/trpc/chat-events-bus.ts": `export function ${FIREHOSE_SYMBOL}(): void {}\n` },
      why: "the exact top-level declaration remains at its canonical home",
    },
  ],
});
