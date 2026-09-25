// The leader record's codec and the ownership verdict over it, every probe injected: a wedged leader, a
// recycled pid, a leaderless group with survivors and an empty one each read as their own state, and a
// record that does not parse never authorizes a signal.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DevPinKey, LeaderRecord, PinSource } from "../../../../tooling/src/stack/index.ts";
import {
  DEV_PIN_KEYS,
  HEARTBEAT_STALE_MS,
  leaderRecordPath,
  leaderVerdict,
  parseLeaderRecord,
  readLeaderRecord,
  recordAuthorizesSignal,
  removeLeaderRecord,
  serializeLeaderRecord,
  writeLeaderRecord,
} from "../../../../tooling/src/stack/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const NOW = 1_700_000_000_000;
/** Every pin pinned but one; env names, so the record is built from pairs. */
const SOURCES = Object.fromEntries(DEV_PIN_KEYS.map((key): readonly [DevPinKey, PinSource] => [key, key === "CREDENTIALS_KEY" ? "host" : "pinned"])) as Record<
  DevPinKey,
  PinSource
>;
const RECORD: LeaderRecord = {
  version: 2,
  pid: 4242,
  pgid: 4242,
  launchId: "9f8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d",
  repoRoot: "/repo",
  runDir: "/repo/.cache/stack",
  ports: { server: 8788, vite: 5173 },
  children: [4243, 4250],
  pins: {
    values: Object.fromEntries([
      ["AUTH_MODE", "single-user"],
      ["DEV_SEED", "on"],
    ]),
    sources: SOURCES,
  },
  startedAt: "2026-09-25T12:00:00.000Z",
  beatMs: NOW - 1000,
};

test("the record round-trips, and anything short of the full shape is no record at all", () => {
  expect(parseLeaderRecord(serializeLeaderRecord(RECORD))).toEqual(RECORD);
  expect(parseLeaderRecord(serializeLeaderRecord({ ...RECORD, pgid: null }))?.pgid).toBeNull();
  expect(parseLeaderRecord('{"version":2,"pid":')).toBeNull();
  expect(parseLeaderRecord(JSON.stringify({ ...RECORD, version: 1 }))).toBeNull();
  expect(parseLeaderRecord(JSON.stringify({ ...RECORD, pid: 0 }))).toBeNull();
  expect(parseLeaderRecord(JSON.stringify({ ...RECORD, children: [1, "two"] }))).toBeNull();
  expect(parseLeaderRecord(JSON.stringify({ ...RECORD, pins: { values: {}, sources: {} } }))).toBeNull();
  expect(parseLeaderRecord(JSON.stringify({ ...RECORD, beatMs: "soon" }))).toBeNull();
});

test("a record on disk reads back; a malformed one and another checkout's are corrupt, and absence is absent", ({ scratch }) => {
  const runDir = join(scratch, "run");
  expect(readLeaderRecord(runDir, "/repo")).toEqual({ kind: "absent" });
  writeLeaderRecord(runDir, RECORD);
  expect(readLeaderRecord(runDir, "/repo")).toEqual({ kind: "record", record: RECORD });
  expect(readLeaderRecord(runDir, "/other-checkout")).toEqual({ kind: "corrupt", path: leaderRecordPath(runDir) });
  writeFileSync(leaderRecordPath(runDir), "{ not json");
  expect(readLeaderRecord(runDir, "/repo")).toEqual({ kind: "corrupt", path: leaderRecordPath(runDir) });
  removeLeaderRecord(runDir);
  removeLeaderRecord(runDir);
  expect(readLeaderRecord(runDir, "/repo")).toEqual({ kind: "absent" });
  // A relative run dir is the caller's defect, not this codec's: the path is joined as given.
  mkdirSync(join(scratch, "elsewhere"), { recursive: true });
  writeLeaderRecord(join(scratch, "elsewhere"), RECORD);
  expect(readFileSync(leaderRecordPath(join(scratch, "elsewhere")), "utf8")).toBe(serializeLeaderRecord(RECORD));
});

test("the verdict: a beating owned leader is live, a silent one is stale, a gone one departed with or without survivors", () => {
  const read = { kind: "record", record: RECORD } as const;
  const owned = (pid: number): boolean => pid === RECORD.pid;
  expect(leaderVerdict(read, { now: NOW, ownsPid: owned, groupHasMembers: () => true })).toBe("live");
  expect(leaderVerdict(read, { now: NOW + HEARTBEAT_STALE_MS + 1, ownsPid: owned, groupHasMembers: () => true })).toBe("stale-leader");
  // The pid is alive but belongs to something else now: not ours, so the group question decides.
  expect(leaderVerdict(read, { now: NOW, ownsPid: () => false, groupHasMembers: () => true })).toBe("departed-with-survivors");
  expect(leaderVerdict(read, { now: NOW, ownsPid: () => false, groupHasMembers: () => false })).toBe("departed");
  expect(leaderVerdict({ kind: "absent" }, { now: NOW, ownsPid: owned, groupHasMembers: () => true })).toBe("absent");
  expect(leaderVerdict({ kind: "corrupt", path: "/x" }, { now: NOW, ownsPid: owned, groupHasMembers: () => true })).toBe("corrupt");
});

test("only a live or stale-leader record authorizes a signal by itself; survivors need a recorded child's proof", () => {
  expect(recordAuthorizesSignal("live")).toBe(true);
  expect(recordAuthorizesSignal("stale-leader")).toBe(true);
  for (const state of ["departed-with-survivors", "departed", "absent", "corrupt"] as const) {
    expect(recordAuthorizesSignal(state), state).toBe(false);
  }
});
