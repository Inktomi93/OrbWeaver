// ── stack-mode: the PURE half of mode-aware stack control ────────────────────────────────────────────
//
// WHY THIS EXISTS: `pnpm stack` supervised exactly one thing — the DEV stack. Launching PRODUCTION was a
// hand-rolled incantation an operator retyped from a doc (`setsid nohup env NODE_ENV=production node …`,
// with two silent cwd traps, pid-hunting through `ss`, a manual drain-watch and no supervisor), and
// "debug mode" was hand-EDITING `.env` to add DEBUG_TOKEN/WIRE_CAPTURE and remembering to strip the lines
// afterwards. Both are now verbs: `pnpm stack up prod`, `pnpm stack up --debug`.
//
// This module owns every DECISION that shape needs — argv → invocation, the debug env overlay + its
// `.env` precedence conflict, the prod spawn plan (argv + env + cwd + log), the pidfile record codec,
// instance-IDENTITY classification, client-dist freshness, drain classification. All pure and
// unit-tested (tests/tooling/stack-mode.test.ts). The imperative half — spawn/kill/poll/probe — is
// `scripts/dev/stack-prod.ts`, and the dev half stays `scripts/dev/stack.sh` byte-for-byte.
//
// Dev tooling (throwaway launcher; global KISS applies — NOT the architecture), same status as
// scripts/dev/engines.ts.
//
// ── THE THREE LAWS THIS FILE ENCODES ────────────────────────────────────────────────────────────────
//
// 1. NO SERVER BUILD STEP, EVER. node 26 runs `.ts` source directly (native type stripping; tsx was shed
//    2026-08-03). `buildProdSpawnPlan` therefore emits `node <repo>/packages/server/src/entry/index.ts`
//    and nothing else — no loader flag, no emit, no bundle, no dist path for the SERVER. The only build
//    artifact in this repo is @orb/client's `vite build` output. The argv snapshot test pins that.
//
// 2. A HEALTH CHECK VALIDATES THE PORT, NOT YOUR PROCESS. A stale incumbent answers `/healthz` happily.
//    Adopt/stop decisions run through `classifyInstance`, which needs an INSTANCE IDENTITY: the pid the
//    port's listener actually belongs to (or `/api/_debug/info`'s `pid` when the debug surface is armed),
//    matched against the pidfile record INCLUDING /proc start-ticks so pid reuse cannot spoof it.
//
// 3. AN E2E/SNAP/CT STACK IS NOT THE STACK. Five other things in this repo spawn a server or a vite on
//    this box (see STACK_SPAWNERS). `/healthz` carries `harness:true` for a Playwright-owned stack — we
//    never adopt one and never kill one out from under a running battery.

// ── The spawner census (reference data; `status` uses it to NAME a foreign listener) ─────────────────

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

/** Every stack-shaped spawner in this repo, with its ports. Sources: scripts/dev/stack.sh (dev),
 *  scripts/probes/_kit/snap-stage.ts (snap stage offsets), scripts/dev/multi-user-fixture.sh,
 *  tests/e2e/support/modes.ts (the three auth-mode projects + the fixture provider), playwright-ct.config.ts.
 *  PROD deliberately shares the dev SERVER port: they are two ways to serve the same app on this box and
 *  must never run at once — `classifyInstance` turns that into a loud refusal instead of a race. */
export const STACK_SPAWNERS: readonly StackSpawner[] = [
  { name: "dev stack (pnpm stack up)", serverPort: 8788, vitePort: 5173, discriminator: "DEV_SEED=on; pidfile .cache/stack/stack.pgid" },
  { name: "prod stack (pnpm stack up prod)", serverPort: 8788, vitePort: null, discriminator: "NODE_ENV=production; pidfile .cache/stack/prod.json; no vite" },
  { name: "vLLM engine fleet", serverPort: null, vitePort: null, discriminator: "ports 8701/8702/8703; pidfile .cache/stack/engines.pgid" },
  { name: "multi-user fixture", serverPort: 8790, vitePort: 5175, discriminator: "AUTH_MODE=local; STACK_RUN_DIR=.cache/multi-user/stack" },
  { name: "e2e single-user", serverPort: 8796, vitePort: 5181, discriminator: "healthz harness:true (E2E_HARNESS=on); start-fg, no pidfile" },
  { name: "e2e fixture provider", serverPort: 8797, vitePort: null, discriminator: "scripted BYO provider, not an orbweaver server" },
  { name: "e2e forward-header", serverPort: 8798, vitePort: 5182, discriminator: "healthz harness:true; start-fg, no pidfile" },
  { name: "e2e local", serverPort: 8799, vitePort: 5183, discriminator: "healthz harness:true; start-fg, no pidfile" },
  {
    name: "snap --isolated/--dirty stage",
    serverPort: 8888,
    vitePort: 5273,
    discriminator: "runs from .cache/snap-stage/<sha>; its OWN pidfile under that tree",
  },
  { name: "playwright-ct", serverPort: null, vitePort: 3100, discriminator: "vite only — no orbweaver server exists in a CT run" },
];

