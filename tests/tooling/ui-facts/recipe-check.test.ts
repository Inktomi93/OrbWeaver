import { join } from "node:path";
import { expect, plantDir, plantFile, test } from "@orb/testkit/tooling";
import { loadSources } from "../../../tooling/src/eslint/ui-classes/source.ts";
import { componentTables } from "../../../tooling/src/eslint/ui-classes/variant-tables.ts";
import type { MigrationPlan } from "../../../tooling/src/ui-facts/migration.ts";
import { recipeFailures } from "../../../tooling/src/ui-facts/recipe-check.ts";

const REPO_ROOT = join(import.meta.dirname, "../../..");
const TABLES = componentTables(REPO_ROOT, loadSources(REPO_ROOT));
const PATH = "packages/client/src/features/probe/uses.tsx";
const ROW = 'import { Row } from "@orb/ui/layout";\n';
const CARD = 'import { Card } from "@orb/ui/card";\n';
const BUTTON = 'import { Button } from "@orb/ui/button";\n';
const STACK = 'import { Stack } from "@orb/ui/layout";\n';
const BOX = 'import { Box } from "@orb/ui/box";\n';

/** A plan that lists the class strings at the given columns of line 2. */
const planAt = (...columns: readonly number[]): MigrationPlan => ({
  owner: "row.justify",
  review: [],
  sites: columns.map((column) => ({
    path: PATH,
    line: 2,
    column,
    source: "@orb/ui/layout",
    name: "Row",
    attribute: "className",
    token: "justify-end",
    prop: "justify",
    value: "end",
  })),
});

const check = (plan: MigrationPlan, before: string, after: string): Promise<readonly string[]> =>
  recipeFailures(REPO_ROOT, plan, [{ path: PATH, before, after }], TABLES);

const columnOf = (line: string, text: string): number => line.indexOf(text);

test("a move the real recipe renders the same passes, through a literal, a joined const and a reflow", async () => {
  const before = `${ROW}const a = <Row gap="field" className="justify-end flex-wrap" />;\n`;
  const after = `${ROW}const a = (\n  <Row gap="field" className="flex-wrap" justify="end" />\n);\n`;
  await expect(check(planAt(columnOf(before.split("\n")[1] ?? "", '"justify-end')), before, after)).resolves.toEqual([]);
});

test("a second element on the line, rewritten without a plan row, fails", async () => {
  const line = '<div><Row className="justify-end" /><Row className="justify-center justify-end" /></div>';
  const before = `${ROW}${line};\n`;
  const after = `${ROW}<div><Row justify="end" /><Row className="justify-center" justify="end" /></div>;\n`;
  await expect(check(planAt(columnOf(line, '"justify-end')), before, after)).resolves.toEqual([`${PATH}:2 Row: the plan does not list this element`]);
  // With a row for it, the real recipe still catches it: `justify-center` won over nothing before and evicts the arm now.
  const [failure] = await check(planAt(columnOf(line, '"justify-end'), columnOf(line, '"justify-center')), before, after);
  expect(failure).toContain('wrote "');
  expect(failure).toContain("justify-center");
});

test("a class expression the check cannot read fails, whatever the plan said", async () => {
  const before = `${ROW}<Row className={cn(edgeClass(), "justify-end")} />;\n`;
  const after = `${ROW}<Row className={cn(edgeClass())} justify="end" />;\n`;
  await expect(check(planAt(0, 30), before, after)).resolves.toEqual([`${PATH}:2 Row: edgeClass() cannot be evaluated`]);
});

test("an arm that writes more than the reader saw fails on the real recipe", async () => {
  const before = `${CARD}<Card className="outline-none" />;\n`;
  const after = `${CARD}<Card focusable={true} />;\n`;
  const [failure] = await check({ ...planAt(0, 20), owner: "card.focusable" }, before, after);
  expect(failure).toContain("focus-visible:ring-ring");
});

test("a non-literal prop runs every arm, and past the bound the check refuses instead of enumerating", async () => {
  const line = '<Row gap={gap} className="justify-end" />';
  const before = `${ROW}${line};\n`;
  const plan = planAt(columnOf(line, '"justify-end'));
  await expect(check(plan, before, `${ROW}<Row gap={gap} justify="end" />;\n`)).resolves.toEqual([]);
  const wide = '<Stack padding={a} reach={b} paddingInlineStart={c} paddingInlineEnd={d} className="px-section" />';
  const [failure] = await check(
    planAt(columnOf(wide, '"px-section')),
    `${STACK}${wide};\n`,
    `${STACK}<Stack padding={a} reach={b} paddingInlineStart={c} paddingInlineEnd={d} paddingInline="section" />;\n`,
  );
  expect(failure).toContain("exceed 64 states");
});

