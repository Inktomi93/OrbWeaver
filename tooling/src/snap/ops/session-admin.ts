// `--session-status` / `--session-close` / `--session-sweep` (docs/design/1208-instrument-substrate.md §3.5,
// §3.8, §4.4) — the registry's admin verbs, the session twins of ops/stage-status.ts. All three work from
// ANY checkout (the registry is repo-keyed); a LIVE session owned by another checkout is reported by status,
// refused by close without `--force` (the #447 teardown-consent rule applied to sessions), and never touched
// by the sweep while it is under its TTL (the #310 liveness-gate lesson: identify by a positive signal).
import process from "node:process";
import { adoptRunSlot } from "../../_shared/artifact-out.ts";
import { abandonedRuns, print, publishRunSlot } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { SessionEvent, SessionRequest, SessionRow } from "../contract/session.ts";
import { SESSION_PROTOCOL_VERSION } from "../contract/session.ts";
import type { Args } from "../contract/types.ts";
import {
  SESSION_CLOSE_GRACE_MS,
  SESSION_INSTRUMENT,
  SESSION_PING_SILENCE_MS,
  sessionIdleMs,
  sessionSocketPath,
  sessionSweepVerdict,
} from "../lib/session-plan.ts";
import { foreignSessionRefusal, sessionDeadText } from "../lib/session-refusals.ts";
import { describeStageAgePhrase } from "../lib/stage-plan.ts";
import { sessionRequest } from "./session-client.ts";
import {
  listRows,
  orphanSockets,
  reapSession,
  removeSocket,
  rowIsLive,
  sessionLimitsFromEnv,
  sessionRegistryHome,
  waitForDaemonExit,
} from "./session-registry.ts";
import { repoRoot } from "./stage-git.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session-status");

const MS_PER_MINUTE = 60_000;

function adminRequest(kind: SessionRequest["kind"], root: string, force: boolean): SessionRequest {
  return { v: SESSION_PROTOCOL_VERSION, kind, runId: "", slotDir: "", argv: [], cwd: process.cwd(), checkout: root, boot: false, force, exportOut: null };
}

/** The daemon's own status answer for a live row, or null when it did not answer (then the row speaks). */
async function askStatus(home: string, root: string, row: SessionRow): Promise<Extract<SessionEvent, { kind: "status" }> | null> {
  let status: Extract<SessionEvent, { kind: "status" }> | null = null;
  // @orb-gate-ignore caught-failure-ownership(default:catch): a live pid whose socket does not answer is REPORTED from its row with the "not answering" mark the caller prints — the read degrades to the evidence it has, it never hides the session. Ends if a silent daemon must become a hard error.
  try {
    await sessionRequest(
      sessionSocketPath(home, row.name),
      adminRequest("status", root, false),
      (event) => {
        if (event.kind === "status") {
          status = event;
        }
      },
      // A status round trip is a handshake, so it takes the PING silence (#1508): before this door had a
      // clock, one wedged daemon hung `--session-status` for every row behind it, forever.
      SESSION_PING_SILENCE_MS,
    );
  } catch {
    return null;
  }
  return status;
}

function describeRow(row: SessionRow, nowMs: number): string {
  return `owner ${row.ownerCheckout} · pid ${row.daemonPid} · last used ${describeStageAgePhrase(row.lastUsedAt, nowMs)} · ${row.binding.kind} ${row.binding.url} · ttl ${Math.round(row.ttlMs / MS_PER_MINUTE)}m · calls ${row.calls}`;
}

/** The activity half of a live row's line: what the daemon said, or that it said nothing. */
function describeActivity(status: Extract<SessionEvent, { kind: "status" }> | null): string {
  if (status === null) {
    return "not answering on its socket";
  }
  return status.busy === null ? `idle ${Math.round(status.idleMs / MS_PER_MINUTE)}m` : `BUSY mid-\`${status.busy}\``;
}

/** One row's status lines: a DEAD row prints its loud block; a live one is asked for its pages. */
async function describeSession(home: string, root: string, row: SessionRow, nowMs: number): Promise<readonly string[]> {
  if (!rowIsLive(row)) {
    return [`session      ${row.name}  DEAD   ${describeRow(row, nowMs)}`, sessionDeadText(row, `socket ${row.socket}`)];
  }
  const status = await askStatus(home, root, row);
  return [
    `session      ${row.name}  LIVE   ${describeActivity(status)} · ${describeRow(row, nowMs)} · endpoint ${row.cdpEndpoint ?? "none"} · slot ${row.slotDir}`,
    ...(status?.pages ?? []).map((page) => `             page ${page.index}  ${page.url}  ${JSON.stringify(page.title)}`),
  ];
}

