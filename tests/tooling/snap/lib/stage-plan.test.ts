// Fixture tests for the PURE derivation core of `snap --isolated` (tooling/src/snap/lib/stage-plan.ts) —
// no git, no worktree, no stack: sha/port/path derivation, the reuse-vs-rebuild staleness rule, the #108
// cross-checkout ownership rules PER ROW, the heartbeat, the teardown consent and the #1186 band claim,
// plus a smoke that the stage dir lands under a gitignored path. The imperative worktree/install/boot
// orchestration is deliberately NOT exercised here (it spins a real stack — out of the CI-tier's remit;
// this file's home is tests/tooling/ per core/Spine-Testing.md §2, a test of a scripts/ tool).
//
// THE TABLE'S OWN RULES MOVED (#1276): the allocator, the limits, the strand/TTL rule with its live-session
// fence and the three-probe health verdict are lib/stage-bands.ts's, pinned at
// tests/tooling/snap/lib/stage-bands.test.ts; the table's file I/O, its mutex and the legacy migration are
// pinned at tests/tooling/snap/ops/stage-marker.int.test.ts. This file keeps what stage-plan still owns.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEV_PORTS, STAGE_BAND_COUNT, stageBandPorts } from "../../../../tooling/src/_shared/ports.ts";
import type { StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import {
  bandAccess,
  DIRTY_STAGE_KEY,
  describeStageAge,
  describeStageAgePhrase,
  foreignStageRefusal,
  foreignTeardownRefusal,
  ISOLATION_TRIPWIRE,
  markerRootFromCommonDir,
  missingLauncherRefusal,
  orphanStageDirs,
  SHORT_SHA_LEN,
  STAGE_INHERITED_ENV_KEYS,
  STAGE_LAUNCHER_RELS,
  selectsTeardownRow,
  shortSha,
  stageBandClaim,
  stageBandRefusal,
  stageBandSharedNote,
  stageBaseUrl,
  stageDecision,
  stageIdleMs,
  stageInheritedEnv,
  stageLauncherPath,
  stagePaths,
  teardownConsent,
} from "../../../../tooling/src/snap/lib/stage-plan.ts";
import { readBands, stageBandVerdictFor, writeRow } from "../../../../tooling/src/snap/ops/stage-marker.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const SHORT = "0123456789ab";
const MAIN_CHECKOUT = "/home/dev/orbweaver";
const LANE_CHECKOUT = "/home/dev/orbweaver/.claude/worktrees/agent-lane";
// The exact `.cache/` gitignore line (root-anchored, trailing slash) that swallows the stage worktrees.
const CACHE_IGNORE_RE = /^\.cache\/$/m;

// ── shortSha ────────────────────────────────────────────────────────────────────────────────────────────

test("shortSha truncates to SHORT_SHA_LEN and trims surrounding whitespace", () => {
  expect(shortSha(SHA)).toBe(SHORT);
  expect(shortSha(SHA).length).toBe(SHORT_SHA_LEN);
  expect(shortSha(`  ${SHA}\n`)).toBe(SHORT);
});

// ── band ports / stageBaseUrl ─────────────────────────────────────────────────────────────────────────

test("band 0 is the pair the single-band era used, and no band collides with the DEV pair", () => {
  // The hand-picked 8888/5273 of the one-band era is now band 0 of the registry — the numbers did not
  // move, the TABLE did (#1276). The full disjointness proof is tests/tooling/_shared/ports.test.ts.
  expect(stageBandPorts(0)).toEqual({ server: 8888, vite: 5273 });
  expect(stageBandPorts(1)).toEqual({ server: 8898, vite: 5283 });
  for (let band = 0; band < STAGE_BAND_COUNT; band += 1) {
    expect(stageBandPorts(band).server).not.toBe(DEV_PORTS.server);
    expect(stageBandPorts(band).vite).not.toBe(DEV_PORTS.vite);
  }
});

test("stageBaseUrl uses localhost (vite v8 binds [::1] only), not 127.0.0.1", () => {
  expect(stageBaseUrl(5273)).toBe("http://localhost:5273");
});

// ── stagePaths ──────────────────────────────────────────────────────────────────────────────────────────

test("stagePaths keys every artifact off the short sha under .cache/snap-stage", () => {
  const paths = stagePaths("/repo", SHA);
  expect(paths.dir).toBe(`/repo/.cache/snap-stage/${SHORT}`);
  expect(paths.databaseUrl).toBe(`file:/repo/.cache/snap-stage/${SHORT}/orbweaver.db`);
  expect(paths.assetsDir).toBe(`/repo/.cache/snap-stage/${SHORT}/assets`);
});

// ── stageDecision (the staleness rule) ──────────────────────────────────────────────────────────────────

/** One band-table ROW. `shortSha`/`baseUrl` are gone on purpose (#1276): they are functions of `sha` and
 *  `vitePort`, and a serialized copy of a derived value is a second home that drifts. */
function active(over: Partial<StageRow> = {}): StageRow {
  return {
    band: 0,
    sha: SHA,
    dir: `/repo/.cache/snap-stage/${SHORT}`,
    serverPort: stageBandPorts(0).server,
    vitePort: stageBandPorts(0).vite,
    checkout: MAIN_CHECKOUT,
    ownerPid: 4242,
    startedAt: "2026-08-16T12:00:00.000Z",
    lastUsedAt: "2026-08-16T12:00:00.000Z",
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
    ...over,
  };
}

test("stageDecision reuses ONLY a healthy, same-sha, non-fresh stage", () => {
  expect(stageDecision({ targetSha: SHA, row: active(), fresh: false, healthy: true })).toBe("reuse");
});

test("stageDecision rebuilds when there is no active stage", () => {
  expect(stageDecision({ targetSha: SHA, row: null, fresh: false, healthy: true })).toBe("rebuild");
});

test("stageDecision rebuilds when HEAD moved (a stale sha)", () => {
  expect(stageDecision({ targetSha: "ffffffffffffffffffffffffffffffffffffffff", row: active(), fresh: false, healthy: true })).toBe("rebuild");
});

test("stageDecision rebuilds an unhealthy (dead-stack) same-sha stage", () => {
  expect(stageDecision({ targetSha: SHA, row: active(), fresh: false, healthy: false })).toBe("rebuild");
});

test("stageDecision rebuilds when --fresh is forced even on a healthy same-sha stage", () => {
  expect(stageDecision({ targetSha: SHA, row: active(), fresh: true, healthy: true })).toBe("rebuild");
});

// ── gitignore coverage + version tripwire ───────────────────────────────────────────────────────────────

test("the stage dir lands under .cache/, which .gitignore excludes wholesale (no stray worktree ever staged)", () => {
  const gitignore = readFileSync(join(import.meta.dirname, "..", "..", "..", "..", ".gitignore"), "utf8");
  expect(gitignore).toMatch(CACHE_IGNORE_RE);
  expect(stagePaths("/repo", SHA).dir).toContain("/.cache/snap-stage/");
});

// ── --dirty stage key ────────────────────────────────────────────────────────────────────────────────────

test("DIRTY_STAGE_KEY never collides with shortSha of a real commit sha", () => {
  expect(DIRTY_STAGE_KEY).toBe("dirty");
  expect(shortSha(SHA)).not.toBe(DIRTY_STAGE_KEY);
});

test("stagePaths keys the dirty stage under its own fixed dir, distinct from any commit-pinned stage", () => {
  const dirtyPaths = stagePaths("/repo", DIRTY_STAGE_KEY);
  expect(dirtyPaths.dir).toBe("/repo/.cache/snap-stage/dirty");
  expect(dirtyPaths.dir).not.toBe(stagePaths("/repo", SHA).dir);
});

test("stageDecision treats a warm dirty stage exactly like any other sha for staleness (rebuilds on a real-sha switch)", () => {
  const dirtyActive = active({ sha: DIRTY_STAGE_KEY, dir: "/repo/.cache/snap-stage/dirty" });
  expect(stageDecision({ targetSha: DIRTY_STAGE_KEY, row: dirtyActive, fresh: false, healthy: true })).toBe("reuse");
  expect(stageDecision({ targetSha: SHA, row: dirtyActive, fresh: false, healthy: true })).toBe("rebuild");
});

// ── the DB-BOUND env allowlist ──────────────────────────────────────────────────────────────────────────
//
// The stage boots under ORB_ENV_NO_FILE (it never reads the operator's .env) on a COPY of the dev DB, so a
// value the copied rows are bound to has to be re-declared or the stage boots against data it cannot read.
// CREDENTIALS_KEY was the miss that made `snap --isolated` blind: no key ⇒ the boot decrypt-probe fails ⇒
// /healthz answers 503 forever ⇒ `stageHealthy` is never true ⇒ every call rebuilds and fights its own
// orphaned processes for the ports (measured 2026-08-09; same stage + same DB with the key ⇒ healthz=200).

const DEV_ENV_SAMPLE = [
  "OWNER_HANDLES=owner@example.com",
  "CREDENTIALS_KEY=3d0f1a2b3c4d5e6f",
  "DEBUG_TOKEN=abadcafeabadcafe",
  "SESSION_SECRET=hunter2hunter2hunter2",
  "OPENROUTER_API_KEY=sk-or-v1-not-a-real-key",
  "WIRE_CAPTURE=on",
].join("\n");

test("stageInheritedEnv forwards the DB-BOUND keys — the owner handle AND the credentials key", () => {
  const inherited = stageInheritedEnv(DEV_ENV_SAMPLE);
  expect(inherited["OWNER_HANDLES"]).toBe("owner@example.com");
  expect(inherited["CREDENTIALS_KEY"]).toBe("3d0f1a2b3c4d5e6f");
  // The exact key SET, so a future addition has to come through the allowlist and its reason, not by accident.
  expect(Object.keys(inherited)).toStrictEqual(["OWNER_HANDLES", "CREDENTIALS_KEY"]);
});

test("stageInheritedEnv forwards NOTHING else — the ORB_ENV_NO_FILE hatch stays narrow", () => {
  // The negative half of the same claim: an operator's real DEBUG_TOKEN / provider key / capture switch must
  // never arm a second, less-guarded surface on the stage port. That is the whole point of the hatch, so the
  // allowlist is pinned by NAME, not merely by the two positives above.
  expect([...STAGE_INHERITED_ENV_KEYS]).toStrictEqual(["OWNER_HANDLES", "CREDENTIALS_KEY"]);
  const inherited = Object.keys(stageInheritedEnv(DEV_ENV_SAMPLE));
  for (const leaked of ["DEBUG_TOKEN", "SESSION_SECRET", "OPENROUTER_API_KEY", "WIRE_CAPTURE"]) {
    expect(inherited).not.toContain(leaked);
  }
});

test("stageInheritedEnv omits a key the dev .env does not declare (no empty-string hand-out)", () => {
  // An absent key must be ABSENT, not "" — the server's schema has its own unset fallback for each, and an
  // empty CREDENTIALS_KEY would be a different, worse failure than no key at all.
  const partial = stageInheritedEnv("OWNER_HANDLES=owner\n");
  expect(Object.keys(partial)).toStrictEqual(["OWNER_HANDLES"]);
  expect(partial["OWNER_HANDLES"]).toBe("owner");
  expect(Object.keys(stageInheritedEnv(""))).toStrictEqual([]);
});

// ── the SHARED, repo-keyed owner marker (issue #108) ─────────────────────────────────────────────────
//
// The band is ONE fixed port pair for the whole box, so its owner marker must be one file every checkout
// agrees on. It used to be written into whichever checkout snap ran from: a lane's stage left main's
// marker dir empty and a sibling's only tell was a raw port check plus ps spelunking (two coordination
// rounds in one afternoon). `git rev-parse --git-common-dir` answers `<main>/.git` from EVERY linked
// worktree, which is the shared key these arms pin — in both directions.

test("markerRootFromCommonDir resolves the SAME marker home from main and from a linked worktree", () => {
  // Both checkouts get the identical `--git-common-dir` answer; that is what makes the marker shared.
  const fromMain = markerRootFromCommonDir(`${MAIN_CHECKOUT}/.git`);
  const fromLane = markerRootFromCommonDir(`${MAIN_CHECKOUT}/.git\n`);
  expect(fromMain).toBe(MAIN_CHECKOUT);
  expect(fromLane).toBe(MAIN_CHECKOUT);
  // …and NOT the lane's own root, which is the whole defect.
  expect(fromLane).not.toBe(LANE_CHECKOUT);
});

test("a common dir that is not a checkout's .git keeps the marker INSIDE it, never in an unrelated parent", () => {
  // `--separate-git-dir` / bare: there is no sibling working tree, so `dirname` would write the marker to
  // whatever directory happens to hold the git dir.
  expect(markerRootFromCommonDir("/srv/gitdirs/orbweaver")).toBe("/srv/gitdirs/orbweaver");
});

test("a stage staged from a worktree is visible from main, and vice versa (one shared table)", () => {
  const markerHome = mkdtempSync(join(tmpdir(), "ae-tooling2-marker-"));
  // Direction 1: the LANE boots the stage on a band…
  writeRow(markerHome, active({ band: 2, checkout: LANE_CHECKOUT, dir: `${LANE_CHECKOUT}/.cache/snap-stage/${SHORT}` }));
  // …and MAIN, resolving the same table home, sees whose that band is.
  const seenFromMain = readBands(markerHome).find((entry) => entry.band === 2);
  expect(seenFromMain?.checkout).toBe(LANE_CHECKOUT);
  expect(seenFromMain?.dir).toContain(LANE_CHECKOUT);

  // Direction 2: main boots one on ANOTHER band, and both rows stand — which is the whole of #1276.
  writeRow(markerHome, active({ band: 3, checkout: MAIN_CHECKOUT }));
  expect(readBands(markerHome).map((entry) => entry.checkout)).toEqual([LANE_CHECKOUT, MAIN_CHECKOUT]);
});

test("bandAccess leaves OUR OWN marker to the existing staleness rules", () => {
  const opts = { checkout: MAIN_CHECKOUT, targetSha: SHA, dirty: false, fresh: false, bandBound: true, healthy: true };
  expect(bandAccess({ ...opts, row: null })).toBe("ours");
  expect(bandAccess({ ...opts, row: active({ checkout: MAIN_CHECKOUT }) })).toBe("ours");
});

test("bandAccess REFUSES rather than killing a live sibling's stage", () => {
  const foreign = active({ checkout: LANE_CHECKOUT });
  const base = { row: foreign, checkout: MAIN_CHECKOUT, bandBound: true, healthy: true };
  // A different commit would tear their stack down…
  expect(bandAccess({ ...base, targetSha: "f".repeat(40), dirty: false, fresh: false })).toBe("refuse");
  // …--fresh would too…
  expect(bandAccess({ ...base, targetSha: SHA, dirty: false, fresh: true })).toBe("refuse");
  // …and --dirty would rsync OUR working tree into THEIR stage dir.
  expect(bandAccess({ ...base, targetSha: SHA, dirty: true, fresh: false })).toBe("refuse");
  // An unhealthy-but-bound foreign stage is theirs to fix, not ours to rebuild.
  expect(bandAccess({ ...base, healthy: false, targetSha: SHA, dirty: false, fresh: false })).toBe("refuse");
});

test("bandAccess SHARES a healthy foreign stage at the same commit, and RECLAIMS a dead one", () => {
  const foreign = active({ checkout: LANE_CHECKOUT });
  const base = { row: foreign, checkout: MAIN_CHECKOUT, targetSha: SHA, dirty: false, fresh: false };
  // Same frozen commit, still serving: point at it read-only rather than fight for the one pair.
  expect(bandAccess({ ...base, bandBound: true, healthy: true })).toBe("shared-reuse");
  // Marker present, band unbound ⇒ a corpse: reclaim it (this is the stale-marker case, not a collision).
  expect(bandAccess({ ...base, bandBound: false, healthy: false })).toBe("take-over");
});

test("the refusal NAMES the owner — checkout, pid and age — not 'unknown'", () => {
  const started = Date.parse("2026-08-16T12:00:00.000Z");
  const message = foreignStageRefusal(active({ checkout: LANE_CHECKOUT, ownerPid: 4242 }), 4242, started + 37 * 60_000);
  expect(message).toContain(LANE_CHECKOUT);
  expect(message).toContain("4242");
  expect(message).toContain("37m");
  // …and carries the remedy, which is the tool, never a hand-kill.
  expect(message).toContain("--stage-down");
});

test("the age PHRASE never reads 'just now ago' — the status line's first live run said exactly that", () => {
  const now = Date.parse("2026-08-16T12:00:00.000Z");
  expect(describeStageAgePhrase("2026-08-16T11:59:30.000Z", now)).toBe("just now");
  expect(describeStageAgePhrase("2026-08-16T11:23:00.000Z", now)).toBe("37m ago");
  expect(describeStageAgePhrase("not-a-date", now)).toBe("unknown age");
});

test("describeStageAge reads humanely and refuses to fake freshness on an unparseable stamp", () => {
  const now = Date.parse("2026-08-16T12:00:00.000Z");
  expect(describeStageAge("2026-08-16T11:59:30.000Z", now)).toBe("just now");
  expect(describeStageAge("2026-08-16T11:23:00.000Z", now)).toBe("37m");
  expect(describeStageAge("2026-08-16T09:46:00.000Z", now)).toBe("2h 14m");
  expect(describeStageAge("not-a-date", now)).toBe("unknown age");
});

// ── THE HEARTBEAT (issue #324) ─────────────────────────────────────────────────────────────────────
//
// A snap stage stayed running as a detached process group long after its purpose ended, holding its band
// and reading like the real dev stack. The fix is NOT teardown-at-run-completion: a warm stage OUTLIVING
// its run is the feature (and #108's shared-reuse depends on it). So liveness is USE — `lastUsedAt`,
// stamped by every boot, every reuse, every session call bound to the band and every attached sibling
// run. The VERDICT that reads this stamp (and its live-session fence) is lib/stage-bands.ts's and is
// pinned at tests/tooling/snap/lib/stage-bands.test.ts; what stage-plan still owns is the measurement.

const NOW = Date.parse("2026-08-22T12:00:00.000Z");
const USED_RECENTLY = new Date(NOW - 5 * 60_000).toISOString();
const USED_LONG_AGO = new Date(NOW - 6 * 60 * 60_000).toISOString();

test("stageIdleMs measures time since the last USE, and treats an unreadable stamp as infinitely idle", () => {
  expect(stageIdleMs(active({ lastUsedAt: USED_RECENTLY }), NOW)).toBe(5 * 60_000);
  // A stamp that cannot be parsed must not read as fresh — the describeStageAge posture, one level up.
  expect(stageIdleMs(active({ lastUsedAt: "not-a-date" }), NOW)).toBe(Number.POSITIVE_INFINITY);
  // And the age is measured from the LAST USE, never from the boot: the exact shape a teardown-on-
  // completion fix would have destroyed — booted this morning, snapped five minutes ago, still serving.
  expect(stageIdleMs(active({ startedAt: USED_LONG_AGO, lastUsedAt: USED_RECENTLY }), NOW)).toBe(5 * 60_000);
});

test("orphanStageDirs spares EVERY row's dir and the dir the current call is about to use", () => {
  const dirs = ["0123456789ab", "dirty", "deadbeefcafe"];
  const rowDirs = [`/repo/.cache/snap-stage/${SHORT}`];
  expect(orphanStageDirs(dirs, { rowDirs, targetDir: "/repo/.cache/snap-stage/dirty" })).toStrictEqual(["deadbeefcafe"]);
  // With TEN bands there can be ten dirs to spare, not one — the single-marker era's blind spot.
  expect(orphanStageDirs(dirs, { rowDirs: [...rowDirs, "/other/.cache/snap-stage/deadbeefcafe"], targetDir: null })).toStrictEqual(["dirty"]);
  // Nothing to spare ⇒ every dir on disk is residue from a run that never finished.
  expect(orphanStageDirs(dirs, { rowDirs: [], targetDir: null })).toStrictEqual(dirs);
  // …and the spare is matched by NAME, not by the caller's absolute path spelling.
  expect(orphanStageDirs(dirs, { rowDirs: ["/somewhere/else/.cache/snap-stage/dirty"], targetDir: null })).toStrictEqual(["0123456789ab", "deadbeefcafe"]);
});

// ── TEARDOWN CONSENT (#447 follow-on) ───────────────────────────────────────────────────────────────
//
// This EVOLVES #108's recorded ruling and both halves are pinned here: cross-checkout teardown still
// works (the mechanism), and a foreign stage that is still in use now needs `--force` (the input that
// changed). Measured 2026-08-22: a sibling's plain `--stage-down` removed a live stage mid-navigation,
// leaving 199 ERR_CONNECTION_REFUSED and a half-deleted dir.

test("teardown consent: your OWN stage, an idle one and a dead one all tear down with no flag", () => {
  const base = { checkout: MAIN_CHECKOUT, force: false };
  expect(teardownConsent({ ...base, row: active({ checkout: MAIN_CHECKOUT }), inUse: true })).toBe("allow");
  expect(teardownConsent({ ...base, row: active({ checkout: LANE_CHECKOUT }), inUse: false })).toBe("allow");
  expect(teardownConsent({ ...base, row: null, inUse: false })).toBe("allow");
});

test("teardown consent REFUSES a foreign stage that is still in use — until --force says so", () => {
  const foreign = { checkout: MAIN_CHECKOUT, row: active({ checkout: LANE_CHECKOUT }), inUse: true };
  expect(teardownConsent({ ...foreign, force: false })).toBe("refuse");
  // #108's mechanism SURVIVES: any checkout can still tear down any stage — it just has to say so.
  expect(teardownConsent({ ...foreign, force: true })).toBe("allow");
});

test("F7 teardown selection is owner-targeted per band — bare --force never widens the owned-row default", () => {
  const ours = active({ checkout: MAIN_CHECKOUT });
  const sibling = active({ checkout: LANE_CHECKOUT });
  expect(selectsTeardownRow(ours, MAIN_CHECKOUT, null)).toBe(true);
  expect(selectsTeardownRow(sibling, MAIN_CHECKOUT, null)).toBe(false);
  expect(selectsTeardownRow(ours, MAIN_CHECKOUT, LANE_CHECKOUT)).toBe(false);
  expect(selectsTeardownRow(sibling, MAIN_CHECKOUT, LANE_CHECKOUT)).toBe(true);
});

test("the foreign-teardown refusal names the owner, the idle age, and the flag that overrides it", () => {
  const message = foreignTeardownRefusal(active({ checkout: LANE_CHECKOUT, lastUsedAt: USED_RECENTLY }), NOW);
  expect(message).toContain(LANE_CHECKOUT);
  expect(message).toContain("5m");
  expect(message).toContain("--stage-down --force");
});

test("the #108 band-collision refusal advertises the spelling that still works post-gate", () => {
  // It used to say plain `--stage-down`, which now refuses on exactly the stage that message is about.
  // A remedy a reader cannot execute is worse than no remedy.
  expect(foreignStageRefusal(active({ checkout: LANE_CHECKOUT }), 4242, NOW)).toContain("--stage-down --force");
});

// ── THE LAUNCHER PATH (issue #447) ─────────────────────────────────────────────────────────────────
//
// The #393 P5 tooling move relocated `scripts/dev/stack.sh` to `tooling/src/stack/stack.sh` and missed
// this consumer: `bootStage` spawned a path that no longer existed (every `--isolated`/`--dirty` caller
// got `STAGE ERROR: stage stack failed to boot`) and `stopStage`, guarded by an existsSync, silently did
// NOTHING — which is a large part of why stages stranded at all (#324). The real-tree arm below is the
// tripwire that would have caught the move: it fails the day the launcher relocates again.

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

test("the launcher this repo SHIPS is the first candidate the stage will try", () => {
  // The rot tripwire. A pure ordering assertion would have stayed green through the P5 move; only asking
  // the actual tree "does this path exist" catches a relocation.
  expect(existsSync(join(REPO_ROOT, STAGE_LAUNCHER_RELS[0])), `${STAGE_LAUNCHER_RELS[0]} must exist — the stage boots and stops through it`).toBe(true);
  expect(stageLauncherPath(REPO_ROOT, existsSync)).toBe(join(REPO_ROOT, STAGE_LAUNCHER_RELS[0]));
});

test("stageLauncherPath falls back to the pre-P5 home for an OLD --ref, and refuses when a ref ships neither", () => {
  const legacyOnly = (path: string): boolean => path.endsWith(join("scripts", "dev", "stack.sh"));
  expect(stageLauncherPath("/stage", legacyOnly)).toBe(join("/stage", "scripts", "dev", "stack.sh"));
  // Order matters: a tree carrying BOTH (mid-move) boots the CURRENT one.
  expect(stageLauncherPath("/stage", () => true)).toBe(join("/stage", STAGE_LAUNCHER_RELS[0]));
  expect(stageLauncherPath("/stage", () => false)).toBeNull();
});

test("the missing-launcher refusal names every path it tried — the message #447 needed and did not get", () => {
  const refusal = missingLauncherRefusal("/stage");
  for (const rel of STAGE_LAUNCHER_RELS) {
    expect(refusal).toContain(rel);
  }
  // …and points at the one place a new home is declared, so the next mover has a destination.
  expect(refusal).toContain("STAGE_LAUNCHER_RELS");
});

test("the isolation tripwire is the exact env var vite.config reads for its proxy target", () => {
  // If this constant and packages/client/vite.config.ts ever drift, the version guard silently passes a
  // pre-support ref (or rejects a good one). Prove they still name the same knob.
  expect(ISOLATION_TRIPWIRE).toBe("VITE_API_TARGET");
  const viteConfig = readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "packages", "client", "vite.config.ts"), "utf8");
  expect(viteConfig).toContain(ISOLATION_TRIPWIRE);
});

