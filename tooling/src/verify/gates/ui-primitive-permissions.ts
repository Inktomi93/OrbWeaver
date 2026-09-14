// Primitive topology and test-data exceptions are exact central grants. Every missing obligation is
// collected before permission reconciliation; each subject/operation groups all actionable sites.
import { defineGate } from "../contract/policy.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { reportReviewedGrantFileCandidates } from "../lib/reviewed-grant-findings.ts";
import { uiPrimitiveFact } from "../lib/ui-primitive-fact.ts";
import { readUiPrimitiveStructure } from "../lib/ui-primitive-structure-read.ts";

const MESSAGE = "a primitive shape, CT obligation, inline provider or color test value requires repair or exact reviewed authority.";
const FIX = "repair the named sites; deliberate topology or test-data exceptions require a central grant for the exact subject and operation.";
export const gate = defineGate({
  id: "ui-primitive-permissions",
  family: "ui-primitive",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@ui", "@tests"], under: ["packages/ui/src/**", "tests/ui/**"] },
  analysis: "resource",
  execution: "entire-population",
  facts: [uiPrimitiveFact],
  resources: [
    { kind: "authored-tree", id: "ui-primitive" },
    { kind: "authored-tree", id: "tests" },
  ],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const result = readUiPrimitiveStructure({
        ...ctx.fact(uiPrimitiveFact),
        primitiveEntries: readyResourceValue(ctx.resources.authoredTree("ui-primitive")),
        testEntries: readyResourceValue(ctx.resources.authoredTree("tests")),
      });
      const candidates = result.permissions.flatMap(({ subject, operation, sites }) =>
        sites.map(({ file, line, message }) => ({ subject, operation, file: file.replace(/\/$/u, ""), line, note: message })),
      );
      reportReviewedGrantFileCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: MESSAGE });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      grant: { subject: "packages/ui/src/primitives/thing", operation: "primitive-shape" },
      files: {
        "packages/ui/src/primitives/thing/thing.tsx": 'export const Thing = () => <div data-slot="thing" />;',
        "packages/ui/src/primitives/thing/index.ts": 'export {Thing} from "./thing";',
        "tests/ui/primitives/thing/thing.ct.tsx": "export const proof = true;",
      },
      expect: { count: 1, messageIncludes: "missing variants.ts" },
      why: "a styled primitive is missing its variants file",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/thing/thing.tsx": 'export const Thing = () => <div data-slot="thing" />;',
        "packages/ui/src/primitives/thing/index.ts": 'export {Thing} from "./thing";',
        "packages/ui/src/primitives/thing/variants.ts": 'export const thingVariants = tv({base: "block"});',
        "tests/ui/primitives/thing/thing.ct.tsx": "export const proof = true;",
      },
      why: "complete primitive topology and CT ownership",
    },
  ],
});
