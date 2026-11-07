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
  "    trim: { tight: 'ps-1 font-bold', loose: 'ps-2 font-bold', plain: 'italic' },",
  "  },",
  "});",
  "export const rowVariants = tv({ variants: { justify: { end: 'justify-end' }, align: { start: 'items-start' } } });",
  "export const panelVariants = tv({ slots: { root: '', label: '' }, variants: { tone: { loud: { label: 'font-bold' }, rooted: { root: 'italic' } } } });",
].join("\n");
const COMPONENTS = [
  "export function Stack({ paddingInline, sway, art, trim, className }) {",
  "  return <div className={stackVariants({ paddingInline, sway, art, trim, className })} />;",
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
  expect(ownerOf("layout", "Stack", "float-left", [])).toEqual({ axis: "stack.sway", prop: "sway", arm: "left" });
  expect(ownerOf("layout", "Row", "justify-end", [])).toEqual({ axis: "row.justify", prop: "justify", arm: "end" });
});

test("a class no forwarded axis writes has no owner", ({ scratch }) => {
  const ownerOf = owners(scratch);
  expect(ownerOf("layout", "Row", "items-start", [])).toBeNull();
  expect(ownerOf("layout", "Row", "min-inline-0", [])).toBeNull();
  expect(ownerOf("layout", "Stack", "justify-end", [])).toBeNull();
  expect(ownerOf("layout", "Missing", "justify-end", [])).toBeNull();
  expect(ownerOf("elsewhere", "Row", "justify-end", [])).toBeNull();
});

test("a wrapper answers for the axes it hands on inside a carrying prop, and for no other the core computes", () => {
  const ownerOf = classOwners(REPO_ROOT);
  const square = ["shrink-0", "p-0"];
  const wrap = ["py-tight", "whitespace-normal", "block-auto"];
  expect(ownerOf("button", "Button", "p-0", square)).toEqual({ axis: "button.square", prop: "square", arm: "true" });
  expect(ownerOf("button", "Button", "block-auto", wrap)).toEqual({ axis: "button.wrap", prop: "wrap", arm: "true" });
  expect(ownerOf("button", "Button", "block-(--size-control-sm)", [])).toEqual({ axis: "button.size", prop: "size", arm: "sm" });
  expect(ownerOf("button", "Button", "block-(--size-touch-target)", [])).toEqual({ axis: "button.size", prop: "size", arm: "chip" });
  expect(ownerOf("button", "Button", "shadow-cta", [])).toBeNull();
});

test("a class under a container step no arm writes belongs to the ramp of that step's axis", () => {
  const ownerOf = classOwners(REPO_ROOT);
  expect(ownerOf("layout", "Row", "@max-cq-48:flex-col", [])).toEqual({ axis: "row.stackBelow", prop: "stackBelow", arm: null });
  expect(ownerOf("layout", "Row", "flex-col", [])).toBeNull();
  expect(ownerOf("layout", "Row", "hover:flex-col", [])).toBeNull();
  expect(ownerOf("layout", "Row", "@max-cq-32:flex-row-reverse", [])).toEqual({ axis: "row.reverseBelow", prop: "reverseBelow", arm: "cq-32" });
  expect(ownerOf("layout", "Row", "@max-cq-48:flex-row-reverse", [])).toEqual({ axis: "row.reverseBelow", prop: "reverseBelow", arm: null });
});

test("the real Text, Heading, Button and Row own the classes the clamp, grow, floor, width, band and out-of-flow props write", () => {
  const ownerOf = classOwners(REPO_ROOT);
  expect(ownerOf("text", "Text", "line-clamp-3", [])).toEqual({ axis: "text.clamp", prop: "clamp", arm: "3" });
  expect(ownerOf("text", "Heading", "line-clamp-2", [])).toEqual({ axis: "heading.clamp", prop: "clamp", arm: "2" });
  expect(ownerOf("text", "Text", "flex-1", [])).toEqual({ axis: "text.grow", prop: "grow", arm: "true" });
  expect(ownerOf("text", "Text", "basis-(--width-field-floor)", [])).toEqual({ axis: "text.floor", prop: "floor", arm: "field" });
  expect(ownerOf("button", "Button", "inline-full", [])).toEqual({ axis: "button.width", prop: "width", arm: "full" });
  expect(ownerOf("layout", "Row", "orb-out-of-flow", [])).toEqual({ axis: "row.outOfFlow", prop: "outOfFlow", arm: "true" });
  const band = ["block-(--size-control-sm)", "gap-tight", "px-tight", "text-label", "leading-label"];
  expect(ownerOf("button", "Button", "px-tight", band)).toEqual({ axis: "button.size", prop: "size", arm: "band" });
  const stacked = ["flex-col", "items-start", "py-row", "block-auto", "text-label", "leading-label"];
  expect(ownerOf("button", "Button", "px-row", stacked)).toEqual({ axis: "button.size", prop: "size", arm: "stacked" });
});