/** `snap --session-status [<name>]` — every session of this repo, live ones asked for their pages. */
async function sessionStatus(name: string | null): Promise<string> {
  const root = repoRoot();
  const home = sessionRegistryHome(root);
  const nowMs = Date.now();
  const rows = listRows(home).filter((row) => name === null || row.name === name);
  const lines: string[] = [];
  if (rows.length === 0) {
    lines.push(name === null ? `sessions     none (registry ${home})` : `SESSION ABSENT  no session named ${name} (registry ${home})`);
  }
  for (const row of rows) {
    lines.push(...(await describeSession(home, root, row, nowMs)));
  }
  const orphans = abandonedRuns(root, SESSION_INSTRUMENT).filter((run) => !rows.some((row) => row.slotDir === run.dir));
  if (orphans.length > 0) {
    lines.push(
      `orphans      ${orphans.length} abandoned session slot(s) no row names (${orphans.map((run) => run.runId).join(", ")}) — \`pnpm snap --session-sweep\` settles them`,
    );
  }
  const { limits } = sessionLimitsFromEnv(null);
  const live = rows.filter(rowIsLive).length;
  lines.push(
    `sessions     ${live} live · ${rows.length - live} dead · cap ${limits.cap} (ORB_SESSION_CAP) · default ttl ${Math.round(limits.ttlMs / MS_PER_MINUTE)}m (ORB_SESSION_TTL_MIN) · registry ${home}`,
  );
  return lines.join("\n");
}

/** `snap --session-close <name> [--force]`: a live session we own (or a foreign one with consent) is asked
 *  to close and waited for; a wedged or dead one is reaped. Idempotent on an absent name — a fold script
 *  closes unconditionally. */
async function closeSession(name: string, force: boolean): Promise<number> {
  const root = repoRoot();
  const home = sessionRegistryHome(root);
  const row = listRows(home).find((entry) => entry.name === name);
  if (row === undefined) {
    print(`session      no session named ${name} (nothing to close; registry ${home})`);
    return EXIT.clean;
  }
  if (!rowIsLive(row)) {
    print(`session      ${name} was DEAD (daemon pid ${row.daemonPid} gone) — reaped: ${await reapSession(home, root, row)}`);
    return EXIT.clean;
  }
  if (row.ownerCheckout !== root && !force) {
    print(foreignSessionRefusal(row, Date.now()));
    return EXIT.toolError;
  }
  let answered = false;
  // @orb-gate-ignore caught-failure-ownership(empty:catch): a daemon that does not answer its close is REAPED below (group signal + marker settle) and the reap's receipt is printed — the failure path is the louder one. Ends if the reap stops being unconditional after a refused close.
  try {
    // The close grace, not the ping silence: a closing daemon is releasing a browser, and this is already
    // the number this file waits for that (#1508 — the door itself used to wait forever instead).
    await sessionRequest(sessionSocketPath(home, name), adminRequest("close", root, force), () => undefined, SESSION_CLOSE_GRACE_MS);
    answered = true;
  } catch {
    answered = false;
  }
  if (answered && (await waitForDaemonExit(row))) {
    print(
      `session      closed ${name}${row.ownerCheckout === root ? "" : ` (owned by ${row.ownerCheckout}, --force)`} — daemon pid ${row.daemonPid} exited, browser released`,
    );
    return EXIT.clean;
  }
  print(`session      ${name} did not close cleanly — reaped: ${await reapSession(home, root, row)}`);
  return EXIT.clean;
}

/** `snap --session-sweep`: dead sessions and sessions alive past their own TTL are reaped; orphan sockets
 *  and abandoned session slots are reconciled; a LIVE session under its TTL is reported, never touched. */
async function sweepSessions(): Promise<string> {
  const root = repoRoot();
  const home = sessionRegistryHome(root);
  const nowMs = Date.now();
  const done: string[] = [];
  const rows = listRows(home);
  for (const row of rows) {
    const verdict = sessionSweepVerdict({ live: rowIsLive(row), idleMs: sessionIdleMs(row, nowMs), ttlMs: row.ttlMs });
    if (verdict === "live") {
      done.push(`${row.name}: live (owner ${row.ownerCheckout}, last used ${describeStageAgePhrase(row.lastUsedAt, nowMs)}) — left alone`);
      continue;
    }
    done.push(`${row.name}: ${verdict === "dead" ? "DEAD" : "idle past its TTL"} — reaped (${await reapSession(home, root, row)})`);
  }
  for (const name of orphanSockets(home)) {
    removeSocket(home, name);
    done.push(`${name}: orphan socket removed (no row)`);
  }
  const named = new Set(rows.map((row) => row.slotDir));
  for (const run of abandonedRuns(root, SESSION_INSTRUMENT).filter((entry) => !named.has(entry.dir))) {
    publishRunSlot(root, adoptRunSlot(root, SESSION_INSTRUMENT, run.dir), []);
    done.push(`${run.runId}: abandoned session slot settled (no row named it)`);
  }
  return done.length === 0 ? `nothing to sweep — no sessions in ${home}` : done.join("\n");
}

/** cli.ts's admin door: the three print-and-exit modes, or null when the argv asked for none of them. */
export async function runSessionAdmin(opts: Args): Promise<number | null> {
  if (opts.sessionStatus) {
    print(await sessionStatus(opts.sessionStatusName));
    return EXIT.clean;
  }
  if (opts.sessionClose !== null) {
    return await closeSession(opts.sessionClose, opts.force);
  }
  if (opts.sessionSweep) {
    print(`[snap-session] ${await sweepSessions()}`);
    return EXIT.clean;
  }
  return null;
}
