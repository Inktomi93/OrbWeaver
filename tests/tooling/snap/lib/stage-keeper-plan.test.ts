// THE STAGE TIMER'S RULES (tooling/src/snap/lib/stage-keeper-plan.ts, #1163 arm b, design §3.6). Pure —
// every arm hands the verdict its own frozen instant, so "sixty-one minutes idle" is exactly that rather
// than that minus however long the run took, and a re-run cannot drift.
//
// PLANTED CONTROLS, BOTH DIRECTIONS, for every fence:
//  • the reap arm is the POSITIVE control that makes each fence meaningful — the same row that a live
//    session, a connected client or a reserved port protects IS reaped once that one fact is removed;
//  • the RESERVED fence is asserted against the real `_shared/ports.ts` dev pair, not a made-up number, so
//    a future port move cannot leave this passing against a port nobody owns;
//  • the identity rule gets both halves: a row naming a DIFFERENT live keeper releases, and a row naming a
//    DEAD one is ADOPTED rather than released (the arming race, and the self-heal for a killed timer).
import { DEV_PORTS, stageBandPorts } from "@orb/tooling/_shared/ports";
import type { StageKeeperEvidence, StageRow } from "@orb/tooling/snap";
import {
  describeStageKeeper,
  keeperPollMs,
  keeperRemainingMs,
  reservedRowPorts,
  stageKeeperClaim,
  stageKeeperLogPath,
  stageKeeperReapLine,
  stageKeeperReservedRefusal,
  stageKeeperVerdict,
} from "@orb/tooling/snap";
import { describe } from "vitest";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const MS_PER_MINUTE = 60_000;
const TTL_MS = 60 * MS_PER_MINUTE;
const SHA = "0123456789abcdef0123456789abcdef01234567";
const CHECKOUT = "/home/dev/orbweaver";
/** The band table's home — where the keeper's log lives beside `bands.json`. */
const HOME = "/home/dev/orbweaver";
const KEEPER_PID = 4242;
const OTHER_PID = 4243;
const FROZEN_ISO = new Date(FROZEN_AT_MS).toISOString();
/** Sixty-one minutes before the frozen instant — one minute past the default TTL. */
const IDLE_ISO = new Date(FROZEN_AT_MS - 61 * MS_PER_MINUTE).toISOString();
/** Fifty-nine minutes — one minute INSIDE it. The pair is what proves the boundary is the TTL. */
const FRESH_ISO = new Date(FROZEN_AT_MS - 59 * MS_PER_MINUTE).toISOString();

function row(over: Partial<StageRow> = {}): StageRow {
  const ports = stageBandPorts(3);
  return {
    band: 3,
    sha: SHA,
    dir: `${CHECKOUT}/.cache/snap-stage/0123456789ab`,
    serverPort: ports.server,
    vitePort: ports.vite,
    checkout: CHECKOUT,
    ownerPid: 999,
    startedAt: FROZEN_ISO,
    lastUsedAt: IDLE_ISO,
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
    keeper: { pid: KEEPER_PID, armedAt: FROZEN_ISO },
    ...over,
  };
}

/** A row with NO keeper at all — the never-armed / arming-race shape. Built by OMISSION rather than by
 *  `{ keeper: undefined }`, which `exactOptionalPropertyTypes` rejects (and which would be a different
 *  claim anyway: an absent key, not a key holding undefined). */
function rowWithoutKeeper(over: Partial<StageRow> = {}): StageRow {
  const { keeper: _armed, ...rest } = row(over);
  return rest;
}

/** `subject` is a POSITIONAL parameter rather than an `over.row` default, because `null` is a real value
 *  here (the cleared-row arm) and any `??`-shaped default would silently replace it with a live row. */
function evidence(subject: StageRow | null, over: Partial<StageKeeperEvidence> = {}): StageKeeperEvidence {
  return {
    row: subject,
    keeperPid: KEEPER_PID,
    liveSessions: [],
    foreignPeer: null,
    reservedPorts: subject === null ? [] : reservedRowPorts(subject),
    nowMs: FROZEN_AT_MS,
    ttlMs: TTL_MS,
    ...over,
  };
}

describe("the idle verdict", () => {
  test("an idle row with no session and no connected client is REAPED — and each fence alone spares it", () => {
    // The positive control first: without it, every "wait" below could be satisfied by a verdict that
    // never reaps anything at all.
    expect(stageKeeperVerdict(evidence(row()))).toBe("reap");

    expect(stageKeeperVerdict(evidence(row(), { liveSessions: ["p-lane"] })), "a live session pins the row").toBe("wait");
    expect(stageKeeperVerdict(evidence(row(), { foreignPeer: "pid 8123 (client of :8918)" })), "a connected client is an interaction").toBe("wait");
    expect(stageKeeperVerdict(evidence(row({ lastUsedAt: FRESH_ISO }))), "one minute inside the TTL").toBe("wait");
  });

  test("the boundary is the TTL itself, judged from lastUsedAt", () => {
    expect(keeperRemainingMs(row({ lastUsedAt: FRESH_ISO }), FROZEN_AT_MS, TTL_MS)).toBe(MS_PER_MINUTE);
    expect(keeperRemainingMs(row(), FROZEN_AT_MS, TTL_MS), "past due clamps at zero, never negative").toBe(0);
    // Exactly AT the TTL is still `wait` — the verdict reaps on strictly greater, the same comparison
    // `stageSweepVerdict` makes, so the two arms cannot disagree about a row on the boundary.
    const exact = row({ lastUsedAt: new Date(FROZEN_AT_MS - TTL_MS).toISOString() });
    expect(stageKeeperVerdict(evidence(exact))).toBe("wait");
  });
});

