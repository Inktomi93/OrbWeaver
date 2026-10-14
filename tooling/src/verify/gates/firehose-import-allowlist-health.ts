// A renamed or moved firehose declaration cannot silently retire the D162 name-keyed boundary, which is the
// `orb/firehose-import-allowlist` selector in eslint.config.js.
import { defineGate } from "../contract/policy.ts";
import { FIREHOSE_SYMBOL, firehoseImportFact } from "../lib/firehose-import-fact.ts";

export const gate = defineGate({
  id: "firehose-import-allowlist-health",
  family: "firehose-import-allowlist-health",
  authority: "hard",
  severity: "error",
  population: ["@server"],
  analysis: "types",
  execution: "entire-population",
  facts: [firehoseImportFact],
  resources: [],
  message: `\`${FIREHOSE_SYMBOL}\` is no longer declared at the canonical chat-events-bus home; the D162 policy is now blind. (tooling/src/verify/gates/GATE-AUTHORING.md)`,
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
    {
      mode: "types",
      files: { "packages/server/src/transport/trpc/chat-events-bus.ts": `export const ${FIREHOSE_SYMBOL} = 0;\n` },
      expect: { count: 1 },
      why: "a same-named non-callable export leaves the operation boundary blind",
    },
    {
      mode: "types",
      files: { "packages/server/src/transport/trpc/chat-events-bus.ts": `function ${FIREHOSE_SYMBOL}(): void {}\nexport const unrelated = 1;\n` },
      expect: { count: 1 },
      why: "a private same-named function cannot be imported through the canonical door",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "packages/server/src/transport/trpc/chat-events-bus.ts": `export function ${FIREHOSE_SYMBOL}(): void {}\n` },
      why: "the exact top-level declaration remains at its canonical home",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/chat-events-bus.ts": `function createBus() { return { ${FIREHOSE_SYMBOL}(): void {} }; }\nconst bus = createBus();\nexport const ${FIREHOSE_SYMBOL} = bus.${FIREHOSE_SYMBOL};\n`,
      },
      why: "the canonical callable export may project the real factory-owned producer",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/chat-events-bus.ts": `const operation = (): void => {};\nexport { operation as ${FIREHOSE_SYMBOL} };\n`,
      },
      why: "the module export table owns the public name, not the local declaration spelling",
    },
  ],
});
