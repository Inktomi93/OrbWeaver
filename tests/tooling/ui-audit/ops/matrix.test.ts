import { parseAuditArgs } from "../../../../tooling/src/ui-audit/ops/parse.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("--matrix arms the representative consumer without changing ordinary audit defaults", () => {
  const matrix = parseAuditArgs(["/configuration", "--matrix", "--out", "rated"]);
  expect(matrix.matrix).toBe(true);
  expect(matrix.route).toBe("/configuration");
  expect(matrix.out).toBe("rated");
  expect(matrix.errors).toEqual([]);

  expect(parseAuditArgs(["/"]).matrix).toBe(false);
});

test("--matrix refuses single-cell appearance, theme, and device overrides", () => {
  const parsed = parseAuditArgs(["--matrix", "--mobile", "--theme", "Light", "--appearance", '{"density":"compact"}']);
  expect(parsed.errors).toContain("--matrix owns appearance/theme/device axes; drop: --mobile, --appearance, --theme");
});
