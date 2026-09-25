// stack's shapes: every decision the dev and prod supervisors, the fixture recipe and the production
// launcher make is typed here; the imperative half (spawn, signal, poll, probe) lives in ops/.
import type { NetworkInterfaceInfo } from "node:os";
import type { AuthMode } from "@orb/contracts/identity";
import type { PortPair } from "../../_shared/ports.ts";
import type { FullPriorityChild } from "../../_shared/proc-contract.ts";

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
  /** `--force`: `up`/`restart` stop whatever this checkout runs on the ports first, instead of refusing a busy port. */
  readonly force: boolean;
  /** Positional leftovers — `logs [server|client] [n]`. */
  readonly rest: readonly string[];
}

export type StackParse = { readonly ok: true; readonly invocation: StackInvocation } | { readonly ok: false; readonly error: string };

export const FIXTURE_VERBS = ["up", "down", "reset", "seed", "status"] as const;
export type FixtureVerb = (typeof FIXTURE_VERBS)[number];

/** What the one cli dispatches: a dev/prod stack verb, the production launcher with its own flags, a
 *  fixture verb, or the served-module probe a staged tree's caller runs by name. */
export type StackCommand =
  | { readonly kind: "stack"; readonly invocation: StackInvocation }
  | { readonly kind: "start"; readonly argv: readonly string[] }
  | { readonly kind: "fixture"; readonly verb: FixtureVerb }
  | { readonly kind: "served-probe" };

export type StackCommandParse = { readonly ok: true; readonly command: StackCommand } | { readonly ok: false; readonly error: string };

// ── The dev stack: pins, context, the leader record ──────────────────────────────────────────────────

/** The env keys the dev stack pins when the host leaves them unset: the auth mode, its dev-only secrets and
 *  the seed stamp. A host export wins; the pin fills the gap. */
export const DEV_PIN_KEYS = ["AUTH_FALLBACK", "AUTH_MODE", "SESSION_SECRET", "CREDENTIALS_KEY", "LOCAL_INITIAL_PASSWORD", "DEV_SEED"] as const;
export type DevPinKey = (typeof DEV_PIN_KEYS)[number];

export const PIN_SOURCES = ["host", "pinned"] as const;
export type PinSource = (typeof PIN_SOURCES)[number];

export interface DevPins {
  /** Every pin key with its effective value. */
  readonly env: Readonly<Record<DevPinKey, string>>;
  readonly sources: Readonly<Record<DevPinKey, PinSource>>;
}

export interface StackLogs {
  readonly stack: string;
  readonly server: string;
  readonly client: string;
}

/** One stack's whole address: where its record and logs live, which ports it binds, and the env its
 *  leader runs under. Built once from an env record, so the fixture and a sidecar thread their own. */
export interface StackContext {
  readonly repoRoot: string;
  /** Absolute; `STACK_RUN_DIR` relative to the repo root, else `<repo>/.cache/stack`. */
  readonly runDir: string;
  readonly ports: PortPair;
  readonly pins: DevPins;
  /** The env the leader inherits: the ambient env with the pins, the ports and the run dir applied. */
  readonly ambient: Readonly<Record<string, string | undefined>>;
  /** The keys a foreground leader publishes into its own process before it boots. */
  readonly launchEnv: Readonly<Record<string, string>>;
  readonly logs: StackLogs;
}

/** The leader's record, rewritten on every heartbeat. `pgid` is null on win32, which has no process group:
 *  there the recorded pids are the tree, stopped through `taskkill /T`. */
export interface LeaderRecord {
  readonly version: 2;
  readonly pid: number;
  readonly pgid: number | null;
  readonly launchId: string;
  readonly repoRoot: string;
  readonly runDir: string;
  readonly ports: PortPair;
  /** The server and vite children as spawned, in boot order. */
  readonly children: readonly number[];
  /** The printable pins' values and every pin's source, for `status`; secrets never land here. */
  readonly pins: { readonly values: Readonly<Partial<Record<DevPinKey, string>>>; readonly sources: Readonly<Record<DevPinKey, PinSource>> };
  readonly startedAt: string;
  /** Wall-clock ms of the last heartbeat; a leader whose beat stopped is stale whatever its pid says. */
  readonly beatMs: number;
}

