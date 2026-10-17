// The z-index singleton checks missing implementation homes; native lint owns occurrences and vocabulary.
// Its complete admitted file list needs no class extraction or special real-tree anchor.
import { defineGate } from "../contract/policy.ts";
import { unresolvedSanctionedHomeKeys } from "../lib/sanctioned-home.ts";
import { Z_INDEX_IMPLEMENTATION_HOMES } from "../lib/z-index-homes.ts";
export const gate = defineGate({
  id: "z-index-tier-health",
  family: "ui-z-index-tier",
  authority: "hard",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: "the z-index implementation home set is unhealthy. (tooling/src/verify/gates/GATE-AUTHORING.md)",
  create: (ctx) => ({
    evaluate: () => {
      const anchor = ctx.files[0];
      if (anchor === undefined) {
        return;
      }
      for (const path of unresolvedSanctionedHomeKeys(ctx.files, ctx.relativePath, Z_INDEX_IMPLEMENTATION_HOMES)) {
        ctx.report.node(anchor, { message: `missing reviewed z-index home: ${path} — UI-Architecture-and-Layout.md` });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/ui/src/x.ts": "export const x = 1;",
        "packages/ui/src/layout/x.ts": "export const l = 1;",
      },
      expect: { count: 1, messageIncludes: "packages/ui/src/markdown/" },
      why: "the markdown implementation home is missing",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/markdown/x.ts": "export const m = 1;",
      },
      expect: { count: 1, messageIncludes: "packages/ui/src/layout/" },
      why: "the layout implementation home is independently missing",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/ui/src/layout/x.ts": "export const l = 1;",
        "packages/ui/src/markdown/x.ts": "export const m = 1;",
      },
      why: "both implementation homes are live without a separate anchor or token resource",
    },
  ],
});