/** Name the known spawner that owns a port, for a legible "not yours" message. */
export function spawnerForPort(port: number): StackSpawner | undefined {
  return STACK_SPAWNERS.find((s) => s.serverPort === port || s.vitePort === port);
}

// ── Invocation ───────────────────────────────────────────────────────────────────────────────────────

export const STACK_MODES = ["dev", "prod"] as const;
export type StackMode = (typeof STACK_MODES)[number];

export const STACK_VERBS = ["up", "down", "restart", "status", "logs", "up-fg", "_leader"] as const;
export type StackVerb = (typeof STACK_VERBS)[number];

/** `start`/`stop` are the ORIGINAL spellings and stay first-class forever: playwright's webServer
 *  (`stack.sh start-fg`), snap-stage's boot/teardown and multi-user-fixture.sh all call them by name.
 *  `up`/`down` are the owner-facing spelling added with modes.
 *
 *  `up-fg` (`start-fg`) and `_leader` are DEV-ONLY internals — the Playwright webServer entrypoint and
 *  the setsid re-exec target. They live in this table because `stack.sh` classifies EVERY invocation
 *  through this one parser (see `formatDispatch`); a verb the parser does not know must exit 2, and
 *  these two are known-and-dev-only rather than unknown. */
const VERB_ALIASES: Readonly<Record<string, StackVerb>> = {
  up: "up",
  start: "up",
  down: "down",
  stop: "down",
  restart: "restart",
  "force-restart": "restart",
  status: "status",
  logs: "logs",
  "start-fg": "up-fg",
  _leader: "_leader",
};

/** The dev-only verbs: they have no prod implementation at all (prod has no vite to foreground and no
 *  setsid leader — the supervisor detaches the server itself). */
const DEV_ONLY_VERBS: ReadonlySet<StackVerb> = new Set<StackVerb>(["up-fg", "_leader"]);

/** The `stack.sh` case-label each verb maps back to. The shell no longer classifies anything itself —
 *  it asks this parser and switches on the answer, so there is exactly ONE grammar and the tests that
 *  pin `parseStackArgv` pin the shell's behavior too. */
const VERB_TO_SHELL_LABEL: Readonly<Record<StackVerb, string>> = {
  up: "start",
  down: "stop",
  restart: "restart",
  status: "status",
  logs: "logs",
  "up-fg": "start-fg",
  _leader: "_leader",
};

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

/** argv (WITHOUT the node/script prefix) → an invocation. Grammar:
 *    `<verb> [mode] [--debug] [--build] [--force] [rest…]`
 *  A bare `pnpm stack` is `status dev` (the pre-existing default). Mode is positional and OPTIONAL, so
 *  every call that existed before modes (`stack start`, `stack restart --force`, `stack logs server 80`)
 *  parses to exactly what it did before. */
export function parseStackArgv(argv: readonly string[]): StackParse {
  if (argv.length === 0) {
    return { ok: true, invocation: { verb: "status", mode: "dev", debug: false, build: false, force: false, rest: [] } };
  }
  const [rawVerb, ...tail] = argv;
  const verb = VERB_ALIASES[rawVerb ?? ""];
  if (verb === undefined) {
    return { ok: false, error: `unknown verb '${rawVerb ?? ""}' — expected one of ${Object.keys(VERB_ALIASES).join(" | ")}` };
  }
  // `force-restart` is the standing alias for `restart --force`; keep its flag implied.
  const tailParse = parseTail(tail, rawVerb === "force-restart");
  if (!tailParse.ok) {
    return tailParse;
  }
  const { mode, debug, build, force, rest } = tailParse;
  if (build && mode !== "prod") {
    return { ok: false, error: "--build is prod-only: dev mode serves the client through the vite dev server, which needs no bundle" };
  }
  if (mode === "prod" && DEV_ONLY_VERBS.has(verb)) {
    return {
      ok: false,
      error: `'${rawVerb ?? ""}' is dev-only: prod has no foreground vite to own and no setsid leader (the prod supervisor detaches the server itself)`,
    };
  }
  if (force && mode === "prod") {
    // The dev `--force` NUKES the port holders AND the detached vLLM fleet, ignoring ownership. Prod has
    // no such verb by design — its whole safety story is that it only ever signals an instance whose
    // IDENTITY it proved. Silently dropping the flag would be the same class of defect as falling
    // through to dev: the operator asked for something destructive and would get something else.
    return {
      ok: false,
      error: "--force is dev-only: the prod supervisor never kills a process it cannot prove is its own. Stop the port holder yourself, then `stack up prod`",
    };
  }
  return { ok: true, invocation: { verb, mode, debug, build, force, rest } };
}