/** What is on disk at the record path. */
export type LeaderRead =
  | { readonly kind: "absent" }
  | { readonly kind: "corrupt"; readonly path: string }
  | { readonly kind: "record"; readonly record: LeaderRecord };

/** The ownership verdict over a record and the live process table:
 *    `live`                     — the leader is ours and beating; signal its group.
 *    `stale-leader`             — the leader pid is ours but the beat stopped; signal its group.
 *    `departed-with-survivors`  — the leader is gone and the group still holds members.
 *    `departed`                 — the leader is gone and so is its group.
 *    `absent` / `corrupt`       — no record, or one that does not parse. */
export const LEADER_STATES = ["live", "stale-leader", "departed-with-survivors", "departed", "absent", "corrupt"] as const;
export type LeaderState = (typeof LEADER_STATES)[number];

/** The probes the verdict reads, injected so every state is provable without a process. `ownsPid` is
 *  "alive, and its command line names this checkout"; `groupHasMembers` asks the recorded group (POSIX) or
 *  the recorded pids (win32). */
export interface LeaderProbes {
  readonly now: number;
  readonly ownsPid: (pid: number) => boolean;
  readonly groupHasMembers: (record: LeaderRecord) => boolean;
  readonly staleAfterMs?: number;
}

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
  readonly debug: boolean;
  readonly repoRoot: string;
  readonly logPath: string;
}

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
 *  every probe can legitimately fail to answer (nothing listening, debug disarmed, an unnameable owner). */
export interface ObservedInstance {
  /** `/healthz` answered 200. NOT sufficient for identity — a stale incumbent answers too. */
  readonly healthy: boolean;
  /** `/healthz` body `harness` — true ⇒ a Playwright-owned stack (E2E_HARNESS=on). */
  readonly harness: boolean | null;
  /** The pid that owns the listening socket, or `/api/_debug/info`'s pid when armed. */
  readonly listenerPid: number | null;
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
  /** `--setup`: ask the setup questions again before starting, even when `.env` exists. */
  readonly setup: boolean;
  /** `--port <n>`: this launch only, never written to `.env`. `null` = the port `.env` or the default names. */
  readonly port: number | null;
  /** `--share`: this launch runs in `local` mode with a quick relay (plan easy-sharing section 6); `.env` is not written. */
  readonly share: boolean;
}

export type StartParse = { readonly ok: true; readonly invocation: StartInvocation } | { readonly ok: false; readonly error: string };

/** One launch of the server, rebuilt from `.env` on every supervised respawn (lib/start-plan.ts `startLaunch`). */
export interface StartLaunch {
  readonly plan: ProdSpawnPlan;
  /** The auth mode the server boots in, for the banner. */
  readonly mode: string;
  /** The single-user `AUTH_FALLBACK=owner` fill is on the child env. */
  readonly fallbackFilled: boolean;
}

/** The server child as the supervisor sees it: a signal target it can wait on. */
export type SupervisedChild = Pick<FullPriorityChild, "kill" | "wait">;

/** `pnpm start`'s supervisor, every effect injected (lib/supervisor.ts), so a test drives respawns without a spawn. */
export interface StartSupervisorDeps {
  /** The once-per-invocation pass before the loop (setup, build, bundle check): an exit code stops the launch. */
  readonly prepare: () => Promise<number | null>;
  /** Re-read `.env` and build this spawn's plan; called once per spawn. */
  readonly launch: () => ProdSpawnPlan;
  readonly spawn: (plan: ProdSpawnPlan) => SupervisedChild;
  /** Registers a process signal handler (`process.on` in a live launcher). */
  readonly register: (signal: NodeJS.Signals, handler: () => void) => void;
  readonly notice: (message: string) => void;
  /** `process.platform` in a live launcher; it decides whether a stop signal is sent on or only noted. */
  readonly platform: NodeJS.Platform;
}

