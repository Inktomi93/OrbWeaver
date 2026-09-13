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
      why: "LEGACY mustFlag[0], ordinary outside arm: raw z-index className outside a reviewed home",
    },
    {
      mode: "source",
      files: { "packages/client/src/test.tsx": 'const y = cn("z-[60]");' },
      expect: { token: '"z-[60]"' },
      why: "LEGACY mustFlag[1], ordinary outside arm: raw z-index in a known class composer",
    },
    {
      mode: "source",
      files: { "packages/client/src/test.tsx": 'const x = <div className="z-(--z-sticky)" />;' },
      expect: { token: "z-" },
      why: "LEGACY mustFlag[2], ordinary outside arm: unknown semantic z token; coordinate narrows to the exact paren-free authored prefix required by the final waiver grammar",
    },
    {
      mode: "source",
      files: { "packages/ui/src/lib/x.ts": 'export const X = "z-(--z-sticky)";' },
      expect: { token: "z-" },
      why: "LEGACY mustFlag[3], ordinary outside arm: unknown semantic class remains self-identifying outside class carriers; coordinate narrows to the final paren-free prefix",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/lib/release-label.ts": 'export const RELEASE_LABEL = "z-50";' },
      why: "LEGACY mustPass[0], ordinary outside arm: ambiguous raw spelling outside a class carrier",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/test.tsx":
          'const x = <div className="z-(--z-base) z-(--z-raised) z-(--z-overlay) z-(--z-modal) z-(--z-popover) z-(--z-toast) z-(--z-tooltip)" />;',
      },
      why: "LEGACY mustPass[2], ordinary outside arm: every governed semantic z token remains accepted",
    },
    {
      mode: "source",
      files: { "packages/ui/src/lib/popup-surface.ts": 'export const POPUP_SURFACE = "relative z-(--z-popover)";' },
      why: "LEGACY mustPass[3], ordinary outside arm: a governed self-identifying semantic recipe remains accepted",
    },
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