/** The shell contract: `stack.sh` execs `stack-prod.ts classify -- "$@"` and switches on these lines
 *  instead of re-implementing the grammar in bash. `rest` is emitted one line per argument so a value
 *  containing spaces survives; every line is `key=value` and the reader splits on the FIRST `=`. */
export function formatDispatch(invocation: StackInvocation): string {
  return [
    `verb=${VERB_TO_SHELL_LABEL[invocation.verb]}`,
    `mode=${invocation.mode}`,
    `debug=${invocation.debug ? "1" : ""}`,
    `build=${invocation.build ? "1" : ""}`,
    `force=${invocation.force ? "1" : ""}`,
    ...invocation.rest.map((arg) => `rest=${arg}`),
    "",
  ].join("\n");
}

/** The usage line — one home, printed by the shell's `*)` arm AND by every parser refusal. */
export const STACK_USAGE =
  "usage: stack.sh {up|start|start-fg|down|stop|restart [--force]|force-restart|status|logs [server|client] [n]} [dev|prod] [--debug] [--build]";

type TailParse =
  | { readonly ok: true; readonly mode: StackMode; readonly debug: boolean; readonly build: boolean; readonly force: boolean; readonly rest: readonly string[] }
  | { readonly ok: false; readonly error: string };

/** The post-verb argument sweep: the optional positional mode, the three flags, and everything else as
 *  passthrough. An unrecognised `--flag` is an ERROR, never a silently-ignored word. */
function parseTail(tail: readonly string[], forcedByVerb: boolean): TailParse {
  let mode: StackMode = "dev";
  let debug = false;
  let force = forcedByVerb;
  let build = false;
  let modeSeen = false;
  const rest: string[] = [];
  for (const arg of tail) {
    if (arg === "--debug") {
      debug = true;
    } else if (arg === "--build") {
      build = true;
    } else if (arg === "--force") {
      force = true;
    } else if (!modeSeen && isStackMode(arg)) {
      mode = arg;
      modeSeen = true;
    } else if (arg.startsWith("--")) {
      return { ok: false, error: `unknown flag '${arg}' — expected --debug | --build | --force` };
    } else {
      rest.push(arg);
    }
  }
  return { ok: true, mode, debug, build, force, rest };
}

function isStackMode(value: string): value is StackMode {
  return (STACK_MODES as readonly string[]).includes(value);
}

// ── The debug overlay ────────────────────────────────────────────────────────────────────────────────

/** The env keys `--debug` arms — every debug-surface knob `foundation/env` declares.
 *  `DEBUG_TOKEN` gates /api/_debug/* · `WIRE_CAPTURE` records outbound provider request bodies ·
 *  `RPG_TRACE` wires the rpg flight recorder read at /api/_debug/rpg/traces (LIVE — wired through
 *  entry/compose/services.ts → lifecycle.ts → app.ts; the handoff doc's old "dead knob" note is stale). */
export const DEBUG_ENV_KEYS = ["DEBUG_TOKEN", "WIRE_CAPTURE", "RPG_TRACE"] as const;
export type DebugEnvKey = (typeof DEBUG_ENV_KEYS)[number];

/** The value each non-token debug knob is armed to. `DEBUG_TOKEN` carries a minted secret instead. */
const DEBUG_ON_VALUES: Readonly<Record<Exclude<DebugEnvKey, "DEBUG_TOKEN">, string>> = { WIRE_CAPTURE: "on", RPG_TRACE: "on" };

export interface DebugConflict {
  readonly key: DebugEnvKey;
  readonly fileValue: string;
  readonly wanted: string;
}

