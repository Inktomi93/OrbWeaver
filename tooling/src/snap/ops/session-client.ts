// The session CLIENT (docs/design/1208-instrument-substrate.md §3.2 + §10.1). `--session <name> …` boots the
// daemon on first use through the ONE detached full-priority door (_shared/proc.ts `spawnFullPriorityChild`:
// own process group, its stdio a LOG FILE beside the socket — a detached child that outlives its launcher must never
// hold a pipe to it), then forwards every call's raw argv over the repo-keyed unix socket and prints the
// daemon's event stream VERBATIM, so the RESULT line stays last on THIS stdout. The client owns the per-call
// run slot (cli.ts wraps it in `withInstrumentRun`); the daemon ADOPTS it for the call's artifacts (§3.7).
// A dead session is loud (§3.8): the row + `abandonedRuns` say so, exit 2, never a silently-resolving
// pointer. Ownership is the DAEMON's verdict (F4); the row read here is the cheap pre-check.
import { readFileSync, statSync } from "node:fs";
import { createConnection } from "node:net";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { errorMessage } from "@orb/kit/error-message";
import { activeRunSlot } from "../../_shared/artifact-out.ts";
import { abandonedRuns, print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import { spawnFullPriorityChild } from "../../_shared/proc.ts";
import type { SessionEvent, SessionRequest, SessionRequestKind, SessionRow } from "../contract/session.ts";
import { SESSION_PROTOCOL_VERSION } from "../contract/session.ts";
import type { Args } from "../contract/types.ts";
import {
  SESSION_BOOT_TIMEOUT_MS,
  SESSION_CALL_SILENCE_MS,
  SESSION_INSTRUMENT,
  SESSION_PING_SILENCE_MS,
  SESSION_READY_POLL_MS,
  sessionAccess,
  sessionLogPath,
  sessionSocketPath,
  stripSessionFlags,
} from "../lib/session-plan.ts";
import { foreignSessionRefusal, sessionCapRefusal, sessionDeadText } from "../lib/session-refusals.ts";
import { readSessionEvent } from "../lib/session-wire.ts";
import { validateRouteSection } from "./parse-route.ts";
import { registerSnapDiagnosticCompleteness, registerSnapFactBatch, registerSnapResultPairs, registerSnapSessionProvenance } from "./run-bundle.ts";
import { liveRows, readRow, releaseSessionBoot, reserveSessionBoot, rowIsLive, sessionLimitsFromEnv, sessionRegistryHome } from "./session-registry.ts";
import { repoRoot } from "./stage-git.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session <name> <route>");

/** The daemon's entry is THIS tool's cli — derived from this module's own location, never from argv (the
 *  argv front door is cli.ts's alone, gate `tooling-argv-front-door`). */
const SNAP_CLI = fileURLToPath(new URL("../cli.ts", import.meta.url));

/** One request → the daemon's event stream, delivered in arrival order; resolves with the `done` exit.
 *  Rejects when the socket refuses (no daemon listens), when the stream ends before `done` (a daemon that
 *  died mid-call), or when the daemon goes MUTE for `silenceMs` — all three are the caller's "I could not
 *  measure", never a verdict.
 *
 *  `silenceMs` is REQUIRED (#1508). This door had no clock at all: a daemon that ACCEPTED the connection
 *  and then wrote nothing held its caller forever — including `pingOk`, which the boot poll awaits
 *  unwrapped, so `SESSION_BOOT_TIMEOUT_MS` was checked only after a wait that never ended and the boot
 *  ceiling was unreachable. It bounds SILENCE, not duration: every event restarts the clock, so a
 *  long-running call is never cut off while the daemon is still talking. Required rather than defaulted
 *  because a handshake and a browser-driving call are two different silences (`session-plan.ts`). */
export function sessionRequest(socketPath: string, request: SessionRequest, onEvent: (event: SessionEvent) => void, silenceMs: number): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const socket = createConnection(socketPath);
    let buffer = "";
    let done: number | null = null;
    let mute: NodeJS.Timeout | undefined;
    const armMute = (): void => {
      clearTimeout(mute);
      mute = setTimeout(() => {
        socket.destroy();
        reject(new Error(`the session daemon sent nothing for ${silenceMs}ms — treating its socket as wedged`));
      }, silenceMs);
    };
    armMute();
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on("data", (chunk: string) => {
      armMute();
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const event = readSessionEvent(line);
        if (event === null) {
          reject(new Error(`the session daemon sent an unreadable event line: ${line}`));
          socket.destroy();
          return;
        }
        if (event.kind === "done") {
          done = event.exit;
        }
        onEvent(event);
        newline = buffer.indexOf("\n");
      }
    });
    socket.on("error", (error) => {
      clearTimeout(mute);
      reject(error);
    });
    socket.on("close", () => {
      clearTimeout(mute);
      if (done === null) {
        reject(new Error("the session daemon closed the connection before its RESULT — it died mid-call"));
        return;
      }
      resolve(done);
    });
  });
}

