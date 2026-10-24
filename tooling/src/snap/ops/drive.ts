// The page DRIVE: navigation + app-readiness (the dataless tripwire, #145), the argv-ordered action
// queue (navs + steps + mid-chain evals — the interleave IS the contract, 2026-08-15/16), and the
// trailing-eval split that keeps a trailing `--eval` a settled-surface observer.

import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import { awaitDevClientReady } from "#dev";
import { settle } from "../../floor/browser/browser.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { Args, DriveFailure } from "../contract/types.ts";
import { COLD_START_READY_TIMEOUT_MS, MOUNT_SETTLE_MS, NETWORKIDLE_TIMEOUT_MS, WAIT_SELECTOR_TIMEOUT_MS } from "../lib/budgets.ts";
import { READ_FAILURE_SURFACE_JS } from "../lib/failure-surface.ts";
import { markStageSettled, markStageUnsettled } from "../lib/stage-run-binding.ts";
import { driveBudgets } from "../lib/throttle.ts";
import { waitDriveFailure } from "./drive-failure-naming.ts";
import { MS_PER_SECOND } from "./flags-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** Did the app reach a SETTLED state? `settled` = the flag went up on a real query-cache idle; `degraded` =
 *  app-ready-signal's ceiling handed the flag over with reads still running; `dataless` = the flag says settled
 *  but the app never reached its data layer at all; `notFound` = the app resolved and declared its own
 *  not-found boundary (`data-app-failure="not-found"`, `routes/__root.tsx`) — a real, deterministic render,
 *  never a boot failure; `absent` = it never went up. */
const APP_READINESS = ["settled", "degraded", "dataless", "notFound", "absent"] as const;
type AppReadiness = (typeof APP_READINESS)[number];
const NOT_FOUND_FAILURE_KIND = "not-found";

/** THE DATALESS TRIPWIRE (issue #145). `data-app-ready` claims a settle from an IDLE query cache, and an
 *  idle cache also describes an app that never got as far as its first read — which is exactly what a stage
 *  stuck on the router's pending component looks like. That shape screenshotted the boot glyph and reported
 *  a clean wait for as long as `snap --isolated` has existed. An EMPTY cache (not idle — empty: zero query
 *  entries ever created) is the signal, and it is never legitimate here: every route this app serves mounts
 *  `useAuthConfig` (`data/auth-config.ts`), so a settled app has read something. `__orb` is dev-only — a
 *  build without the bridge answers `null` and we make no claim rather than a false one. */
async function everReadAnything(page: Page): Promise<boolean | null> {
  // probe-whose-failure-is-its-return-value — a build without the __orb bridge, or a probe that throws, returns null and the caller "makes no claim rather than a false one" (doc comment above). Ends if a caller starts trusting null as a positive settle.
  const count = await page.evaluate("window.__orb ? window.__orb.queries().length : null").catch(() => null);
  return typeof count === "number" ? count > 0 : null;
}

