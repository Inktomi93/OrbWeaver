// The agent-sync cli's exit contract through the REAL binary. `--check` is a `pnpm check` stage, so its
// codes are load-bearing: a stale mirror must read as VIOLATIONS (1), never as a crashed tool (2) — the
// pre-move script threw on staleness, which node reports as 1 and the runner would now escalate to 2.
import { expect, test } from "../../support/tool-fixtures.ts";

test("agent-sync --check reports the mirror as current on a synced tree", async ({ runCli }) => {
  const res = await runCli("agent-sync", ["--check"]);
  await expect(res).toExitWith(0);
  expect(res.stdout).toContain("Codex agent manifests: current");
});

test("agent-sync refuses an unknown flag as misuse, writing nothing", async ({ runCli }) => {
  const res = await runCli("agent-sync", ["--rewrite-everything"]);
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain("usage: pnpm agents:sync");
});