// ── the BAND CLAIM (#1186) ──────────────────────────────────────────────────────────────────────────
// A refused `snap --isolated` leaves the band with its PREVIOUS owner, and `perf-meter --base
// http://localhost:5273` chained behind it happily measured that sibling checkout's tree (lane
// p-home-perf, 2026-09-02: three AFTER receipts taken off another lane's stage, discarded). The claim is
// exact rather than heuristic — the band is ONE fixed port pair and its owner marker is ONE shared file —
// so all four arms are pinned, including the two that must stay SILENT: a guard that refuses everything
// is as useless as one that refuses nothing.
test("a base at ANY stage band is judged against that band's owner; anything else is not the band (#1186)", () => {
  const rows = [active({ band: 0 }), active({ band: 4, checkout: LANE_CHECKOUT })];
  // The two SILENT arms: an ordinary base, and a band this checkout itself owns.
  expect(stageBandClaim("http://localhost:5173/chat", MAIN_CHECKOUT, rows)).toBe("not-the-band");
  expect(stageBandClaim("file:///tmp/fixture/page.html", MAIN_CHECKOUT, rows)).toBe("not-the-band");
  expect(stageBandClaim("http://localhost:5273", MAIN_CHECKOUT, rows)).toBe("ours");
  // …and the ones that must refuse. BOTH band ports count: a `--url` may name the server half directly.
  expect(stageBandClaim("http://localhost:5273/chat", LANE_CHECKOUT, rows)).toBe("foreign");
  expect(stageBandClaim("http://localhost:8888/api/health", LANE_CHECKOUT, rows)).toBe("foreign");
  // #1276 widened the door from ONE hardcoded pair to the whole range: band 4 is arbitrated identically.
  expect(stageBandClaim(`http://localhost:${stageBandPorts(4).vite}`, MAIN_CHECKOUT, rows)).toBe("foreign");
  expect(stageBandClaim(`http://localhost:${stageBandPorts(4).vite}`, LANE_CHECKOUT, rows)).toBe("ours");
  // No row is NOT permission: nothing accounts for whoever is serving that port.
  expect(stageBandClaim(`http://localhost:${stageBandPorts(7).vite}`, LANE_CHECKOUT, rows)).toBe("unowned");
  expect(stageBandClaim("http://localhost:5273", LANE_CHECKOUT, [])).toBe("unowned");
});

