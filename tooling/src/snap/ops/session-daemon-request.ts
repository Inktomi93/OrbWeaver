// The session daemon's request + idle-lifecycle capability: dispatches one NDJSON request at a time,
// pauses the TTL while an active call/export owns the browser, rearms only after that work settles, and
// refuses to rearm once shutdown begins. The process/bootstrap/close half stays in session-daemon.ts.
import type { Socket } from "node:net";
import { errorMessage } from "@orb/kit/error-message";
import { print } from "../../_shared/artifacts.ts";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { summarizeOrbConsoleCompleteness } from "../../_shared/browser-diagnostics.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { installOutputSink, warn } from "../../_shared/log.ts";
import type { SessionEvent, SessionRequest, SessionRow, SessionRunProvenance } from "../contract/session.ts";
import { sessionCallTarget, sessionIdleMs } from "../lib/session-plan.ts";
import { foreignSessionRefusal, sessionBusyRefusal, sessionStageDeadRefusal } from "../lib/session-refusals.ts";
import { armSessionCallBaseMs } from "./arms/registry.ts";
import { parseSnapArgs } from "./parse.ts";
import { takeSnapFactBatches, takeSnapResultPairs } from "./run-bundle.ts";
import { isTerminalSessionCallError, runSessionCallWithinBudget, sessionCallWatchdogBaseMs } from "./session-call-watchdog.ts";
import type { SessionCallState } from "./session-daemon-call.ts";
import { runSessionCallInDaemon } from "./session-daemon-call.ts";
import type { SessionEvidenceState } from "./session-evidence.ts";
import { exportSessionRings } from "./session-evidence.ts";
import { touchSessionHeartbeat } from "./session-heartbeat.ts";
import { observeSessionStageDeath } from "./session-stage-liveness.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session <name> <route>");

const MS_PER_MINUTE = 60_000;

function sessionStageProvenance(row: SessionRow): NonNullable<SessionRunProvenance["stage"]> {
  if (row.stage === null || row.stage === undefined) {
    return { state: "not-applicable", ownerCheckout: null, band: null, ref: null, binding: row.binding, failure: null };
  }
  if (row.stage.ownerCheckout === undefined || row.stage.ref === undefined || row.stage.binding === undefined) {
    return {
      state: "unavailable",
      ownerCheckout: row.stage.ownerCheckout ?? null,
      band: row.stage.band,
      ref: row.stage.ref ?? null,
      binding: row.stage.binding ?? row.binding,
      failure: "session row predates exact stage provenance",
    };
  }
  return {
    state: "bound",
    ownerCheckout: row.stage.ownerCheckout,
    band: row.stage.band,
    ref: row.stage.ref,
    binding: row.stage.binding,
    failure: null,
  };
}

export interface SessionDaemonState extends SessionCallState {
  readonly home: string;
  readonly socketPath: string;
  readonly ttlMs: number;
  /** The band table's home and the band this session drives, or null for a `--base`/`--file` session.
   *  A session bound to a band is what keeps that STAGE alive: every call stamps the row's heartbeat and
   *  the row lists this name, so the stage reaper never takes a band a live daemon is driving (§3.6). */
  readonly stageHome: string;
  readonly stageBand: number | null;
  row: SessionRow;
  /** The in-flight `call`/`export`, or null — `busy` refuses a second driver; `close` awaits it. */
  inflight: { readonly op: string; readonly startedAt: number; readonly done: Promise<string | null> } | null;
  ttlTimer: NodeJS.Timeout | null;
  closing: boolean;
  /** A call that outlived bounded cancellation permanently poisons this browser. The socket closes next,
   * but an already-accepted request still sees this terminal reason instead of observing reusable state. */
  terminalReason: string | null;
  readonly evidence: SessionEvidenceState;
}

interface SessionEventSink {
  readonly destroyed: boolean;
  readonly writable: boolean;
  write: (text: string) => unknown;
  end: () => unknown;
}

export function emitSessionEvent(socket: SessionEventSink, event: SessionEvent): void {
  if (!socket.destroyed && socket.writable) {
    socket.write(`${JSON.stringify(event)}\n`);
  }
}

function touchRow(state: SessionDaemonState, patch: Partial<SessionRow>): void {
  touchSessionHeartbeat(state, patch);
}

/** The daemon's three CALLER-LESS shutdown boundaries — the TTL timer and the two signal handlers. Nobody
 *  awaits them, and `void` is NOT an escape here: eslint runs `no-floating-promises` with
 *  `ignoreVoid: false` (eslint.config.js), the repo's ruling that a detached promise names its handler.
 *  `shutdown` releases the `closed` latch in a `finally`, so the process still leaves when its teardown
 *  throws; this catch is the last-resort REPORT on the daemon log, never a swallow — a teardown that failed
 *  quietly is exactly the row-reads-live-forever class §3.8 exists to make loud. */
