import { parseCssStylesheet } from "../../../../tooling/src/verify/lib/css-rules.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("nested rules and direct at-rule declarations retain source order and ownership", () => {
  const parsed = parseCssStylesheet("@layer theme {\n  --seed: var(--base);\n  .outer {\n    color: red;\n    & .inner { color: blue; }\n  }\n}\n");

  expect(parsed.rules.map((rule) => rule.selectorList)).toEqual([".outer", "& .inner"]);
  expect(parsed.rules.map((rule) => rule.braceStart)).toEqual([47, 78]);
  expect(parsed.atRules).toHaveLength(1);
  expect(parsed.atRules[0]).toMatchObject({
    prelude: "@layer theme",
    line: 1,
    offset: 0,
    declarations: [expect.objectContaining({ prop: "--seed", value: "var(--base)", line: 2, column: 3, offset: 17, valueOffset: 25 })],
  });
});