/** The `wanted` placeholder for a DEBUG_TOKEN conflict. A conflict message names the file value and the
 *  wanted value; for the token the wanted value is a SECRET, so it is described, never printed
 *  ([[credential-display-response-echo-leak]]). */
const TOKEN_WANTED = "<a minted token — never printed>";

export type DebugArming =
  | { readonly kind: "armed"; readonly overlay: Readonly<Record<string, string>>; readonly token: string; readonly notes: readonly string[] }
  | { readonly kind: "refused"; readonly conflicts: readonly DebugConflict[] };

/** Decide what `--debug` actually arms, given what the repo `.env` already declares.
 *
 *  THE PRECEDENCE FACT THIS EXISTS FOR: `foundation/env` loads `.env` with **override:true** — a key in
 *  the file BEATS the process env we spawn with (deliberate; the dev stack pins model/port/posture there
 *  and a stale shell export must not win). So an overlay for a key the file already declares is a SILENT
 *  NO-OP. Three arms, no silence:
 *    • file declares the SAME armed value  → adopt it, note the arming SOURCE (`.env`, not the overlay).
 *    • file declares a DIFFERENT value     → REFUSE with the exact fix. `--debug` must never be a placebo.
 *    • file is silent                      → the overlay arms it, and nothing is written to `.env`. */
export function resolveDebugArming(opts: { readonly fileEnv: Readonly<Record<string, string | undefined>>; readonly token: string }): DebugArming {
  const conflicts: DebugConflict[] = [];
  const notes: string[] = [];
  const overlay: Record<string, string> = {};
  let token = opts.token;

  const fileToken = opts.fileEnv["DEBUG_TOKEN"];
  if (fileToken === undefined) {
    overlay["DEBUG_TOKEN"] = token;
  } else if (fileToken.length > 0) {
    // A token in the file wins by precedence, so ADOPT it as the effective token rather than arming a
    // second one the server would ignore. Never echoed — only its source is reported.
    token = fileToken;
    notes.push("DEBUG_TOKEN: already declared in .env — using that token (the file wins over any overlay).");
  } else {
    // A bare `DEBUG_TOKEN=` line parses to the EMPTY STRING, not to absence — and `loadEnvFileWithOverride`
    // overrides on `value !== undefined`, so that empty value beats our overlay and the schema's
    // `.min(1).optional()` then leaves the surface OFF. Treating empty as absence is precisely the silent
    // placebo this refusal exists to prevent, so an empty file value is a CONFLICT like any other.
    conflicts.push({ key: "DEBUG_TOKEN", fileValue: "", wanted: TOKEN_WANTED });
  }

  for (const [key, wanted] of Object.entries(DEBUG_ON_VALUES)) {
    const fileValue = opts.fileEnv[key];
    if (fileValue === undefined) {
      overlay[key] = wanted;
    } else if (fileValue === wanted) {
      notes.push(`${key}: already ${wanted} in .env — armed by the file, not by --debug.`);
    } else {
      conflicts.push({ key: key as DebugEnvKey, fileValue, wanted });
    }
  }
  return conflicts.length > 0 ? { kind: "refused", conflicts } : { kind: "armed", overlay, token, notes };
}

/** The operator-facing refusal text for a `.env` conflict. Names the file values, never the token. */
export function debugConflictMessage(conflicts: readonly DebugConflict[]): string {
  const lines = conflicts.map((c) => `  .env declares ${c.key}=${c.fileValue}, but --debug needs ${c.key}=${c.wanted}`);
  return [
    "--debug REFUSED: the repo .env already pins a debug knob to a different value.",
    ...lines,
    "",
    "foundation/env loads .env with override:true, so the file WINS over the spawn env — arming it here",
    "would be a silent no-op. Delete the conflicting line(s) from .env; --debug then arms them per-launch",
    "with no file edit at all (which is the whole point of the flag).",
  ].join("\n");
}

/** Strip every debug key from an inherited env. Used when `--debug` is ABSENT: a stray `export
 *  WIRE_CAPTURE=on` in the operator's shell must not silently arm a production launch. `.env` is
 *  untouched by this — a knob declared in the file is deploy config and still applies. */
export function stripDebugEnv(base: Readonly<Record<string, string | undefined>>): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && !(DEBUG_ENV_KEYS as readonly string[]).includes(key)) {
      out[key] = value;
    }
  }
  return out;
}

