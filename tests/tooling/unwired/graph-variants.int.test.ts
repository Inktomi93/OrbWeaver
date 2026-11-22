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
  expect(labelsIn(scan, "variant-value-unused", FILE)).toEqual(["size = md, lg", "tone = loud"]);
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
  expect(labelsIn(scan, "variant-value-unused", FILE)).toEqual(["pad = wide"]);
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
  expect(labelsIn(scan, "variant-value-unused", FILE)).toEqual(["size = lg", "tone (whole axis: plain, loud)"]);
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
  expect(labelsIn(scan, "variant-value-unused", FILE)).toEqual(["level = 3", "on = mixed"]);
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
  expect(labelsIn(scan, "variant-value-unused", FILE)).toEqual(["size = lg"]);
});

// `variantProps(recipe, selection)` infers `T` from both arguments, so the selection literal's slot is the recipe's own
// props: its `lg` selects the axis value, and `sm` is the control nothing selects.
test("a selection co-inferred with its recipe selects the recipe's axis values", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'import { tv } from "tailwind-variants";',
      'const button = tv({ variants: { size: { sm: "s", lg: "l" } } });',
      "interface VariantClassRecipe<S> {",
      "  (props?: S): string;",
      "  readonly variants: Readonly<Record<string, Readonly<Record<string, unknown>>>>;",
      "}",
      "declare function variantProps<S>(recipe: VariantClassRecipe<S>, selection: S): object;",
      'export const chosen = variantProps(button, { size: "lg" });',
    ]),
  );
  expect(labelsIn(scan, "variant-value-unused", FILE)).toEqual(["size = sm"]);
});
