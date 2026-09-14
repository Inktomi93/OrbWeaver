import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { readyResourceValue } from "../../../../tooling/src/verify/lib/resource-declaration.ts";
import { uiPrimitiveFact } from "../../../../tooling/src/verify/lib/ui-primitive-fact.ts";
import {
  readUiPrimitiveOccurrences,
  readUiPrimitiveOverlayHealth,
  readUiPrimitiveStructure,
} from "../../../../tooling/src/verify/lib/ui-primitive-structure-read.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const BASE = {
  "packages/ui/src/primitives/thing/thing.tsx": 'export const Thing = () => <div data-slot="thing" />;',
  "packages/ui/src/primitives/thing/index.ts": 'export { Thing } from "./thing";',
  "packages/ui/src/primitives/thing/variants.ts": 'export const thingVariants = tv({base: "block"});',
  "tests/ui/primitives/thing/thing.ct.tsx": "export const proof = true;",
};
const probe = defineGate({
  id: "ui-primitive-reader-probe",
  family: "ui-primitive",
  authority: "hard",
  severity: "error",
  population: ["@ui", "@tests"],
  analysis: "resource",
  execution: "entire-population",
  facts: [uiPrimitiveFact],
  resources: [
    { kind: "authored-tree", id: "ui-primitive" },
    { kind: "authored-tree", id: "tests" },
  ],
  message: "UI primitive reader probe",
  create: (ctx) => ({
    evaluate: () => {
      const result = readUiPrimitiveStructure({
        ...ctx.fact(uiPrimitiveFact),
        primitiveEntries: readyResourceValue(ctx.resources.authoredTree("ui-primitive")),
        testEntries: readyResourceValue(ctx.resources.authoredTree("tests")),
      });
      ctx.receipt({ kind: "population", source: "primitive-probe", members: result.primitives });
      for (const permission of result.permissions) {
        for (const site of permission.sites) {
          ctx.report.file(site.file.replace(/\/$/u, ""), { line: site.line, message: site.message });
        }
      }
      for (const site of result.health) {
        ctx.report.file(site.file, { line: site.line, message: site.message });
      }
      for (const hit of result.occurrences) {
        ctx.report.node(hit.node, { token: hit.token, offset: hit.offset });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { ...BASE, "tests/ui/primitives/thing/thing.ct.tsx": 'test(`the #483 seal ${"#abc"}`, () => {});' },
      expect: { count: 1, messageIncludes: "hardcoded color" },
      why: "dispatcher-fed narration spans leave a template substitution visible to the color judgment",
    },
    {
      mode: "resource",
      files: { ...BASE, "packages/ui/src/primitives/thing/index.ts": 'export * from "./variants";' },
      expect: { count: 1, token: "./variants" },
      why: "direct export evidence retains the exact source token for the final ordinary occurrence",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { ...BASE, "tests/ui/primitives/thing/thing.ct.tsx": 'test("#483 the seal", () => expect(1, "#424 reason").toBe(1));' },
      why: "complete topology and narrated issue citations remain clean",
    },
  ],
});

test("source and resource facts preserve the UI primitive reading boundaries", () => {
  expect(verifyPolicyProofs([probe])).toEqual([]);
});

const syntaxProbe = defineGate({
  id: "ui-primitive-syntax-probe",
  family: "ui-primitive",
  authority: "hard",
  severity: "error",
  population: "@ui",
  analysis: "syntax",
  execution: "entire-population",
  facts: [uiPrimitiveFact],
  resources: [],
  message: "UI primitive source-only probe",
  create: (ctx) => ({
    evaluate: () => {
      const { sources } = ctx.fact(uiPrimitiveFact);
      ctx.receipt({ kind: "population", source: "ui-source-probe", members: sources.size });
      for (const hit of readUiPrimitiveOccurrences(sources)) {
        ctx.report.node(hit.node, { token: hit.token, offset: hit.offset });
      }
      for (const hit of readUiPrimitiveOverlayHealth(sources)) {
        ctx.report.file(hit.file, { line: hit.line, message: hit.message });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/ui/src/primitives/dialog/dialog.tsx": "export const X = () => <Dialog.Popup />;" },
      expect: { count: 1, messageIncludes: ".Backdrop + .Popup" },
      why: "modal anatomy is judged from source even without a filesystem topology resource",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/icon/icon.tsx": "export const X = () => <svg />;" },
      expect: { count: 1, token: "svg" },
      why: "inline SVG remains an authored occurrence without resource declarations",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/ui/src/primitives/dialog/dialog.tsx": "export const X = () => <><Dialog.Backdrop /><Dialog.Popup /></>;" },
      why: "complete modal anatomy has no source-only finding",
    },
  ],
});

test("source-only judgments do not acquire topology resources", () => {
  expect(verifyPolicyProofs([syntaxProbe])).toEqual([]);
});
