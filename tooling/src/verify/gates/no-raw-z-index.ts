import { defineGate } from "../contract/policy.ts";
import { readUiTierFacts, tierOccurrences, uiTierPermissionFact } from "../lib/ui-tier-permissions.ts";

export const gate = defineGate({
  id: "no-raw-z-index",
  family: "ui-z-index-tier",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [uiTierPermissionFact],
  resources: [],
  message: "raw z-N or unknown semantic z-index outside the reviewed implementation tier — use a governed z-(--z-*) token.",
  fix: "Use a governed semantic z-index token. A deliberate outside occurrence requires an exact @orb-waive no-raw-z-index(<reported token>): <reason> marker.",
  create: (ctx) => ({
    evaluate: () => {
      for (const hit of tierOccurrences(readUiTierFacts(ctx), "z-index", null)) {
        ctx.report.node(hit.node, { token: hit.token, offset: hit.offset });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/test.tsx": 'const x = <div className="z-50" />;' },
      expect: { token: '"z-50"' },
      why: "raw class outside a reviewed home",
    },
    {
      mode: "source",
      files: { "packages/ui/src/lib/x.ts": 'export const X = "z-(--z-sticky)";' },
      expect: { token: "z-" },
      why: "unknown semantic class remains self-identifying outside class carriers",
    },
  ],
  mustPass: [
    { mode: "source", files: { "packages/client/src/x.ts": 'export const note = "z-50";' }, why: "ambiguous raw spelling outside a class carrier" },
    {
      mode: "source",
      files: {
        "packages/client/src/x.tsx":
          '// @orb-waive no-raw-z-index("z-50"): reviewed local exception until this fixture changes.\nconst x = <div className="z-50" />;',
      },
      why: "ordinary exact-position waiver remains available outside homes",
    },
  ],
});
