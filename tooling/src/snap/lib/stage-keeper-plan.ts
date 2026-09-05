// THE STAGE'S OWN IDLE TIMER, ruled purely (docs/design/1208-instrument-substrate.md §3.6, issue #1163
// arm b): what ONE poll decides, how often to poll, how much time is left on a band, and the exact lines
// the timer prints when it reaps or refuses. No I/O — ops/stage-keeper.ts observes the box and acts.
//
// WHY A SECOND ARM AT ALL, when reap-on-acquire already exists. Arm (a) is CONTENTION-driven: a strand is
// reclaimed by the next lane that needs a band. On 2026-09-05 no lane needed one for hours, and three
// bands sat stranded 2h56m / 4h51m / 1h37m with LIVE server+vite stacks resident — part of a loadavg of
// 50-83 on 24 cores that made three sibling lanes refuse to render a verdict at all. Nobody was refused a
// band, so arm (a) never fired; nobody ran `--stage-sweep`, so the manual arm never fired either. The
// owner's design is the missing one: "each interaction resets the timer; if the timer expires it tears
// itself down." Arms (a) and the sweep stay EXACTLY as they were — a dead keeper must never strand a band,
// so they remain the backstop, and this timer is never their fence.
//
// THE THREE THINGS THAT COUNT AS AN INTERACTION, and none of them is "a snap CLI call":
//   1. `lastUsedAt` — stamped by every `ensureStage`, every session call bound to the band and every
//      attached sibling run (§3.6's definition, already implemented by ops/stage-marker.ts `touchRow`);
//   2. a LIVE SESSION ref on the row — the daemon is driving it, whatever the idle age (§3.6's fence);
//   3. a FOREIGN PEER: an established connection to one of the row's ports from a process that is not one
//      of the stage's own. That third one is what keeps a 90-minute one-shot drive alive — a matrix run
//      calls `ensureStage` ONCE and then holds a browser against the stage for an hour with no further
//      table write, so `lastUsedAt` alone would reap the stage out from under it. A page holds vite's HMR
//      socket open for its whole life, which is exactly the observable this reads.
//
// THE ASYMMETRY WITH ARM (a) IS DELIBERATE. The allocator reaps on `lastUsedAt` alone and does NOT ask
// about peers — because it only ever fires when a lane NEEDS the band, which is the right moment to break
// a tie. The timer fires under no pressure at all, so it can afford to be the conservative arm: every
// uncertainty (an unidentifiable peer, an unreadable row) resolves to `wait`.
import { reservedPort } from "../../_shared/ports.ts";
import type { StageKeeperEvidence, StageKeeperVerdict, StageRow } from "../contract/stage.ts";
import { describeStageAgePhrase, shortSha, stageIdleMs, stageKeeperLogPath } from "./stage-plan.ts";

const MS_PER_MINUTE = 60_000;

/** The poll cadence: a tenth of the TTL, floored so a tiny `ORB_STAGE_TTL_MIN` (the committed proofs run
 *  at seconds) still resolves, ceilinged so a 60-minute TTL costs one `ss` and one small JSON read a
 *  minute rather than a busy loop. The TTL itself is NEVER load-scaled (§7.1: idle is not load), and
 *  neither is this — a poll interval is a sampling rate on an idle clock, not a wall-clock budget. */
const KEEPER_POLL_FLOOR_MS = 200;
const KEEPER_POLL_CEILING_MS = 60_000;
const KEEPER_POLL_DIVISOR = 10;

export function keeperPollMs(ttlMs: number): number {
  return Math.min(KEEPER_POLL_CEILING_MS, Math.max(KEEPER_POLL_FLOOR_MS, Math.round(ttlMs / KEEPER_POLL_DIVISOR)));
}

/** Whose timer is this row's? `adopt` when the row names NO keeper or one whose process is gone — the
 *  keeper stamps itself and takes the band; `held` when a live keeper (this one or another) already owns
 *  it, and the verdict below decides what that means.
 *
 *  THE ADOPTION IS WHAT MAKES THE ARMING RACE-FREE. `armStageKeeper` spawns the child and THEN writes its
 *  pid onto the row; a keeper with a small TTL can poll before that write lands, and a keeper that
 *  released on "no keeper recorded" would die a millisecond after being armed. Adopting is also the
 *  self-heal for a row whose keeper was killed: the next `ensureStage` spawns a fresh one that takes the
 *  band without anybody reconciling the stale pid. Two keepers cannot both hold it — the loser sees a
 *  LIVE pid that is not its own at its next poll and releases. */
export function stageKeeperClaim(row: StageRow, keeperAlive: (pid: number) => boolean): "adopt" | "held" {
  const keeper = row.keeper;
  return keeper === undefined || !keeperAlive(keeper.pid) ? "adopt" : "held";
}

