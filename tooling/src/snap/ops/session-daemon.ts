// The session DAEMON (docs/design/1208-instrument-substrate.md §3.2–§3.5, §3.7–§3.8, §10.1): the process
// behind `pnpm snap --session <name>`. Entered as the cli verb `--session-daemon <name>` (argv enters in
// cli.ts only; the client spawns it through _shared/proc.ts `spawnNicedChild` — own process group, nice -19,
// stdio a log file beside the socket). It boots the session's stage through the unchanged `configureStage`,
// opens its OWN run slot (instrument `snap-session` — the `.inflight` marker's pid is this pid, so
// `abandonedRuns` names it the moment it dies), launches ONE browser through `launchSnapSession` with the
// debugging endpoint on, writes the repo-keyed row, and serves NDJSON requests on `<name>.sock` one at a
// time: `call` (the capture half, ops/session-daemon-call.ts), `export`, `status`, `ping`, `close`. The TTL
// timer is reset by `call`/`ping`, never by `status`; idle past it, SIGTERM, or `close` all run ONE shutdown
// that waits for an in-flight call (drain before dispose), closes the browser, removes the socket + row and
// finishes the slot. Nothing here prints to its own stdout on purpose — `print`/`warn` reach the log file
// (this process's stdio) AND, during a request, the caller's socket through the output sink.
import { rmSync, writeFileSync } from "node:fs";
import type { Server, Socket } from "node:net";
import { createServer } from "node:net";
import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import { artifactFile, beginInstrumentRun, finishInstrumentRun } from "../../_shared/artifact-out.ts";
import { openRunSlot, print, publishRunSlot } from "../../_shared/artifacts.ts";
import type { CapturedRequest, ProbeSession } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdict } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { budget, loadResultPairs } from "../../_shared/load-budget.ts";
import { installOutputSink, warn } from "../../_shared/log.ts";
import type { SessionEvent, SessionRequest, SessionRow } from "../contract/session.ts";
import { SESSION_PROTOCOL_VERSION } from "../contract/session.ts";
import type { Args } from "../contract/types.ts";
import { foreignSessionRefusal, SESSION_INSTRUMENT, sessionBusyRefusal, sessionCapRefusal, sessionIdleMs, sessionSocketPath } from "../lib/session-plan.ts";
import { readSessionRequest, resultPairsOf } from "../lib/session-wire.ts";
import { urlStageBand } from "../lib/stage-plan.ts";
import { configureStage, snapDestination } from "./guards.ts";
import { debuggingEndpointFor, finishSession, launchSnapSession } from "./session.ts";
import type { SessionCallState } from "./session-daemon-call.ts";
import { runSessionCallInDaemon } from "./session-daemon-call.ts";
import { liveRows, readRow, removeRow, removeSocket, sessionLimitsFromEnv, sessionRegistryHome, writeRow } from "./session-registry.ts";
import { repoRoot } from "./stage-git.ts";
import { bindSessionToBand, markerRoot, touchRow as touchStageBand, unbindSessionFromBand } from "./stage-marker.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session <name> <route>");

/** A client that connects and never sends its request line is dropped after this — a leak guard, not a
 *  budget. The BASE is 30 s, not the 5 s this shipped with: a leak guard's only cost when it is GENEROUS is
 *  a dead client's socket lingering a few seconds, while a FALSE trip kills a live caller's real call. The
 *  `budget()` factor is 1 below one job per core, so a 5 s base stayed 5 s exactly when it was least safe —
 *  a sibling suite saturating the box can deschedule a healthy client between `connect` and its first
 *  write. Generous base + the policy's stretch on top (#1232). */
const REQUEST_LINE_BASE_MS = 30_000;
const REQUEST_LINE_TIMEOUT_MS = budget(REQUEST_LINE_BASE_MS);
const MS_PER_MINUTE = 60_000;

interface DaemonState extends SessionCallState {
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
  inflight: { readonly op: string; readonly startedAt: number; readonly done: Promise<void> } | null;
  ttlTimer: NodeJS.Timeout | null;
  closing: boolean;
}

function emitTo(socket: Socket, event: SessionEvent): void {
  if (!socket.destroyed && socket.writable) {
    socket.write(`${JSON.stringify(event)}\n`);
  }
}