// ── The prod spawn plan ──────────────────────────────────────────────────────────────────────────────

/** The server entry, repo-root-relative. There is NO build step: node 26 runs this `.ts` file directly. */
export const SERVER_ENTRY_REL = "packages/server/src/entry/index.ts";
/** The built client bundle the prod SPA registrar serves (`CLIENT_DIST_DIR`'s default, cwd-relative there). */
export const CLIENT_DIST_REL = "packages/client/dist";
/** `resolveSpaDistDir` throws at boot in production when this file is missing (entry/http/spa.ts). */
export const CLIENT_DIST_INDEX_REL = `${CLIENT_DIST_REL}/index.html`;

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

/** Build the exact spawn the manual incantation performed — `NODE_ENV=production node <entry>.ts`, at the
 *  repo root, appending to the prod log — plus (only) the debug overlay when asked. */
export function buildProdSpawnPlan(opts: ProdSpawnPlanOpts): ProdSpawnPlan {
  const inherited = opts.debugOverlay === undefined ? stripDebugEnv(opts.baseEnv) : materialize(opts.baseEnv);
  return {
    command: opts.nodePath,
    args: [`${opts.repoRoot}/${SERVER_ENTRY_REL}`],
    env: { ...inherited, NODE_ENV: "production", ...(opts.debugOverlay ?? {}) },
    cwd: opts.repoRoot,
    logPath: opts.logPath,
  };
}

function materialize(base: Readonly<Record<string, string | undefined>>): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

// ── The pidfile record ───────────────────────────────────────────────────────────────────────────────

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

export function serializeProdRecord(record: ProdRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

/** Parse a pidfile. A truncated/garbage file (a killed mid-write) is `null` — treated as "no record",
 *  never as a crash, exactly like snap-stage's `readActive`. */
export function parseProdRecord(text: string): ProdRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const r = parsed as Partial<Record<keyof ProdRecord, unknown>>;
  if (r.mode !== "prod" || typeof r.pid !== "number" || typeof r.port !== "number") {
    return null;
  }
  return {
    mode: "prod",
    pid: r.pid,
    pgid: typeof r.pgid === "number" ? r.pgid : r.pid,
    port: r.port,
    startedAt: typeof r.startedAt === "string" ? r.startedAt : "",
    startTicks: typeof r.startTicks === "string" ? r.startTicks : "",
    debug: r.debug === true,
    repoRoot: typeof r.repoRoot === "string" ? r.repoRoot : "",
    logPath: typeof r.logPath === "string" ? r.logPath : "",
  };
}

/** What a launcher does when the atomic `wx` create of the spawn lock FAILED — i.e. somebody else holds
 *  it. `retake` = the file vanished between the failed create and our read (a racing release), so try the
 *  create again. `refuse` = a live launcher owns the window; this `up` is a no-op. `break-stale` = the
 *  holder pid is dead, so the lock is a crashed launcher's leftover and gets removed loudly.
 *
 *  The window this protects: the adopt/refuse decision and the spawn are separate syscalls, so two
 *  `up prod` runs can both read "port free" and both spawn. The loser dies on EADDRINUSE — but only
 *  after clobbering the winner's pidfile. Same class the engines launcher paid for with a duplicate
 *  vLLM fleet (scripts/dev/engines.ts `acquireBootLock`). */
export type SpawnLockAction = "retake" | "refuse" | "break-stale";

/** What the lock file's CONTENT turned out to be. Three outcomes, not two — conflating them is what
 *  wedged the lock:
 *    `vanished`    — the file disappeared between the failed `wx` create and our read (a racing release).
 *    `unparseable` — empty, whitespace, non-numeric, or a non-positive / non-integer "pid". A crash or a
 *                    short write between `wx` and the write leaves exactly this, and it is a REAL window.
 *    `pid`         — a plausible process id we can actually probe.  */
export type LockHolder =
  | { readonly kind: "vanished" }
  | { readonly kind: "unparseable"; readonly raw: string }
  | { readonly kind: "pid"; readonly pid: number };

/** Read the lock file's content into a `LockHolder`. `null` raw = the read threw (file gone).
 *
 *  THE TRAP THIS CLOSES: the old code did `Number(readFileSync(...).trim())` and fed the result straight
 *  to a liveness probe. `Number("") === 0`, and **`process.kill(0, 0)` signals the caller's own process
 *  GROUP, so it always succeeds** — an empty lock file therefore read as "a live launcher (pid 0) holds
 *  the lock", and `up prod` became a permanent no-op until a human deleted the file. `0` is never a pid
 *  here; neither is a negative number (that is a process GROUP in kill(2)) nor a fractional value. */
