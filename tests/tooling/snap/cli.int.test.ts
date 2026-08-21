// @instrument-proof: plants a WCAG-failing low-contrast paragraph in a local mock and asserts the
// --contrast instrument REDs on it (exit 1, FAIL line) — with the readable twin as the negative control
// proving the instrument is not always-red. `--file` mode: no stack, a real headless chromium.
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { expect, test } from "../../support/tool-fixtures.ts";

const BAD_HTML = `<!doctype html><html><body style="background:#8a8a8a">
<p style="color:#7a7a7a;font-size:16px">barely there text</p>
</body></html>`;

const GOOD_HTML = `<!doctype html><html><body style="background:#ffffff">
<p style="color:#111111;font-size:16px">plainly readable text</p>
</body></html>`;

const BROWSER_TIMEOUT_MS = 60_000;

test("the contrast instrument REDs on a planted WCAG failure (and stays green on the readable twin)", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "bad.html": BAD_HTML, "good.html": GOOD_HTML });
  const bad = await runCli("snap", ["--file", `${root}/bad.html`, "--contrast", "p", "--text", "--no-failure-evidence"], { timeoutMs: BROWSER_TIMEOUT_MS });
  expect(bad.stdout).toContain("FAIL");
  await expect(bad).toExitWith(EXIT.violations);
  const good = await runCli("snap", ["--file", `${root}/good.html`, "--contrast", "p", "--text", "--no-failure-evidence"], { timeoutMs: BROWSER_TIMEOUT_MS });
  expect(good.stdout).toContain("PASS");
  await expect(good).toExitWith(EXIT.clean);
});

test("CLI misuse refuses before any browser boots (exit 3 posture is the parse contract)", async ({ runCli }) => {
  const res = await runCli("snap", ["--viewport", "banana", "--no-failure-evidence"]);
  expect(res.stdout).toContain("ARG ERROR");
  await expect(res).toExitWith(EXIT.misuse);
});