function touchRow(state: DaemonState, patch: Partial<SessionRow>): void {
  const nowIso = new Date().toISOString();
  state.row = { ...state.row, ...patch, lastUsedAt: nowIso };
  writeRow(state.home, state.row);
  // INTERACTION MEANS ANY REQUEST THROUGH THE SUBSTRATE, not only a snap CLI call (§3.6): a lane driving
  // its stage exclusively through a session would otherwise watch its stage go idle and be reaped under it.
  if (state.stageBand !== null) {
    touchStageBand(state.stageHome, state.stageBand, nowIso);
  }
}

/** The daemon's three CALLER-LESS shutdown boundaries — the TTL timer and the two signal handlers. Nobody
 *  awaits them, and `void` is NOT an escape here: eslint runs `no-floating-promises` with
 *  `ignoreVoid: false` (eslint.config.js), the repo's ruling that a detached promise names its handler.
 *  `shutdown` releases the `closed` latch in a `finally`, so the process still leaves when its teardown
 *  throws; this catch is the last-resort REPORT on the daemon log, never a swallow — a teardown that failed
 *  quietly is exactly the row-reads-live-forever class §3.8 exists to make loud. */
function detachShutdown(work: Promise<void>, name: string, reason: string): void {
  // @orb-gate-ignore caught-failure-ownership(promise:work): a timer/signal boundary has no caller to carry an exit code, so the daemon log IS the report; the `closed` latch is already released by shutdown's `finally`, so the process leaves regardless. Ends if shutdown stops releasing the latch unconditionally.
  work.catch((unhandled: unknown) => {
    warn(`session      ${name}: shutdown (${reason}) failed — ${errorMessage(unhandled)}`);
  });
}

function armTtl(state: DaemonState, shutdown: (reason: string) => Promise<void>): void {
  if (state.ttlTimer !== null) {
    clearTimeout(state.ttlTimer);
  }
  // Never unref'd: the TTL is the one timer that MUST fire in an otherwise idle process.
  state.ttlTimer = setTimeout(() => {
    const reason = `idle past the ${Math.round(state.ttlMs / MS_PER_MINUTE)}m TTL`;
    detachShutdown(shutdown(reason), state.name, reason);
  }, state.ttlMs);
}

/** `--session-export`: the daemon's rings into the CALLER's slot as `sessions/<name>/*.json`, which the
 *  client publishes as `reports/sessions/<name>/…` pointers at its finish (§3.7). */
async function exportRings(state: DaemonState, request: SessionRequest): Promise<number> {
  beginInstrumentRun("snap", state.root, { slotDir: request.slotDir });
  try {
    const requests: readonly CapturedRequest[] = [...state.requestLog, ...state.session.requests.values()];
    const files: readonly (readonly [string, unknown])[] = [
      ["session", state.row],
      ["console", state.session.consoleMessages],
      ["page-errors", state.session.pageErrors],
      ["requests", requests],
    ];
    for (const [kind, payload] of files) {
      const path = await artifactFile("sessions", `${state.name}/${kind}`, ".json");
      writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
      print(`exported     ${path}`);
    }
    // Through the VERDICT door, not printResult: `files` is the population that cannot honestly be empty —
    // an export that enumerated the ring set and wrote NOTHING is a broken export, and a bare printResult
    // would let it read clean (arm F, Core-Tooling-Law.md §4.5). The three ring counts are declared with
    // `honestEmpty` because a session really can have said nothing on the console — that is a measured
    // zero, and the pair names it as one instead of hiding it among the numbers.
    return printVerdict("snap-session-export", {
      verdict: EXIT.clean,
      denominators: {
        files: { value: files.length, refuseWhen: "zero" },
        console: { value: state.session.consoleMessages.length, refuseWhen: "zero", honestEmpty: "the session logged no console message" },
        "page-errors": { value: state.session.pageErrors.length, refuseWhen: "zero", honestEmpty: "the session raised no page error" },
        requests: { value: requests.length, refuseWhen: "zero", honestEmpty: "the session issued no request (an --eval-only drive over a --file fixture)" },
      },
      pairs: [["name", state.name], ...loadResultPairs()],
    });
  } finally {
    finishInstrumentRun();
  }
}

/** Run a serialized request (`call`/`export`) under the output sink, guarding the daemon: a throwing call
 *  is reported to ITS caller as a tool error and the session survives it (the next call names nothing
 *  stale — the page is whatever the failed call left). */
