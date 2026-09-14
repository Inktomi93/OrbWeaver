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
      expect: { count: 1, token: "pointer-coarse:hidden" },
      why: "LEGACY mustFlag[0], ordinary outside arm: pointer capability variant outside shell",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/persona/components/x.tsx": 'export const G = <div className="pointer-fine:group-hover:pointer-events-auto" />;\n',
      },
      expect: { count: 1, token: "pointer-fine:group-hover:pointer-events-auto" },
      why: "LEGACY mustFlag[1], ordinary outside arm: stacked pointer-fine variant",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.ts": 'export const x = "[@media(hover:hover)]:block";' },
      expect: { count: 1, token: "[@media" },
      why: "LEGACY mustFlag[2], ordinary outside arm: arbitrary capability media variant; coordinate narrows to the exact paren-free authored prefix required by the final waiver grammar",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/chat/components/x.tsx": 'export const G = <div className="hover:bg-accent @md:flex-row" />;\n' },
      why: "LEGACY mustPass[1], ordinary outside arm: hover state and a container query are not capability queries",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/rpg/components/x.tsx": 'export const G = <div className="min-w-touch-target min-h-touch-target" />;\n' },
      why: "LEGACY mustPass[0], ordinary outside arm: pointer-conditional tokens remain legal",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/rpg/components/x.tsx": 'export const G = <div className="pointer-events-none pointer-events-auto" />;\n' },
      why: "LEGACY mustPass[2], ordinary outside arm: pointer-events utilities are not capability variants",
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