export function detachSessionShutdown(work: Promise<void>, name: string, reason: string): void {
  // @orb-waive caught-failure-ownership(work): a timer/signal boundary has no caller to carry an exit code, so the daemon log IS the report; the `closed` latch is already released by shutdown's `finally`, so the process leaves regardless. Ends if shutdown stops releasing the latch unconditionally.
  work.catch((unhandled: unknown) => {
    warn(`session      ${name}: shutdown (${reason}) failed — ${errorMessage(unhandled)}`);
  });
}

export function armSessionTtl(state: SessionDaemonState, shutdown: (reason: string) => Promise<void>): void {
  if (state.closing) {
    return;
  }
  if (state.ttlTimer !== null) {
    clearTimeout(state.ttlTimer);
  }
  // Never unref'd: the TTL is the one timer that MUST fire in an otherwise idle process.
  state.ttlTimer = setTimeout(() => {
    const reason = `idle past the ${Math.round(state.ttlMs / MS_PER_MINUTE)}m TTL`;
    detachSessionShutdown(shutdown(reason), state.name, reason);
  }, state.ttlMs);
}

export function pauseSessionTtl(state: SessionDaemonState): void {
  if (state.ttlTimer !== null) {
    clearTimeout(state.ttlTimer);
    state.ttlTimer = null;
  }
}

/** Run a serialized request (`call`/`export`) under the output sink. An ordinary failure leaves the
 * session reusable; a timed-out call that remains live after cancellation returns a terminal reason so
 * the request owner can answer its caller, then close the daemon without awaiting that work again. */
async function serveSerialized(state: SessionDaemonState, request: SessionRequest, socket: Socket, run: () => Promise<number>): Promise<string | null> {
  const op = request.argv.join(" ") || request.kind;
  const sessionProvenance: SessionRunProvenance = {
    name: state.name,
    call: request.kind === "call" ? state.calls + 1 : state.calls,
    evidenceWindow: request.kind === "call" ? state.session.diagnosticWindow.value + 1 : state.session.diagnosticWindow.value,
    binding: state.row.binding,
    stage: sessionStageProvenance(state.row),
  };
  touchRow(state, { inflightOp: op });
  // The tee: every line reaches the daemon's own log (its stdout) AND the caller, in order. Exact pairs
  // and typed facts cross their own in-process handoff; terminal prose is never parsed back into data.
  const diagnosticStart = state.session.diagnosticCompleteness.length;
  const release = installOutputSink({
    line: (text) => {
      emitSessionEvent(socket, { kind: "line", text });
    },
    warn: (text) => emitSessionEvent(socket, { kind: "warn", text }),
  });
  let exit: number = EXIT.toolError;
  let terminalReason: string | null = null;
  // @orb-waive caught-failure-ownership(error): the failure is printed to the caller as SESSION CALL ERROR and the request's `done` carries toolError — the caller's exit IS the report; the daemon stays up by design (a session survives a failed call, §7.1). Ends if the done event stops carrying the exit.
  try {
    const call = request.kind === "call" ? parseSnapArgs([...request.argv]) : null;
    const navigates = call !== null && (sessionCallTarget(call) !== "live" || call.matrix || call.scenario !== null);
    exit = await runSessionCallWithinBudget(state, op, run, sessionCallWatchdogBaseMs(navigates, call === null ? null : armSessionCallBaseMs(call)));
  } catch (error) {
    print(`SESSION CALL ERROR  ${state.name}: ${errorMessage(error)}`);
    if (isTerminalSessionCallError(error)) {
      terminalReason = `terminal call \`${op}\` remained live after its watchdog cancellation`;
      print(`SESSION DEAD   ${state.name} ${terminalReason}; the daemon is closing and this browser will not be reused`);
    }
    exit = EXIT.toolError;
  } finally {
    if (request.kind === "call") {
      observeSessionStageDeath(state, op);
    }
    release();
    touchRow(state, { inflightOp: null, lastOp: op, calls: state.calls });
  }
  const facts = takeSnapFactBatches();
  emitSessionEvent(socket, {
    kind: "done",
    exit,
    pairs: takeSnapResultPairs(),
    ...(facts.length === 0 ? {} : { facts }),
    ...(request.kind === "call"
      ? { diagnosticCompleteness: summarizeOrbConsoleCompleteness(state.session.diagnosticCompleteness.slice(diagnosticStart)) }
      : {}),
    sessionProvenance,
  });
  socket.end();
  return terminalReason;
}

function pagesOf(session: ProbeSession): readonly { readonly index: number; readonly url: string; readonly title: string }[] {
  return session.pages.map((page, index) => ({ index, url: page.url(), title: "" }));
}