export interface StartBuildDecision {
  readonly run: boolean;
  /** The ONE line the launcher prints about the build — why it is running one, or why it is not. */
  readonly reason: string;
}

// ── `pnpm start` setup — the questions that write `.env` (lib/setup-plan.ts, ops/setup.ts) ───────────

/** Who uses the box: `just-me` is single-user (no login, this machine only); `network` is a login mode. */
export const SETUP_AUDIENCES = ["just-me", "network"] as const;
export type SetupAudience = (typeof SETUP_AUDIENCES)[number];

/** How `network` users sign in: a password the app stores (`local`), or the operator's identity provider. */
export const SETUP_LOGINS = ["password", "sso"] as const;
export type SetupLogin = (typeof SETUP_LOGINS)[number];

export interface SetupAnswers {
  readonly port: number;
  readonly audience: SetupAudience;
  /** Asked only for `network`; `just-me` carries the default so a re-run can offer it. */
  readonly login: SetupLogin;
  /** The host names people type to reach the box, as the `ALLOWED_HOSTS` list; `null` = none to write (an
   *  IP address needs no entry). Asked only for `network`, pre-filled with this machine's own names. */
  readonly allowedHosts: string | null;
}

/** The values setup writes: exactly the keys it owns, nothing else. */
export interface SetupValues {
  readonly port: number;
  readonly authMode: AuthMode;
  /** SSO was chosen but no SSO mode is configured yet: `authMode` is `local` until the operator adds the
   *  identity provider's keys, which setup never collects. */
  readonly ssoPending: boolean;
  /** `null` leaves `ALLOWED_HOSTS` in `.env` exactly as it is. */
  readonly allowedHosts: string | null;
}

/** What `pnpm start` does about `.env` before it starts.
 *    `keep`     — `.env` exists and `--setup` was not given: use it as it is.
 *    `ask`      — ask the questions (a first run in a terminal, or `--setup` in a terminal).
 *    `defaults` — no `.env` and no terminal to ask in: boot on the built-in defaults and write nothing.
 *    `refuse`   — `--setup` with no terminal: there is no one to ask. */
const SETUP_DECISIONS = ["keep", "ask", "defaults", "refuse"] as const;
export type SetupDecision = (typeof SETUP_DECISIONS)[number];

/** How a setup pass ended. `written` carries the values now in `.env`; `cancelled` wrote nothing. */
export type SetupResult =
  | { readonly kind: "keep" }
  | { readonly kind: "defaults" }
  | { readonly kind: "refuse" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "written"; readonly values: SetupValues };

/** One setup pass's inputs. The streams are injected so a test drives the questions with scripted answers. */
export interface SetupRunOpts {
  readonly envPath: string;
  /** `--setup` was given. */
  readonly setup: boolean;
  /** Both stdin and stdout are a terminal, so there is someone to ask. */
  readonly interactive: boolean;
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  /** The launcher's own env: a key `.env` leaves unset is offered from here. */
  readonly ambient: Readonly<Record<string, string | undefined>>;
  readonly machine: SetupMachine;
}

/** What setup reads about this machine to pre-fill the address question (`node:os` in production). */
export interface SetupMachine {
  readonly hostname: string;
  readonly interfaces: NodeJS.Dict<readonly NetworkInterfaceInfo[]>;
  /** Running inside WSL2, whose own addresses other devices cannot reach without Windows port forwarding. */
  readonly wsl: boolean;
}

/** How another device reaches the box at a URL: `lan` always works on the same network, `tailnet` only from the
 *  operator's tailnet, and `mdns` only where `.local` names resolve. */
const SETUP_URL_KINDS = ["lan", "tailnet", "mdns"] as const;
export type SetupUrlKind = (typeof SETUP_URL_KINDS)[number];

export interface SetupUrl {
  readonly url: string;
  readonly kind: SetupUrlKind;
}

/** A parsed answer: the value, or the one-line reason the question is asked again. */
export type AnswerParse<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };
