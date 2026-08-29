import { expect, test } from "../../support/tool-fixtures.ts";

test("the manual front door documents fresh-target and evidence semantics", async ({ runCli }) => {
  const result = await runCli("review-mirror", ["--help"]);
  await expect(result).toExitWith(0);
  expect(result.stdout).toContain("fresh-target-dir");
  expect(result.stdout).toContain("review-mirror-evidence.json");
  expect(result.stdout).toContain("--evidence-out");
});

test("unknown options are misuse rather than a review verdict", async ({ runCli }) => {
  const result = await runCli("review-mirror", ["--schedule"]);
  await expect(result).toExitWith(3);
  expect(result.stderr).toContain("usage: pnpm review:mirror");
});

test("--evidence-out with no path is misuse, never a silent no-op", async ({ runCli }) => {
  const missingValue = await runCli("review-mirror", ["--evidence-out"]);
  await expect(missingValue).toExitWith(3);
  expect(missingValue.stderr).toContain("usage: pnpm review:mirror");

  const emptyValue = await runCli("review-mirror", ["--evidence-out="]);
  await expect(emptyValue).toExitWith(3);

  const flagAsValue = await runCli("review-mirror", ["--evidence-out", "--schedule"]);
  await expect(flagAsValue).toExitWith(3);
});

test("a second positional beyond the mirror target is misuse", async ({ runCli }) => {
  const result = await runCli("review-mirror", ["/tmp/mirror-a", "/tmp/mirror-b", "--evidence-out", "/tmp/e.json"]);
  await expect(result).toExitWith(3);
  expect(result.stderr).toContain("usage: pnpm review:mirror");
});
