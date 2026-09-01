import { EXIT } from "../../../../tooling/src/_shared/exit-contract.ts";
import { aggregateUiAuditMatrixExit } from "../../../../tooling/src/ui-audit/ops/matrix.ts";
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

test("matrix aggregation preserves child instrument errors over product violations", () => {
  expect(aggregateUiAuditMatrixExit([EXIT.clean, EXIT.violations, EXIT.toolError])).toEqual({
    verdict: EXIT.toolError,
    violations: 1,
    instrumentErrors: 1,
  });
  expect(aggregateUiAuditMatrixExit([EXIT.clean, EXIT.violations])).toEqual({ verdict: EXIT.violations, violations: 1, instrumentErrors: 0 });
  expect(aggregateUiAuditMatrixExit([EXIT.clean, EXIT.clean])).toEqual({ verdict: EXIT.clean, violations: 0, instrumentErrors: 0 });
  expect(aggregateUiAuditMatrixExit([EXIT.misuse])).toEqual({ verdict: EXIT.toolError, violations: 0, instrumentErrors: 1 });
});
