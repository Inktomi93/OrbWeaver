// @instrument-proof: a fixture page whose __orb bridge reports a PLANTED breaching snapshot (a 200ms
// blocking LoAF with style/layout in-frame, plus non-virtualized CLS 0.5) must exit 1 through the real
// cli; the in-budget twin must exit 0 — the budget arms cannot pass vacuously on a page whose bridge
// reports nothing. The plant sits at the instrument's INPUT CONTRACT (__orb is app-only; a static page
// has none), which is exactly the mustFlag discipline extended to the cli tier.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../support/tool-fixtures.ts";

const CLI_TIMEOUT_MS = 90_000;

/** A minimal __orb bridge whose motion() answers with the given snapshot. */
function page(motionJson: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title><script>
globalThis.__orb = {
  motion: () => (${motionJson}),
  animations: () => [],
  resetEvidence: () => {},
  motionFlaggersSettled: () => true,
  setMotionAuditDropTrackingPaused: () => {},
};
</script></head><body><main>fixture</main></body></html>`;
}

const BREACHING = `{
  loafs: [{ startTime: 100, duration: 260, blockingDuration: 200, styleAndLayoutStart: 120, scripts: [] }],
  cls: 0.5, virtualizedCls: 0, nonVirtualizedCls: 0.5, worstBlocking: 200, worstShift: 0.5
}`;
const CLEAN = "{ loafs: [], cls: 0, virtualizedCls: 0, nonVirtualizedCls: 0, worstBlocking: 0, worstShift: 0 }";

test("a planted breaching motion snapshot REDs the audit through the real cli", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "jank.html"), page(BREACHING));
  const res = await runCli("motion-audit", ["/jank.html", "--base", `file://${scratch}`, "--window", "50", "--no-throttle"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("FAIL");
  expect(res).toExitWith(1);
});

test("the in-budget twin passes — the red above is the plant, not the harness", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "smooth.html"), page(CLEAN));
  const res = await runCli("motion-audit", ["/smooth.html", "--base", `file://${scratch}`, "--window", "50", "--no-throttle"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("PASS");
  expect(res).toExitWith(0);
});

test("an unknown flag is CLI misuse before any browser boots", async ({ runCli }) => {
  const res = await runCli("motion-audit", ["--open-caht", "latest"]);
  expect(res).toExitWith(3);
});
