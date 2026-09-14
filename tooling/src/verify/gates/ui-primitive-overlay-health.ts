// Overlay anatomy is structural health: a grant or source waiver cannot license missing modal layers.
import { defineGate } from "../contract/policy.ts";
import { uiPrimitiveFact } from "../lib/ui-primitive-fact.ts";
import { readUiPrimitiveOverlayHealth } from "../lib/ui-primitive-structure-read.ts";
export const gate = defineGate({
  id: "ui-primitive-overlay-health",
  family: "ui-primitive",
  authority: "hard",
  severity: "error",
  population: "@ui",
  analysis: "syntax",
  execution: "entire-population",
  facts: [uiPrimitiveFact],
  resources: [],
  message: "the primitive overlay is missing its required anatomy.",
  fix: "anchored popups need Positioner; modal overlays need Backdrop and Popup without Positioner.",
  create: (ctx) => ({
    evaluate: () => {
      ctx.receipt({ kind: "population", source: "ui-overlay-sources", members: ctx.files.length });
      for (const hit of readUiPrimitiveOverlayHealth(ctx.fact(uiPrimitiveFact).sources)) {
        ctx.report.file(hit.file, { line: hit.line, message: hit.message });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/ui/src/primitives/dialog/dialog.tsx": "export const X = () => <D.Popup />;" },
      expect: { count: 1, messageIncludes: ".Backdrop + .Popup" },
      why: "a modal popup without its backdrop is structurally incomplete",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/ui/src/primitives/dialog/dialog.tsx": "export const X = () => <><D.Backdrop /><D.Popup /></>;" },
      why: "complete modal anatomy",
    },
  ],
});