test("the door's computed axes write the same on both sides of a move, so they cost no states", async () => {
  const line = '<Button className="justify-start text-start" />';
  await expect(check(planAt(columnOf(line, '"justify-start')), `${BUTTON}${line};\n`, `${BUTTON}<Button justify="start" />;\n`)).resolves.toEqual([]);
});

test("a move only one value of an open prop can break fails on that value, so the prop was not left out", async () => {
  // A square's compound writes its own inline size after every axis, so it evicts `width` and not the class.
  const line = '<Button size="chip" square={square} className="inline-full" />';
  const [failure] = await check(
    planAt(columnOf(line, '"inline-full')),
    `${BUTTON}${line};\n`,
    `${BUTTON}<Button size="chip" square={square} width="full" />;\n`,
  );
  expect(failure).toContain("inline-(--size-touch-target)");
});

test("a move that only the door's default breaks fails, because the check renders with the door's own defaults", async ({ scratch }) => {
  const root = plantDir(scratch, "default-breaks");
  plantFile(root, "packages/ui/package.json", JSON.stringify({ exports: { "./box": "./src/primitives/box/index.ts" } }));
  plantFile(root, "packages/ui/src/primitives/box/index.ts", 'export { Box } from "./box.tsx";');
  plantFile(
    root,
    "packages/ui/src/primitives/box/variants.ts",
    [
      "const tv = (table) => (props) => [",
      "  ...Object.entries(table.variants).map(([axis, arms]) => arms[String(props[axis] ?? table.defaultVariants[axis])] ?? ''),",
      "].join(' ');",
      "export const boxVariants = tv({",
      "  variants: { flag: { true: 'text-label', false: '' }, step: { low: 'text-micro', high: 'text-body' } },",
      "  defaultVariants: { step: 'high' },",
      "});",
    ].join("\n"),
  );
  plantFile(
    root,
    "packages/ui/src/primitives/box/box.tsx",
    "export function Box({ flag, step, className }) {\n  return <div className={boxVariants({ flag, step, className })} />;\n}",
  );
  const line = '<Box className="text-label" />';
  const file = { path: PATH, before: `${BOX}${line};\n`, after: `${BOX}<Box flag={true} />;\n` };
  const plan = { ...planAt(columnOf(line, '"text-label')), owner: "box.flag" };
  const [failure] = await recipeFailures(root, plan, [file], componentTables(root, loadSources(root)));
  expect(failure).toContain("text-body");
});

test("a compound that joins a kept-out axis to the changed prop still renders", async () => {
  const line = '<Button size={size} className="shrink-0 p-0" />';
  const [failure] = await check(planAt(columnOf(line, '"shrink-0')), `${BUTTON}${line};\n`, `${BUTTON}<Button size={size} square={true} />;\n`);
  expect(failure).toContain("inline-(--size-touch-target)");
});

test("a compound joining an open prop to the changed one renders that prop, though no class of it conflicts with the move", async ({ scratch }) => {
  const root = plantDir(scratch, "compound-reach");
  plantFile(root, "packages/ui/package.json", JSON.stringify({ exports: { "./box": "./src/primitives/box/index.ts" } }));
  plantFile(root, "packages/ui/src/primitives/box/index.ts", 'export { Box } from "./box.tsx";');
  plantFile(
    root,
    "packages/ui/src/primitives/box/variants.ts",
    [
      "const tv = (table) => (props) => [",
      "  ...Object.entries(table.variants).map(([axis, arms]) => arms[String(props[axis])] ?? ''),",
      "  ...table.compoundVariants.filter(({ class: written, ...when }) => Object.entries(when).every(([axis, arm]) => props[axis] === arm)).map((one) => one.class),",
      "].join(' ');",
      "export const boxVariants = tv({",
      "  variants: { tone: { low: 'text-label', high: 'text-body' }, flag: { true: 'shrink-0', false: '' } },",
      "  compoundVariants: [{ tone: 'low', flag: true, class: 'italic' }],",
      "});",
    ].join("\n"),
  );
  plantFile(
    root,
    "packages/ui/src/primitives/box/box.tsx",
    "export function Box({ tone, flag, className }) {\n  return <div className={boxVariants({ tone, flag, className })} />;\n}",
  );
  const line = '<Box tone={tone} className="shrink-0" />';
  const file = { path: PATH, before: `${BOX}${line};\n`, after: `${BOX}<Box tone={tone} flag={true} />;\n` };
  const plan = { ...planAt(columnOf(line, '"shrink-0')), owner: "box.flag" };
  const [failure] = await recipeFailures(root, plan, [file], componentTables(root, loadSources(root)));
  expect(failure).toContain("italic");
});

test("a change outside the planned elements fails", async () => {
  const line = '<Row className="justify-end" />';
  const before = `${ROW}${line};\n`;
  const after = `${ROW}<Row justify="end" />;\nconst extra = 2;\n`;
  await expect(check(planAt(columnOf(line, '"justify-end')), before, after)).resolves.toEqual([`${PATH}: text outside the planned elements changed`]);
});
