// The isolated stage's PURE derivation core (unit-tested): ports/paths/keys, the marker-age and
// band-access verdicts (#108 — a foreign live stage is a refusal, never a teardown), the staleness
// rule, and the DB-bound inherited-env allowlist. The imperative half is ops/stage.ts.
import { basename, dirname, join } from "node:path";
import { parseEnv } from "node:util";
import type { ActiveStage, BandAccess, StageDecision, StagePaths, StagePorts, StageSweepEvidence, StageSweepVerdict } from "../contract/stage.ts";

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

const MS_PER_SECOND = 1000;
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
    "it down deliberately with `pnpm snap --stage-down --force` (cross-checkout teardown still works from " +
    "anywhere — `--force` is what says you accept killing THEIR run, #447), or boot a private stack on " +
    "a free pair (VITE_PORT/VITE_API_TARGET into tooling/src/stack/stack.sh) and drive it with `snap --base`."
  );
}

// ── THE STRAND RULE (#324) ────────────────────────────────────────────────────────────────────────────
//
// A stage is WARM BY DESIGN — it outlives the snap run that booted it so the next call (and, under #108,
// a sibling checkout at the same commit) reuses it instead of re-paying `pnpm install` + a full stack
// boot. That is why "tear the stage down when the run finishes" is NOT the fix for a strand: it would
// delete the feature. The liveness of a warm stage is its USE, not its parent process, so the heartbeat
// is `lastUsedAt` (stamped by every boot AND every reuse) and a strand is a stage nothing has used since
// the TTL.
//
// A MARKER-LESS bound band has no heartbeat to read, so its age comes from the PROCESS instead. Both
// paths are additionally fenced on the band process being rooted in a `.cache/snap-stage/` dir: the
// dev stack, an engine, or any other server that happens to hold a band port is never this sweep's
// business (the #310 liveness-gate lesson — identify by a positive signal, never a structural guess).

/** How long a stage may go UNUSED before `--stage-sweep` calls it a strand. Generous on purpose: a long
 *  visual campaign snaps the same warm stage over hours, and the sweep is explicit — its job is the
 *  forgotten stage from a killed agent, not impatience with a live one. */
export const STAGE_IDLE_TTL_MS = 2 * MINUTES_PER_HOUR * MS_PER_MINUTE;

/** `describeStageAge` + the " ago" suffix, except when the age is already a complete phrase — the status
 *  line read "last used : just now ago" on its first live run. */
export function describeStageAgePhrase(startedAt: string, nowMs: number): string {
  const age = describeStageAge(startedAt, nowMs);
  return age === "just now" || age === "unknown age" ? age : `${age} ago`;
}

/** Milliseconds since this stage was last booted-or-reused. An unparseable stamp reads as INFINITELY
 *  idle — the same posture as `describeStageAge`: a marker that cannot say when it was used must not
 *  look fresh. (It is still fenced by `bandIsStageRooted`, so this can never reap a foreign server.) */
export function stageIdleMs(active: ActiveStage, nowMs: number): number {
  const lastUsed = Date.parse(active.lastUsedAt);
  return Number.isNaN(lastUsed) ? Number.POSITIVE_INFINITY : Math.max(0, nowMs - lastUsed);
}

/** Whether whatever holds the stage band right now has outlived its use. Pure — the caller observes the
 *  band, the process root and the process age. `ttlMs` is a parameter so the suite can pin both sides of
 *  the boundary without waiting two hours. */
export function stageSweepVerdict(evidence: StageSweepEvidence, ttlMs: number = STAGE_IDLE_TTL_MS): StageSweepVerdict {
  if (!evidence.bandBound) {
    return "unbound";
  }
  // The one hard fence: a bound band that is not a stage's is somebody else's server. Never ours to kill.
  if (!evidence.bandIsStageRooted) {
    return "live";
  }
  if (evidence.active === null) {
    // Lost marker: no heartbeat exists, so the process's own age is the only honest signal. `ps` refusing
    // to answer is NOT evidence of age — leave it alone and let `--stage-down` be the deliberate remedy.
    const ageSeconds = evidence.bandProcessAgeSeconds;
    return ageSeconds !== null && ageSeconds * MS_PER_SECOND > ttlMs ? "stranded" : "live";
  }
  return stageIdleMs(evidence.active, evidence.nowMs) > ttlMs ? "stranded" : "live";
}

/** Does the marker name a stage that is NOT running? The dangling `active.json` of #324 (measured on the
 *  live tree 2026-08-22: a 42h-old marker whose band had been free for two days — `--stage-status` showed
 *  a stage, `ss` showed nothing, and every reader had to reconcile that by hand). It is the same corpse
 *  `bandAccess` already rules a `take-over`, so reconciling it costs a rebuild at worst and never a kill.
 *  The one shape it could misjudge is a stage whose server AND vite are both down in the same instant of
 *  a respawn — which is exactly the stage a rebuild should replace. */
