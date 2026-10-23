import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { readSnapEvalValues } from "../../../../tooling/src/snap/lib/run-report-evals.ts";

const EXPRESSION = "document.title";

test("eval artifacts preserve value/error wire rows and normalize the unused field", async ({ plantedTree }) => {
  const root = await plantedTree({
    "evals.json": JSON.stringify({
      v: 1,
      evals: [
        { page: 0, expression: EXPRESSION, value: "", error: null },
        { page: 1, expression: EXPRESSION, value: null, error: "" },
        { page: 2, expression: EXPRESSION, value: "title", error: 7 },
        { page: 3, expression: EXPRESSION, value: false, error: "blocked" },
      ],
    }),
  });
  expect(await readSnapEvalValues(`${root}/evals.json`)).toEqual([
    { page: 0, expression: EXPRESSION, value: "", error: null },
    { page: 1, expression: EXPRESSION, value: null, error: "" },
    { page: 2, expression: EXPRESSION, value: "title", error: null },
    { page: 3, expression: EXPRESSION, value: null, error: "blocked" },
  ]);
});

test.for([
  { name: "both value and error", row: { page: 0, expression: EXPRESSION, value: "title", error: "blocked" } },
  { name: "neither value nor error", row: { page: 0, expression: EXPRESSION, value: null, error: null } },
  { name: "fractional page", row: { page: 0.5, expression: EXPRESSION, value: "title", error: null } },
  { name: "non-string expression", row: { page: 0, expression: 5, value: "title", error: null } },
])("eval artifacts reject $name", async ({ row }, { plantedTree }) => {
  const root = await plantedTree({ "evals.json": JSON.stringify({ v: 1, evals: [row] }) });
  await expect(readSnapEvalValues(`${root}/evals.json`)).rejects.toThrow("malformed eval row (value XOR error)");
});