function printEvent(event: SessionEvent): void {
  if (event.kind === "line") {
    print(event.text);
  } else if (event.kind === "warn") {
    warn(event.text);
  }
}

/** Is a daemon answering on this socket? A refused/absent socket is the "not yet" of a boot poll. */
async function pingOk(socketPath: string, root: string): Promise<boolean> {
  const ping: SessionRequest = {
    v: SESSION_PROTOCOL_VERSION,
    kind: "ping",
    runId: "",
    slotDir: "",
    argv: [],
    cwd: process.cwd(),
    checkout: root,
    boot: false,
    force: false,
    exportOut: null,
  };
  // @orb-waive caught-failure-ownership(catch): a refused or absent socket IS the negative answer of a readiness poll — the caller keeps polling until the daemon answers, exits, or the boot budget names the failure. Ends if the poll stops bounding the wait.
  try {
    return (await sessionRequest(socketPath, ping, () => undefined, SESSION_PING_SILENCE_MS)) === EXIT.clean;
  } catch {
    return false;
  }
}

/** Print the daemon's log bytes past `offset` (its stage boot, its own refusals) so a boot is watchable
 *  from the client's terminal; returns the new offset. */
function relayLog(logPath: string, offset: number): number {
  // @orb-waive caught-failure-ownership(catch): the log does not exist until the daemon's first write — an absent file is "nothing to relay yet" (the offset is handed back unchanged) and the poll reads again next tick. Ends if a missing log must be reported instead.
  try {
    const size = statSync(logPath).size;
    if (size <= offset) {
      return offset;
    }
    const text = readFileSync(logPath, "utf8").slice(offset);
    for (const line of text.split("\n").filter((entry) => entry !== "")) {
      print(`daemon       ${line}`);
    }
    return size;
  } catch {
    return offset;
  }
}

/** One session call's addressing: the name, the registry it lives in, the caller's checkout, and the argv
 *  the daemon receives (the client's own flags stripped). */
interface SessionCallContext {
  readonly name: string;
  readonly home: string;
  readonly root: string;
  readonly forwarded: readonly string[];
  readonly exportOut: string | null;
}

/** Boot the daemon and wait for it to answer `ping` — relaying its log meanwhile. Returns null when the
 *  session is ready, else the exit code (the daemon died during boot, or the boot budget expired). */
async function bootSession(opts: Args, ctx: SessionCallContext): Promise<number | null> {
  const { name, home, root, forwarded } = ctx;
  const { limits, errors } = sessionLimitsFromEnv(opts.sessionTtlMin);
  if (errors.length > 0) {
    for (const error of errors) {
      print(`ARG ERROR    ${error}`);
    }
    return EXIT.misuse;
  }
  const reservation = reserveSessionBoot(home, name, limits.cap);
  if (reservation === "cap") {
    print(sessionCapRefusal(name, liveRows(home), limits.cap, Date.now()));
    return EXIT.toolError;
  }
  if (reservation === "name") {
    print(`SESSION REFUSED  ${name} is already booting — wait for its daemon to publish a row`);
    return EXIT.toolError;
  }
  const logPath = sessionLogPath(home, name);
  const socketPath = sessionSocketPath(home, name);
  const ttl = opts.sessionTtlMin === null ? [] : ["--session-ttl", String(opts.sessionTtlMin)];
  const child = spawnFullPriorityChild(process.execPath, [SNAP_CLI, "--session-daemon", name, ...ttl, ...forwarded], {
    cwd: process.cwd(),
    logPath,
    detached: true,
  });
  // The daemon outlives this client by design; without `unref` node would hold the client open until it exits.
  child.unref();
  print(`session      booting ${name} (daemon pid ${child.pid ?? "?"}, log ${logPath})`);
  const deadline = Date.now() + SESSION_BOOT_TIMEOUT_MS;
  let offset = 0;
  try {
    for (;;) {
      offset = relayLog(logPath, offset);
      if (child.hasExited()) {
        print(`SESSION BOOT FAILED  ${name}'s daemon exited during boot — its log is above (${logPath})`);
        return EXIT.toolError;
      }
      if (await pingOk(socketPath, root)) {
        return null;
      }
      if (Date.now() > deadline) {
        child.killGroup("SIGKILL");
        print(`SESSION BOOT FAILED  ${name} did not answer within ${SESSION_BOOT_TIMEOUT_MS}ms — its log is above (${logPath})`);
        return EXIT.toolError;
      }
      await sleep(SESSION_READY_POLL_MS);
    }
  } finally {
    releaseSessionBoot(home, name);
  }
}

