// --watch: the timed observation series (screenshot + eval re-runs per tick) for streaming/transient
// states no single-shot capture can see. The block printer lives with its report siblings.
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import { settle } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args, WatchTick } from "../contract/types.ts";
import { PNG_EXT_RE, shouldProduceShot } from "../lib/out-names.ts";
import { captureEvals } from "./arms/eval.ts";
import { SHOT_BASE } from "./arms/shot.ts";
import { watchIntervalMs } from "./flags-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export async function runWatchSeries(page: Page, opts: Args, out: string): Promise<WatchTick[]> {
  const ticks: WatchTick[] = [];
  const intervalMs = watchIntervalMs(opts);
  const page0Evals = opts.eval.filter((e) => e.page === 0).map((e) => e.expr);
  const start = Date.now();
  let elapsed = 0;
  while (elapsed <= opts.watchMs) {
    const shotPath = shouldProduceShot(opts) ? out.replace(PNG_EXT_RE, `-t${elapsed}.png`) : null;
    // `--no-shot --watch` is the cheap state-series path: repeat evals without minting dozens of images.
    // @orb-gate-ignore caught-failure-ownership(promise:screenshot): captured into shotError on the returned tick, which report.ts prints as FAILED and run.ts counts into the verdict. Ends if that count/print stops being read.
    const shotError = shotPath === null ? null : await page.screenshot({ path: shotPath, ...SHOT_BASE }).then(() => null, errorMessage);
    const evals = page0Evals.length > 0 ? await captureEvals(page, page0Evals) : [];
    ticks.push({ elapsedMs: elapsed, shot: shotPath, shotError, evals });
    if (elapsed >= opts.watchMs) {
      break;
    }
    await settle(page, intervalMs);
    elapsed = Date.now() - start;
  }
  return ticks;
}
