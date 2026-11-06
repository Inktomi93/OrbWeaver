import { join } from "node:path";
import { expect, plantDir, plantFile, test } from "@orb/testkit/tooling";
import { classOwners } from "../../../tooling/src/ui-facts/class-owners.ts";

const REPO_ROOT = join(import.meta.dirname, "../../..");
const UI_PACKAGE = JSON.stringify({ exports: { "./layout": "./src/layout/index.ts" } });
// Stack forwards sway and art, Row forwards justify but not align, and Panel's arm lands on a part inside it.
const VARIANTS = [
  "export const stackVariants = tv({",
  "  variants: {",
  "    paddingInline: { block: 'px-block' },",
  "    sway: { left: 'float-left', right: 'float-right' },",
  "    art: { portrait: 'ps-4 pe-4' },",
  "  },",
  "});",
  "export const rowVariants = tv({ variants: { justify: { end: 'justify-end' }, align: { start: 'items-start' } } });",
  "export const panelVariants = tv({ slots: { root: '', label: '' }, variants: { tone: { loud: { label: 'font-bold' }, rooted: { root: 'italic' } } } });",
].join("\n");
const COMPONENTS = [
  "export function Stack({ paddingInline, sway, art, className }) {",
  "  return <div className={stackVariants({ paddingInline, sway, art, className })} />;",
  "}",
  "export function Row({ justify, className }) {",
  "  return <div className={rowVariants({ justify, className })} />;",
  "}",
  "export function Panel({ tone, className }) {",
  "  return <div className={panelVariants({ tone, className })} />;",
  "}",
].join("\n");

function owners(scratch: string): ReturnType<typeof classOwners> {
  const root = plantDir(scratch, "owners");
  plantFile(root, "packages/ui/package.json", UI_PACKAGE);
  plantFile(root, "packages/ui/src/layout/variants.ts", VARIANTS);
  plantFile(root, "packages/ui/src/layout/components.tsx", COMPONENTS);
  return classOwners(root);
}

test("a class an arm of a forwarded axis writes has that axis as its owner, whatever the axis is called", ({ scratch }) => {
  const ownerOf = owners(scratch);
  expect(ownerOf("layout", "Stack", "float-left")).toEqual({ axis: "stack.sway", prop: "sway", arm: "left" });
  expect(ownerOf("layout", "Row", "justify-end")).toEqual({ axis: "row.justify", prop: "justify", arm: "end" });
});

test("a class no forwarded axis writes has no owner", ({ scratch }) => {
  const ownerOf = owners(scratch);
  expect(ownerOf("layout", "Row", "items-start")).toBeNull();
  expect(ownerOf("layout", "Row", "min-inline-0")).toBeNull();
  expect(ownerOf("layout", "Stack", "justify-end")).toBeNull();
  expect(ownerOf("layout", "Missing", "justify-end")).toBeNull();
  expect(ownerOf("elsewhere", "Row", "justify-end")).toBeNull();
});

test("an arm that writes a part inside the component owns nothing on its root", ({ scratch }) => {
  const ownerOf = owners(scratch);
  expect(ownerOf("layout", "Panel", "font-bold")).toBeNull();
  expect(ownerOf("layout", "Panel", "italic")).toEqual({ axis: "panel.tone", prop: "tone", arm: "rooted" });
});

test("the real layout tables own justify on Row and truncate on Text", () => {
  const ownerOf = classOwners(REPO_ROOT);
  expect(ownerOf("layout", "Row", "justify-end")).toEqual({ axis: "row.justify", prop: "justify", arm: "end" });
  expect(ownerOf("text", "Text", "truncate")).toEqual({ axis: "text.truncate", prop: "truncate", arm: "true" });
  expect(ownerOf("layout", "Row", "min-inline-0")).toBeNull();
});

test("the real Row owns each class it writes below a container step, on the steps of the container scale", () => {
  const ownerOf = classOwners(REPO_ROOT);
  expect(ownerOf("layout", "Row", "@max-cq-32:flex-col")).toEqual({ axis: "row.stackBelow", prop: "stackBelow", arm: "cq-32" });
  expect(ownerOf("layout", "Row", "@max-cq-28:items-stretch")).toEqual({ axis: "row.stretchBelow", prop: "stretchBelow", arm: "cq-28" });
  expect(ownerOf("layout", "Row", "@max-cq-64:justify-end")).toEqual({ axis: "row.endBelow", prop: "endBelow", arm: "cq-64" });
  expect(ownerOf("layout", "Row", "@max-cq-40:flex-col")).toBeNull();
});

test("the real Stack and Row own an inset that steps down below the phone container step, and the block-start inset", () => {
  const ownerOf = classOwners(REPO_ROOT);
  expect(ownerOf("layout", "Stack", "@max-cq-28:px-tight")).toEqual({ axis: "stack.paddingInlineNarrow", prop: "paddingInlineNarrow", arm: "tight" });
  expect(ownerOf("layout", "Stack", "@max-cq-28:pe-block")).toEqual({ axis: "stack.paddingInlineEndNarrow", prop: "paddingInlineEndNarrow", arm: "block" });
  expect(ownerOf("layout", "Row", "@max-cq-28:px-row")).toEqual({ axis: "row.paddingInlineNarrow", prop: "paddingInlineNarrow", arm: "row" });
  expect(ownerOf("layout", "Stack", "pbs-row")).toEqual({ axis: "stack.paddingBlockStart", prop: "paddingBlockStart", arm: "row" });
});
