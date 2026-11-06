import { join } from "node:path";
import { expect, plantDir, plantFile, test } from "@orb/testkit/tooling";
import { classOwners } from "../../../tooling/src/ui-facts/class-owners.ts";

const REPO_ROOT = join(import.meta.dirname, "../../..");
const NO_ELEMENT = { props: {}, peers: [] } as const;
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
  expect(ownerOf("layout", "Stack", "float-left", NO_ELEMENT)).toEqual({ axis: "stack.sway", prop: "sway", arm: "left" });
  expect(ownerOf("layout", "Row", "justify-end", NO_ELEMENT)).toEqual({ axis: "row.justify", prop: "justify", arm: "end" });
});

test("a class no forwarded axis writes has no owner", ({ scratch }) => {
  const ownerOf = owners(scratch);
  expect(ownerOf("layout", "Row", "items-start", NO_ELEMENT)).toBeNull();
  expect(ownerOf("layout", "Row", "min-inline-0", NO_ELEMENT)).toBeNull();
  expect(ownerOf("layout", "Stack", "justify-end", NO_ELEMENT)).toBeNull();
  expect(ownerOf("layout", "Missing", "justify-end", NO_ELEMENT)).toBeNull();
  expect(ownerOf("elsewhere", "Row", "justify-end", NO_ELEMENT)).toBeNull();
});

test("an arm that writes a part inside the component owns nothing on its root", ({ scratch }) => {
  const ownerOf = owners(scratch);
  expect(ownerOf("layout", "Panel", "font-bold", NO_ELEMENT)).toBeNull();
  expect(ownerOf("layout", "Panel", "italic", NO_ELEMENT)).toEqual({ axis: "panel.tone", prop: "tone", arm: "rooted" });
});

test("a class that beats a later axis's class keeps its precedence only as a class, so the prop does not own it", ({ scratch }) => {
  const ownerOf = owners(scratch);
  expect(ownerOf("layout", "Stack", "px-block", NO_ELEMENT)).toEqual({ axis: "stack.paddingInline", prop: "paddingInline", arm: "block" });
  // `art` renders after `paddingInline` and its `ps-4` loses to a later `px-block`, which a prop would put before it.
  expect(ownerOf("layout", "Stack", "px-block", { props: { art: null }, peers: [] })).toBeNull();
  expect(ownerOf("layout", "Stack", "px-block", { props: { art: "portrait" }, peers: [] })).toBeNull();
  // A peer in the same className that conflicts is as decisive as a later axis: the move would reorder the two.
  expect(ownerOf("layout", "Stack", "px-block", { props: {}, peers: ["px-row"] })).toBeNull();
});

test("the real layout tables own justify on Row and truncate on Text", () => {
  const ownerOf = classOwners(REPO_ROOT);
  expect(ownerOf("layout", "Row", "justify-end", NO_ELEMENT)).toEqual({ axis: "row.justify", prop: "justify", arm: "end" });
  expect(ownerOf("text", "Text", "truncate", NO_ELEMENT)).toEqual({ axis: "text.truncate", prop: "truncate", arm: "true" });
  expect(ownerOf("layout", "Row", "min-inline-0", NO_ELEMENT)).toBeNull();
});

test("the real Row owns each class it writes below a container step, on the steps of the container scale", () => {
  const ownerOf = classOwners(REPO_ROOT);
  expect(ownerOf("layout", "Row", "@max-cq-32:flex-col", NO_ELEMENT)).toEqual({ axis: "row.stackBelow", prop: "stackBelow", arm: "cq-32" });
  expect(ownerOf("layout", "Row", "@max-cq-28:items-stretch", NO_ELEMENT)).toEqual({ axis: "row.stretchBelow", prop: "stretchBelow", arm: "cq-28" });
  expect(ownerOf("layout", "Row", "@max-cq-64:justify-end", NO_ELEMENT)).toEqual({ axis: "row.endBelow", prop: "endBelow", arm: "cq-64" });
  expect(ownerOf("layout", "Row", "@max-cq-40:flex-col", NO_ELEMENT)).toBeNull();
});
