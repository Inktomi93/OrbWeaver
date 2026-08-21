// The isolated stage's PURE derivation core (unit-tested): ports/paths/keys, the marker-age and
// band-access verdicts (#108 — a foreign live stage is a refusal, never a teardown), the staleness
// rule, and the DB-bound inherited-env allowlist. The imperative half is ops/stage.ts.
import { basename, dirname, join } from "node:path";
import { parseEnv } from "node:util";
import type { ActiveStage, BandAccess, StageDecision, StagePaths, StagePorts } from "../contract/stage.ts";

// The canonical dev ports (mirrors stack.sh BACKEND_PORT + vite.config strictPort). The stage offsets both.
export const DEV_SERVER_PORT = 8788;
export const DEV_VITE_PORT = 5173;
// Offset both dev ports into a free band (8788→8888, 5173→5273): dodges the live dev pair. The vLLM engine
// ports 8701-8703 sit outside this band anyway (the stage ADOPTS the shared fleet — see bootStage's
// ENGINES_POSTURE pin — it never offsets or spawns engines). One stage runs at a time, so a single fixed
// offset never self-collides.
const STAGE_PORT_OFFSET = 100;
// 12 hex — collision-safe for a dir name while staying human-scannable in logs.
export const SHORT_SHA_LEN = 12;
// vite.config.ts must READ this env var for the stage to isolate its /api proxy — its presence is the
// ref-supports-isolation tripwire (see the header VERSION TRIPWIRE note).
export const ISOLATION_TRIPWIRE = "VITE_API_TARGET";
// The `--dirty` stage's fixed key (stands in for a sha in stagePaths/ActiveStage) — never a real commit
// hash (all-lowercase, 5 chars, shorter than a sha's 40), so it can't collide with `shortSha` of a real ref.
export const DIRTY_STAGE_KEY = "dirty";

export const STAGE_ROOT_REL = join(".cache", "snap-stage");
export const ACTIVE_REL = join(STAGE_ROOT_REL, "active.json");

export function shortSha(sha: string): string {
  return sha.trim().slice(0, SHORT_SHA_LEN);
}

export function stagePorts(offset: number = STAGE_PORT_OFFSET): StagePorts {
  return { server: DEV_SERVER_PORT + offset, vite: DEV_VITE_PORT + offset };
}

/** `localhost`, NOT 127.0.0.1 — vite v8 binds [::1] only (see stack.sh vite_ok()); the IPv4 loopback
 *  never answers the dev server's vite port. */
export function stageBaseUrl(vitePort: number): string {
  return `http://localhost:${vitePort}`;
}

export function stagePaths(root: string, sha: string): StagePaths {
  const dir = join(root, STAGE_ROOT_REL, shortSha(sha));
  return {
    dir,
    // Absolute file: URL so the stage db lives under the stage dir regardless of the server's cwd — and is
    // trivially removed on teardown with the whole dir.
    databaseUrl: `file:${join(dir, "orbweaver.db")}`,
    assetsDir: join(dir, "assets"),
  };
}

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/** Human age of a marker ("just now" / "37m" / "2h 14m"). An unparseable/absent stamp reads "unknown age"
 *  rather than a fake zero — a marker that cannot say when it was written must not look fresh. */
