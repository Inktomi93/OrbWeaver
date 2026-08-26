import { expect, test } from "../../support/tool-fixtures.ts";

test("the front door documents the report/source/window contract", async ({ runCli }) => {
  const result = await runCli("mutation-probe", ["--help"]);
  await expect(result).toExitWith(0);
  expect(result.stdout).toContain("<report.json>");
  expect(result.stdout).toContain("reports/mutation-probe/");
});

test("a missing source argument is misuse, not a measurement", async ({ runCli }) => {
  const result = await runCli("mutation-probe", ["reports/some.json"]);
  await expect(result).toExitWith(3);
  expect(result.stderr).toContain("usage: pnpm mutation:probe");
});

test("an empty survivor window is refused rather than measured as zero", async ({ runCli }) => {
  const result = await runCli("mutation-probe", ["reports/some.json", "packages/server/src/x.ts", "5:5"]);
  await expect(result).toExitWith(3);
  expect(result.stderr).toContain("measures nothing");
});