/** How long this band has left before its timer fires, in ms — 0 once it is due. */
export function keeperRemainingMs(row: StageRow, nowMs: number, ttlMs: number): number {
  return Math.max(0, ttlMs - stageIdleMs(row, nowMs));
}

/** ONE poll's decision. The order IS the safety argument:
 *  1. the RESERVED fence first, unconditionally — a row that names the dev pair is refused before any idle
 *     arithmetic can make it look reapable (the operator's `:5173`/`:8788` stack is out of scope by
 *     definition, and a timer that could reach it is an outage generator, not a feature);
 *  2. IDENTITY — a keeper whose row is gone, or whose row now names a different keeper, has been replaced
 *     (a `--fresh` rebuild boots a new stage on the same band); it must release without touching a thing;
 *  3. the LIVE-SESSION fence, the same one `stageSweepVerdict` applies;
 *  4. a connected FOREIGN PEER — somebody is driving this stage right now;
 *  5. only then the idle clock. */
export function stageKeeperVerdict(evidence: StageKeeperEvidence): StageKeeperVerdict {
  const { row } = evidence;
  if (row === null) {
    return "release";
  }
  if (evidence.reservedPorts.length > 0) {
    return "refuse";
  }
  if (row.keeper === undefined || row.keeper.pid !== evidence.keeperPid) {
    return "release";
  }
  if (evidence.liveSessions.length > 0 || evidence.foreignPeer !== null) {
    return "wait";
  }
  return stageIdleMs(row, evidence.nowMs) > evidence.ttlMs ? "reap" : "wait";
}

/** Which of a row's ports a reserved row owns — normally none. Kept here rather than at the call site so
 *  the fence and the verdict that reads it cannot drift apart. */
export function reservedRowPorts(row: StageRow): readonly number[] {
  return [row.serverPort, row.vitePort].filter((port) => reservedPort(port) !== undefined);
}

/** THE line the timer writes when it fires — one line, naming what it reaped and whose (#1163). */
export function stageKeeperReapLine(row: StageRow, nowMs: number, ttlMs: number): string {
  return (
    `[snap-stage] TIMER REAPED band ${row.band} — stage ${shortSha(row.sha)} owned by ${row.checkout} ` +
    `(dir ${row.dir}, :${row.serverPort}/:${row.vitePort}) was idle ${describeStageAgePhrase(row.lastUsedAt, nowMs)} ` +
    `past the ${Math.round(ttlMs / MS_PER_MINUTE)}m TTL with no live session and no connected client — ` +
    "stack stopped, dir removed, row cleared"
  );
}

/** The hard refusal (exit-2 class): the timer will not act on a row that names a port somebody else owns. */
export function stageKeeperReservedRefusal(row: StageRow, reserved: readonly number[]): string {
  const named = reserved
    .map((port) => {
      const owner = reservedPort(port);
      return `:${port} (${owner === undefined ? "unknown owner" : owner.owner})`;
    })
    .join(", ");
  return (
    `STAGE KEEPER REFUSED  band ${row.band}'s row names reserved port(s) ${named} — the idle timer only ever ` +
    "tears down a stage on its own band, never the dev stack, the fixture or an e2e mode. Nothing was touched; " +
    "reconcile the row with `pnpm snap --stage-status` (tooling/src/snap/lib/stage-keeper-plan.ts)."
  );
}

/** The keeper's half of a `--stage-status` band line. A row with no keeper, or one whose keeper pid is
 *  gone, says so OUT LOUD and names the arms that still cover it — a silent "timer" column would read as
 *  protection that is not there. */
export function describeStageKeeper(
  input: { readonly home: string; readonly row: StageRow; readonly nowMs: number; readonly ttlMs: number },
  keeperAlive: (pid: number) => boolean,
): string {
  const { home, row, nowMs, ttlMs } = input;
  const keeper = row.keeper;
  if (keeper === undefined) {
    return "timer none — reap-on-acquire and `--stage-sweep` are its only arms";
  }
  if (!keeperAlive(keeper.pid)) {
    return `timer DEAD (pid ${keeper.pid}) — reap-on-acquire and \`--stage-sweep\` still cover this band`;
  }
  const remaining = keeperRemainingMs(row, nowMs, ttlMs);
  // The LOG is named here rather than left implicit: the keeper writes its reap/refusal line to a file
  // under `.cache/` (it is detached, so it cannot write to any caller's stdout), and a gitignored artifact
  // nothing points at is an artifact nobody reads.
  return `timer ${Math.ceil(remaining / MS_PER_MINUTE)}m left (pid ${keeper.pid}, log ${stageKeeperLogPath(home, row.band)})`;
}