// ── the SHARED arm (#2441) ──────────────────────────────────────────────────────────────────────────
// The allocator's arm 2 hands a lane "a sibling's healthy row at our sha" (`bandAccess` → `shared-reuse`)
// and this guard then called that exact row `foreign` and exited 2 with "nothing was measured", so a lane
// whose `--ref` matched a live sibling's stage — at main tip, every lane — could never run an isolated
// snap. Both arms are pinned here: the allocation this run actually made is READABLE, and a band nobody
// handed us is still the #1186 refusal.
test("a SIBLING's band this run's own allocation bound is SHARED, not foreign (#2441)", () => {
  const siblings = [active({ band: 0, checkout: MAIN_CHECKOUT })];
  const bound = active({ band: 0, checkout: MAIN_CHECKOUT });
  expect(stageBandClaim("http://localhost:5273", LANE_CHECKOUT, siblings, bound)).toBe("shared");
  // …and it is READABLE: no refusal text, so the run measures. The operator is told whose tree answered.
  expect(stageBandRefusal("shared", "http://localhost:5273", LANE_CHECKOUT, siblings)).toBeNull();
  const note = stageBandSharedNote("shared", "http://localhost:5273", siblings);
  expect(note).toContain(MAIN_CHECKOUT);
  expect(note).toContain(shortSha(SHA));
  expect(note).toContain("SHARED band 0");
  // The note is ONLY for the shared arm — the ordinary paths stay silent.
  expect(stageBandSharedNote("ours", "http://localhost:5273", siblings)).toBeNull();
  expect(stageBandSharedNote("foreign", "http://localhost:5273", siblings)).toBeNull();
});

