// stack's shapes — the PURE half of mode-aware stack control, split out of the old
// `scripts/dev/_kit/stack-mode.ts` at the #393 P5 move. Every decision the launcher makes is typed here;
// the imperative half (spawn/kill/poll/probe) lives in ops/, and the dev half is stack.sh.

// ── The spawner census ───────────────────────────────────────────────────────────────────────────────

/** One thing on this box that can bind a server and/or a vite port. Keeping this as DATA is what lets
 *  `stack status` say "that's the e2e local-mode harness" instead of printing a bare pid — and what stops
 *  an adopt/kill from ever treating one of these as the operator's stack. */
export interface StackSpawner {
  readonly name: string;
  /** The Hono server port, or `null` for a spawner that boots no server (playwright-ct is vite-only). */
  readonly serverPort: number | null;
  /** The vite port, or `null` (prod serves the built bundle from the server itself — no vite at all). */
  readonly vitePort: number | null;
  /** How to tell it apart from the operator's stack at runtime. */
  readonly discriminator: string;
}

// ── Invocation ───────────────────────────────────────────────────────────────────────────────────────

export const STACK_MODES = ["dev", "prod"] as const;
export type StackMode = (typeof STACK_MODES)[number];

export const STACK_VERBS = ["up", "down", "restart", "status", "logs", "up-fg", "_leader"] as const;
export type StackVerb = (typeof STACK_VERBS)[number];

export interface StackInvocation {
  readonly verb: StackVerb;
  readonly mode: StackMode;
  /** `--debug`: arm the /api/_debug surface + wire capture as a PROCESS ENV OVERLAY. Orthogonal to mode. */
  readonly debug: boolean;
  /** `--build`: run the client `vite build` BEFORE anything is stopped (no dead-dist downtime window). */
  readonly build: boolean;
  /** `--force`: dev-mode nuke-then-boot (existing `restart --force` behavior). */
  readonly force: boolean;
  /** Positional leftovers — `logs [server|client] [n]`. */
  readonly rest: readonly string[];
}

export type StackParse = { readonly ok: true; readonly invocation: StackInvocation } | { readonly ok: false; readonly error: string };

// ── The debug overlay ────────────────────────────────────────────────────────────────────────────────

/** The env keys `--debug` arms — every debug-surface knob `foundation/env` declares.
 *  `DEBUG_TOKEN` gates /api/_debug/* · `WIRE_CAPTURE` records outbound provider request bodies ·
 *  `RPG_TRACE` wires the rpg flight recorder read at /api/_debug/rpg/traces. */
export const DEBUG_ENV_KEYS = ["DEBUG_TOKEN", "WIRE_CAPTURE", "RPG_TRACE"] as const;
export type DebugEnvKey = (typeof DEBUG_ENV_KEYS)[number];

export interface DebugConflict {
  readonly key: DebugEnvKey;
  readonly fileValue: string;
  readonly wanted: string;
}

export type DebugArming =
  | { readonly kind: "armed"; readonly overlay: Readonly<Record<string, string>>; readonly token: string; readonly notes: readonly string[] }
  | { readonly kind: "refused"; readonly conflicts: readonly DebugConflict[] };

// ── The prod spawn plan ──────────────────────────────────────────────────────────────────────────────

export interface ProdSpawnPlan {
  /** Always the running node binary — never a loader, never a bundler, never a transpiler. */
  readonly command: string;
  readonly args: readonly string[];
  /** The FULL resolved child env (inheritance is explicit here so a snapshot test can prove what leaks). */
  readonly env: Readonly<Record<string, string>>;
  /** The repo root. Both `.env` loading and `CLIENT_DIST_DIR` are cwd-relative — this is the cwd trap the
   *  handoff doc warned about twice, closed by construction. */
  readonly cwd: string;
  readonly logPath: string;
}

export interface ProdSpawnPlanOpts {
  readonly repoRoot: string;
  readonly nodePath: string;
  readonly baseEnv: Readonly<Record<string, string | undefined>>;
  /** Present only when `--debug` armed successfully. */
  readonly debugOverlay?: Readonly<Record<string, string>>;
  readonly logPath: string;
}

// ── The pidfile record + the spawn lock ──────────────────────────────────────────────────────────────

export interface ProdRecord {
  readonly mode: "prod";
  readonly pid: number;
  /** The child is spawned `detached:true` (node calls setsid(2) before exec), so pgid === pid. */
  readonly pgid: number;
  readonly port: number;
  readonly startedAt: string;
  /** /proc/<pid>/stat field 22. Pid numbers are recycled; this makes the record reuse-proof. */
  readonly startTicks: string;
  readonly debug: boolean;
  readonly repoRoot: string;
  readonly logPath: string;
}

/** Fresh Linux process identity used by the detached dev-stack ownership verifier. */
export interface ObservedStackProcess {
  readonly pid: number;
  readonly pgid: number;
  readonly startTicks: string;
  readonly executable: string;
  readonly cmdlineBase64: string;
  readonly cwd: string;
}

