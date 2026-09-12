// One session CALL inside the daemon (docs/design/1208-instrument-substrate.md §3.3, §5, §10.1): re-parse
// the forwarded argv with the ONE validator, refuse a browser-lifetime flag on a later call, merge through
// the promoted partition, resolve the target (a route, a file, or the LIVE page), adopt the client's slot,
// open this call's evidence window over the daemon's rings, and run the SAME `runOnSession` the one-shot
// path runs — never a second capture path (invariant 4). Split from ops/session-daemon.ts (the process,
// socket and lifecycle) by nature: this file is the capture half.
import process from "node:process";
import { artifactKey, routeSlug } from "../../_shared/artifact-naming.ts";
import { artifactFile, beginInstrumentRun, finishInstrumentRun } from "../../_shared/artifact-out.ts";
import { print } from "../../_shared/artifacts.ts";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { reassertOwnerViewport } from "../../_shared/browser-emulation-guard.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { SessionCallTarget, SessionRequest } from "../contract/session.ts";
import type { Args } from "../contract/types.ts";
import { shouldProduceShot } from "../lib/out-names.ts";
import { inheritSessionArgs, inheritSessionBinding, livePageSlug, sessionCallTarget, sessionOnlyFlagsIn } from "../lib/session-plan.ts";
import { cascadeNotBootedRefusal, neverNavigatedRefusal, sessionOnlyFlagsRefusal } from "../lib/session-refusals.ts";
import { refuseFileMode, snapDestination } from "./guards.ts";
import { snapMatrixOnSession } from "./matrix.ts";
import { parseSnapArgs } from "./parse.ts";
import { runOnSession } from "./run.ts";
import { cascadeRuntimeFor } from "./session.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session <name> <route>");

const ABOUT_BLANK = "about:blank";

/** What the capture half needs from the daemon: the live browser, the boot args, and its call counter.
 *  The ordered request ring is owned by `session` through ops/request-ring.ts, not duplicated here. */
export interface SessionCallState {
  readonly name: string;
  readonly root: string;
  readonly session: ProbeSession;
  readonly bootArgs: Args;
  calls: number;
}

/** The URL-keyed failure-verdict map is call-scoped; the ordered lifetime evidence lives in RequestRing. */
function resetFailedRequestWindow(state: SessionCallState): void {
  state.session.evidence.requestSummary.clear();
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
  // The client already proved `--matrix` has either a stage arm or a stateful session binding. The raw
  // daemon argv intentionally omits `--session`; restore that parse context before the inherited binding
  // is merged below, or the second validation pass would reject the exact F10 route it is hosting.
  const call = parseSnapArgs([...request.argv], { inheritedSessionBinding: true });
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
    if (call.matrix) {
      state.calls += 1;
      session.diagnosticWindow.value += 1;
      return await snapMatrixOnSession(merged, session);
    }
    const out = await artifactFile("snaps", destination.name, ".png");
    const key = artifactKey(destination.name);
    // The window: where the rings stood when this call began. Call 1 starts at 0, so its RESULT pairs are
    // the one-shot path's byte for byte (T9); later calls exclude what earlier calls already judged.
    const window = { consoleStart: session.evidence.console.cursor(), pageErrorStart: session.evidence.pageErrors.cursor() };
    if (state.calls > 0) {
      resetFailedRequestWindow(state);
    }
    if (target === "live") {
      await resetLiveEvidence(session);
    }
    state.calls += 1;
    session.diagnosticWindow.value += 1;
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
