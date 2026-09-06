// THE REAP LEDGER — `<main>/.cache/snap-stage/reaps.json`, a bounded ring of the most recent stage
// teardowns and WHICH ARM fired (docs/design/1208-instrument-substrate.md §3.6, issue #1163).
//
// WHY IT EXISTS. A reaped band leaves nothing behind: the row is cleared, the dir is gone, the ports are
// free. So "band 3 is free" and "band 3 was reaped out from under a lane forty seconds ago" are the SAME
// observation on `--stage-status`, and with four arms that can end a stage (the stage's own idle timer,
// reap-on-acquire, `--stage-sweep`, `--stage-down`) the operator's next question after a stage vanishes is
// always "which one, and why". This answers it in one line without a second instrument.
//
// BOUNDED AND BEST-EFFORT, on purpose. It is an operator READ, never an input to any decision: nothing in
// the allocator, the sweep or the timer reads this file back, so a lost write costs a diagnostic line and
// never a wrong verdict. It rides the SAME table mutex as `bands.json` (`withBandsLock`), because a reap
// and its ledger entry are one event and a concurrent allocator must not interleave between them.
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { StageReapArm, StageReapEntry, StageReapsFile, StageRow } from "../contract/stage.ts";
import { describeStageAgePhrase, REAPS_REL, shortSha, stageIdleMs } from "../lib/stage-plan.ts";
import { withBandsLock } from "./stage-marker.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --stage-status");

const REAPS_FILE_VERSION = 1;
/** How many teardowns the ring keeps. Ten bands, so this is at least one full turnover of the table — long
 *  enough to explain a stage that vanished during a lane's run, short enough that the file stays a glance. */
const REAP_RING_SIZE = 20;

/** Narrowed by SEARCH rather than by a cast: a stored arm that is not a member reads as an unparseable
 *  entry and is dropped, which is the same posture `readRow` takes for a band row it cannot reason about. */
const REAP_ARMS: readonly StageReapArm[] = ["timer", "acquire", "sweep", "down", "boot-dead"];

function readArm(value: unknown): StageReapArm | null {
  return REAP_ARMS.find((arm) => arm === value) ?? null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An entry we cannot reason about is not an entry — a garbage row is dropped rather than repaired, the
 *  same posture `readRow` takes for the band table. */
function readEntry(value: unknown): StageReapEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  const { band, sha, checkout, at, idleMs } = value;
  const arm = readArm(value["arm"]);
  if (!(Number.isInteger(band) && arm !== null && typeof sha === "string")) {
    return null;
  }
  if (!(typeof checkout === "string" && typeof at === "string" && typeof idleMs === "number")) {
    return null;
  }
  return { band: Number(band), arm, sha, checkout, at, idleMs };
}

export function readStageReaps(home: string): readonly StageReapEntry[] {
  const path = join(home, REAPS_REL);
  if (!existsSync(path)) {
    return [];
  }
  // @orb-gate-ignore caught-failure-ownership(default:catch): optional-read-as-absent — a truncated/garbage ledger reads as "no reaps recorded", which is the same line a fresh checkout prints; nothing decides anything on this file. Ends if any verdict starts reading it back.
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!(isRecord(parsed) && parsed["v"] === REAPS_FILE_VERSION && Array.isArray(parsed["rows"]))) {
      return [];
    }
    return parsed["rows"].map(readEntry).filter((entry): entry is StageReapEntry => entry !== null);
  } catch {
    return [];
  }
}

/** Append one teardown, newest LAST, trimmed to the ring size. Held under the table mutex by the caller's
 *  own `withBandsLock` when there is one (the lock is re-entrant), so a reap and its ledger entry land
 *  together. */
export function recordStageReap(home: string, row: StageRow, arm: StageReapArm, nowMs: number = Date.now()): void {
  const entry: StageReapEntry = {
    band: row.band,
    arm,
    sha: row.sha,
    checkout: row.checkout,
    at: new Date(nowMs).toISOString(),
    idleMs: stageIdleMs(row, nowMs),
  };
  withBandsLock(home, () => {
    const kept = [...readStageReaps(home), entry].slice(-REAP_RING_SIZE);
    const file: StageReapsFile = { v: REAPS_FILE_VERSION, rows: kept };
    const path = join(home, REAPS_REL);
    const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
    try {
      writeFileSync(temp, `${JSON.stringify(file, null, 2)}\n`);
      renameSync(temp, path);
    } finally {
      rmSync(temp, { force: true });
    }
  });
}

/** The `--stage-status` line: the most recent teardowns, newest first, each naming its arm and its age. */
export function describeStageReaps(home: string, nowMs: number, limit: number): string {
  const entries = [...readStageReaps(home)].slice(-limit).reverse();
  if (entries.length === 0) {
    return "none recorded";
  }
  return entries
    .map((entry) => `band ${entry.band} ${entry.arm} ${describeStageAgePhrase(entry.at, nowMs)} (${shortSha(entry.sha)} · ${entry.checkout})`)
    .join(" · ");
}
