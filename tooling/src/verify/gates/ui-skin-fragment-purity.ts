import { defineGate } from "../contract/policy.ts";
import { readUiTierFacts, tierOccurrences, uiTierPermissionFact } from "../lib/ui-tier-permissions.ts";

export const gate = defineGate({
  id: "ui-skin-fragment-purity",
  family: "ui-skin-fragment-tier",
  authority: "ordinary",
  severity: "error",
  population: "@ui",
  analysis: "syntax",
  execution: "entire-population",
  facts: [uiTierPermissionFact],
  resources: [],
  message: "a static string outside packages/ui/src/lib/ hand-spells a homed skin fragment — compose the lib constant instead.",
  fix: "Import and compose the matching skin-fragment constant. A deliberate outside occurrence requires an exact @orb-waive ui-skin-fragment-purity(<signature>): <reason> marker.",
  create: (ctx) => ({
    evaluate: () => {
      for (const hit of tierOccurrences(readUiTierFacts(ctx), "skin-fragment", null)) {
        ctx.report.node(hit.node, { token: hit.token, offset: hit.offset });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/ui/src/primitives/tooltip/variants.ts": 'export const overlay = { arrow: "size-row rotate-45 border border-border bg-popover" };\n' },
      expect: { count: 1, token: "rotate-45 border border-border bg-popover" },
      why: "LEGACY mustFlag[0], ordinary outside arm: the OVERLAY_ARROW signature",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/toast/variants.ts": 'export const toast = { root: "rounded-control focus-visible:ring-2 focus-visible:ring-ring" };\n',
      },
      expect: { count: 1, token: "focus-visible:ring-" },
      why: "LEGACY mustFlag[1], ordinary outside arm: the partial focus-ring signature",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/x.ts": 'export const x = "bg-backdrop";' },
      expect: { token: "bg-backdrop" },
      why: "ordinary string carriers are scanned",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/x.ts": "declare const y: string; export const x = `focus-visible:ring-2 ${y}`;" },
      expect: { token: "focus-visible:ring-" },
      why: "LEGACY mustFlag[2], ordinary outside arm: static template spans are scanned",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/ui/src/primitives/x.ts": "declare const SCRIM: string; export const x = `${SCRIM}`;" },
      why: "LEGACY mustPass[0], ordinary outside arm: composition does not re-spell the signature",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/x.ts":
          '// @orb-waive ui-skin-fragment-purity(bg-backdrop): reviewed local exception until this fixture changes.\nexport const x = "bg-backdrop";',
      },
      why: "ordinary exact-signature waiver remains available outside the home",
    },
  ],
});
