// UI authored occurrences: variant barrels stay private and SVG geometry uses the governed icon API.
// Topology permissions and overlay health are separate authority owners over the same source fact.
import { defineGate } from "../contract/policy.ts";
import { uiPrimitiveFact } from "../lib/ui-primitive-fact.ts";
import { readUiPrimitiveOccurrences } from "../lib/ui-primitive-structure-read.ts";
export const gate = defineGate({
  id: "ui-primitive-structure",
  family: "ui-primitive",
  authority: "ordinary",
  severity: "error",
  population: "@ui",
  analysis: "syntax",
  execution: "entire-population",
  facts: [uiPrimitiveFact],
  resources: [],
  message: "UI source re-exports private variants or embeds inline SVG outside the chart layer.",
  fix:
    "keep variants imports internal; use the governed Icon component for non-chart SVG geometry. A " +
    "deliberate exception is waived with `// @orb-waive ui-primitive-structure(<position>): <reason>` " +
    "at the exact reported position — the module specifier for a leaked variants barrel, e.g. " +
    "`./variants`, or `svg` for an inline SVG element.",
  create: (ctx) => ({
    evaluate: () => {
      const { sources } = ctx.fact(uiPrimitiveFact);
      ctx.receipt({ kind: "population", source: "ui-primitive-sources", members: ctx.files.length });
      for (const hit of readUiPrimitiveOccurrences(sources)) {
        ctx.report.node(hit.node, { token: hit.token, offset: hit.offset });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/ui/src/primitives/thing/index.ts": 'export * from "./variants";' },
      expect: { count: 1, token: "./variants" },
      why: "a public barrel leaks its private variant constructor",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/thing/thing.tsx": "export const Thing = () => <svg />;" },
      expect: { count: 1, token: "svg" },
      why: "non-chart SVG must use the governed icon API",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/ui/src/charts/thing.tsx": "export const Thing = () => <svg />;" },
      why: "chart geometry is the existing inline-SVG classification",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/thing/index.ts":
          '// @orb-waive ui-primitive-structure(./variants): reviewed pending migration, tracked in #0000.\nexport * from "./variants";',
      },
      why:
        "the §6.2 positive identity arm: the correct marker at the exact reported module-specifier token " +
        "`./variants` suppresses the twin of mustFlag[0] — one finding, one waived, zero effective findings, " +
        "zero authority alarms",
    },
  ],
});