test("an arm that writes a part inside the component owns nothing on its root", ({ scratch }) => {
  const ownerOf = owners(scratch);
  expect(ownerOf("layout", "Panel", "font-bold", [])).toBeNull();
  expect(ownerOf("layout", "Panel", "italic", [])).toEqual({ axis: "panel.tone", prop: "tone", arm: "rooted" });
});

test("an axis with an arm outside the family does not choose it, so a class of one composed arm has no owner", ({ scratch }) => {
  expect(owners(scratch)("layout", "Stack", "ps-1", [])).toBeNull();
});

test("the real layout tables own justify on Row and truncate on Text", () => {
  const ownerOf = classOwners(REPO_ROOT);
  expect(ownerOf("layout", "Row", "justify-end", [])).toEqual({ axis: "row.justify", prop: "justify", arm: "end" });
  expect(ownerOf("text", "Text", "truncate", [])).toEqual({ axis: "text.truncate", prop: "truncate", arm: "true" });
  expect(ownerOf("layout", "Row", "min-inline-0", [])).toBeNull();
});

test("the real Row owns each class it writes below a container step, on the steps of the container scale", () => {
  const ownerOf = classOwners(REPO_ROOT);
  expect(ownerOf("layout", "Row", "@max-cq-32:flex-col", [])).toEqual({ axis: "row.stackBelow", prop: "stackBelow", arm: "cq-32" });
  expect(ownerOf("layout", "Row", "@max-cq-28:items-stretch", [])).toEqual({ axis: "row.stretchBelow", prop: "stretchBelow", arm: "cq-28" });
  expect(ownerOf("layout", "Row", "@max-cq-64:justify-end", [])).toEqual({ axis: "row.endBelow", prop: "endBelow", arm: "cq-64" });
  expect(ownerOf("layout", "Row", "@max-cq-20:flex-col", [])).toEqual({ axis: "row.stackBelow", prop: "stackBelow", arm: null });
});

test("the real Stack and Row own an inset that steps down below the phone container step, and the block-start inset", () => {
  const ownerOf = classOwners(REPO_ROOT);
  expect(ownerOf("layout", "Stack", "@max-cq-28:px-tight", [])).toEqual({ axis: "stack.paddingInlineNarrow", prop: "paddingInlineNarrow", arm: "tight" });
  expect(ownerOf("layout", "Row", "@max-cq-28:px-row", [])).toEqual({ axis: "row.paddingInlineNarrow", prop: "paddingInlineNarrow", arm: "row" });
  expect(ownerOf("layout", "Stack", "@max-cq-28:pe-block", [])).toEqual({ axis: "stack.paddingInlineEndNarrow", prop: "paddingInlineEndNarrow", arm: "block" });
  expect(ownerOf("layout", "Stack", "pbs-row", [])).toEqual({ axis: "stack.paddingBlockStart", prop: "paddingBlockStart", arm: "row" });
});

test("a class of a family an axis chooses in is that axis's, with no arm named when no arm writes it", () => {
  const ownerOf = classOwners(REPO_ROOT);
  expect(ownerOf("layout", "Stack", "max-inline-(--reading-measure-prose)", [])).toEqual({ axis: "stack.cap", prop: "cap", arm: null });
  expect(ownerOf("layout", "Stack", "@max-cq-32:pe-block", [])).toEqual({ axis: "stack.paddingInlineEnd", prop: "paddingInlineEnd", arm: null });
  expect(ownerOf("layout", "Grid", "max-inline-(--width-sidebar-sm)", [])).toEqual({ axis: "grid.cap", prop: "cap", arm: "sidebar" });
  // A zero step is structure, and a family no axis chooses in is the caller's to write.
  expect(ownerOf("layout", "Row", "pe-0", [])).toBeNull();
  expect(ownerOf("layout", "Row", "min-inline-0", [])).toBeNull();
});