test("#1186's refusal SURVIVES: a band no allocation of ours bound is still foreign (#2441)", () => {
  const siblings = [active({ band: 0, checkout: MAIN_CHECKOUT })];
  // The p-home-perf incident verbatim: a chained instrument pointed at a sibling's band, having allocated
  // NOTHING. No binding ⇒ no entitlement ⇒ refusal, exactly as before.
  expect(stageBandClaim("http://localhost:5273", LANE_CHECKOUT, siblings, null)).toBe("foreign");
  // A binding to a DIFFERENT band does not licence this one.
  expect(stageBandClaim("http://localhost:5273", LANE_CHECKOUT, siblings, active({ band: 4, checkout: MAIN_CHECKOUT }))).toBe("foreign");
  // A STALE binding — the band was reaped and re-let to a different tree at a different sha — must not
  // licence a read of the NEW occupant. Matching on the band alone is what would have.
  const reLet = [active({ band: 0, checkout: MAIN_CHECKOUT, sha: `${SHA.slice(0, -1)}f` })];
  expect(stageBandClaim("http://localhost:5273", LANE_CHECKOUT, reLet, active({ band: 0, checkout: MAIN_CHECKOUT }))).toBe("foreign");
});

test("the band verdict door reads this run's binding, and never both refuses and notes (#2441)", () => {
  const readTable = (): readonly StageRow[] => [active()];
  const shared = stageBandVerdictFor("http://localhost:5273", { checkout: LANE_CHECKOUT, readTable, readBinding: () => active() });
  expect(shared.claim).toBe("shared");
  expect(shared.refusal).toBeNull();
  expect(shared.note).toContain(MAIN_CHECKOUT);
  const refused = stageBandVerdictFor("http://localhost:5273", { checkout: LANE_CHECKOUT, readTable, readBinding: () => null });
  expect(refused.claim).toBe("foreign");
  expect(refused.refusal).toContain("nothing was measured");
  expect(refused.note).toBeNull();
});