async function appReadiness(page: Page, timeoutMs: number): Promise<AppReadiness> {
  const flag = page.locator("html[data-app-ready]");
  // a failed wait converts to attached=false and appReadiness returns absent; navigate maps absent to UNSETTLED_REASON and returns it as navError, which capture.ts stores in outcome.navError for verdict.ts and report.ts. Ends if absent stops mapping to a navError.
  const attached = await flag
    .waitFor({ state: "attached", timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
  if (!attached) {
    return "absent";
  }
  // THE NOT-FOUND DISCRIMINATOR (#1837 misdiagnosis). An unknown route resolves through beforeLoad's
  // `throw notFound()`, mounts the root's not-found boundary and settles `data-app-ready` on a cache
  // that never got a read — the exact shape `dataless` exists to catch, but this is the app correctly
  // saying "there is nothing here", not a boot placeholder. Checked BEFORE degraded/dataless so neither
  // arm ever mislabels it.
  // probe-whose-failure-is-its-return-value — a build without the __orb-free declare, or a probe that throws, reads null and falls through to the ordinary ladder below. Ends if a caller starts trusting null as "not not-found".
  const failureKind = await page.evaluate(READ_FAILURE_SURFACE_JS).catch(() => null);
  if (failureKind === NOT_FOUND_FAILURE_KIND) {
    return "notFound";
  }
  if ((await flag.getAttribute("data-app-ready")) === "degraded") {
    return "degraded";
  }
  return (await everReadAnything(page)) === false ? "dataless" : "settled";
}

/** A non-settled first navigation is a failed capture, never a warm-up pass. */
const UNSETTLED_REASON: Record<Exclude<AppReadiness, "settled">, string> = {
  absent:
    "app never signalled data-app-ready — the capture is MID-HYDRATION, not the settled app. This first navigation failed; inspect its browser evidence and preserved stack log.",
  degraded:
    "data-app-ready came up DEGRADED — reads were still in flight at the client's own readiness ceiling, so the capture is mid-hydration, not the settled app. This first navigation failed; inspect its browser evidence and preserved stack log.",
  dataless:
    "data-app-ready came up settled but the query cache is EMPTY — the app never reached its data layer, so this capture is a boot placeholder, not the app. This first navigation failed; inspect its browser evidence and preserved stack log.",
  notFound:
    'NOT-FOUND — the app rendered its own not-found boundary (data-app-failure="not-found") for this route. This is the app resolving cleanly and saying the route does not exist; it is NOT a boot failure, an empty query cache is expected here, and re-navigating (isolated or not) will not change the verdict. Check the route against the section vocabulary (packages/client/src/state/section-ids.ts SECTION_IDS), or drive client-state navigation instead of a URL with --goto <section>/--goto config:<group>.',
};

/** A resolved app (settled, or its own not-found boundary) proves the stage serves; anything else is a miss. */
function latchStageReadiness(readiness: AppReadiness): void {
  if (readiness === "settled" || readiness === "notFound") {
    markStageSettled();
  } else {
    markStageUnsettled(`the stage's first navigation came back ${readiness}`);
  }
}

export async function navigate(page: Page, opts: Args, url: string, failures?: DriveFailure[]): Promise<string | null> {
  // The ceilings are a function of the STAGE (a cold vite) AND of the declared LOAD ARM (#836) — see
  // lib/throttle.ts driveBudgets for why a throttled run cannot be held to the un-throttled budget.
  const budgets = driveBudgets({ isolated: opts.isolated, cpuRate: opts.cpuThrottle, network: opts.network });
  const navTimeout = budgets.nav;
  const resp = opts.coldStart
    ? await awaitDevClientReady(page, url, Date.now() + COLD_START_READY_TIMEOUT_MS)
    : await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
  let navError: string | null = null;
  if (!resp) {
    navError = "no response";
  } else if (!resp.ok()) {
    navError = `HTTP ${resp.status()}`;
  }
  // Default readiness gate: app-ready-signal.ts sets `data-app-ready` on <html> once the initial reads
  // settle — independent of the never-idle SSE stream. Wait for it so snaps capture the SETTLED app,
  // not mid-hydration skeletons (the "lists sit on skeletons forever" friction). Graceful: a non-app
  // page or an old build that never sets it just falls through, so this only ever adds real load-wait,
  // never a hang.
  // --file (a static mock over file://) has no app and never sets the flag — waiting would burn the full
  // timeout on EVERY mock snap, so skip it there rather than pay a guaranteed-useless wait.
  //
  // THE RESULT IS REPORTED, NOT SWALLOWED (2026-08-09). This used to `.catch(() => undefined)` the whole
  // wait, so a page that never signalled ready produced a mid-hydration capture and a clean report — the
  // instrument failing open. It now reads the flag's VALUE too: app-ready-signal hands over `degraded` when its
  // ceiling fires with reads still in flight. Either shape is a nav error on a route we are serving,
  // because the capture below is NOT of the settled app and every downstream assertion about it is void.
  if (opts.file === null) {
    const readiness = await appReadiness(page, budgets.ready);
    if (readiness !== "settled") {
      navError ??= UNSETTLED_REASON[readiness];
    }
    if (opts.isolated) {
      latchStageReadiness(readiness);
    }
  }
  // Even a non-OK nav may still render something worth waiting for (SPA error page).
  if (opts.waitSelector !== null) {
    // The throw still propagates (ops/capture.ts owns it as outcome.navError and screenshots wherever the
    // page got to) — but the STRUCTURED row is minted here, where the selector that never appeared is
    // still in hand, so the end card names the argv to correct instead of a `nav/wait threw:` prose blob.
    try {
      await page.locator(opts.waitSelector).first().waitFor({ state: "visible", timeout: WAIT_SELECTOR_TIMEOUT_MS });
    } catch (error) {
      failures?.push(waitDriveFailure(opts.waitSelector, errorMessage(error)));
      throw error;
    }
  }
  return navError;
}

export async function settlePage(page: Page, opts: Args): Promise<void> {
  if (opts.idle) {
    // Wait for the network to go quiet (bounded) — a real settle for routes whose
    // content lands via deferred queries, instead of guessing a timeout.
    // bounded best-effort settle — a chatty stream must never block the shot, per the trailing comment. Ends if the timeout bound is removed.
    // biome-ignore lint/suspicious/noPlaywrightNetworkidle: explicit opt-in (--idle) with a hard bound — settling on network-quiet IS the flag's contract.
    await page.waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS }).catch(() => {
      /* bounded — a chatty stream must never block the shot */
    });
  }
  if (opts.sseSeconds > 0) {
    await settle(page, opts.sseSeconds * MS_PER_SECOND);
  } else if (!opts.idle) {
    await settle(page, MOUNT_SETTLE_MS);
  }
}