function serveReadOnlyRequest(state: SessionDaemonState, request: SessionRequest, socket: Socket, shutdown: (reason: string) => Promise<void>): boolean {
  if (request.kind === "ping") {
    touchRow(state, {});
    armSessionTtl(state, shutdown);
    emitSessionEvent(socket, { kind: "done", exit: EXIT.clean, pairs: [] });
    socket.end();
    return true;
  }
  if (request.kind !== "status") {
    return false;
  }
  emitSessionEvent(socket, {
    kind: "status",
    row: state.row,
    pages: pagesOf(state.session),
    busy: state.inflight === null ? null : state.inflight.op,
    idleMs: sessionIdleMs(state.row, Date.now()),
  });
  emitSessionEvent(socket, { kind: "done", exit: EXIT.clean, pairs: [] });
  socket.end();
  return true;
}

/** The T4 gate, split from the request dispatcher so lifecycle branching stays readable. */
function refuseDeadStageCall(state: SessionDaemonState, request: SessionRequest, socket: Socket): boolean {
  if (request.kind !== "call") {
    return false;
  }
  const dead = observeSessionStageDeath(state, request.argv.join(" ") || request.kind);
  if (dead?.status !== "dead") {
    return false;
  }
  emitSessionEvent(socket, { kind: "line", text: sessionStageDeadRefusal(state.name, dead) });
  emitSessionEvent(socket, { kind: "done", exit: EXIT.toolError, pairs: [] });
  socket.end();
  return true;
}

function refuseTerminalOrForeignPing(state: SessionDaemonState, request: SessionRequest, socket: Socket): boolean {
  if (refuseTerminalSessionRequest(state, request, socket)) {
    return true;
  }
  if (request.kind !== "ping" || request.checkout === state.row.ownerCheckout) {
    return false;
  }
  emitSessionEvent(socket, { kind: "line", text: foreignSessionRefusal(state.row, Date.now()) });
  emitSessionEvent(socket, { kind: "done", exit: EXIT.toolError, pairs: [] });
  socket.end();
  return true;
}

export function refuseTerminalSessionRequest(
  state: Pick<SessionDaemonState, "name" | "terminalReason">,
  _request: Pick<SessionRequest, "kind">,
  socket: SessionEventSink,
): boolean {
  if (state.terminalReason === null) {
    return false;
  }
  emitSessionEvent(socket, { kind: "line", text: `SESSION DEAD   ${state.name} ${state.terminalReason}; this browser is closing and cannot be reused` });
  emitSessionEvent(socket, { kind: "done", exit: EXIT.toolError, pairs: [] });
  socket.end();
  return true;
}

export async function serveSessionRequest(
  state: SessionDaemonState,
  request: SessionRequest,
  socket: Socket,
  shutdown: (reason: string) => Promise<void>,
): Promise<void> {
  if (refuseTerminalOrForeignPing(state, request, socket)) {
    return;
  }
  if (serveReadOnlyRequest(state, request, socket, shutdown)) {
    return;
  }
  // Ownership (F4): a foreign caller is refused naming the owner — a `close` with consent is the exception.
  if (request.checkout !== state.row.ownerCheckout && !(request.kind === "close" && request.force)) {
    emitSessionEvent(socket, { kind: "line", text: foreignSessionRefusal(state.row, Date.now()) });
    emitSessionEvent(socket, { kind: "done", exit: EXIT.toolError, pairs: [] });
    socket.end();
    return;
  }
  if (request.kind === "close") {
    emitSessionEvent(socket, {
      kind: "line",
      text: `session      ${state.name} closing on request${state.inflight === null ? "" : " (after the in-flight call)"}`,
    });
    emitSessionEvent(socket, { kind: "done", exit: EXIT.clean, pairs: [] });
    socket.end();
    await shutdown("closed by request");
    return;
  }
  if (state.inflight !== null) {
    emitSessionEvent(socket, { kind: "line", text: sessionBusyRefusal(state.name, state.inflight.op, Date.now() - state.inflight.startedAt) });
    emitSessionEvent(socket, { kind: "done", exit: EXIT.toolError, pairs: [] });
    socket.end();
    return;
  }
  if (refuseDeadStageCall(state, request, socket)) {
    return;
  }
  const run =
    request.kind === "export"
      ? (): Promise<number> =>
          exportSessionRings(state.evidence, {
            root: state.root,
            slotDir: request.slotDir,
            name: state.name,
            out: request.exportOut,
            row: state.row,
            session: state.session,
          })
      : (): Promise<number> => runSessionCallInDaemon(state, request);
  // TTL means IDLE time. A serialized call owns the daemon until it settles; leaving the idle timer
  // armed here lets it close the browser under a legitimate long eval/export.
  pauseSessionTtl(state);
  const done = serveSerialized(state, request, socket, run);
  state.inflight = { op: request.argv.join(" ") || request.kind, startedAt: Date.now(), done };
  const terminalReason = await done;
  state.inflight = null;
  if (terminalReason !== null) {
    state.terminalReason = terminalReason;
    await shutdown(terminalReason);
    return;
  }
  armSessionTtl(state, shutdown);
}
