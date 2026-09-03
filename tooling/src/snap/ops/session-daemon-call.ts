// One session CALL inside the daemon (docs/design/1208-instrument-substrate.md §3.3, §5, §10.1): re-parse
// the forwarded argv with the ONE validator, refuse a browser-lifetime flag on a later call, merge through
// the promoted partition, resolve the target (a route, a file, or the LIVE page), adopt the client's slot,
// open this call's evidence window over the daemon's rings, and run the SAME `runOnSession` the one-shot
// path runs — never a second capture path (invariant 4). Split from ops/session-daemon.ts (the process,
// socket and lifecycle) by nature: this file is the capture half.
import process from "node:process";
import { artifactFile, beginInstrumentRun, finishInstrumentRun } from "../../_shared/artifact-out.ts";
import { artifactKey, print, routeSlug } from "../../_shared/artifacts.ts";
import type { CapturedRequest, ProbeSession } from "../../_shared/browser.ts";
import { reassertOwnerViewport } from "../../_shared/browser-emulation-guard.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { SessionCallTarget, SessionRequest } from "../contract/session.ts";
import type { Args } from "../contract/types.ts";
import { shouldProduceShot } from "../lib/out-names.ts";
import {
  cascadeNotBootedRefusal,
  inheritSessionArgs,
  inheritSessionBinding,
  livePageSlug,
  neverNavigatedRefusal,
  sessionCallTarget,
  sessionOnlyFlagsIn,
  sessionOnlyFlagsRefusal,
} from "../lib/session-plan.ts";
import { refuseFileMode, snapDestination } from "./guards.ts";
import { parseSnapArgs } from "./parse.ts";
import { runOnSession } from "./run.ts";
import { cascadeRuntimeFor } from "./session.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session <name> <route>");

const ABOUT_BLANK = "about:blank";

/** What the capture half needs from the daemon: the live browser, the boot args, and the rings it keeps
 *  across calls. Mutable by design — `calls` and `requestLog` are the daemon's lifetime state. */
export interface SessionCallState {
  readonly name: string;
  readonly root: string;
  readonly session: ProbeSession;
  readonly bootArgs: Args;
  /** Requests the launcher's per-page map held before each later call rolled it into this lifetime log —
   *  what `--session-export` carries, and why a call's `failed-req=` counts only its own window. */
  readonly requestLog: CapturedRequest[];
  calls: number;
}

/** Roll the launcher's request map into the lifetime log and clear it, so THIS call's failed-request
 *  window starts empty (the map is keyed by URL — a re-request would otherwise overwrite the old status). */
function rollRequests(state: SessionCallState): void {
  state.requestLog.push(...state.session.requests.values());
  state.session.requests.clear();
}

/** The scenario's `keepLivePage` shape: a live-page call resets the app's own evidence ring so `__orb`
 *  readers (queries/CLS) scope to this call. Raw string — the tooling program is DOM-less. */
async function resetLiveEvidence(session: ProbeSession): Promise<void> {
  await session.page.evaluate("window.__orb && window.__orb.resetEvidence()");
}

/** The artifact base a call falls back to when `--out` is absent — what `snapDestination` derives for a
 *  navigating call, and the live page's own slug for a call that drives the page as it stands. */
function defaultOutFor(target: SessionCallTarget, call: Args, pageUrl: string): string {
  if (target === "live") {
    return livePageSlug(pageUrl);
  }
  return target === "file" ? snapDestination(call).name : routeSlug(call.route);
}

function callRefusals(state: SessionCallState, request: SessionRequest, call: Args): readonly string[] {
  const refusals: string[] = [];
  if (!request.boot) {
    const lifetime = sessionOnlyFlagsIn(request.argv);
    if (lifetime.length > 0) {
      refusals.push(sessionOnlyFlagsRefusal(state.name, lifetime));
    }
  }
  refusals.push(...call.errors.map((error) => `ARG ERROR    ${error}`));
  if (!request.boot && call.cascade.length > 0 && cascadeRuntimeFor(state.session) === null) {
    refusals.push(cascadeNotBootedRefusal(state.name));
  }
  return refusals;
}

/** Run one call against the live session and return its exit — the RESULT line and every report line reach
 *  the client through the output sink the daemon installed around this call. */
export async function runSessionCallInDaemon(state: SessionCallState, request: SessionRequest): Promise<number> {
  // Path-shaped `--out`/`--file` resolve against the CALLER's cwd (design §3.4) — one request at a time,
  // so the daemon's cwd is the caller's for the duration of the call.
  process.chdir(request.cwd);
  const call = parseSnapArgs([...request.argv]);
  const refusals = callRefusals(state, request, call);
  if (refusals.length > 0) {
    for (const refusal of refusals) {
      print(refusal);
    }
    print("Run pnpm snap --help for supported flags and combinations.");
    return EXIT.misuse;
  }
  for (const warning of call.warnings) {
    print(`ARG WARNING  ${warning}`);
  }
  const { session, bootArgs } = state;
  // #1287: a sibling that attached directly on the debugging endpoint since the last call — invisible to
  // this socket protocol, so "always repair" is the only sound trigger — can have left `window.screen`
  // reverted to Chromium's compiled default while `window.innerWidth/innerHeight` read correctly. A
  // forced round trip on THIS persistent connection is the one mechanism proven to survive that
  // sibling's own detach (browser-emulation-guard.ts); cheap (two CDP round trips) and idempotent.
  await reassertOwnerViewport(session.page, session.environmentContract.applied.viewport);
  const target = sessionCallTarget(call);
  const pageUrl = session.page.url();
  if (target === "live" && pageUrl === ABOUT_BLANK) {
    print(neverNavigatedRefusal(state.name));
    return EXIT.misuse;
  }
  const defaultOut = defaultOutFor(target, call, pageUrl);
  const merged = inheritSessionBinding(bootArgs, inheritSessionArgs(bootArgs, call, defaultOut), call);
  const fileRefusal = refuseFileMode(merged);
  if (fileRefusal !== null) {
    print(fileRefusal);
    return EXIT.violations;
  }
  const destination = target === "live" ? { url: pageUrl, name: merged.out ?? defaultOut } : snapDestination(merged);
  beginInstrumentRun("snap", state.root, { slotDir: request.slotDir });
  try {
    const out = await artifactFile("snaps", destination.name, ".png");
    const key = artifactKey(destination.name);
    // The window: where the rings stood when this call began. Call 1 starts at 0, so its RESULT pairs are
    // the one-shot path's byte for byte (T9); later calls exclude what earlier calls already judged.
    const window = { consoleStart: session.consoleMessages.length, pageErrorStart: session.pageErrors.length };
    if (state.calls > 0) {
      rollRequests(state);
    }
    if (target === "live") {
      await resetLiveEvidence(session);
    }
    state.calls += 1;
    const result = await runOnSession(
      session,
      merged,
      { url: destination.url, name: destination.name, out, key, produceShot: shouldProduceShot(merged), navigate: target !== "live" },
      // A session keeps its browser and records no per-call trace/HAR (§10.1): the finish is a no-op.
      { window, finish: () => Promise.resolve({ traces: [], hars: [] }) },
    );
    return result.code;
  } finally {
    // The adopted slot is the CLIENT's: releasing it publishes nothing (the owner publishes at its finish).
    finishInstrumentRun();
  }
}
