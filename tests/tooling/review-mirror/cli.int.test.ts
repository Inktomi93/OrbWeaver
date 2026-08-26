import { expect, test } from "../../support/tool-fixtures.ts";

test("the manual front door documents fresh-target and evidence semantics", async ({ runCli }) => {
  const result = await runCli("review-mirror", ["--help"]);
  await expect(result).toExitWith(0);
  expect(result.stdout).toContain("fresh-target-dir");
  expect(result.stdout).toContain("review-mirror-evidence.json");
});

test("unknown options are misuse rather than a review verdict", async ({ runCli }) => {
  const result = await runCli("review-mirror", ["--schedule"]);
  await expect(result).toExitWith(3);
  expect(result.stderr).toContain("usage: pnpm review:mirror");
});
