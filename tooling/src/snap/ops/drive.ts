// The page DRIVE: navigation + app-readiness (the dataless tripwire, #145), the argv-ordered action
// queue (navs + steps + mid-chain evals — the interleave IS the contract, 2026-08-15/16), and the
// trailing-eval split that keeps a trailing `--eval` a settled-surface observer.
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import { print } from "../../_shared/artifacts.ts";
import { settle } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args, DriveFailure } from "../contract/types.ts";
import { MOUNT_SETTLE_MS, NETWORKIDLE_TIMEOUT_MS, WAIT_SELECTOR_TIMEOUT_MS } from "../lib/budgets.ts";
import { READ_FAILURE_SURFACE_JS } from "../lib/failure-surface.ts";
import { markStageBootDead } from "../lib/stage-run-binding.ts";
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
  // @orb-waive caught-failure-ownership(page.evaluate): probe-whose-failure-is-its-return-value — a build without the __orb bridge, or a probe that throws, returns null and the caller "makes no claim rather than a false one" (doc comment above). Ends if a caller starts trusting null as a positive settle.
  const count = await page.evaluate("window.__orb ? window.__orb.queries().length : null").catch(() => null);
  return typeof count === "number" ? count > 0 : null;
}

async function appReadiness(page: Page, timeoutMs: number): Promise<AppReadiness> {
  const flag = page.locator("html[data-app-ready]");
  // @orb-waive caught-failure-ownership(waitFor): failure IS the return value — converts to attached=false, which becomes the "absent" readiness arm fed into UNSETTLED_REASON and reported as navError below. Ends if that reporting chain is removed.
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
  // @orb-waive caught-failure-ownership(page.evaluate): probe-whose-failure-is-its-return-value — a build without the __orb-free declare, or a probe that throws, reads null and falls through to the ordinary ladder below. Ends if a caller starts trusting null as "not not-found".
  const failureKind = await page.evaluate(READ_FAILURE_SURFACE_JS).catch(() => null);
  if (failureKind === NOT_FOUND_FAILURE_KIND) {
    return "notFound";
  }
  if ((await flag.getAttribute("data-app-ready")) === "degraded") {
    return "degraded";
  }
  return (await everReadAnything(page)) === false ? "dataless" : "settled";
}

/** Why a non-settled readiness voids the capture — one line per arm, mapped exhaustively so a new arm
 *  cannot be added without its reason. NONE of them tells a STAGE reader to re-run: on `--isolated` the
 *  warm-up navigation has already been paid inside this run (`readinessWithColdStageWarmup`), so reaching
 *  any of these lines there means the SECOND, warm navigation failed too. */
const UNSETTLED_REASON: Record<Exclude<AppReadiness, "settled">, string> = {
  absent:
    "app never signalled data-app-ready — the capture is MID-HYDRATION, not the settled app. On `--isolated` the cold-stage warm-up navigation has ALREADY been retried inside this run (#1142), so reaching this line there means the stage's app does not mount at all: read the stage's stack log (preserved into this run's slot) rather than re-running. Elsewhere (the dev stack, `--base`) this is the app itself failing to mount.",
  degraded:
    "data-app-ready came up DEGRADED — reads were still in flight at the client's own readiness ceiling, so the capture is mid-hydration, not the settled app. On `--isolated` the warm-up navigation has ALREADY been retried inside this run (#1837), so reaching this line there is a stage whose SECOND, warm navigation still could not settle: read the stage's stack log (preserved into this run's slot) rather than re-running.",
  dataless:
    "data-app-ready came up settled but the query cache is EMPTY — the app never reached its data layer, so this capture is a boot placeholder (the router's pending glyph), not the app. On `--isolated` the warm-up navigation has ALREADY been retried inside this run (#1837), so reaching this line there is a stage whose SECOND, warm navigation still served the placeholder: read the stage's stack log (preserved into this run's slot) rather than re-running.",
  notFound:
    'NOT-FOUND — the app rendered its own not-found boundary (data-app-failure="not-found") for this route. This is the app resolving cleanly and saying the route does not exist; it is NOT a boot failure, an empty query cache is expected here, and re-navigating (isolated or not) will not change the verdict. Check the route against the section vocabulary (packages/client/src/state/section-ids.ts SECTION_IDS), or drive client-state navigation instead of a URL with --goto <section>/--goto config:<group>.',
};

