// Fixture tests for the PURE derivation core of `snap --isolated` (scripts/probes/_kit/snap-stage.ts) —
// no git, no worktree, no stack: sha/port/path derivation + the reuse-vs-rebuild staleness rule, plus a
// smoke that the stage dir lands under a gitignored path. The imperative worktree/install/boot orchestration
// is deliberately NOT exercised here (it spins a real stack — out of the CI-tier's remit; this file's home
// is tests/tooling/ per core/Spine-Testing.md §2, a test of a scripts/ tool).
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActiveStage } from "../../scripts/probes/_kit/snap-stage.ts";
import {
  bandAccess,
  DEV_SERVER_PORT,
  DEV_VITE_PORT,
  DIRTY_STAGE_KEY,
  describeStageAge,
  foreignStageRefusal,
  ISOLATION_TRIPWIRE,
  markerRootFromCommonDir,
  readActive,
  SHORT_SHA_LEN,
  STAGE_INHERITED_ENV_KEYS,
  shortSha,
  stageBaseUrl,
  stageDecision,
  stageInheritedEnv,
  stagePaths,
  stagePorts,
  writeActive,
} from "../../scripts/probes/_kit/snap-stage.ts";
import { expect, test } from "../support/fixtures.ts";

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
  const gitignore = readFileSync(join(import.meta.dirname, "..", "..", ".gitignore"), "utf8");
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

test("describeStageAge reads humanely and refuses to fake freshness on an unparseable stamp", () => {
  const now = Date.parse("2026-08-16T12:00:00.000Z");
  expect(describeStageAge("2026-08-16T11:59:30.000Z", now)).toBe("just now");
  expect(describeStageAge("2026-08-16T11:23:00.000Z", now)).toBe("37m");
  expect(describeStageAge("2026-08-16T09:46:00.000Z", now)).toBe("2h 14m");
  expect(describeStageAge("not-a-date", now)).toBe("unknown age");
});

test("the isolation tripwire is the exact env var vite.config reads for its proxy target", () => {
  // If this constant and packages/client/vite.config.ts ever drift, the version guard silently passes a
  // pre-support ref (or rejects a good one). Prove they still name the same knob.
  expect(ISOLATION_TRIPWIRE).toBe("VITE_API_TARGET");
  const viteConfig = readFileSync(join(import.meta.dirname, "..", "..", "packages", "client", "vite.config.ts"), "utf8");
  expect(viteConfig).toContain(ISOLATION_TRIPWIRE);
});
