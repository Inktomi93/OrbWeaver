// The isolated stage's PURE derivation core (unit-tested): ports/paths/keys, the marker-age and per-row
// band-access verdicts (#108 — a foreign live stage is a refusal, never a teardown), the staleness rule,
// the `--base` band claim (#1186) and the DB-bound inherited-env allowlist. The imperative half is
// ops/stage.ts; the TABLE's own derivations — allocation, the TTL/strand rule, the three-probe health
// verdict, the limits — are lib/stage-bands.ts (split when this file approached the tooling line cap,
// docs/architecture/core/Core-Tooling-Law.md §4.3).
import { basename, dirname, join } from "node:path";
import { parseEnv } from "node:util";
import { stageBandForPort } from "../../_shared/ports.ts";
import type { BandAccess, StageBandClaim, StageDecision, StagePaths, StageRow } from "../contract/stage.ts";

// 12 hex — collision-safe for a dir name while staying human-scannable in logs.
export const SHORT_SHA_LEN = 12;
// vite.config.ts must READ this env var for the stage to isolate its /api proxy — its presence is the
// ref-supports-isolation tripwire (see the header VERSION TRIPWIRE note).
export const ISOLATION_TRIPWIRE = "VITE_API_TARGET";
// The `--dirty` stage's fixed key (stands in for a sha in stagePaths/StageRow) — never a real commit
// hash (all-lowercase, 5 chars, shorter than a sha's 40), so it can't collide with `shortSha` of a real ref.
export const DIRTY_STAGE_KEY = "dirty";

export const STAGE_ROOT_REL = join(".cache", "snap-stage");
/** The BAND TABLE (#1276) — one row per band, the file every checkout of the repo agrees on. */
export const BANDS_REL = join(STAGE_ROOT_REL, "bands.json");
/** Where band k's idle timer writes (#1163 arm b). A DETACHED child must never hold a pipe to the process
 *  that spawned it — `_shared/proc.ts` `spawnNicedChild` states the rule and the session daemon already
 *  obeys it: without a `logPath` the child gets `["ignore","pipe","pipe"]`, whose first write after the
 *  launcher exits is EPIPE, and whose stream handles keep the LAUNCHER's event loop referenced. The keeper
 *  outlives every snap call by design, so its one reap line has to land in a file. `--stage-status` names
 *  this path per row, so the artifact has a reader (it is under `.cache/`, therefore gitignored). */
export function stageKeeperLogPath(home: string, band: number): string {
  return join(home, STAGE_ROOT_REL, `keeper-band${band}.log`);
}

/** The bounded REAP LEDGER (#1163): the last few teardowns with the ARM that fired. A reaped band leaves
 *  no row, so without this "band 3 is free" and "band 3 was reaped 40 s ago" read identically. */
export const REAPS_REL = join(STAGE_ROOT_REL, "reaps.json");
/** The pre-#1276 single marker. Read ONCE as a legacy row and DELETED (ops/stage-marker.ts
 *  `migrateLegacyMarker`) — there is no compat shim, because half a migration is the named rot
 *  (`Core-Tooling-Law.md` §1). This constant exists only so the migration and the status line can name
 *  the file they retired. */
export const LEGACY_ACTIVE_REL = join(STAGE_ROOT_REL, "active.json");

export function shortSha(sha: string): string {
  return sha.trim().slice(0, SHORT_SHA_LEN);
}

/** `localhost`, NOT 127.0.0.1 — vite v8 binds [::1] only (see stack.sh vite_ok()); the IPv4 loopback
 *  never answers the dev server's vite port. */
export function stageBaseUrl(vitePort: number): string {
  return `http://localhost:${vitePort}`;
}