/** Complete launch identity persisted before stack.sh releases control of its setsid leader. */
export interface DevStackIdentity extends ObservedStackProcess {
  readonly version: 1;
  readonly repoRoot: string;
  /** THE LAUNCH MARKER (#1013). A high-entropy token `stack.sh` mints and EXPORTS before it spawns the
   *  setsid leader, so every member of the resulting group inherits it in its environment, and which is
   *  recorded here from the leader's own `/proc/<pid>/environ`. It is what makes a leaderless SURVIVOR
   *  identifiable: a live pid in the recorded group that carries this exact token was started by THIS
   *  launch and by nothing else. OPTIONAL because a record written before the marker existed must still
   *  parse — such a record simply cannot be adopted, which is the pre-#1013 refusal, unchanged. */
  readonly launchId?: string | undefined;
}

/** Can a leaderless group be adopted? (#1013 — the answer the pidfile alone could never give.)
 *    `adoptable`   — every live member of the recorded group carries the recorded launch marker.
 *    `unmarked`    — at least one live member does NOT, so this is not provably our group any more.
 *    `no-marker`   — the record predates the marker (or the leader never carried one): unknowable.
 *    `empty`       — the group has no members left; there is nothing to adopt. */
export type DevStackAdoption =
  | { readonly kind: "adoptable"; readonly pgid: number; readonly members: readonly number[] }
  | { readonly kind: "unmarked"; readonly pgid: number; readonly unmarked: readonly number[] }
  | { readonly kind: "no-marker"; readonly pgid: number; readonly reason: string }
  | { readonly kind: "empty"; readonly pgid: number };

export type DevStackIdentityVerdict =
  | { readonly verdict: "owned"; readonly pgid: number; readonly witness: ObservedStackProcess }
  | { readonly verdict: "absent"; readonly reason: string }
  /** The record is well-formed and ours, and the recorded LEADER has exited (#1162). Distinct from
   *  `refused` because it is the ONLY refusal whose remaining question is answerable: ask the group
   *  whether anything survived the leader. Empty group → nothing to clean; populated → a true alarm. */
  | { readonly verdict: "departed"; readonly pgid: number; readonly reason: string }
  | { readonly verdict: "refused"; readonly reason: string };

const SPAWN_LOCK_ACTIONS = ["retake", "refuse", "break-stale"] as const;
export type SpawnLockAction = (typeof SPAWN_LOCK_ACTIONS)[number];

/** What the lock file's CONTENT turned out to be. Three outcomes, not two — conflating them is what
 *  wedged the lock:
 *    `vanished`    — the file disappeared between the failed `wx` create and our read (a racing release).
 *    `unparseable` — empty, whitespace, non-numeric, or a non-positive / non-integer "pid". A crash or a
 *                    short write between `wx` and the write leaves exactly this, and it is a REAL window.
 *    `pid`         — a plausible process id we can actually probe. */
export type LockHolder =
  | { readonly kind: "vanished" }
  | { readonly kind: "unparseable"; readonly raw: string }
  | { readonly kind: "pid"; readonly pid: number };

// ── Instance identity ────────────────────────────────────────────────────────────────────────────────

/** What we could actually observe about whoever holds the port right now. Every field is nullable because
 *  every probe can legitimately fail to answer (nothing listening / debug disarmed / no /proc). */
export interface ObservedInstance {
  /** `/healthz` answered 200. NOT sufficient for identity — a stale incumbent answers too. */
  readonly healthy: boolean;
  /** `/healthz` body `harness` — true ⇒ a Playwright-owned stack (E2E_HARNESS=on). */
  readonly harness: boolean | null;
  /** The pid that owns the listening socket (`ss -ltnp`), or `/api/_debug/info`'s pid when armed. */
  readonly listenerPid: number | null;
  /** /proc/<listenerPid>/stat field 22 — pid-reuse defence. */
  readonly listenerStartTicks: string | null;
}

/** The five identity verdicts, in decision order:
 *    `ours-healthy`   — our recorded instance is alive, healthy and verified by identity; `up` is a no-op.
 *    `ours-unhealthy` — our record's process is alive but not answering: booting, or wedged.
 *    `foreign`        — something answers the port and it is NOT ours. Never adopt, never kill.
 *    `harness`        — the port holder stamps itself a Playwright harness. Hands off, always.
 *    `absent`         — nothing holds the port; any record is stale. */
const INSTANCE_VERDICTS = ["ours-healthy", "ours-unhealthy", "foreign", "harness", "absent"] as const;
export type InstanceVerdict = (typeof INSTANCE_VERDICTS)[number];

export interface InstanceClassification {
  readonly verdict: InstanceVerdict;
  readonly reason: string;
}