test("the band refusal names BOTH checkouts — the whole failure was not knowing whose tree answered (#1186)", () => {
  const refusal = stageBandRefusal("foreign", "http://localhost:5273", LANE_CHECKOUT, [active()]);
  expect(refusal).toContain(MAIN_CHECKOUT);
  expect(refusal).toContain(LANE_CHECKOUT);
  expect(refusal).toContain("nothing was measured");
  // An unowned band still refuses, and says so in the owner slot rather than inventing one.
  expect(refusal).toContain("stage band 0");
  expect(stageBandRefusal("unowned", "http://localhost:5273", LANE_CHECKOUT, [])).toContain("NOBODY");
  // The readable claims produce NO text at all — the guard must be silent on the ordinary path.
  expect(stageBandRefusal("ours", "http://localhost:5273", MAIN_CHECKOUT, [active()])).toBeNull();
  expect(stageBandRefusal("not-the-band", "http://localhost:5173", MAIN_CHECKOUT, [active()])).toBeNull();
});

test("the table door refuses a FOREIGN owner and passes our own — a PLANTED table, never the box's (#1186)", () => {
  // Both readers are injected on purpose: writing the real shared table from a suite would evict a live
  // sibling lane's stage, which is the very failure this guard exists to prevent.
  expect(stageBandVerdictFor("http://localhost:5273", { checkout: LANE_CHECKOUT, readTable: () => [active()], readBinding: () => null }).refusal).toContain(
    MAIN_CHECKOUT,
  );
  expect(stageBandVerdictFor("http://localhost:5273", { checkout: MAIN_CHECKOUT, readTable: () => [active()], readBinding: () => null }).refusal).toBeNull();
  expect(
    stageBandVerdictFor("http://localhost:5173/chat", { checkout: LANE_CHECKOUT, readTable: () => [active()], readBinding: () => null }).refusal,
  ).toBeNull();
});