/** THE COLD-STAGE WARM-UP IS OURS TO PAY, NOT THE READER'S (#1142). A freshly created `--isolated` stage is
 *  a vite that has never transformed this route: the FIRST navigation drives the on-demand build and the app
 *  does not mount inside the readiness ceiling, so the run refused and told the reader to "re-run against the
 *  now-warm stage". Reproduced at FOUR shas: that re-run refused the SAME way and only the THIRD invocation
 *  measured — the message under-instructed by a whole run, which is the lying-instrument-message class.
 *
 *  The fix makes the promise TRUE rather than re-wording it: the warm-up navigation happens HERE, once,
 *  inside the run that provoked it, and ONLY for a stage. A dev-stack or `--base` origin that never mounts is
 *  a real app defect and still refuses on the first pass — retrying there would convert a finding into a
 *  slower finding. Bounded by the same two ceilings, so the worst case for a genuinely dead stage app is one
 *  extra nav+readiness ceiling paid once, instead of a third full CLI invocation paid by the caller.
 *
 *  AND IT COVERS EVERY NON-SETTLED ARM, NOT JUST `absent` (#1837). Scoping the retry to `absent` left the
 *  arm a cold stage ACTUALLY produces uncovered, so every isolated boot at today's tip refused: measured on a
 *  QUIET box (load 3.8/24, budget-factor 1.00) at d5adb9103, `snap / --isolated` came back
 *  `nav=ERROR / degraded`, and its HAR is 1375 entries of which ~1370 are vite source-module transforms
 *  served one at a time over 28.7 s — with exactly ONE api call in the whole trace (`/api/auth/me`, 19 ms,
 *  200), zero page errors and zero failed requests. A fresh stage worktree has an empty React-Compiler
 *  transform cache (packages/client/vite.config.ts #593), so it pays the cold pass e2e's globalSetup exists
 *  to absorb; the app is never waiting on a read. The CLIENT's own readiness ceiling is a hard 20 s that
 *  stamps `data-app-ready="degraded"` ONE-SHOT (packages/client/src/lib/app-ready-signal.ts), which is well
 *  inside snap's 60 s STAGE_READY budget — so on a cold stage the wait ALWAYS returns early carrying
 *  `degraded` and the 60 s budget is structurally unreachable. A fresh document gets a fresh one-shot signal,
 *  which is why the re-navigation settles: the same stage, re-run warm, came back `nav=OK` in 8 s. */
async function readinessWithColdStageWarmup(
  page: Page,
  opts: Args,
  url: string,
  budgets: { readonly nav: number; readonly ready: number },
): Promise<{ readonly readiness: AppReadiness; readonly httpError: string | null }> {
  const first = await appReadiness(page, budgets.ready);
  // NOT-FOUND IS NOT COLD VITE (#1837 misdiagnosis). It is a deterministic render off a real route
  // resolution, not a placeholder the warm-up pass could ever fix — retrying re-renders the same
  // not-found boundary and would then mark a perfectly healthy stage BOOT-DEAD for it.
  if (first === "settled" || first === "notFound" || !opts.isolated) {
    return { readiness: first, httpError: null };
  }
  print(`[snap-stage] the stage's first navigation came back ${first} (cold vite); re-navigating once before judging`);
  const retry = await page.goto(url, { waitUntil: "domcontentloaded", timeout: budgets.nav });
  const httpError = retry !== null && !retry.ok() ? `HTTP ${String(retry.status())}` : null;
  const readiness = await appReadiness(page, budgets.ready);
  if (readiness !== "settled" && readiness !== "notFound") {
    // A stage whose WARM navigation still cannot settle never served an app, so it is not the warm asset
    // #324 protects — it is a corpse holding a band and a process group (`lib/stage-run-binding.ts`).
    markStageBootDead(`the stage's warm-up re-navigation came back ${readiness}`);
  }
  return { readiness, httpError };
}

export async function navigate(page: Page, opts: Args, url: string, failures?: DriveFailure[]): Promise<string | null> {
  // The ceilings are a function of the STAGE (a cold vite) AND of the declared LOAD ARM (#836) — see
  // lib/throttle.ts driveBudgets for why a throttled run cannot be held to the un-throttled budget.
  const budgets = driveBudgets({ isolated: opts.isolated, cpuRate: opts.cpuThrottle, network: opts.network });
  const navTimeout = budgets.nav;
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
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
    const settled = await readinessWithColdStageWarmup(page, opts, url, { nav: navTimeout, ready: budgets.ready });
    if (navError === null) {
      navError = settled.httpError ?? (settled.readiness === "settled" ? null : UNSETTLED_REASON[settled.readiness]);
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
    // @orb-waive caught-failure-ownership(page.waitForLoadState): bounded best-effort settle — a chatty stream must never block the shot, per the trailing comment. Ends if the timeout bound is removed.
    // biome-ignore lint/nursery/noPlaywrightNetworkidle: explicit opt-in (--idle) with a hard bound — settling on network-quiet IS the flag's contract.
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
