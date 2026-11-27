// @subject tooling/src/snap/ops/drive-actions.ts
// A live `--resize` re-windows the run's environment contract with the page, so the run's closing environment check reads the new
// size as the asked-for one and does not fail the run for the window it just set.
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { scaledBudget } from "../../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(60_000);
const PAGE_HTML = `<!doctype html><html data-app-ready="settled"><body><main>resize plant</main></body></html>`;

test("a run that resizes its window passes its environment check, and a run with no resize does too", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "page.html": PAGE_HTML });
  const argv = ["--file", `${root}/page.html`, "--viewport", "800x600", "--no-shot", "--no-deadcss", "--no-failure-evidence"];

  const control = await runCli("snap", argv, { timeoutMs: BROWSER_TIMEOUT_MS });
  await expect(control).toExitWith(EXIT.clean);
  expect(control.stdout).toContain("environment-fails=0");

  const resized = await runCli("snap", [...argv, "--resize", "400x300"], { timeoutMs: BROWSER_TIMEOUT_MS });
  await expect(resized).toExitWith(EXIT.clean);
  expect(resized.stdout).toContain("environment-fails=0");
});
