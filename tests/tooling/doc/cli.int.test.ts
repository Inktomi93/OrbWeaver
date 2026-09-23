// The doc cli's exit contract through the REAL binary: misuse is 3, a refusal is 1 with nothing written,
// the read verbs are 0 on the real tree.
import { expect, test } from "../../support/tool-fixtures.ts";

test("misuse exits 3 and prints the usage", async ({ runCli }) => {
  const res = await runCli("doc", ["frobnicate"]);
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain("usage: pnpm doc <verb>");
});

test("a refused write exits 1 and writes nothing", async ({ runCli }) => {
  const res = await runCli("doc", ["set", "999999", "open"]);
  await expect(res).toExitWith(1);
  expect(res.stderr).toContain("NOTHING WRITTEN");
  expect(res.stdout).toBe("");
});

test("the read verbs exit 0 on the real tree, and help is 0", async ({ runCli }) => {
  await expect(await runCli("doc", ["help"])).toExitWith(0);
  const overview = await runCli("doc", ["overview"]);
  await expect(overview).toExitWith(0);
  expect(overview.stdout).toMatch(/^open \(\d+\)\n/u);
  const due = await runCli("doc", ["due", "docs/adr/*.md"]);
  await expect(due).toExitWith(0);
  expect(due.stdout).toMatch(/doc due — \d+ document\(s\) due for review/u);
});