export function parseLockHolder(raw: string | null): LockHolder {
  if (raw === null) {
    return { kind: "vanished" };
  }
  const trimmed = raw.trim();
  const pid = Number(trimmed);
  if (trimmed.length === 0 || !Number.isInteger(pid) || pid <= 0) {
    return { kind: "unparseable", raw: trimmed };
  }
  return { kind: "pid", pid };
}

/** The action after the atomic `wx` create FAILED — somebody, or something, holds the lock.
 *
 *  An UNPARSEABLE holder is a STALE lock, never a live one: nobody can be waited on, so the only
 *  non-wedging move is to break it loudly and retake. (It used to return `retake`, which left the file
 *  in place — the retry's `wx` failed again and the loop gave up with "another launcher won the race",
 *  so the lock was never removed and every later `up prod` no-opped too.) */
export function decideSpawnLock(holder: LockHolder, holderAlive: boolean): SpawnLockAction {
  switch (holder.kind) {
    case "vanished":
      return "retake";
    case "unparseable":
      return "break-stale";
    default:
      return holderAlive ? "refuse" : "break-stale";
  }
}

/** How a holder is named in an operator-facing log line. */
export function lockHolderText(holder: LockHolder): string {
  switch (holder.kind) {
    case "vanished":
      return "none (the lock file vanished mid-read)";
    case "unparseable":
      return `unparseable content ${JSON.stringify(holder.raw)}`;
    default:
      return `pid ${holder.pid}`;
  }
}

/** May THIS launcher delete the pidfile after its own spawn failed?
 *
 *  ONLY when the record on disk is still the one it wrote. Two overlapping `up prod` runs race: the
 *  loser's child dies on EADDRINUSE, and an UNCONDITIONAL unlink on that failure path would delete the
 *  WINNER's record — after which `down prod` reads no record, classifies the live instance as `foreign`,
 *  and REFUSES to stop the very server this tool started. (The spawn window is also locked; this guard
 *  is the second belt, for a lock broken as stale or a crash between spawn and write.) */
export function mayRemovePidfile(record: ProdRecord | null, myChildPid: number): boolean {
  return record !== null && record.pid === myChildPid;
}

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

export type InstanceVerdict =
  /** Our recorded instance is alive, healthy and verified by identity — `up` is a no-op. */
  | "ours-healthy"
  /** Our record's process is alive but not answering — a boot in progress or a wedged instance. */
  | "ours-unhealthy"
  /** Something answers the port and it is NOT ours. Never adopt, never kill. */
  | "foreign"
  /** Something answers the port and it stamps itself as a Playwright harness. Hands off, always. */
  | "harness"
  /** Nothing holds the port; any record is stale. */
  | "absent";

export interface InstanceClassification {
  readonly verdict: InstanceVerdict;
  readonly reason: string;
}

/** THE identity decision — [[health-check-validates-the-port-not-your-process]] in code.
 *
 *  Order matters: the harness stamp is checked FIRST (a battery-owned stack must be untouchable even if
 *  something about our record coincidentally matched), then pid identity, then start-ticks. */
export function classifyInstance(opts: {
  readonly record: ProdRecord | null;
  readonly observed: ObservedInstance;
  /** Is the recorded pid still a live process? (`process.kill(pid, 0)`) */
  readonly recordProcessAlive: boolean;
}): InstanceClassification {
  const { record, observed } = opts;
  if (observed.harness === true) {
    return {
      verdict: "harness",
      reason: "the port is held by a Playwright harness stack (/healthz reports harness:true) — never adopted, never stopped by this tool",
    };
  }
  if (observed.listenerPid === null && !observed.healthy) {
    return { verdict: "absent", reason: "nothing is listening on the port" };
  }
  if (record === null) {
    return { verdict: "foreign", reason: `the port is held by pid ${observed.listenerPid ?? "?"} and there is no prod pidfile — this tool did not start it` };
  }
  if (!opts.recordProcessAlive) {
    return observed.listenerPid === null
      ? { verdict: "absent", reason: `the recorded pid ${record.pid} is gone and nothing holds the port — stale pidfile` }
      : {
          verdict: "foreign",
          reason: `the recorded pid ${record.pid} is gone but pid ${observed.listenerPid ?? "?"} holds the port — a different process took it`,
        };
  }
  if (observed.listenerPid !== null && observed.listenerPid !== record.pid) {
    return { verdict: "foreign", reason: `the port is held by pid ${observed.listenerPid}, but our record says pid ${record.pid}` };
  }
  if (record.startTicks !== "" && observed.listenerStartTicks !== null && observed.listenerStartTicks !== record.startTicks) {
    return { verdict: "foreign", reason: `pid ${record.pid} matches but its start time does not — the pid was recycled by an unrelated process` };
  }
  return observed.healthy
    ? { verdict: "ours-healthy", reason: `pid ${record.pid} verified by identity and answering /healthz` }
    : { verdict: "ours-unhealthy", reason: `pid ${record.pid} is alive but /healthz is not answering (still booting, or wedged)` };
}