export function describeStageAge(startedAt: string, nowMs: number): string {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) {
    return "unknown age";
  }
  const minutes = Math.max(0, Math.floor((nowMs - started) / MS_PER_MINUTE));
  if (minutes < 1) {
    return "just now";
  }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes % MINUTES_PER_HOUR}m`;
}

export function bandAccess(opts: {
  readonly active: ActiveStage | null;
  readonly checkout: string;
  readonly targetSha: string;
  readonly dirty: boolean;
  readonly fresh: boolean;
  readonly bandBound: boolean;
  readonly healthy: boolean;
}): BandAccess {
  if (opts.active === null || opts.active.checkout === opts.checkout) {
    return "ours";
  }
  if (!opts.bandBound) {
    return "take-over";
  }
  // `--dirty` would rsync OUR working tree into THEIR stage dir; `--fresh` and a sha change would tear
  // their stack down. Only an untouched same-commit reuse is safe across checkouts.
  const wouldMutateTheirStage = opts.dirty || opts.fresh;
  if (!wouldMutateTheirStage && opts.active.sha === opts.targetSha && opts.healthy) {
    return "shared-reuse";
  }
  return "refuse";
}

/** The port-collision refusal: names the owner (checkout, pid, age) instead of "unknown", and states the
 *  two remedies. This is the message issue #108 exists for. */
export function foreignStageRefusal(active: ActiveStage, livePid: number | null, nowMs: number): string {
  return (
    `stage band :${active.serverPort}/:${active.vitePort} is held by ANOTHER checkout — ${active.checkout} ` +
    `(stage ${active.shortSha}, owner pid ${active.ownerPid ?? "unknown"}, band pid ${livePid ?? "none"}, started ${describeStageAge(active.startedAt, nowMs)} ago). ` +
    "THE BAND IS ONE FIXED PAIR: rebuilding/re-syncing/--fresh here would kill that stage. Either wait, tear " +
    "it down deliberately with `pnpm snap --stage-down` (works from any checkout), or boot a private stack on " +
    "a free pair (VITE_PORT/VITE_API_TARGET into scripts/dev/stack.sh) and drive it with `snap --base`."
  );
}

/** The staleness rule: reuse a warm stage ONLY when it is the requested sha, healthy, and not forced fresh;
 *  otherwise rebuild. Pure — the imperative caller supplies `healthy`. */
export function stageDecision(opts: {
  readonly targetSha: string;
  readonly active: ActiveStage | null;
  readonly fresh: boolean;
  readonly healthy: boolean;
}): StageDecision {
  if (opts.fresh || opts.active === null || opts.active.sha !== opts.targetSha || !opts.healthy) {
    return "rebuild";
  }
  return "reuse";
}

/** The marker root derived from `git rev-parse --path-format=absolute --git-common-dir` (issue #108).
 *  Every linked worktree answers the MAIN checkout's `<main>/.git`, so its parent is the one path all
 *  checkouts of a repo agree on — that is what makes the band's owner discoverable across worktrees.
 *  A common dir NOT named `.git` (a `--separate-git-dir` / bare layout) has no such sibling worktree, so
 *  the marker stays INSIDE the git dir rather than being written to an unrelated parent directory. */
export function markerRootFromCommonDir(gitCommonDir: string): string {
  const dir = gitCommonDir.trim();
  return basename(dir) === ".git" ? dirname(dir) : dir;
}

/**
 * THE DB-BOUND KEYS — the ONLY dev-`.env` values the stage inherits, and the reason each one is on the list.
 *
 * `ORB_ENV_NO_FILE` makes the stage skip the operator's `.env` wholesale (the security hatch — see
 * `bootStage`), so every key the stage needs is re-declared explicitly. A key earns a row here ONLY when the
 * stage's DB — a COPY of the dev DB (`seedStageData`) — is meaningless without it: the copy carries rows
 * whose identity or ciphertext is bound to that exact value, so a stage booting under a different one is
 * booting against data it cannot read. Anything else (DEBUG_TOKEN, WIRE_CAPTURE, OIDC_*, provider API keys)
 * stays OUT by design — that is the whole point of the hatch, and this allowlist is what keeps it narrow.
 *
 *   • OWNER_HANDLES   — the copied DB's owner row already sits at whatever handle the dev deploy
 *                       provisioned. Declaring the SAME handle keeps `seedOwner` idempotent instead of
 *                       colliding with D17's single-owner unique index.
 *   • CREDENTIALS_KEY — the copied DB's credential ciphertext was sealed under the dev key. Without it the
 *                       boot decrypt-probe fails, `credentialsKeyOk` goes false, and `/healthz` answers 503
 *                       FOREVER (`entry/http/healthz.ts`) — which `stageHealthy` reads, so the stage is
 *                       never healthy, `bootStage` throws "stack failed to boot", the active marker is never
 *                       written, and every later `snap --isolated` re-enters rebuild and fights its own
 *                       orphaned processes for the ports. Measured 2026-08-09 on a stage seeded from the dev
 *                       DB: no key ⇒ `boot-failed` + `healthz=503`; same stage, same DB, key present ⇒
 *                       `stack: up` + `healthz=200`. That failure is what made `snap --isolated` blind.
 */
export const STAGE_INHERITED_ENV_KEYS = ["OWNER_HANDLES", "CREDENTIALS_KEY"] as const;

/** Pick the inherited keys out of a dev `.env`'s TEXT (pure — the imperative caller supplies the bytes).
 *  A key absent from the file is absent from the result, matching the schema's own unset fallback for each. */
export function stageInheritedEnv(envFileContent: string): Record<string, string> {
  const parsed = parseEnv(envFileContent);
  const inherited: Record<string, string> = {};
  for (const key of STAGE_INHERITED_ENV_KEYS) {
    const value = parsed[key];
    if (typeof value === "string") {
      inherited[key] = value;
    }
  }
  return inherited;
}
