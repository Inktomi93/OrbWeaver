// Fixture tests for the PURE derivation core of `snap --isolated` (tooling/src/snap/lib/stage-plan.ts) —
// no git, no worktree, no stack: sha/port/path derivation, the reuse-vs-rebuild staleness rule, the #108
// cross-checkout ownership marker, and the #324 strand rule (heartbeat, sweep verdict, orphan dirs), plus a
// smoke that the stage dir lands under a gitignored path. The imperative worktree/install/boot orchestration
// is deliberately NOT exercised here (it spins a real stack — out of the CI-tier's remit; this file's home
// is tests/tooling/ per core/Spine-Testing.md §2, a test of a scripts/ tool). The two marker functions
// (`readActive`/`writeActive`/`touchActive`) ARE exercised: they are file I/O over a tmpdir, not a stack.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActiveStage } from "../../../../tooling/src/snap/contract/stage.ts";
import {
  bandAccess,
  DEV_SERVER_PORT,
  DEV_VITE_PORT,
  DIRTY_STAGE_KEY,
  describeStageAge,
  describeStageAgePhrase,
  foreignStageRefusal,
  foreignTeardownRefusal,
  ISOLATION_TRIPWIRE,
  markerIsDangling,
  markerRootFromCommonDir,
  missingLauncherRefusal,
  orphanStageDirs,
  SHORT_SHA_LEN,
  STAGE_IDLE_TTL_MS,
  STAGE_INHERITED_ENV_KEYS,
  STAGE_LAUNCHER_RELS,
  shortSha,
  stageBaseUrl,
  stageDecision,
  stageIdleMs,
  stageInheritedEnv,
  stageLauncherPath,
  stagePaths,
  stagePorts,
  stageSweepVerdict,
  teardownConsent,
} from "../../../../tooling/src/snap/lib/stage-plan.ts";
import { readActive, touchActive, writeActive } from "../../../../tooling/src/snap/ops/stage-marker.ts";
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

// ── stagePorts / stageBaseUrl ─────────────────────────────────────────────────────────────────────────

test("stagePorts offsets BOTH dev ports into the free band by default (8788→8888, 5173→5273)", () => {
  expect(stagePorts()).toEqual({ server: 8888, vite: 5273 });
});

test("stagePorts honors a custom offset and never overlaps the dev pair", () => {
  const ports = stagePorts(250);
  expect(ports).toEqual({ server: DEV_SERVER_PORT + 250, vite: DEV_VITE_PORT + 250 });
  expect(ports.server).not.toBe(DEV_SERVER_PORT);
  expect(ports.vite).not.toBe(DEV_VITE_PORT);
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

function active(over: Partial<ActiveStage> = {}): ActiveStage {
  return {
    sha: SHA,
    shortSha: SHORT,
    dir: `/repo/.cache/snap-stage/${SHORT}`,
    serverPort: 8888,
    vitePort: 5273,
    baseUrl: "http://localhost:5273",
    checkout: MAIN_CHECKOUT,
    ownerPid: 4242,
    startedAt: "2026-08-16T12:00:00.000Z",
    lastUsedAt: "2026-08-16T12:00:00.000Z",
    ...over,
  };
}

test("stageDecision reuses ONLY a healthy, same-sha, non-fresh stage", () => {
  expect(stageDecision({ targetSha: SHA, active: active(), fresh: false, healthy: true })).toBe("reuse");
});

test("stageDecision rebuilds when there is no active stage", () => {
  expect(stageDecision({ targetSha: SHA, active: null, fresh: false, healthy: true })).toBe("rebuild");
});

test("stageDecision rebuilds when HEAD moved (a stale sha)", () => {
  expect(stageDecision({ targetSha: "ffffffffffffffffffffffffffffffffffffffff", active: active(), fresh: false, healthy: true })).toBe("rebuild");
});

test("stageDecision rebuilds an unhealthy (dead-stack) same-sha stage", () => {
  expect(stageDecision({ targetSha: SHA, active: active(), fresh: false, healthy: false })).toBe("rebuild");
});

test("stageDecision rebuilds when --fresh is forced even on a healthy same-sha stage", () => {
  expect(stageDecision({ targetSha: SHA, active: active(), fresh: true, healthy: true })).toBe("rebuild");
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
  const dirtyActive = active({ sha: DIRTY_STAGE_KEY, shortSha: DIRTY_STAGE_KEY, dir: "/repo/.cache/snap-stage/dirty" });
  expect(stageDecision({ targetSha: DIRTY_STAGE_KEY, active: dirtyActive, fresh: false, healthy: true })).toBe("reuse");
  expect(stageDecision({ targetSha: SHA, active: dirtyActive, fresh: false, healthy: true })).toBe("rebuild");
});

// ── the DB-BOUND env allowlist ──────────────────────────────────────────────────────────────────────────
//
// The stage boots under ORB_ENV_NO_FILE (it never reads the operator's .env) on a COPY of the dev DB, so a
// value the copied rows are bound to has to be re-declared or the stage boots against data it cannot read.
// CREDENTIALS_KEY was the miss that made `snap --isolated` blind: no key ⇒ the boot decrypt-probe fails ⇒
// /healthz answers 503 forever ⇒ `stageHealthy` is never true ⇒ every call rebuilds and fights its own
// orphaned processes for the ports (measured 2026-08-09; same stage + same DB with the key ⇒ healthz=200).

const DEV_ENV_SAMPLE = [
  "OWNER_HANDLES=inktomi93@gmail.com",
  "CREDENTIALS_KEY=3d0f1a2b3c4d5e6f",
  "DEBUG_TOKEN=abadcafeabadcafe",
  "SESSION_SECRET=hunter2hunter2hunter2",
  "OPENROUTER_API_KEY=sk-or-v1-not-a-real-key",
  "WIRE_CAPTURE=on",
].join("\n");

test("stageInheritedEnv forwards the DB-BOUND keys — the owner handle AND the credentials key", () => {
  const inherited = stageInheritedEnv(DEV_ENV_SAMPLE);
  expect(inherited["OWNER_HANDLES"]).toBe("inktomi93@gmail.com");
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

test("a stage staged from a worktree is visible from main, and vice versa (one shared marker file)", () => {
  const markerHome = mkdtempSync(join(tmpdir(), "ae-tooling2-marker-"));
  // Direction 1: the LANE boots the stage…
  writeActive(markerHome, active({ checkout: LANE_CHECKOUT, dir: `${LANE_CHECKOUT}/.cache/snap-stage/${SHORT}` }));
  // …and MAIN, resolving the same marker home, sees whose it is.
  const seenFromMain = readActive(markerHome);
  expect(seenFromMain?.checkout).toBe(LANE_CHECKOUT);
  expect(seenFromMain?.dir).toContain(LANE_CHECKOUT);

  // Direction 2: main boots one, the lane reads it.
  writeActive(markerHome, active({ checkout: MAIN_CHECKOUT }));
  expect(readActive(markerHome)?.checkout).toBe(MAIN_CHECKOUT);
});

test("a marker with no owner (a pre-#108 per-checkout file) reads as NO marker, not as a foreign one", () => {
  // Otherwise a legacy marker would refuse every checkout forever; the port-probe fallback handles it.
  const markerHome = mkdtempSync(join(tmpdir(), "ae-tooling2-legacy-"));
  const { checkout: _dropped, ...legacy } = active();
  writeActive(markerHome, legacy as ActiveStage);
  expect(readActive(markerHome)).toBeNull();
});

test("bandAccess leaves OUR OWN marker to the existing staleness rules", () => {
  const opts = { checkout: MAIN_CHECKOUT, targetSha: SHA, dirty: false, fresh: false, bandBound: true, healthy: true };
  expect(bandAccess({ ...opts, active: null })).toBe("ours");
  expect(bandAccess({ ...opts, active: active({ checkout: MAIN_CHECKOUT }) })).toBe("ours");
});

test("bandAccess REFUSES rather than killing a live sibling's stage", () => {
  const foreign = active({ checkout: LANE_CHECKOUT });
  const base = { active: foreign, checkout: MAIN_CHECKOUT, bandBound: true, healthy: true };
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
  const base = { active: foreign, checkout: MAIN_CHECKOUT, targetSha: SHA, dirty: false, fresh: false };
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

// ── THE STRAND RULE + THE HEARTBEAT (issue #324) ───────────────────────────────────────────────────
//
// A snap stage stayed running as a detached process group long after its purpose ended, holding the band
// and reading like the real dev stack. The fix is NOT teardown-at-run-completion: a warm stage OUTLIVING
// its run is the feature (and #108's shared-reuse depends on it). So liveness is USE — `lastUsedAt`,
// stamped by every boot and every reuse — and the sweep's safety lives in two fences these arms pin:
// it never touches a band it cannot positively identify as a stage's, and never one used inside the TTL.

const NOW = Date.parse("2026-08-22T12:00:00.000Z");
const TTL = 60 * 60_000;
const USED_RECENTLY = new Date(NOW - 5 * 60_000).toISOString();
const USED_LONG_AGO = new Date(NOW - 6 * 60 * 60_000).toISOString();

function evidence(over: Partial<Parameters<typeof stageSweepVerdict>[0]> = {}): Parameters<typeof stageSweepVerdict>[0] {
  return { active: active({ lastUsedAt: USED_RECENTLY }), bandBound: true, bandIsStageRooted: true, bandProcessAgeSeconds: 60, nowMs: NOW, ...over };
}

test("stageIdleMs measures time since the last USE, and treats an unreadable stamp as infinitely idle", () => {
  expect(stageIdleMs(active({ lastUsedAt: USED_RECENTLY }), NOW)).toBe(5 * 60_000);
  // A stamp that cannot be parsed must not read as fresh — the describeStageAge posture, one level up.
  expect(stageIdleMs(active({ lastUsedAt: "not-a-date" }), NOW)).toBe(Number.POSITIVE_INFINITY);
});

test("a stage USED inside the TTL is live — no matter how old the stage itself is", () => {
  // The exact shape a teardown-on-completion fix would have destroyed: booted this morning, snapped five
  // minutes ago, still serving a campaign. `startedAt` is deliberately ancient here.
  expect(stageSweepVerdict(evidence({ active: active({ startedAt: USED_LONG_AGO, lastUsedAt: USED_RECENTLY }) }), TTL)).toBe("live");
});

test("a stage nothing has used past the TTL is STRANDED — the #324 corpse", () => {
  expect(stageSweepVerdict(evidence({ active: active({ lastUsedAt: USED_LONG_AGO }) }), TTL)).toBe("stranded");
});

test("the sweep NEVER judges a band it cannot identify as a stage's — the one hard fence", () => {
  // The dev stack on a mis-set PORT, an engine, any other server: killing its process group would take an
  // unrelated service down. An idle marker does not license that — the fence outranks the TTL.
  const notAStage = { bandIsStageRooted: false, active: active({ lastUsedAt: USED_LONG_AGO }), bandProcessAgeSeconds: 99_999 };
  expect(stageSweepVerdict(evidence(notAStage), TTL)).toBe("live");
  // The positive control for that same fence: flip ONLY the identification and the identical evidence is
  // reapable — so the arm above is proving the fence, not merely passing.
  expect(stageSweepVerdict(evidence({ ...notAStage, bandIsStageRooted: true }), TTL)).toBe("stranded");
});

test("a MARKER-LESS bound band is judged by its PROCESS age, and an unknown age is never 'old'", () => {
  const lost = { active: null };
  // A lost marker with an old stage-rooted process is the strand `--stage-down` used to be the only cure for.
  expect(stageSweepVerdict(evidence({ ...lost, bandProcessAgeSeconds: 6 * 60 * 60 }), TTL)).toBe("stranded");
  // A young one is a stage someone just booted (the marker write may not even have landed yet).
  expect(stageSweepVerdict(evidence({ ...lost, bandProcessAgeSeconds: 30 }), TTL)).toBe("live");
  // `ps` refusing to answer is "I could not measure", never "it is old" — the instrument-zero rule.
  expect(stageSweepVerdict(evidence({ ...lost, bandProcessAgeSeconds: null }), TTL)).toBe("live");
});

test("an unbound band is 'unbound' regardless of what the marker still claims", () => {
  expect(stageSweepVerdict(evidence({ bandBound: false, active: active({ lastUsedAt: USED_LONG_AGO }) }), TTL)).toBe("unbound");
  expect(stageSweepVerdict(evidence({ bandBound: false, active: null }), TTL)).toBe("unbound");
});

test("the default idle TTL is generous enough that a long visual campaign is never a strand", () => {
  // Two hours: the sweep exists for the forgotten stage of a killed agent, not for impatience with a live
  // one. Pinned by VALUE so a shrink has to be a deliberate edit here, not a quiet one in the source.
  expect(STAGE_IDLE_TTL_MS).toBe(2 * 60 * 60_000);
  expect(stageSweepVerdict(evidence({ active: active({ lastUsedAt: new Date(NOW - 90 * 60_000).toISOString() }) }))).toBe("live");
});

test("a marker over an UNBOUND band is DANGLING — the residue that outlives a reaped stage", () => {
  // Measured on the live tree 2026-08-22 while building this: `--stage-status` showed a stage from 42h
  // earlier whose band had been free for two days. Nothing reconciled it, so every reader had to.
  expect(markerIsDangling(active({ lastUsedAt: USED_LONG_AGO }), "unbound")).toBe(true);
  // No marker ⇒ nothing to reconcile; a BOUND band ⇒ the strand rule owns it, not this one (a dangling
  // check that fired on a live stage would clear the marker of a stage still serving).
  expect(markerIsDangling(null, "unbound")).toBe(false);
  expect(markerIsDangling(active({ lastUsedAt: USED_LONG_AGO }), "stranded")).toBe(false);
  expect(markerIsDangling(active({ lastUsedAt: USED_RECENTLY }), "live")).toBe(false);
});

test("orphanStageDirs spares the marker's dir and the dir the current call is about to use", () => {
  const dirs = ["0123456789ab", "dirty", "deadbeefcafe"];
  expect(orphanStageDirs(dirs, { markerDir: `/repo/.cache/snap-stage/${SHORT}`, targetDir: "/repo/.cache/snap-stage/dirty" })).toStrictEqual(["deadbeefcafe"]);
  // Nothing to spare ⇒ every dir on disk is residue from a run that never finished.
  expect(orphanStageDirs(dirs, { markerDir: null, targetDir: null })).toStrictEqual(dirs);
  // …and the spare is matched by NAME, not by the caller's absolute path spelling.
  expect(orphanStageDirs(dirs, { markerDir: "/somewhere/else/.cache/snap-stage/dirty", targetDir: null })).toStrictEqual(["0123456789ab", "deadbeefcafe"]);
});

test("readActive backfills the heartbeat of a marker written before it existed (never a fresh-looking undefined)", () => {
  const markerHome = mkdtempSync(join(tmpdir(), "ae-tooling2-heartbeat-"));
  const { lastUsedAt: _dropped, ...legacy } = active({ startedAt: USED_LONG_AGO });
  writeActive(markerHome, legacy as ActiveStage);
  // The boot stamp is the honest floor: it can only make such a stage look OLDER, never fresher.
  expect(readActive(markerHome)?.lastUsedAt).toBe(USED_LONG_AGO);
  expect(stageIdleMs(readActive(markerHome) as ActiveStage, NOW)).toBe(6 * 60 * 60_000);
});

test("touchActive stamps the heartbeat and disturbs NOTHING else the marker says", () => {
  const markerHome = mkdtempSync(join(tmpdir(), "ae-tooling2-touch-"));
  writeActive(markerHome, active({ lastUsedAt: USED_LONG_AGO }));
  touchActive(markerHome, USED_RECENTLY);
  const after = readActive(markerHome);
  expect(after?.lastUsedAt).toBe(USED_RECENTLY);
  // The ownership facts (#108) are what a foreign-stage refusal names — a heartbeat must not rewrite them.
  expect(after?.checkout).toBe(MAIN_CHECKOUT);
  expect(after?.startedAt).toBe("2026-08-16T12:00:00.000Z");
  expect(after?.ownerPid).toBe(4242);
  expect(stageSweepVerdict(evidence({ active: after }), TTL)).toBe("live");
});

test("touchActive on a missing marker is a no-op — there is no stage to keep alive", () => {
  const markerHome = mkdtempSync(join(tmpdir(), "ae-tooling2-touch-none-"));
  touchActive(markerHome, USED_RECENTLY);
  expect(readActive(markerHome)).toBeNull();
});

// ── TEARDOWN CONSENT (#447 follow-on) ───────────────────────────────────────────────────────────────
//
// This EVOLVES #108's recorded ruling and both halves are pinned here: cross-checkout teardown still
// works (the mechanism), and a foreign stage that is still in use now needs `--force` (the input that
// changed). Measured 2026-08-22: a sibling's plain `--stage-down` removed a live stage mid-navigation,
// leaving 199 ERR_CONNECTION_REFUSED and a half-deleted dir.

test("teardown consent: your OWN stage, an idle one and a dead one all tear down with no flag", () => {
  const base = { checkout: MAIN_CHECKOUT, force: false };
  expect(teardownConsent({ ...base, active: active({ checkout: MAIN_CHECKOUT }), inUse: true })).toBe("allow");
  expect(teardownConsent({ ...base, active: active({ checkout: LANE_CHECKOUT }), inUse: false })).toBe("allow");
  expect(teardownConsent({ ...base, active: null, inUse: false })).toBe("allow");
});

test("teardown consent REFUSES a foreign stage that is still in use — until --force says so", () => {
  const foreign = { checkout: MAIN_CHECKOUT, active: active({ checkout: LANE_CHECKOUT }), inUse: true };
  expect(teardownConsent({ ...foreign, force: false })).toBe("refuse");
  // #108's mechanism SURVIVES: any checkout can still tear down any stage — it just has to say so.
  expect(teardownConsent({ ...foreign, force: true })).toBe("allow");
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