describe("the identity and reserved fences", () => {
  test("a row naming a different LIVE keeper releases; one naming a DEAD keeper is adopted", () => {
    const foreign = row({ keeper: { pid: OTHER_PID, armedAt: FROZEN_ISO } });
    expect(
      stageKeeperClaim(foreign, (pid) => pid === OTHER_PID),
      "somebody live holds it",
    ).toBe("held");
    expect(stageKeeperVerdict(evidence(foreign)), "…and it is not us, so we release").toBe("release");

    expect(
      stageKeeperClaim(foreign, () => false),
      "the recorded keeper is gone",
    ).toBe("adopt");
    expect(
      stageKeeperClaim(rowWithoutKeeper(), () => true),
      "no keeper recorded — the arming race",
    ).toBe("adopt");
    // The self-heal is the whole point: an adopted row is REAPABLE, not merely re-owned.
    expect(stageKeeperVerdict(evidence(row({ keeper: { pid: KEEPER_PID, armedAt: FROZEN_ISO } })))).toBe("reap");
  });

  test("a cleared row releases rather than reaping something that no longer exists", () => {
    expect(stageKeeperVerdict(evidence(null))).toBe("release");
  });

  test("a row naming the DEV STACK's own ports is refused, however idle, and the refusal names the owner", () => {
    const devRow = row({ serverPort: DEV_PORTS.server, vitePort: DEV_PORTS.vite, lastUsedAt: IDLE_ISO });
    const reserved = reservedRowPorts(devRow);
    expect(reserved, "both halves of the dev pair are reserved rows").toEqual([DEV_PORTS.server, DEV_PORTS.vite]);
    expect(stageKeeperVerdict(evidence(devRow)), "the reserved fence outranks the idle clock").toBe("refuse");
    // …and the SAME row on its own band's ports is reaped, so the refusal is about the ports, not the row.
    expect(stageKeeperVerdict(evidence(row({ lastUsedAt: IDLE_ISO })))).toBe("reap");

    const refusal = stageKeeperReservedRefusal(devRow, reserved);
    expect(refusal).toContain("STAGE KEEPER REFUSED");
    expect(refusal).toContain(`:${DEV_PORTS.vite} (dev stack)`);
    expect(refusal).toContain("Nothing was touched");
  });

  test("an ordinary band row reserves nothing — the fence is not always-on", () => {
    expect(reservedRowPorts(row())).toEqual([]);
  });
});

describe("the operator-facing text", () => {
  test("the poll cadence is a tenth of the TTL, floored for a tiny test TTL and ceilinged for the real one", () => {
    expect(keeperPollMs(TTL_MS), "60 min ⇒ one poll a minute, not a busy loop").toBe(MS_PER_MINUTE);
    expect(keeperPollMs(1200), "a seconds-long proof TTL still resolves").toBe(200);
    expect(keeperPollMs(24 * 60 * MS_PER_MINUTE), "a day-long TTL is still capped at a minute").toBe(MS_PER_MINUTE);
  });

  test("the reap line names the band, the stage, its owner and why", () => {
    const line = stageKeeperReapLine(row(), FROZEN_AT_MS, TTL_MS);
    expect(line).toContain("TIMER REAPED band 3");
    expect(line).toContain(CHECKOUT);
    expect(line).toContain("no live session and no connected client");
    expect(line).toContain("row cleared");
  });

  test("the status column says LEFT, DEAD or NONE — never a silent column implying protection", () => {
    const at = (subject: StageRow, alive: boolean): string =>
      describeStageKeeper({ home: HOME, row: subject, nowMs: FROZEN_AT_MS, ttlMs: TTL_MS }, () => alive);
    const live = at(row({ lastUsedAt: FRESH_ISO }), true);
    expect(live).toContain(`timer 1m left (pid ${KEEPER_PID}`);
    // The keeper is DETACHED, so its reap line can only reach a file — and a gitignored artifact nothing
    // points at is one nobody reads. The status column names it.
    expect(live, "the status line names the keeper's log").toContain(stageKeeperLogPath(HOME, 3));
    expect(at(row(), false)).toContain(`timer DEAD (pid ${KEEPER_PID})`);
    expect(at(row(), false), "and it names the arms that still cover the band").toContain("`--stage-sweep` still cover");
    expect(at(rowWithoutKeeper(), true)).toContain("timer none");
  });
});