export type UpAction = "spawn" | "adopt" | "refuse";

/** `up` on an already-verified-healthy instance is a NO-OP REPORT, never a second spawn (the engines
 *  launcher paid for this exact class — a duplicate fleet that loaded models and served nothing). */
export function decideUp(classification: InstanceClassification): { readonly action: UpAction; readonly reason: string } {
  switch (classification.verdict) {
    case "ours-healthy":
      return { action: "adopt", reason: classification.reason };
    case "absent":
      return { action: "spawn", reason: classification.reason };
    default:
      return { action: "refuse", reason: classification.reason };
  }
}

/** `down`/`restart` may only signal an instance whose identity we PROVED. `ours-unhealthy` counts: a
 *  wedged instance of ours is exactly the thing an operator needs to be able to stop. */
export function decideDown(classification: InstanceClassification): { readonly action: "stop" | "noop" | "refuse"; readonly reason: string } {
  switch (classification.verdict) {
    case "ours-healthy":
    case "ours-unhealthy":
      return { action: "stop", reason: classification.reason };
    case "absent":
      return { action: "noop", reason: classification.reason };
    default:
      return { action: "refuse", reason: classification.reason };
  }
}

// ── Shutdown drain ───────────────────────────────────────────────────────────────────────────────────

/** MIRRORS `SHUTDOWN_DRAIN_MS` in packages/server/src/entry/lifecycle.ts (not exported from the package,
 *  so it is restated here and PINNED by a test that reads that file — a drift makes the test red, not the
 *  operator's restart hang). */
export const SERVER_DRAIN_MS = 10_000;
/** Margin over the server's own bounded drain before we escalate. The drain force-closes at its deadline
 *  and logs a warn, so anything past `drain + margin` is a process that is not going to exit on its own. */
export const DRAIN_MARGIN_MS = 5000;
export const DRAIN_WATCH_MS = SERVER_DRAIN_MS + DRAIN_MARGIN_MS;

export type DrainOutcome = "complete" | "deadline-hit" | "pending";

/** Classify the tail of the prod log written SINCE the SIGTERM. `deadline-hit` is a real outcome, not a
 *  failure: the drain force-closed a long-lived SSE stream at 10s and said so (a warn, because a client
 *  saw a truncated stream) — expected during a deploy. */
export function classifyDrainTail(tail: string): DrainOutcome {
  if (tail.includes("shutdown: complete")) {
    return "complete";
  }
  if (tail.includes("shutdown: drain deadline hit")) {
    return "deadline-hit";
  }
  return "pending";
}

// ── Client-dist freshness ────────────────────────────────────────────────────────────────────────────

export type DistState = "missing" | "stale" | "fresh";

export interface DistVerdict {
  readonly state: DistState;
  readonly message: string;
}

/** Prod boot is FATAL without `dist/index.html` (`resolveSpaDistDir` throws, entry/http/spa.ts) — so a
 *  missing bundle must be caught BEFORE the old instance is stopped, and reported as the command that
 *  fixes it rather than as a dead boot in a log file. Staleness is a WARN only: an operator restarting to
 *  pick up a server-only change legitimately has an older bundle, and node runs server `.ts` directly, so
 *  no server change can ever require a build.
 *
 *  `null` mtimes mean "not found". Vite writes `manifest:false` here deliberately (client vite.config.ts:
 *  Hono serves index.html as-is), so mtimes ARE the instrument — there is no manifest to read. */
