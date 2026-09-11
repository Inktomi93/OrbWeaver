// The session DAEMON (docs/design/1208-instrument-substrate.md §3.2–§3.5, §3.7–§3.8, §10.1): the process
// behind `pnpm snap --session <name>`. Entered as the cli verb `--session-daemon <name>` (argv enters in
// cli.ts only; the client spawns it through _shared/proc.ts `spawnFullPriorityChild` — own process group,
// stdio a log file beside the socket). It boots the session's stage through the unchanged `configureStage`,
// opens its OWN run slot (instrument `snap-session` — the `.inflight` marker's pid is this pid, so
// `abandonedRuns` names it the moment it dies), launches ONE browser through `launchSnapSession` with the
// debugging endpoint on, writes the repo-keyed row, and serves NDJSON requests on `<name>.sock` one at a
// time: `call` (the capture half, ops/session-daemon-call.ts), `export`, `status`, `ping`, `close`. The TTL
// timer is reset by `call`/`ping`, never by `status`; idle past it, SIGTERM, or `close` all run ONE shutdown
// that waits for an in-flight call (drain before dispose), closes the browser, removes the socket + row and
// finishes the slot. Nothing here prints to its own stdout on purpose — `print`/`warn` reach the log file
// (this process's stdio) AND, during a request, the caller's socket through the output sink.
import { rmSync } from "node:fs";
import { createServer } from "node:net";
import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import { beginInstrumentRun, finishInstrumentRun } from "../../_shared/artifact-out.ts";
import { openRunSlot, print, publishRunSlot } from "../../_shared/artifacts.ts";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import { killPidGroup } from "../../_shared/proc.ts";
import type { SessionRow } from "../contract/session.ts";
import { SESSION_PROTOCOL_VERSION } from "../contract/session.ts";
import type { Args } from "../contract/types.ts";
import { currentSnapStageProvenance } from "../lib/run-provenance.ts";
import { SESSION_INSTRUMENT, sessionSocketPath } from "../lib/session-plan.ts";
import { sessionCapRefusal } from "../lib/session-refusals.ts";
import { urlStageBand } from "../lib/stage-plan.ts";
import { sweepOwnBrowsers, sweepStrandedBrowsers } from "./browser-sweep.ts";
import { configureStage, snapDestination } from "./guards.ts";
import { debuggingEndpointFor, finishSession, launchSnapSession } from "./session.ts";
import type { SessionDaemonState } from "./session-daemon-request.ts";
import { armSessionTtl, detachSessionShutdown, emitSessionEvent, pauseSessionTtl, serveSessionRequest } from "./session-daemon-request.ts";
import { listenSessionServer, readSessionRequestLine } from "./session-daemon-wire.ts";
import { retainSessionEvidence, sessionEvidenceState } from "./session-evidence.ts";
import { liveRows, readRow, removeRow, removeSocket, sessionLimitsFromEnv, sessionRegistryHome, writeRow } from "./session-registry.ts";
import { repoRoot } from "./stage-git.ts";
import { bindSessionToBand, markerRoot, unbindSessionFromBand } from "./stage-marker.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session <name> <route>");

function bindingOf(bootArgs: Args): SessionRow["binding"] {
  if (bootArgs.file !== null) {
    return { kind: "file", url: snapDestination(bootArgs).url };
  }
  return { kind: bootArgs.isolated ? "stage" : "base", url: bootArgs.base };
}

export function sessionEnvironmentOf(bootArgs: Args): SessionRow["environment"] {
  return {
    viewport: bootArgs.viewport,
    viewportExplicit: bootArgs.viewportExplicit,
    device: bootArgs.device,
    colorScheme: bootArgs.colorScheme,
    reducedMotion: bootArgs.reducedMotion || bootArgs.probe,
    contrast: bootArgs.browserContrast ?? null,
    reducedTransparency: bootArgs.reducedTransparency ?? false,
    deviceScaleFactor: bootArgs.scale.deviceScaleFactor,
  };
}

