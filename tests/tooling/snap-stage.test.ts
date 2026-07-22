// Fixture tests for the PURE derivation core of `snap --isolated` (scripts/probes/_kit/snap-stage.ts) —
// no git, no worktree, no stack: sha/port/path derivation + the reuse-vs-rebuild staleness rule, plus a
// smoke that the stage dir lands under a gitignored path. The imperative worktree/install/boot orchestration
// is deliberately NOT exercised here (it spins a real stack — out of the CI-tier's remit; this file's home
// is tests/tooling/ per core/Spine-Testing.md §2, a test of a scripts/ tool).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ActiveStage } from "../../scripts/probes/_kit/snap-stage.ts";
import {
  DEV_SERVER_PORT,
  DEV_VITE_PORT,
  DIRTY_STAGE_KEY,
  ISOLATION_TRIPWIRE,
  SHORT_SHA_LEN,
  shortSha,
  stageBaseUrl,
  stageDecision,
  stagePaths,
  stagePorts,
} from "../../scripts/probes/_kit/snap-stage.ts";
import { expect, test } from "../support/fixtures.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const SHORT = "0123456789ab";
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

test("the isolation tripwire is the exact env var vite.config reads for its proxy target", () => {
  // If this constant and packages/client/vite.config.ts ever drift, the version guard silently passes a
  // pre-support ref (or rejects a good one). Prove they still name the same knob.
  expect(ISOLATION_TRIPWIRE).toBe("VITE_API_TARGET");
  const viteConfig = readFileSync(join(import.meta.dirname, "..", "..", "packages", "client", "vite.config.ts"), "utf8");
  expect(viteConfig).toContain(ISOLATION_TRIPWIRE);
});
