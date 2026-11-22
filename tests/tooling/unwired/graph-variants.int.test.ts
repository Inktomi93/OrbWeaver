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