/** What a dead session's row can say about WHERE it died: the abandoned slot when the marker still names
 *  it, else the bare fact. */
function deadDetail(root: string, row: SessionRow): string {
  const abandoned = abandonedRuns(root, SESSION_INSTRUMENT).find((run) => run.dir === row.slotDir);
  return abandoned === undefined ? `socket ${row.socket}` : `run slot ${row.slotDir} still in flight since ${abandoned.startedAt}`;
}

async function forwardRequest(kind: SessionRequestKind, ctx: SessionCallContext, boot: boolean): Promise<number> {
  const { name, home, root, forwarded } = ctx;
  const slot = activeRunSlot();
  if (slot === null) {
    throw new Error("INSTRUMENT ERROR: a session call runs inside withInstrumentRun — no run slot is open for the daemon to adopt");
  }
  const request: SessionRequest = {
    v: SESSION_PROTOCOL_VERSION,
    kind,
    runId: slot.runId,
    slotDir: slot.dir,
    argv: forwarded,
    cwd: process.cwd(),
    checkout: root,
    boot,
    force: false,
    exportOut: kind === "export" ? ctx.exportOut : null,
  };
  // @orb-waive caught-failure-ownership(error): a daemon that vanished mid-call is reported as SESSION DEAD (or SESSION ERROR with the reason) and the call exits toolError — the failure is the printed verdict. Ends if that exit code stops being surfaced.
  try {
    return await sessionRequest(
      sessionSocketPath(home, name),
      request,
      (event) => {
        if (event.kind === "done" && event.diagnosticCompleteness !== undefined) {
          registerSnapDiagnosticCompleteness(event.diagnosticCompleteness);
        }
        if (event.kind === "done") {
          registerSnapResultPairs(event.pairs);
          for (const batch of event.facts ?? []) {
            registerSnapFactBatch(batch);
          }
          if (event.sessionProvenance !== undefined) {
            registerSnapSessionProvenance(event.sessionProvenance);
          }
        }
        printEvent(event);
      },
      SESSION_CALL_SILENCE_MS,
    );
  } catch (error) {
    const row = readRow(home, name);
    print(row === null ? `SESSION ERROR  ${name}: ${errorMessage(error)}` : sessionDeadText(row, errorMessage(error)));
    return EXIT.toolError;
  }
}

/** The route check for a `--session` call, judged on what the call reaches: a live session's binding, else
 *  the boot args. The parse defers it here because the argv of a later call does not name the target. */
export function sessionRouteErrors(opts: Args): string[] {
  if (opts.session === null) {
    return [];
  }
  const row = readRow(sessionRegistryHome(repoRoot()), opts.session);
  const target = row !== null && rowIsLive(row) ? { ...opts, base: row.binding.url, isolated: row.binding.kind === "stage" } : opts;
  return validateRouteSection(target);
}

/** `--session <name> …` (boot + call) and `--session-export <name>` — both run inside THIS run's slot. */
export async function runSessionCall(opts: Args, argv: readonly string[]): Promise<number> {
  const exporting = opts.sessionExport !== null;
  const name = opts.sessionExport ?? opts.session;
  if (name === null) {
    throw new Error("INSTRUMENT ERROR: runSessionCall without --session/--session-export");
  }
  const root = repoRoot();
  const home = sessionRegistryHome(root);
  const ctx: SessionCallContext = { name, home, root, forwarded: stripSessionFlags(argv), exportOut: exporting ? opts.out : null };
  const row = readRow(home, name);
  const live = row !== null && rowIsLive(row);
  const access = sessionAccess({ row, live, callerCheckout: root });
  if (row !== null && access === "refuse") {
    print(foreignSessionRefusal(row, Date.now()));
    return EXIT.toolError;
  }
  if (row !== null && access === "reclaim") {
    print(sessionDeadText(row, deadDetail(root, row)));
    return EXIT.toolError;
  }
  let boot = false;
  if (access === "absent") {
    if (exporting) {
      print(`SESSION ABSENT  no session named ${name} — nothing to export (registry ${home})`);
      return EXIT.toolError;
    }
    const bootExit = await bootSession(opts, ctx);
    if (bootExit !== null) {
      return bootExit;
    }
    boot = true;
  }
  return await forwardRequest(exporting ? "export" : "call", ctx, boot);
}