export function markerIsDangling(active: ActiveStage | null, verdict: StageSweepVerdict): boolean {
  return verdict === "unbound" && active !== null;
}

/** Stage dirs on THIS checkout that no live stage accounts for — the accumulation half of #324. Never
 *  includes the dir the marker names (it may be a live stage, ours or a sibling's) nor the dir the
 *  current call is about to use. Dirs are per-checkout by construction, so this can only ever propose
 *  our own. */
export function orphanStageDirs(dirs: readonly string[], keep: { readonly markerDir: string | null; readonly targetDir: string | null }): string[] {
  const spared = new Set([keep.markerDir, keep.targetDir].filter((d): d is string => d !== null).map((d) => basename(d)));
  return dirs.filter((name) => !spared.has(name));
}

// ── THE LAUNCHER PATH (#447) ──────────────────────────────────────────────────────────────────────────
//
// The stage boots and stops the STAGED TREE's own launcher, so the path is a property of the ref being
// staged, not of this checkout. The #393 P5 tooling move relocated it from `scripts/dev/stack.sh` to
// `tooling/src/stack/stack.sh` and missed this consumer: `bootStage` spawned a path that did not exist
// (`STAGE ERROR: stage stack failed to boot` for every `--isolated`/`--dirty` caller), and `stopStage`
// — guarded by an `existsSync` — SILENTLY DID NOTHING, which is a large part of why stages stranded
// (#324). So the resolution is ordered and total: the current home first, the pre-P5 home second (a
// `--ref <old-sha>` stage is a supported mode and its tree really does keep the launcher there), and
// null when neither exists so the caller can refuse with the paths it tried instead of no-op'ing.

export const STAGE_LAUNCHER_RELS = [join("tooling", "src", "stack", "stack.sh"), join("scripts", "dev", "stack.sh")] as const;

/** The staged tree's launcher, or null when it ships neither. `exists` is injected so this stays pure and
 *  the suite can pin every arm (including the pre-P5 ref) without a worktree. */
export function stageLauncherPath(stageDir: string, exists: (path: string) => boolean): string | null {
  for (const rel of STAGE_LAUNCHER_RELS) {
    const candidate = join(stageDir, rel);
    if (exists(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** The refusal when a staged ref ships no launcher at all — names every path tried, because "failed to
 *  boot" without them is exactly the message that cost #447 a lane's afternoon. */
export function missingLauncherRefusal(stageDir: string): string {
  return (
    `stage ${stageDir} ships no dev-stack launcher — tried ${STAGE_LAUNCHER_RELS.join(" and ")}. ` +
    "Either the ref predates both homes, or the launcher moved again and this list needs the new path " +
    "(tooling/src/snap/lib/stage-plan.ts STAGE_LAUNCHER_RELS)."
  );
}

// ── TEARDOWN CONSENT (#447 follow-on, 2026-08-22) ─────────────────────────────────────────────────────
//
// THIS EVOLVES A RECORDED RULING; both texts matter. #108 made `--stage-down` work from ANY checkout on
// purpose, and `foreignStageRefusal` still advertises it as the remedy for a band collision. That
// mechanism SURVIVES — its INPUT changed. Measured 2026-08-22: a sibling lane's plain `--stage-down`
// acted on the global marker and removed a LIVE stage owned by another checkout while its stack and
// vite were serving a navigation; the removal half-failed ("Directory not empty") and left the run with
// 199 ERR_CONNECTION_REFUSED and a half-deleted dir. Tearing down someone else's LIVE stage is a
// deliberate act, so it now requires a deliberate flag.
//
// What is unchanged: your own stage, an idle one, a dead one, and a marker-less band all tear down with
// a plain `--stage-down` exactly as before. Only "foreign AND still in use" asks for `--force`.

/** May this caller tear down the stage the marker names? `refuse` ⇒ a foreign, still-in-use stage and no
 *  `--force`. Pure — `inUse` is the caller's band/heartbeat observation (a `live` sweep verdict). */
export function teardownConsent(opts: {
  readonly active: ActiveStage | null;
  readonly checkout: string;
  readonly inUse: boolean;
  readonly force: boolean;
}): "allow" | "refuse" {
  if (opts.active === null || opts.active.checkout === opts.checkout || opts.force || !opts.inUse) {
    return "allow";
  }
  return "refuse";
}

/** The refusal `--stage-down` prints instead of killing a sibling's working stage — names the owner and
 *  the one flag that overrides it, so the escape hatch #108 promised is still one command away. */
export function foreignTeardownRefusal(active: ActiveStage, nowMs: number): string {
  return (
    `stage ${active.shortSha} is owned by ANOTHER checkout — ${active.checkout} (last used ` +
    `${describeStageAge(active.lastUsedAt, nowMs)} ago) — and its band is still bound, so tearing it down ` +
    "would kill a run in progress (measured 2026-08-22: it did). Wait for it to go idle, or say so " +
    "deliberately with `pnpm snap --stage-down --force`."
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
