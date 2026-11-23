// A tailwind-variants table's values are used only where a caller selects them: a literal at the call, a default the
// table names, a boolean axis's omitted `false` arm, or a value forwarded from a caller's own prop, followed to the
// literals that fill it. A table built by a wrapped `tv` is still a table: the resolved signature confirms it.
import { expect, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan, labelsIn, tailwindVariants } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/button.ts`;
const source = (lines: readonly string[]): Record<string, string> => ({ ...tailwindVariants(), [FILE]: lines.join("\n") });

test("a value no caller selects is unused; a literal, a default, a false arm and a forwarded prop each select", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'import { tv } from "tailwind-variants";',
      "const button = tv({",
      '  variants: { size: { sm: "s", md: "m", lg: "l" }, tone: { plain: "p", loud: "x" }, block: { true: "b", false: "" } },',
      '  defaultVariants: { tone: "plain" },',
      "});",
      'export interface ButtonProps { readonly size?: "sm" | "md" | "lg" }',
      "export const Button = ({ size }: ButtonProps): string => button({ size, block: true });",
      'export const small = Button({ size: "sm" });',
    ]),
  );
  expect(labelsIn(scan, "variant-value-unused", FILE)).toEqual(["button.size = md, lg", "button.tone = loud"]);
});

test("a table built through a wrapped tv is read like one built by tv itself", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'import type { TV } from "tailwind-variants";',
      "declare const ui: { readonly tv: TV };",
      'const card = ui.tv({ variants: { pad: { none: "", wide: "w" } } });',
      'export const plain = card({ pad: "none" });',
    ]),
  );
  expect(labelsIn(scan, "variant-value-unused", FILE)).toEqual(["card.pad = wide"]);
});

// `recipe(bag)` hands the whole parameter bag over: each axis the bag's type carries takes the bag member's literals
// as a typed value. `size = lg` is outside the bag's type, and `tone`, which the bag lacks, stays a whole unused axis.
test("a whole parameter bag handed to a recipe selects each axis by its member's type", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'import { tv } from "tailwind-variants";',
      'const recipe = tv({ variants: { size: { sm: "s", md: "m", lg: "l" }, tone: { plain: "p", loud: "x" } } });',
      'export interface Bag { readonly size: "sm" | "md" }',
      "export const styled = (bag: Bag): string => recipe(bag);",
      'export const small = styled({ size: "sm" });',
    ]),
  );
  expect(labelsIn(scan, "variant-value-unused", FILE)).toEqual(["recipe.size = lg", "recipe.tone (whole axis: plain, loud)"]);
});

// A typed value selects every literal its type can be: `2 | 1` a numeric axis's keys, `boolean` both arms of a
// boolean axis. `level = 3` and `on = mixed` are the controls no type names; a type the scan cannot spell would make
// its axis dynamic, and a dynamic axis reports nothing.
test("a typed value selects its literal type's members, numeric keys and a boolean's two arms included", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'import { tv } from "tailwind-variants";',
      'const badge = tv({ variants: { level: { 1: "a", 2: "b", 3: "c" }, on: { true: "y", false: "n", mixed: "m" } } });',
      "export const shown = (lv: 2 | 1, flag: boolean): string => badge({ level: lv, on: flag });",
    ]),
  );
  expect(labelsIn(scan, "variant-value-unused", FILE)).toEqual(["badge.level = 3", "badge.on = mixed"]);
});

// `props.size` forwards the prop it reads, so the axis takes what callers write into `ButtonProps.size`; `lg` is the
// value no caller writes.
test("a prop read off the parameter bag forwards the values callers write into it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'import { tv } from "tailwind-variants";',
      'const button = tv({ variants: { size: { sm: "s", md: "m", lg: "l" } } });',
      'export interface ButtonProps { readonly size?: "sm" | "md" | "lg" }',
      "export const Button = (props: ButtonProps): string => button({ size: props.size });",
      'export const both = [Button({ size: "sm" }), Button({ size: "md" })];',
    ]),
  );
  expect(labelsIn(scan, "variant-value-unused", FILE)).toEqual(["button.size = lg"]);
});

// `variantProps(recipe, { size })` with `size` read off typed props: the selection's own type fits the recipe's props,
// so TypeScript infers the selection from itself, and only the recipe sibling names the real slot. `chip` forwards
// `sm`; `md` and `lg` are the values no caller selects.
test("a selection co-inferred with its recipe selects the recipe's axis values", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'import { tv } from "tailwind-variants";',
      'const button = tv({ variants: { size: { sm: "s", md: "m", lg: "l" } } });',
      "interface VariantClassRecipe<S> {",
      "  (props?: S): string;",
      "  readonly variants: Readonly<Record<string, Readonly<Record<string, unknown>>>>;",
      "}",
      "declare function variantProps<S>(recipe: VariantClassRecipe<S>, selection: S): object;",
      'export interface ChipProps { readonly size?: "sm" | "md" | "lg" }',
      "export const chip = ({ size }: ChipProps): object => variantProps(button, { size });",
      'export const shown = chip({ size: "sm" });',
    ]),
  );
  expect(labelsIn(scan, "variant-value-unused", FILE)).toEqual(["button.size = md, lg"]);
});

// A stamped attribute's selector names the value it selects (packages/ui/src/lib/variant-attrs.ts stamps the arm a caller
// picked), so an unused value's row lists every selector that one delete removes with it; a selector keeps nothing. A
// selector naming a value no recipe declares is stale; data-tone also takes the tone door's tones.
test("an unused stamped value names its selectors; a selector of an undeclared value is stale", { timeout: 120_000 }, async ({ plantedTree }) => {
  const sheet = `${GRAPH_SOURCE}/stamps.css`;
  const scan = await graphScan(plantedTree, {
    ...source([
      'import { tv } from "tailwind-variants";',
      'const chip = tv({ variants: { size: { sm: "s", lg: "l" }, step: { one: "1" }, tone: { loud: "x" } } });',
      'export const small = chip({ size: "sm", step: "one", tone: "loud" });',
      'export const hover = "data-[size=lg]:p-1 data-[step=two]:p-2";',
    ]),
    [sheet]: [
      '[data-size="lg"] { color: red; }',
      '[data-size="xl"] { color: red; }',
      '[data-tone="info"] { color: red; }',
      '[data-orientation="vertical"] { color: red; }',
      '[data-size^="x"] { color: red; }',
      // a tone that displaces a recipe's tone arm moves the arm to data-variant
      '[data-variant="loud"] { color: red; }',
    ].join("\n"),
  });
  const rows = (bucket: "variant-value-unused" | "variant-selector-stale"): readonly (readonly [string, string | null])[] =>
    scan.analysis[bucket].map(({ label, note }) => [label, note]);
  expect({ unused: rows("variant-value-unused"), stale: rows("variant-selector-stale") }).toEqual({
    unused: [[`${FILE}:chip.size = lg`, `selected by ${sheet}:1 (lg), ${FILE}:4 (lg)`]],
    stale: [
      [`${sheet}:2 [data-size="xl"]`, "no recipe declares the value"],
      [`${FILE}:4 [data-step="two"]`, "no recipe declares the value"],
    ],
  });
});

// Two recipes in one file may each declare an axis of one name: each row names its recipe, so it stays its own row.
test("an axis two recipes share a name for reports once per recipe", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'import { tv } from "tailwind-variants";',
      'export const linear = tv({ variants: { danger: { true: "d" } } });',
      'export const arc = tv({ variants: { danger: { true: "d" } } });',
      "export const shown = linear() + arc();",
    ]),
  );
  expect(labelsIn(scan, "variant-value-unused", FILE)).toEqual(["linear.danger (whole axis: true)", "arc.danger (whole axis: true)"]);
});