/** A row's base URL, derived — the row stores ports, never a second copy of the URL built from them. */
export function stageRowBaseUrl(row: StageRow): string {
  return stageBaseUrl(row.vitePort);
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

/** Human age of a row ("just now" / "37m" / "2h 14m"). An unparseable/absent stamp reads "unknown age"
 *  rather than a fake zero — a row that cannot say when it was written must not look fresh. */
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

/** `describeStageAge` + the " ago" suffix, except when the age is already a complete phrase — the status
 *  line read "last used : just now ago" on its first live run. */
export function describeStageAgePhrase(startedAt: string, nowMs: number): string {
  const age = describeStageAge(startedAt, nowMs);
  return age === "just now" || age === "unknown age" ? age : `${age} ago`;
}

export function bandAccess(opts: {
  readonly row: StageRow | null;
  readonly checkout: string;
  readonly targetSha: string;
  readonly dirty: boolean;
  readonly fresh: boolean;
  readonly bandBound: boolean;
  readonly healthy: boolean;
}): BandAccess {
  if (opts.row === null || opts.row.checkout === opts.checkout) {
    return "ours";
  }
  if (!opts.bandBound) {
    return "take-over";
  }
  // `--dirty` would rsync OUR working tree into THEIR stage dir; `--fresh` and a sha change would tear
  // their stack down. Only an untouched same-commit reuse is safe across checkouts.
  const wouldMutateTheirStage = opts.dirty || opts.fresh;
  if (!wouldMutateTheirStage && opts.row.sha === opts.targetSha && opts.healthy) {
    return "shared-reuse";
  }
  return "refuse";
}

/** The band-collision refusal: names the owner (checkout, pid, age) instead of "unknown", and states the
 *  remedies. This is the message issue #108 exists for — with #1276's band index, because "the band" is
 *  now one of ten and a reader needs to know WHICH. */
export function foreignStageRefusal(row: StageRow, livePid: number | null, nowMs: number): string {
  return (
    `stage band ${row.band} (:${row.serverPort}/:${row.vitePort}) is held by ANOTHER checkout — ${row.checkout} ` +
    `(stage ${shortSha(row.sha)}, owner pid ${row.ownerPid ?? "unknown"}, band pid ${livePid ?? "none"}, started ${describeStageAge(row.startedAt, nowMs)} ago). ` +
    "Rebuilding/re-syncing/--fresh on THIS band would kill that stage. Every other band was already tried " +
    "(the allocator takes the lowest free one first), so: wait, tear it down deliberately with " +
    "`pnpm snap --stage-down --force` (cross-checkout teardown still works from anywhere — `--force` is " +
    "what says you accept killing THEIR run, #447), or free a band with `pnpm snap --stage-sweep`."
  );
}

// ── THE STRAND RULE (#324, generalized to the table by #1276) ─────────────────────────────────────────
//
// A stage is WARM BY DESIGN — it outlives the snap run that booted it so the next call (and, under #108,
// a sibling checkout at the same commit) reuses it instead of re-paying `pnpm install` + a full stack
// boot. That is why "tear the stage down when the run finishes" is NOT the fix for a strand: it would
// delete the feature. The liveness of a warm stage is its USE, not its parent process, so the heartbeat
// is `lastUsedAt` (stamped by every boot, every reuse, every session call bound to the band and every
// attached sibling run) and a strand is a stage nothing has used since the TTL.
//
// A ROW-LESS bound band has no heartbeat to read, so its age comes from the PROCESS instead. Both
// paths are additionally fenced on the band process being rooted in a `.cache/snap-stage/` dir: the
// dev stack, an engine, or any other server that happens to hold a band port is never this sweep's
// business (the #310 liveness-gate lesson — identify by a positive signal, never a structural guess).
// The rule itself lives in lib/stage-bands.ts beside the allocator that consumes it.

/** Milliseconds since this stage was last used. An unparseable stamp reads as INFINITELY idle — the same
 *  posture as `describeStageAge`: a row that cannot say when it was used must not look fresh. (It is still
 *  fenced by `bandIsStageRooted` and by the live-session rule, so this can never reap a live stage.) */
export function stageIdleMs(row: StageRow, nowMs: number): number {
  const lastUsed = Date.parse(row.lastUsedAt);
  return Number.isNaN(lastUsed) ? Number.POSITIVE_INFINITY : Math.max(0, nowMs - lastUsed);
}

/** Stage dirs on THIS checkout that no live stage accounts for — the accumulation half of #324. Never
 *  includes a dir any ROW names (it may be a live stage, ours or a sibling's) nor the dir the current call
 *  is about to use. Dirs are per-checkout by construction, so this can only ever propose our own. */
export function orphanStageDirs(dirs: readonly string[], keep: { readonly rowDirs: readonly string[]; readonly targetDir: string | null }): string[] {
  const spared = new Set([...keep.rowDirs, keep.targetDir].filter((d): d is string => d !== null).map((d) => basename(d)));
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
// #1276 narrows the blast radius again, without touching the rule: a plain `--stage-down` acts on the
// rows THIS CHECKOUT owns (it can no longer reach a sibling's row at all), and `--force` is what extends
// it to foreign rows. Your own stage, an idle one, a dead one and a row-less band still tear down with a
// plain `--stage-down` exactly as before.

/** May this caller tear down the stage this row names? `refuse` ⇒ a foreign, still-in-use stage and no
 *  `--force`. Pure — `inUse` is the caller's band/heartbeat observation (a `live` sweep verdict). */
export function teardownConsent(opts: {
  readonly row: StageRow | null;
  readonly checkout: string;
  readonly inUse: boolean;
  readonly force: boolean;
}): "allow" | "refuse" {
  if (opts.row === null || opts.row.checkout === opts.checkout || opts.force || !opts.inUse) {
    return "allow";
  }
  return "refuse";
}

/** The F7 teardown selector: no selector means rows owned by this checkout; a named owner narrows the
 *  operation to that owner's rows. `--force` is consent, never a hidden all-foreign selector. */
export function selectsTeardownRow(row: StageRow, checkout: string, owner: string | null): boolean {
  return owner === null ? row.checkout === checkout : row.checkout === owner;
}

/** The refusal `--stage-down` prints instead of killing a sibling's working stage — names the owner and
 *  the one flag that overrides it, so the escape hatch #108 promised is still one command away. */
export function foreignTeardownRefusal(row: StageRow, nowMs: number): string {
  return (
    `stage ${shortSha(row.sha)} on band ${row.band} is owned by ANOTHER checkout — ${row.checkout} (last used ` +
    `${describeStageAge(row.lastUsedAt, nowMs)} ago) — and its band is still bound, so tearing it down ` +
    "would kill a run in progress (measured 2026-08-22: it did). Wait for it to go idle, or say so " +
    "deliberately with `pnpm snap --stage-down --force`."
  );
}

/** The staleness rule: reuse a warm stage ONLY when it is the requested sha, healthy, and not forced fresh;
 *  otherwise rebuild. Pure — the imperative caller supplies `healthy` (lib/stage-bands.ts's three-probe
 *  verdict, `warm`). */
export function stageDecision(opts: {
  readonly targetSha: string;
  readonly row: StageRow | null;
  readonly fresh: boolean;
  readonly healthy: boolean;
}): StageDecision {
  if (opts.fresh || opts.row === null || opts.row.sha !== opts.targetSha || !opts.healthy) {
    return "rebuild";
  }
  return "reuse";
}

/** The table root derived from `git rev-parse --path-format=absolute --git-common-dir` (issue #108).
 *  Every linked worktree answers the MAIN checkout's `<main>/.git`, so its parent is the one path all
 *  checkouts of a repo agree on — that is what makes a band's owner discoverable across worktrees.
 *  A common dir NOT named `.git` (a `--separate-git-dir` / bare layout) has no such sibling worktree, so
 *  the table stays INSIDE the git dir rather than being written to an unrelated parent directory. */
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
 *                       FOREVER (`entry/http/healthz.ts`) — which the health probe reads, so the stage is
 *                       never healthy, `bootStage` throws "stack failed to boot", the row is never
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

// ── the BAND CLAIM: who owns the port an instrument was pointed at (#1186) ─────────────────────────
//
// A `snap --isolated` that REFUSES on band contention does not stop the instruments chained behind it:
// `perf-meter --base http://localhost:5273` and `motion-audit --base …` then measure whichever lane's
// stage currently holds that band, and the numbers look completely normal. Lane p-home-perf took three
// AFTER receipts off a sibling checkout's tree that way (2026-09-02, discarded).
//
// Every band is a REGISTERED port pair (_shared/ports.ts) and the table naming each one's owner is ONE
// shared file, so "am I allowed to read this?" is answerable EXACTLY, without a heuristic: a base at a
// band port whose row names another checkout is a REFUSAL, and so is one no row accounts for — an unowned
// band is "I cannot say whose tree this is", which is the same defect
// (.claude/rules/gates-and-tooling.md: a bare zero is "I couldn't measure", never "it isn't there").
// #1276 widened this from one hardcoded pair to the whole range: a `--base` on ANY band is arbitrated.

/** Which band does this URL address, or null? Port-keyed, because a band IS its ports — a
 *  `--base http://localhost:5283` and a `--url http://localhost:5283/chat` are the same claim. */
export function urlStageBand(url: string): number | null {
  if (!URL.canParse(url)) {
    return null;
  }
  return stageBandForPort(Number(new URL(url).port));
}

/** Does this URL address ANY stage band? (`urlStageBand` with the index thrown away — kept because most
 *  callers only need the yes/no and reading `!== null` at each of them re-spells the question.) */
export function urlTargetsStageBand(url: string): boolean {
  return urlStageBand(url) !== null;
}

export function stageBandClaim(url: string, checkout: string, rows: readonly StageRow[]): StageBandClaim {
  const band = urlStageBand(url);
  if (band === null) {
    return "not-the-band";
  }
  const row = rows.find((candidate) => candidate.band === band);
  if (row === undefined) {
    return "unowned";
  }
  return row.checkout === checkout ? "ours" : "foreign";
}

/** The exit-2 copy for a claim that is not ours — it names BOTH checkouts, because the whole failure is
 *  that the operator could not tell whose tree answered. Returns null for the two readable claims. */
export function stageBandRefusal(claim: StageBandClaim, url: string, checkout: string, rows: readonly StageRow[]): string | null {
  if (claim === "not-the-band" || claim === "ours") {
    return null;
  }
  const band = urlStageBand(url);
  const row = rows.find((candidate) => candidate.band === band);
  const owner = row === undefined ? "NOBODY (no row in the band table)" : `${row.checkout} (stage ${shortSha(row.sha)}, started ${row.startedAt})`;
  return [
    `STAGE ERROR  ${url} is stage band ${band ?? "?"}, and this checkout does not own it — nothing was measured.`,
    `  band owner : ${owner}`,
    `  invoked by : ${checkout}`,
    "  A refused `snap --isolated` leaves the band with its previous owner, so an instrument chained behind",
    "  it would report that tree's numbers as yours. Boot your own stage (`pnpm snap --isolated --ref <sha>`)",
    "  — the allocator gives you a band of your own — or measure the live stack instead.",
  ].join("\n");
}