async function serveSerialized(state: DaemonState, request: SessionRequest, socket: Socket, run: () => Promise<number>): Promise<void> {
  const op = request.argv.join(" ") || request.kind;
  touchRow(state, { inflightOp: op });
  // The tee: every line reaches the daemon's own log (its stdout) AND the caller, in order; the captured
  // copy is what the `done` event's RESULT pairs are read from.
  const captured: string[] = [];
  const release = installOutputSink({
    line: (text) => {
      captured.push(text);
      emitTo(socket, { kind: "line", text });
    },
    warn: (text) => emitTo(socket, { kind: "warn", text }),
  });
  let exit: number = EXIT.toolError;
  // @orb-gate-ignore caught-failure-ownership(empty:error): the failure is printed to the caller as SESSION CALL ERROR and the request's `done` carries toolError — the caller's exit IS the report; the daemon stays up by design (a session survives a failed call, §7.1). Ends if the done event stops carrying the exit.
  try {
    exit = await run();
  } catch (error) {
    print(`SESSION CALL ERROR  ${state.name}: ${errorMessage(error)}`);
    exit = EXIT.toolError;
  } finally {
    release();
    touchRow(state, { inflightOp: null, lastOp: op, calls: state.calls });
  }
  emitTo(socket, { kind: "done", exit, pairs: resultPairsOf(captured) });
  socket.end();
}

function pagesOf(session: ProbeSession): readonly { readonly index: number; readonly url: string; readonly title: string }[] {
  return session.pages.map((page, index) => ({ index, url: page.url(), title: "" }));
}

async function serveRequest(state: DaemonState, request: SessionRequest, socket: Socket, shutdown: (reason: string) => Promise<void>): Promise<void> {
  if (request.kind === "ping") {
    armTtl(state, shutdown);
    emitTo(socket, { kind: "done", exit: EXIT.clean, pairs: [] });
    socket.end();
    return;
  }
  if (request.kind === "status") {
    emitTo(socket, {
      kind: "status",
      row: state.row,
      pages: pagesOf(state.session),
      busy: state.inflight === null ? null : state.inflight.op,
      idleMs: sessionIdleMs(state.row, Date.now()),
    });
    emitTo(socket, { kind: "done", exit: EXIT.clean, pairs: [] });
    socket.end();
    return;
  }
  // Ownership (F4): a foreign caller is refused naming the owner — a `close` with consent is the exception.
  if (request.checkout !== state.row.ownerCheckout && !(request.kind === "close" && request.force)) {
    emitTo(socket, { kind: "line", text: foreignSessionRefusal(state.row, Date.now()) });
    emitTo(socket, { kind: "done", exit: EXIT.toolError, pairs: [] });
    socket.end();
    return;
  }
  if (request.kind === "close") {
    emitTo(socket, { kind: "line", text: `session      ${state.name} closing on request${state.inflight === null ? "" : " (after the in-flight call)"}` });
    emitTo(socket, { kind: "done", exit: EXIT.clean, pairs: [] });
    socket.end();
    await shutdown("closed by request");
    return;
  }
  if (state.inflight !== null) {
    emitTo(socket, { kind: "line", text: sessionBusyRefusal(state.name, state.inflight.op, Date.now() - state.inflight.startedAt) });
    emitTo(socket, { kind: "done", exit: EXIT.toolError, pairs: [] });
    socket.end();
    return;
  }
  const run = request.kind === "export" ? (): Promise<number> => exportRings(state, request) : (): Promise<number> => runSessionCallInDaemon(state, request);
  const done = serveSerialized(state, request, socket, run);
  state.inflight = { op: request.argv.join(" ") || request.kind, startedAt: Date.now(), done };
  await done;
  state.inflight = null;
  armTtl(state, shutdown);
}

function readRequestLine(socket: Socket): Promise<SessionRequest | null> {
  return new Promise<SessionRequest | null>((resolve) => {
    let buffer = "";
    socket.setEncoding("utf8");
    socket.setTimeout(REQUEST_LINE_TIMEOUT_MS, () => {
      socket.destroy();
      resolve(null);
    });
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline !== -1) {
        socket.setTimeout(0);
        resolve(readSessionRequest(buffer.slice(0, newline)));
      }
    });
    socket.on("error", (error) => {
      warn(`session      ${errorMessage(error)} on a client connection`);
      resolve(null);
    });
  });
}

