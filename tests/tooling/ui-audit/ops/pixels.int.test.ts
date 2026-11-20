// The pictures-painted wait in the pixel pass takes its ceiling from the invocation it runs in. A snap host runs many
// invocations in one process and begins a load epoch for each, so a ceiling baked in at import would hold the first
// invocation's box reading for every later one.

import { expect, test } from "@orb/testkit/tooling";
import { BOX_LOAD_ENV, beginLoadEpoch } from "@orb/tooling/floor/host/load-budget";
import { withProcessEnv } from "@orb/tooling/floor/process/process-env";
import { chromium } from "@playwright/test";
import { UI_AUDIT_CEILINGS_MS } from "../../../../tooling/src/ui-audit/lib/budgets.ts";
import { settleHeldBackdrops } from "../../../../tooling/src/ui-audit/ops/pixels.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CASE_TIMEOUT_MS = scaledBudget(30_000);
const QUIET_BOX = "0.2/24";
const LOADED_BOX = "60/24";

// Records every timer the page's own scripts arm, so the wait's ceiling is read where it takes effect.
const RECORD_TIMERS = `(() => {
  const armed = [];
  const original = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...rest) => { armed.push(ms); return original(fn, ms, ...rest); };
  globalThis.__armedTimers = armed;
})()`;

// One forced read whose backdrop the walk could not resolve, so the pass asks the page for painted pixels.
const HELD_READ = {
  index: 0,
  color: { r: 0, g: 0, b: 0 },
  backdrop: { kind: "unresolved", reason: "no-opaque-base", fallback: { r: 255, g: 255, b: 255 } },
  opacity: 1,
  box: { x: 0, y: 0, width: 40, height: 20 },
} as const;

test("a second invocation in one process waits for pictures under its own load ceiling", { timeout: CASE_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<main><p>held text</p></main>");
    await page.evaluate(RECORD_TIMERS);
    const armedFor = async (box: string): Promise<{ readonly armed: number; readonly ceiling: number }> =>
      await withProcessEnv(BOX_LOAD_ENV, box, async () => {
        beginLoadEpoch();
        await settleHeldBackdrops(page, [HELD_READ]);
        const armed = await page.evaluate<readonly number[]>("globalThis.__armedTimers");
        return { armed: armed.at(-1) ?? -1, ceiling: UI_AUDIT_CEILINGS_MS.picturesPainted };
      });
    const quiet = await armedFor(QUIET_BOX);
    const loaded = await armedFor(LOADED_BOX);
    // The positive control: the loaded box stretches the ceiling, so the two invocations must arm different waits.
    expect(loaded.ceiling).toBeGreaterThan(quiet.ceiling);
    expect(quiet.armed).toBe(quiet.ceiling);
    expect(loaded.armed).toBe(loaded.ceiling);
  } finally {
    await browser.close();
  }
});