const CARD_PACKAGE = JSON.stringify({ exports: { "./card": "./src/primitives/card/index.ts" } });
const CARD_COMPONENT = [
  "export function Card({ focusable, className }) {",
  "  const fill = props.fill;",
  "  return <div className={cardVariants({ focusable, className })} data-fill={fill} />;",
  "}",
].join("\n");

function cardOwners(scratch: string, variants: string): ReturnType<typeof classOwners> {
  const root = plantDir(scratch, "card-owners");
  plantFile(root, "packages/ui/package.json", CARD_PACKAGE);
  plantFile(root, "packages/ui/src/lib/ring.ts", 'export const FOCUS_RING = "ring-2 ring-ring";\nexport const fill = "block-full flex-1";');
  plantFile(root, "packages/ui/src/primitives/card/variants.ts", variants);
  plantFile(root, "packages/ui/src/primitives/card/card.tsx", CARD_COMPONENT);
  return classOwners(root);
}

test("an arm that writes an imported class constant owns each class in it, beside the literal classes it writes", ({ scratch }) => {
  const ownerOf = cardOwners(
    scratch,
    [
      'import { FOCUS_RING } from "../../lib/ring.ts";',
      `export const cardVariants = tv({ variants: { focusable: { true: \`outline-none \${FOCUS_RING}\`, false: '' } } });`,
    ].join("\n"),
  );
  const owner = { axis: "card.focusable", prop: "focusable", arm: "true" };
  const arm = ["outline-none", "ring-2", "ring-ring"];
  expect(ownerOf("card", "Card", "outline-none", arm)).toEqual(owner);
  expect(ownerOf("card", "Card", "ring-2", arm)).toEqual(owner);
  expect(ownerOf("card", "Card", "ring-ring", arm)).toEqual(owner);
});

test("a name the arm's file does not import reads nothing, even when a ui constant of that name exists", ({ scratch }) => {
  const ownerOf = cardOwners(scratch, "export const cardVariants = tv({ variants: { focusable: { true: fill, false: '' } } });");
  expect(ownerOf("card", "Card", "block-full", [])).toBeNull();
});

test("a class of a multi-class arm is owned when the element wears the whole arm, and a lone class of it is not", ({ scratch }) => {
  const ownerOf = cardOwners(scratch, "export const cardVariants = tv({ variants: { focusable: { true: 'outline-none ring-2', false: '' } } });");
  expect(ownerOf("card", "Card", "ring-2", ["ring-2"])).toBeNull();
  expect(ownerOf("card", "Card", "ring-2", ["outline-none", "flex"])).toEqual({ axis: "card.focusable", prop: "focusable", arm: "true" });
  expect(ownerOf("card", "Card", "ring-2", ["flex"])).toBeNull();
});

test("a door export that wraps another component of its door answers for the axes it hands on, and not for the ones it takes", ({ scratch }) => {
  const root = plantDir(scratch, "wrapper-door");
  plantFile(root, "packages/ui/package.json", JSON.stringify({ exports: { "./button": "./src/primitives/button/index.ts" } }));
  plantFile(
    root,
    "packages/ui/src/primitives/button/variants.ts",
    "export const buttonVariants = tv({ variants: { stretch: { row: 'flex-1 justify-start' }, size: { sm: 'p-1', md: 'p-2' } } });",
  );
  plantFile(
    root,
    "packages/ui/src/primitives/button/core.tsx",
    [
      "export function ButtonCore(props) {",
      "  const { stretch, size, className, ...rest } = props;",
      "  return <button {...rest} className={buttonVariants({ stretch, size, className })} />;",
      "}",
    ].join("\n"),
  );
  plantFile(
    root,
    "packages/ui/src/primitives/button/button.tsx",
    ["export function Button({ size = 'md', ...rest }) {", "  return <ButtonCore {...rest} scale={size} />;", "}"].join("\n"),
  );
  const ownerOf = classOwners(root);
  const row = { axis: "button.stretch", prop: "stretch", arm: "row" };
  expect(ownerOf("button", "Button", "justify-start", ["flex-1"])).toEqual(row);
  expect(ownerOf("button", "ButtonCore", "justify-start", ["flex-1"])).toEqual({ ...row, axis: "button-core.stretch" });
  expect(ownerOf("button", "Button", "p-1", [])).toBeNull();
});