export function classifyDist(opts: { readonly distIndexMtimeMs: number | null; readonly newestSourceMtimeMs: number | null }): DistVerdict {
  if (opts.distIndexMtimeMs === null) {
    return {
      state: "missing",
      message: `no ${CLIENT_DIST_INDEX_REL} — production boot would throw at startup. Run: pnpm --filter @orb/client build   (or re-run with --build)`,
    };
  }
  if (opts.newestSourceMtimeMs !== null && opts.newestSourceMtimeMs > opts.distIndexMtimeMs) {
    return {
      state: "stale",
      message:
        "client bundle is OLDER than client/ui source — the served UI predates your changes. Rebuild with --build (server-only changes need no build: node runs .ts directly)",
    };
  }
  return { state: "fresh", message: "client bundle is newer than client/ui source" };
}

// ── the /api/_debug arming probe ─────────────────────────────────────────────────────────────────────

/** What an UNAUTHENTICATED `GET /api/_debug/info` tells us about the live instance's debug posture.
 *
 *  Since AUTHFIX-2 (2026-08-07) the expected answer from a plain dev stack is `token` (or `off`), NOT `open`.
 *  The gate's first arm requires an admin SESSION — a validated cookie or a verified SSO identity — and this
 *  probe deliberately presents neither. It used to read `open` on any single-user stack because that arm
 *  admitted the un-credentialed owner fallback; that was the hole, not a feature. `open` now means a real
 *  admin cookie rode the probe, which for this un-credentialed fetch means: investigate. */
export type DebugPosture =
  /** 404 — `DEBUG_TOKEN` unset and the caller presented no admin session: the whole surface is off. */
  | "off"
  /** 401 — the token gate is ARMED and we did not present one. The normal answer for an armed stack. */
  | "token"
  /** 200 — reachable with no credential at all. Post-AUTHFIX-2 this should be unreachable for this probe. */
  | "open"
  /** No answer at all. */
  | "unknown";

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

export function classifyDebugPosture(status: number | null): DebugPosture {
  switch (status) {
    case HTTP_NOT_FOUND:
      return "off";
    case HTTP_UNAUTHORIZED:
      return "token";
    case HTTP_OK:
      return "open";
    default:
      return "unknown";
  }
}

export function debugPostureText(posture: DebugPosture, tokenPath: string): string {
  switch (posture) {
    case "token":
      return `ARMED (token gate) — token in ${tokenPath} (value never printed)`;
    case "open":
      return "⚠ reachable with NO credential — expected 401/404 since AUTHFIX-2; investigate the debug gate";
    case "off":
      return "off (DEBUG_TOKEN unset and no admin session — /api/_debug/* 404s)";
    default:
      return "unknown (no live instance answering)";
  }
}

// ── ss parsing ───────────────────────────────────────────────────────────────────────────────────────

const SS_PID_RE = /pid=(\d+)/u;
const WHITESPACE_RE = /\s+/u;
// ss -ltn columns: State Recv-Q Send-Q Local-Address:Port Peer-Address:Port [Process]
const SS_LOCAL_ADDRESS_COLUMN = 3;
// After "pid (comm)" the remaining /proc/<pid>/stat fields start at field 3, so starttime (field 22)
// sits at index 19 of the post-comm remainder.
const PROC_STARTTIME_INDEX = 19;

/** Pull the listening pid for `port` out of `ss -ltnp` output. Matches on the LOCAL address column ending
 *  in `:<port>` so `:8788` never matches a peer address or `:87880`. */
export function parseListenerPid(ssOutput: string, port: number): number | null {
  for (const line of ssOutput.split("\n")) {
    const columns = line.trim().split(WHITESPACE_RE);
    const local = columns[SS_LOCAL_ADDRESS_COLUMN];
    if (local === undefined || !local.endsWith(`:${port}`)) {
      continue;
    }
    const match = SS_PID_RE.exec(line);
    if (match?.[1] !== undefined) {
      return Number(match[1]);
    }
    return null; // listening, but the owner is another user's process (no pid= without privileges)
  }
  return null;
}

/** /proc/<pid>/stat field 22 (starttime). The comm field can contain spaces AND parens, so the split is
 *  anchored on the LAST `)` — the classic /proc parse bug this avoids by construction. */
export function parseProcStartTicks(statLine: string): string | null {
  const close = statLine.lastIndexOf(")");
  if (close === -1) {
    return null;
  }
  const fields = statLine
    .slice(close + 1)
    .trim()
    .split(WHITESPACE_RE);
  return fields[PROC_STARTTIME_INDEX] ?? null;
}