function initialRow(
  state: Pick<SessionDaemonState, "name" | "root" | "home" | "socketPath" | "ttlMs" | "bootArgs">,
  args: { readonly slotDir: string; readonly cdpEndpoint: string | null; readonly bootArgv: readonly string[]; readonly stageBand: number | null },
): SessionRow {
  const { bootArgs } = state;
  const stageProvenance = currentSnapStageProvenance();
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
    stage:
      args.stageBand === null
        ? null
        : {
            band: args.stageBand,
            status: "live",
            detectedAt: null,
            op: null,
            ...(stageProvenance?.state === "bound"
              ? {
                  ownerCheckout: stageProvenance.ownerCheckout ?? state.root,
                  ref: stageProvenance.ref ?? "unavailable",
                  binding: stageProvenance.binding ?? bindingOf(bootArgs),
                }
              : {}),
          },
    environment: sessionEnvironmentOf(bootArgs),
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
  const bootArgs: Args = opts;
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
    beginInstrumentRun(SESSION_INSTRUMENT, root, { slotDir: slot.dir });
    session = await launchSnapSession(bootArgs, {
      pages: bootArgs.pages,
      debuggingEndpoint: true,
      requireCascadeRuntime: opts.matrix,
    });
  } catch (error) {
    publishRunSlot(root, slot, []);
    throw error;
  } finally {
    finishInstrumentRun();
  }
  const socketPath = sessionSocketPath(home, name);
  // `configureStage` has already allocated (or reused) a band and repointed `bootArgs.base` at it, so the
  // BASE names the band — the one fact both halves of the substrate agree on (`urlStageBand` is port-keyed).
  const stageHome = markerRoot(root);
  const stageBand = bootArgs.isolated ? urlStageBand(bootArgs.base) : null;
  const state: SessionDaemonState = {
    name,
    root,
    home,
    socketPath,
    session,
    bootArgs,
    calls: 0,
    ttlMs: limits.ttlMs,
    stageHome,
    stageBand,
    row: initialRow(
      { name, root, home, socketPath, ttlMs: limits.ttlMs, bootArgs },
      { slotDir: slot.dir, cdpEndpoint: await debuggingEndpointFor(session), bootArgv: argv, stageBand },
    ),
    inflight: null,
    ttlTimer: null,
    closing: false,
    terminalReason: null,
    evidence: sessionEvidenceState(slot.dir, name, bootArgs.failureEvidence),
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
    // @orb-waive caught-failure-ownership(readSessionRequestLine): the failure is reported to the caller as SESSION SERVE ERROR and the request's `done` carries toolError — the caller's exit IS the report, and the daemon stays up (a session survives a failed call, §7.1). Ends if the done event stops carrying the exit.
    readSessionRequestLine(socket)
      .then(async (request) => {
        if (request === null) {
          emitSessionEvent(socket, { kind: "warn", text: `SESSION PROTOCOL ERROR  ${name}: unreadable request line (protocol v${SESSION_PROTOCOL_VERSION})` });
          emitSessionEvent(socket, { kind: "done", exit: EXIT.toolError, pairs: [] });
          socket.end();
          return;
        }
        await serveSessionRequest(state, request, socket, shutdown);
      })
      .catch((unhandled: unknown) => {
        emitSessionEvent(socket, { kind: "warn", text: `SESSION SERVE ERROR  ${name}: ${errorMessage(unhandled)}` });
        emitSessionEvent(socket, { kind: "done", exit: EXIT.toolError, pairs: [] });
        socket.end();
      });
  });
  const shutdown = async (reason: string): Promise<void> => {
    if (state.closing) {
      return;
    }
    state.closing = true;
    pauseSessionTtl(state);
    // Drain before dispose: an in-flight call finishes and answers its caller before the browser goes.
    await state.inflight?.done;
    print(`session      ${name} closing — ${reason}`);
    server.close();
    // @orb-waive caught-failure-ownership(error): a browser that fails to close is logged and the teardown proceeds to the registry half — the row + socket must go regardless, or the session reads as live forever. Ends if a failed browser close must abort the teardown.
    try {
      await retainSessionEvidence(state.evidence, session);
      await finishSession(session, false, name, false);
    } catch (error) {
      warn(`session      ${name}: browser close failed — ${errorMessage(error)}`);
    }
    // The latch is released NO MATTER WHAT: a registry or slot teardown that throws must not park the daemon
    // on `closed` forever holding a row that still reads LIVE — that is §3.8's dead-marker class from the
    // inside, and it is what makes `detachSessionShutdown`'s catch a report rather than a hang.
    try {
      if (stageBand !== null) {
        // Release the stage: the band is now reapable on its own idle TTL, exactly as if no session had run.
        unbindSessionFromBand(stageHome, stageBand, name);
      }
      removeSocket(home, name);
      removeRow(home, name);
      publishRunSlot(root, slot, []);
      // THE BROWSER IS IN ITS OWN SESSION (#1848), so the group kill below cannot reach it and a close
      // that failed leaves it running for good. Anything still carrying this daemon's run marker after
      // the close is exactly that; a clean shutdown reaps nothing and prints nothing.
      for (const line of [...sweepOwnBrowsers(), ...sweepStrandedBrowsers()]) {
        print(`[snap-session] ${line}`);
      }
    } finally {
      resolveClosed();
      if (state.terminalReason !== null) {
        // A non-page call can retain a worker/CDP handle even after the browser closes. The daemon owns
        // its detached process group, so terminal teardown ends that whole possibly-live workload after
        // the row/socket/slot cleanup rather than letting it mutate a published call slot later.
        killPidGroup(process.pid, "SIGKILL");
      }
    }
  };
  // A stale socket file from a crashed predecessor blocks `listen` — the access gate already ruled this
  // name absent or reclaimable, so the file is ours to clear.
  rmSync(socketPath, { force: true });
  await listenSessionServer(server, socketPath);
  writeRow(home, state.row);
  process.once("SIGTERM", () => {
    detachSessionShutdown(shutdown("SIGTERM"), name, "SIGTERM");
  });
  process.once("SIGINT", () => {
    detachSessionShutdown(shutdown("SIGINT"), name, "SIGINT");
  });
  armSessionTtl(state, shutdown);
  print(`session      ${name} ready — socket ${socketPath} · endpoint ${state.row.cdpEndpoint ?? "none"} · slot ${slot.relDir}`);
  await closed;
  return EXIT.clean;
}
