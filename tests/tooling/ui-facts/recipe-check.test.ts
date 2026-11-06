import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import type { MigrationPlan } from "../../../tooling/src/ui-facts/migration.ts";
import { recipeFailures } from "../../../tooling/src/ui-facts/recipe-check.ts";
import { loadSources } from "../../../tooling/src/ui-facts/source.ts";
import { componentTables } from "../../../tooling/src/ui-facts/variant-tables.ts";

const REPO_ROOT = join(import.meta.dirname, "../../..");
const TABLES = componentTables(REPO_ROOT, loadSources(REPO_ROOT));
const PATH = "packages/client/src/features/probe/uses.tsx";
const ROW = 'import { Row } from "@orb/ui/layout";\n';
const CARD = 'import { Card } from "@orb/ui/card";\n';

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
  const wide = '<Row gap={gap} align={align} tone={tone} className="justify-end" />';
  const [failure] = await check(
    planAt(columnOf(wide, '"justify-end')),
    `${ROW}${wide};\n`,
    `${ROW}<Row gap={gap} align={align} tone={tone} justify="end" />;\n`,
  );
  expect(failure).toContain("exceed 64 states");
});

test("a change outside the planned elements fails", async () => {
  const line = '<Row className="justify-end" />';
  const before = `${ROW}${line};\n`;
  const after = `${ROW}<Row justify="end" />;\nconst extra = 2;\n`;
  await expect(check(planAt(columnOf(line, '"justify-end')), before, after)).resolves.toEqual([`${PATH}: text outside the planned elements changed`]);
});