const UP_ACTIONS = ["spawn", "adopt", "refuse"] as const;
export type UpAction = (typeof UP_ACTIONS)[number];

// ── Shutdown drain + client-dist freshness ───────────────────────────────────────────────────────────

const DRAIN_OUTCOMES = ["complete", "deadline-hit", "pending"] as const;
export type DrainOutcome = (typeof DRAIN_OUTCOMES)[number];

const DIST_STATES = ["missing", "stale", "fresh"] as const;
export type DistState = (typeof DIST_STATES)[number];

export interface DistVerdict {
  readonly state: DistState;
  readonly message: string;
}

// ── The SERVED-TRANSFORM probe (dev; #524) ───────────────────────────────────────────────────────────

/** What a served vite transform turned out to be, measured against the file on disk.
 *
 *  `fresh`        — what vite served was built from the bytes now on disk: the served transform's own
 *                   sourcemap carries the file verbatim (#2461). For a module served without a map, the
 *                   weaker fallback applies — every value export the disk file declares is present.
 *  `stale`        — the served transform was built from DIFFERENT bytes (or, on the fallback, is missing a
 *                   declared export): vite is serving a transform that predates the file on disk,
 *                   which is what a DEAD FILE WATCHER looks like from outside (the module cache never gets
 *                   invalidated, `touch` does nothing, and every page load white-screens on an import that
 *                   resolves to undefined). The whole point of the probe: `healthz ok` + `vite pid alive`
 *                   both stayed true for 24 minutes while the app was down.
 *  `unreachable`  — vite did not answer at all (it is down, or the module 404s). Not a staleness verdict.
 *  `unverifiable` — nothing to compare: no candidate source file, or none declaring a value export. An
 *                   honest "I could not measure", never folded into `fresh`. */
const SERVED_STATES = ["fresh", "stale", "unreachable", "unverifiable"] as const;
export type ServedState = (typeof SERVED_STATES)[number];

export interface ServedVerdict {
  readonly state: ServedState;
  /** The repo-relative module the probe compared, or `null` when there was nothing to compare. */
  readonly file: string | null;
  readonly message: string;
}

// ── The /api/_debug arming probe ─────────────────────────────────────────────────────────────────────

/** What an UNAUTHENTICATED `GET /api/_debug/info` tells us about the live instance's debug posture.
 *
 *  Since AUTHFIX-2 (2026-08-07) the expected answer from a plain dev stack is `token` (or `off`), NOT
 *  `open`. The gate's first arm requires an OWNER SESSION, and this probe deliberately presents none.
 *  OWNER, not admin, since the 2026-09-20 owner ruling that `admin` is delegated in-app authority rather
 *  than box-operator authority: a delegated admin is refused at every `/api/_debug/*` probe. The
 *  `x-debug-token` headless arm every tooling caller here uses is untouched by that ruling. */
/** `off` = 404, `DEBUG_TOKEN` unset and no owner session presented: the whole surface is off ·
 *  `token` = 401, the token gate is ARMED and we did not present one (the normal answer) ·
 *  `open` = 200, reachable with NO credential — post-AUTHFIX-2 this probe should never see it ·
 *  `unknown` = no answer at all. */
const DEBUG_POSTURES = ["off", "token", "open", "unknown"] as const;
export type DebugPosture = (typeof DEBUG_POSTURES)[number];

// ── `pnpm start` — the PORTABLE one-command production launcher (ops/start.ts) ───────────────────────

/** `--build` forces a client build, `--no-build` skips one; `auto` (neither flag) builds only when the
 *  bundle is missing or older than client/ui source. */
export const START_BUILD_MODES = ["auto", "force", "skip"] as const;
export type StartBuildMode = (typeof START_BUILD_MODES)[number];

export interface StartInvocation {
  readonly build: StartBuildMode;
}

export type StartParse = { readonly ok: true; readonly invocation: StartInvocation } | { readonly ok: false; readonly error: string };

export interface StartBuildDecision {
  readonly run: boolean;
  /** The ONE line the launcher prints about the build — why it is running one, or why it is not. */
  readonly reason: string;
}

/** How to run the operator's OWN pnpm from a child process with `shell: false`, on every platform.
 *    `node`    — `<node> <pnpm.cjs> <args>`: pnpm's own JS entry, run by the node we are already in. The
 *                only spelling that works unchanged on win32, where pnpm on PATH is `pnpm.cmd` and node
 *                refuses to spawn a `.cmd`/`.bat` without `shell: true`.
 *    `path`    — bare `pnpm` resolved by the OS execvp (POSIX only; no `.cmd` indirection there).
 *    `refused` — no usable pnpm could be named, and guessing would be a lie. `reason` is the fix. */
export type PnpmInvocation =
  | { readonly kind: "node"; readonly command: string; readonly args: readonly string[] }
  | { readonly kind: "path"; readonly command: string; readonly args: readonly string[] }
  | { readonly kind: "refused"; readonly reason: string };
