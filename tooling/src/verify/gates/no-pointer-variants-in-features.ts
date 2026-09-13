import { defineGate } from "../contract/policy.ts";
import { readUiTierFacts, tierOccurrences, uiTierPermissionFact } from "../lib/ui-tier-permissions.ts";

export const gate = defineGate({
  id: "no-pointer-variants-in-features",
  family: "ui-pointer-capability-tier",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "entire-population",
  facts: [uiTierPermissionFact],
  resources: [],
  message: "pointer/hover capability variant in a feature string — device capability lives at the token or shell layer.",
  fix: "Compose a pointer-conditional token or shared component constant. A deliberate outside occurrence requires an exact @orb-waive no-pointer-variants-in-features(<class token>): <reason> marker.",
  create: (ctx) => ({
    evaluate: () => {
      for (const hit of tierOccurrences(readUiTierFacts(ctx), "pointer-capability", null)) {
        ctx.report.node(hit.node, { token: hit.token, offset: hit.offset });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const x = <div className="pointer-coarse:hidden" />;' },
      expect: { token: "pointer-coarse:hidden" },
      why: "pointer capability variant outside shell",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.ts": 'export const x = "[@media(hover:hover)]:block";' },
      expect: { token: "[@media" },
      why: "arbitrary capability media variant in any static feature string",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const x = <div className="hover:block pointer-events-none" />;' },
      why: "interaction state and pointer-events utility are not capability queries",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/x.tsx":
          '// @orb-waive no-pointer-variants-in-features(pointer-coarse:hidden): reviewed local exception until this fixture changes.\nexport const x = <div className="pointer-coarse:hidden" />;',
      },
      why: "ordinary exact-token waiver remains available outside shell",
    },
  ],
});