function listen(server: Server, socketPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function bindingOf(bootArgs: Args): SessionRow["binding"] {
  if (bootArgs.file !== null) {
    return { kind: "file", url: snapDestination(bootArgs).url };
  }
  return { kind: bootArgs.isolated ? "stage" : "base", url: bootArgs.base };
}

function initialRow(
  state: Pick<DaemonState, "name" | "root" | "home" | "socketPath" | "ttlMs" | "bootArgs">,
  args: { readonly slotDir: string; readonly cdpEndpoint: string | null; readonly bootArgv: readonly string[] },
): SessionRow {
  const { bootArgs } = state;
  const now = new Date().toISOString();
  return {
    v: SESSION_PROTOCOL_VERSION,
    name: state.name,
    ownerCheckout: state.root,
    daemonPid: process.pid,
    pgid: process.pid,
    socket: state.socketPath,
    cdpEndpoint: args.cdpEndpoint,
    slotDir: args.slotDir,
    binding: bindingOf(bootArgs),
    environment: {
      viewport: bootArgs.viewport,
      device: bootArgs.device,
      colorScheme: bootArgs.colorScheme,
      reducedMotion: bootArgs.reducedMotion || bootArgs.probe,
      deviceScaleFactor: bootArgs.scale.deviceScaleFactor,
    },
    bootArgv: args.bootArgv,
    createdAt: now,
    lastUsedAt: now,
    inflightOp: null,
    lastOp: null,
    ttlMs: state.ttlMs,
    headless: !bootArgs.vnc,
    calls: 0,
  };
}

/** `snap --session-daemon <name> …` — resolves when the session has shut down; the exit is the process's. */
export async function runSessionDaemon(opts: Args, argv: readonly string[]): Promise<number> {
  const name = opts.sessionDaemon;
  if (name === null) {
    throw new Error("INSTRUMENT ERROR: runSessionDaemon without --session-daemon");
  }
  const root = repoRoot();
  const home = sessionRegistryHome(root);
  const { limits, errors } = sessionLimitsFromEnv(opts.sessionTtlMin);
  if (errors.length > 0) {
    for (const error of errors) {
      print(`ARG ERROR    ${error}`);
    }
    return EXIT.misuse;
  }
  const others = liveRows(home).filter((row) => row.name !== name);
  if (others.length >= limits.cap) {
    print(sessionCapRefusal(name, others, limits.cap, Date.now()));
    return EXIT.toolError;
  }
  const existing = readRow(home, name);
  if (existing !== null && existing.daemonPid !== process.pid && liveRows(home).some((row) => row.name === name)) {
    print(`SESSION REFUSED  ${name} is already live (daemon pid ${existing.daemonPid}) — a second daemon for one name is the shared-tab defect`);
    return EXIT.toolError;
  }
  // A session records no Playwright trace/HAR (§10.1): a per-call trace stop would end the session's tracing.
  const bootArgs: Args = { ...opts, failureEvidence: false };
  if (opts.failureEvidence) {
    print("session      failure-evidence traces are off for a session (phase 1) — `--session-export` carries the rings");
  }
  const stageExit = configureStage(bootArgs);
  if (stageExit !== null) {
    return stageExit;
  }
  const slot = openRunSlot(root, SESSION_INSTRUMENT);
  let session: ProbeSession;
  // No gate-ignore here on purpose: the catch RETHROWS the caught binding, which IS ownership under
  // caught-failure-ownership, so a marker would be a dead exemption (gate-ignore-inventory reds those).
  // The slot is settled first so the marker does not outlive the launch and read as a dead session.
  try {
    session = await launchSnapSession(bootArgs, name, { pages: bootArgs.pages, debuggingEndpoint: true });
  } catch (error) {
    publishRunSlot(root, slot, []);
    throw error;
  }
  const socketPath = sessionSocketPath(home, name);
  // `configureStage` has already allocated (or reused) a band and repointed `bootArgs.base` at it, so the
  // BASE names the band — the one fact both halves of the substrate agree on (`urlStageBand` is port-keyed).
  const stageHome = markerRoot(root);
  const stageBand = bootArgs.isolated ? urlStageBand(bootArgs.base) : null;
  const state: DaemonState = {
    name,
    root,
    home,
    socketPath,
    session,
    bootArgs,
    requestLog: [],
    calls: 0,
    ttlMs: limits.ttlMs,
    stageHome,
    stageBand,
    row: initialRow(
      { name, root, home, socketPath, ttlMs: limits.ttlMs, bootArgs },
      { slotDir: slot.dir, cdpEndpoint: await debuggingEndpointFor(session), bootArgv: argv },
    ),
    inflight: null,
    ttlTimer: null,
    closing: false,
  };
  if (stageBand !== null) {
    // The row lists this session, so the stage reaper leaves the band alone while the daemon lives (§3.6).
    bindSessionToBand(stageHome, stageBand, name, new Date().toISOString());
  }
  let resolveClosed: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const server = createServer((socket) => {
    // The connection EVENT has no caller to await it, but the client IS blocked on this socket: a rejection
    // has to answer it with a verdict (exit 2) or the lane hangs instead of reading one.
    // @orb-gate-ignore caught-failure-ownership(promise:readRequestLine): the failure is reported to the caller as SESSION SERVE ERROR and the request's `done` carries toolError — the caller's exit IS the report, and the daemon stays up (a session survives a failed call, §7.1). Ends if the done event stops carrying the exit.
    readRequestLine(socket)
      .then(async (request) => {
        if (request === null) {
          emitTo(socket, { kind: "warn", text: `SESSION PROTOCOL ERROR  ${name}: unreadable request line (protocol v${SESSION_PROTOCOL_VERSION})` });
          emitTo(socket, { kind: "done", exit: EXIT.toolError, pairs: [] });
          socket.end();
          return;
        }
        await serveRequest(state, request, socket, shutdown);
      })
      .catch((unhandled: unknown) => {
        emitTo(socket, { kind: "warn", text: `SESSION SERVE ERROR  ${name}: ${errorMessage(unhandled)}` });
        emitTo(socket, { kind: "done", exit: EXIT.toolError, pairs: [] });
        socket.end();
      });
  });
  const shutdown = async (reason: string): Promise<void> => {
    if (state.closing) {
      return;
    }
    state.closing = true;
    if (state.ttlTimer !== null) {
      clearTimeout(state.ttlTimer);
    }
    // Drain before dispose: an in-flight call finishes and answers its caller before the browser goes.
    await state.inflight?.done;
    print(`session      ${name} closing — ${reason}`);
    server.close();
    // @orb-gate-ignore caught-failure-ownership(empty:error): a browser that fails to close is logged and the teardown proceeds to the registry half — the row + socket must go regardless, or the session reads as live forever. Ends if a failed browser close must abort the teardown.
    try {
      await finishSession(session, false, name, false);
    } catch (error) {
      warn(`session      ${name}: browser close failed — ${errorMessage(error)}`);
    }
    // The latch is released NO MATTER WHAT: a registry or slot teardown that throws must not park the daemon
    // on `closed` forever holding a row that still reads LIVE — that is §3.8's dead-marker class from the
    // inside, and it is what makes `detachShutdown`'s catch a report rather than a hang.
    try {
      if (stageBand !== null) {
        // Release the stage: the band is now reapable on its own idle TTL, exactly as if no session had run.
        unbindSessionFromBand(stageHome, stageBand, name);
      }
      removeSocket(home, name);
      removeRow(home, name);
      publishRunSlot(root, slot, []);
    } finally {
      resolveClosed();
    }
  };
  // A stale socket file from a crashed predecessor blocks `listen` — the access gate already ruled this
  // name absent or reclaimable, so the file is ours to clear.
  rmSync(socketPath, { force: true });
  await listen(server, socketPath);
  writeRow(home, state.row);
  process.once("SIGTERM", () => {
    detachShutdown(shutdown("SIGTERM"), name, "SIGTERM");
  });
  process.once("SIGINT", () => {
    detachShutdown(shutdown("SIGINT"), name, "SIGINT");
  });
  armTtl(state, shutdown);
  print(`session      ${name} ready — socket ${socketPath} · endpoint ${state.row.cdpEndpoint ?? "none"} · slot ${slot.relDir}`);
  await closed;
  return EXIT.clean;
}
