// The session substrate's PURE core (docs/design/1208-instrument-substrate.md §3.3–§3.5 + §10.1), the
// sibling of lib/stage-plan.ts: the flag PARTITION every browser-lifetime consumer shares (a scenario's
// checkpoints and a session's calls — ONE table, promoted here from ops/scenario.ts), the registry paths,
// access/sweep verdicts, limits, and parse-time session rows. Printable refusals live in
// session-refusals.ts. No I/O: the imperative halves are ops/session-registry.ts (rows, sockets, liveness),
// ops/session-client.ts (the caller), ops/session-daemon.ts + ops/session-daemon-call.ts (the daemon); the
// wire readers are ./session-wire.ts. Pinned both ways by tests/tooling/snap/lib/session-plan.test.ts.
//
// ONE PARTITION. `inheritSessionArgs` owns every browser-lifetime field for both scenarios and stateful
// sessions. Explicit checkpoint/session-call boot flags are refused from their RAW argv before this
// inheritance is trusted; inheritance never launders a misplaced flag into a valid-looking plan.
import { basename, extname, join } from "node:path";
import { splitPageSuffix } from "../../_shared/argv.ts";
import { routeSlug } from "../../_shared/artifact-naming.ts";
import { budget } from "../../_shared/load-budget.ts";
import type { SessionAccess, SessionCallTarget, SessionLimits, SessionRow, SessionSweepVerdict } from "../contract/session.ts";
import type { Args } from "../contract/types.ts";
import { sessionLevelArmFlags } from "../ops/arms/registry.ts";

// ── the registry (repo-keyed like the stage marker, #108) ─────────────────────────────────────────────

export const SESSION_REGISTRY_REL = join(".cache", "snap-session");
/** The run-slot instrument a daemon opens for itself — `abandonedRuns(root, SESSION_INSTRUMENT)` is the
 *  dead-session oracle (§3.8). */
export const SESSION_INSTRUMENT = "snap-session";
/** Short, lowercase, socket-path-safe: `<main>/.cache/snap-session/<name>.sock` must stay under the
 *  108-byte unix-socket limit on every checkout of the repo, and a name is a lane's handle, not prose. */
const SESSION_NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/u;

export function sessionNameRefusal(name: string): string | null {
  return SESSION_NAME_RE.test(name)
    ? null
    : `session name ${JSON.stringify(name)} must match [a-z0-9][a-z0-9-]{0,31} (a lane's short handle, e.g. p-home-perf)`;
}

export function sessionSocketPath(home: string, name: string): string {
  return join(home, `${name}.sock`);
}

export function sessionRowPath(home: string, name: string): string {
  return join(home, `${name}.json`);
}

/** The daemon's stdout/stderr — beside the socket, never inside the slot (a `daemon.log` in the slot would
 *  be published as a `reports/daemon.log` pointer by the enumerating finish). */
export function sessionLogPath(home: string, name: string): string {
  return join(home, `${name}.log`);
}

// ── limits (owner fork F5) ────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SESSION_TTL_MIN = 30;
export const DEFAULT_SESSION_CAP = 3;
const MS_PER_MINUTE = 60_000;
/** How long the client waits for a booting daemon to answer `ping`, on a QUIET box — the launcher's own
 *  readiness ceiling (`stack.sh` READINESS_TIMEOUT 240 s) plus a browser boot. The BASE the ceiling below
 *  derives from; phase 1b's policy (#1232) now owns the stretch this comment used to only promise. */
const SESSION_BOOT_BASE_MS = 240_000;
export const SESSION_BOOT_TIMEOUT_MS = budget(SESSION_BOOT_BASE_MS);
export const SESSION_READY_POLL_MS = 200;
/** How long `--session-close`/`--session-sweep` wait for a signalled daemon to leave before SIGKILL. */
export const SESSION_CLOSE_GRACE_MS = 10_000;
/** THE MUTE CEILINGS (#1508): how long ONE socket exchange may say NOTHING before the client calls the
 *  daemon wedged. They bound SILENCE, not work — every event the daemon sends restarts the clock — so
 *  neither is a performance budget. A `ping` (and the admin `status` round trip) is a handshake: five
 *  quiet seconds means nobody is listening, and the boot poll wants that answer fast so it can poll
 *  again. A CALL is the daemon driving a browser, so its quiet stretches are legitimate and long; two
 *  minutes of total silence is the point where it is wedged, not slow. Both ride `budget()`, so a
 *  contended box stretches them instead of reading as a dead session. */
const SESSION_PING_SILENCE_BASE_MS = 5000;
export const SESSION_PING_SILENCE_MS = budget(SESSION_PING_SILENCE_BASE_MS);
const SESSION_CALL_SILENCE_BASE_MS = 120_000;
export const SESSION_CALL_SILENCE_MS = budget(SESSION_CALL_SILENCE_BASE_MS);

/** Flag \> env \> default. A fractional TTL is legal (`ORB_SESSION_TTL_MIN=0.05` is a 3 s calibration
 *  drive); a non-positive or unparseable value is a REFUSAL, never a silent default — a session whose TTL
 *  silently became 30 min is the strand class this substrate exists to end. */
export function resolveSessionLimits(input: {
  readonly ttlMinEnv: string | undefined;
  readonly capEnv: string | undefined;
  readonly ttlMinFlag: number | null;
}): {
  readonly limits: SessionLimits;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];
  let ttlMin = DEFAULT_SESSION_TTL_MIN;
  if (input.ttlMinFlag !== null) {
    ttlMin = input.ttlMinFlag;
  } else if (input.ttlMinEnv !== undefined && input.ttlMinEnv !== "") {
    ttlMin = Number(input.ttlMinEnv);
  }
  if (!(Number.isFinite(ttlMin) && ttlMin > 0)) {
    errors.push(
      `the session TTL must be a positive number of minutes (--session-ttl <min> / ORB_SESSION_TTL_MIN), got ${JSON.stringify(input.ttlMinFlag ?? input.ttlMinEnv)}`,
    );
    ttlMin = DEFAULT_SESSION_TTL_MIN;
  }
  let cap = DEFAULT_SESSION_CAP;
  if (input.capEnv !== undefined && input.capEnv !== "") {
    cap = Number(input.capEnv);
    if (!(Number.isInteger(cap) && cap >= 1)) {
      errors.push(`ORB_SESSION_CAP must be an integer >= 1, got ${JSON.stringify(input.capEnv)}`);
      cap = DEFAULT_SESSION_CAP;
    }
  }
  return { limits: { ttlMs: Math.ceil(ttlMin * MS_PER_MINUTE), cap }, errors };
}

// ── the flag partition (§3.3) ─────────────────────────────────────────────────────────────────────────

/** Flags that name a property of the BROWSER LIFETIME — where it serves, its emulation, its shims, its
 *  seeds, its load arm, its tab count. Legal on the boot call only; a later call carrying one is refused
 *  (exit 3) instead of being silently overridden, because "I asked for 412 wide and measured 1280" is the
 *  P3 leak wearing a socket.
 *  THE ARM MEMBERS ARE DERIVED (`sessionLevelArmFlags()`, contract/arms.ts §3.3): an arm declares
 *  `level: "session"` beside its flags, so `--cascade` is in this set because its DevTools-SDK runtime is
 *  a persistent-profile LAUNCH property, and it says so once — in the arm — instead of here and there. */
export const SESSION_ONLY_FLAGS: ReadonlySet<string> = new Set([
  "--base",
  "--isolated",
  "--ref",
  "--dirty",
  "--fresh",
  "--viewport",
  "--wide",
  "--mobile",
  "--desktop",
  "--scale",
  "--dark",
  "--light",
  "--reduced-motion",
  "--appearance",
  "--appearance-preset",
  "--full-motion",
  "--theme",
  "--probe",
  "--local-storage",
  "--vnc",
  "--debug-token",
  "--strict-console",
  "--no-failure-evidence",
  "--pages",
  "--contexts",
  "--as",
  "--fixture-server",
  "--fixture-base",
  "--cpu-throttle",
  "--network",
  ...sessionLevelArmFlags(),
]);

/** The session-level flags a later call's argv carries, in argv order (duplicates kept — the refusal
 *  names every offending token). A value token never starts with `--`, so only flag tokens are judged;
 *  the `@<page>` suffix is stripped the way ops/parse.ts strips it. */
export function sessionOnlyFlagsIn(argv: readonly string[]): readonly string[] {
  return argv.filter((token) => token.startsWith("--") && SESSION_ONLY_FLAGS.has(splitPageSuffix(token).flag));
}

/** The flags the CLIENT consumes and never forwards — both are required-value flags, so each strips
 *  exactly itself plus its next token. */
const CLIENT_ONLY_FLAGS: ReadonlyMap<string, number> = new Map([
  ["--session", 1],
  ["--session-ttl", 1],
]);

export function stripSessionFlags(argv: readonly string[]): readonly string[] {
  const out: string[] = [];
  let skip = 0;
  for (const token of argv) {
    if (skip > 0) {
      skip -= 1;
      continue;
    }
    const consumed = CLIENT_ONLY_FLAGS.get(token);
    if (consumed === undefined) {
      out.push(token);
    } else {
      skip = consumed;
    }
  }
  return out;
}

/** The one browser-lifetime partition shared by scenarios and sessions. A per-lifetime value always
 * comes from the boot command; a per-call value always comes from the call. Local-storage seeds are a
 * launch property too: concatenating checkpoint seeds after the init script was installed claimed state
 * the browser never received. */
function inheritedCallFields(
  bootArgs: Args,
  call: Args,
  inheritOuterCall: boolean,
): Pick<Args, "diagnostics" | "actions" | "eval" | "watchMs" | "watchEveryMs" | "fullPage" | "shot" | "shotOf" | "mask" | "crop" | "deadCss"> {
  if (!inheritOuterCall) {
    return {
      diagnostics: call.diagnostics,
      actions: call.actions,
      eval: call.eval,
      watchMs: call.watchMs,
      watchEveryMs: call.watchEveryMs,
      fullPage: call.fullPage,
      shot: call.shot,
      shotOf: call.shotOf,
      mask: call.mask,
      crop: call.crop,
      deadCss: call.deadCss,
    };
  }
  return {
    diagnostics: call.diagnostics ?? bootArgs.diagnostics,
    actions: [...bootArgs.actions, ...call.actions],
    eval: [...bootArgs.eval, ...call.eval],
    watchMs: call.watchMs === 0 ? bootArgs.watchMs : call.watchMs,
    // Each field inherits on ITS OWN zero-check (#1509). Branching the cadence on `watchMs` broke both
    // asymmetric calls: one stating only `--watch-every` had its explicit cadence REPLACED by the boot
    // value, and one stating only `--watch` dropped the boot cadence it should have inherited.
    watchEveryMs: call.watchEveryMs === 0 ? bootArgs.watchEveryMs : call.watchEveryMs,
    fullPage: bootArgs.fullPage || call.fullPage,
    shot: bootArgs.shot && call.shot,
    shotOf: call.shotOf ?? bootArgs.shotOf,
    mask: [...bootArgs.mask, ...call.mask],
    crop: call.crop ?? bootArgs.crop,
    deadCss: bootArgs.deadCss && call.deadCss,
  };
}

export function inheritSessionArgs(bootArgs: Args, call: Args, name: string, inheritOuterCall = false): Args {
  return {
    ...call,
    base: bootArgs.base,
    vnc: bootArgs.vnc,
    debugToken: bootArgs.debugToken,
    failureEvidence: bootArgs.failureEvidence,
    strictConsole: bootArgs.strictConsole,
    checkpoint: bootArgs.checkpoint || call.checkpoint,
    includeHidden: bootArgs.includeHidden || call.includeHidden,
    json: bootArgs.json,
    summary: bootArgs.summary || call.summary,
    ...inheritedCallFields(bootArgs, call, inheritOuterCall),
    viewport: bootArgs.viewport,
    viewportExplicit: bootArgs.viewportExplicit,
    device: bootArgs.device,
    colorScheme: bootArgs.colorScheme,
    reducedMotion: bootArgs.reducedMotion,
    ...(bootArgs.browserContrast === undefined ? {} : { browserContrast: bootArgs.browserContrast }),
    ...(bootArgs.reducedTransparency === undefined ? {} : { reducedTransparency: bootArgs.reducedTransparency }),
    // The shim is installed once, on the ONE context every capture shares — so it is a lifetime property
    // like the media emulation, taken from the boot command (a call that sets its own is refused rather
    // than silently applying to every capture or to none).
    appearance: bootArgs.appearance,
    theme: bootArgs.theme,
    cascade: bootArgs.cascade,
    reactProfile: bootArgs.reactProfile,
    probe: bootArgs.probe,
    localStorage: [...bootArgs.localStorage],
    scale: bootArgs.scale,
    isolated: bootArgs.isolated,
    ref: bootArgs.ref,
    dirty: bootArgs.dirty,
    fresh: bootArgs.fresh,
    cpuThrottle: bootArgs.cpuThrottle,
    network: bootArgs.network,
    pages: bootArgs.pages,
    contexts: bootArgs.contexts,
    as: bootArgs.as,
    fixtureServer: bootArgs.fixtureServer,
    fixtureBase: bootArgs.fixtureBase,
    out: call.out ?? name,
  };
}

/** A stateful session call differs from a scenario checkpoint only in JSON ownership: every daemon call
 * is its own run, while a scenario is one outer run. Browser-lifetime inheritance remains exclusively in
 * `inheritSessionArgs`; this wrapper must never grow another boot-field list. */
export function inheritSessionBinding(bootArgs: Args, merged: Args, call: Args): Args {
  void bootArgs;
  return {
    ...merged,
    json: call.json,
  };
}

/** The per-capture refusal rows a scenario checkpoint has always carried (ops/scenario.ts before #1231),
 *  judged on the INHERITED args for the mode rows and on the RAW parse for the shim rows. Shared with the
 *  session daemon so one table refuses the same combinations everywhere. */
export function checkpointArgErrors(inherited: Args, label: string, rawArgv: readonly string[] = []): readonly string[] {
  const misplacedBootFlags = sessionOnlyFlagsIn(rawArgv);
  const stageAdminFlags = rawArgv.filter((token) =>
    ["--stage-down", "--stage-status", "--stage-sweep", "--stage-owner", "--force"].includes(splitPageSuffix(token).flag),
  );
  return (
    [
      [
        misplacedBootFlags.length > 0,
        `scenario checkpoint args cannot set browser-lifetime flags (${misplacedBootFlags.join(" ")}); put them on the outer command`,
      ],
      [inherited.pages > 1 || inherited.contexts > 1 || inherited.as !== null, "scenario checkpoints do not support --pages/--contexts/--as"],
      [inherited.watchMs > 0 || inherited.baseline || inherited.diff, "scenario checkpoints do not support --watch/--baseline/--diff"],
      [inherited.scenario !== null || inherited.matrix, "scenario checkpoints cannot nest --scenario/--matrix"],
      [
        inherited.lighthouse !== null || inherited.requests,
        "scenario checkpoints do not run the --lighthouse/--requests arms (this path drives its own session and would ignore them) — take those receipts in their own snap run",
      ],
      [stageAdminFlags.length > 0, `scenario checkpoint args cannot manage stages (${stageAdminFlags.join(" ")}); put stage flags on the outer command`],
    ]
      // Each row is [invalid, message], so the tuple element type here is `boolean | string`; `=== true`
      // reads the boolean slot exactly and never the message.
      .filter(([invalid]) => invalid === true)
      .map(([, message]) => `${label}: ${message}`)
  );
}

/** Every capture in one browser lifetime must seed localStorage identically — the init script is
 *  installed once, before the first navigation. */
export function identicalSeedsError(checkpoints: readonly Args[]): string | null {
  const firstSeeds = JSON.stringify(checkpoints[0]?.localStorage ?? []);
  return checkpoints.some((checkpoint) => JSON.stringify(checkpoint.localStorage) !== firstSeeds)
    ? "scenario checkpoints must use identical --local-storage seeds because they share one browser lifetime"
    : null;
}

/** A call names a file, a route, or neither — neither means the LIVE page. */
export function sessionCallTarget(call: Args): SessionCallTarget {
  if (call.file !== null) {
    return "file";
  }
  return call.routeGiven ? "route" : "live";
}

// ── access, liveness, sweep (§3.5) ────────────────────────────────────────────────────────────────────

export function sessionAccess(input: { readonly row: SessionRow | null; readonly live: boolean; readonly callerCheckout: string }): SessionAccess {
  if (input.row === null) {
    return "absent";
  }
  if (!input.live) {
    return "reclaim";
  }
  return input.row.ownerCheckout === input.callerCheckout ? "ours" : "refuse";
}

/** Milliseconds since the row's last call boundary; an unparseable stamp reads as INFINITELY idle (the
 *  stage-plan posture — a row that cannot say when it was used must not look fresh). */
export function sessionIdleMs(row: SessionRow, nowMs: number): number {
  const lastUsed = Date.parse(row.lastUsedAt);
  return Number.isNaN(lastUsed) ? Number.POSITIVE_INFINITY : Math.max(0, nowMs - lastUsed);
}

export function sessionSweepVerdict(input: { readonly live: boolean; readonly idleMs: number; readonly ttlMs: number }): SessionSweepVerdict {
  if (!input.live) {
    return "dead";
  }
  return input.idleMs > input.ttlMs ? "idle" : "live";
}

// ── the live-page target ─────────────────────────────────────────────────────────────────────────────
// (the wire readers — request/row/event lines, RESULT pairs — are ./session-wire.ts's)

/** The default artifact base of a LIVE-page call: the page's route slug for an http(s) page, the file's
 *  basename for a `file://` one — what `snapDestination` would have derived had the call named it. */
export function livePageSlug(pageUrl: string): string {
  if (!URL.canParse(pageUrl)) {
    return "live";
  }
  const url = new URL(pageUrl);
  if (url.protocol === "file:") {
    const base = basename(url.pathname);
    return routeSlug(base.slice(0, base.length - extname(base).length));
  }
  return routeSlug(`${url.pathname}${url.search}`);
}

// ── the parse-time refusal rows (ops/parse.ts consumes them; here because they are pure and session-owned) ──

/** The stateful-session mode rows (design §3.3/§4.4). The four admin modes each print and exit, so two in
 *  one argv is an ambiguous ask (the stage-admin rule); `--session-daemon` is the daemon's own entry. Each row is
 *  `[invalid, message]`; ops/parse.ts filters the true ones into its ARG ERROR list. */
export function sessionModeValidationPairs(args: Args, contextsMode: boolean): readonly (readonly [boolean, string])[] {
  const admin = args.sessionStatus || args.sessionClose !== null || args.sessionSweep || args.sessionExport !== null;
  const driving = args.session !== null || args.sessionDaemon !== null;
  return [
    [
      [args.sessionStatus, args.sessionClose !== null, args.sessionSweep, args.sessionExport !== null].filter(Boolean).length > 1,
      "--session-status, --session-close, --session-sweep and --session-export are mutually exclusive",
    ],
    [driving && admin, "--session <name> drives a session; the admin modes (--session-status/--session-close/--session-sweep/--session-export) stand alone"],
    [args.session !== null && args.sessionDaemon !== null, "--session-daemon is the daemon's own entry and does not combine with --session"],
    [args.sessionTtlMin !== null && !driving, "--session-ttl <min> is a boot property of --session <name>"],
    [
      driving && (contextsMode || (args.scenario !== null && !args.matrix)),
      "--session does not combine with --scenario alone or --contexts/--as: a matrix scenario opens each cell in its own disposable session-browser context",
    ],
    // `--session` + `--lighthouse` WAS REFUSED HERE, and the refusal is DELETED (#1259, phase 3). It was
    // never a taste call: the two features wrote `--remote-debugging-port` onto one browser by
    // incompatible means — the arm RESERVED a loopback port and passed it, a session let Chrome pick
    // (port 0) and read `DevToolsActivePort` back — so two such args on one launch was last-wins and
    // silent. Phase 3 deleted the reserving path outright (ops/session.ts), leaving ONE mechanism, so the
    // pair now composes: `--session x --lighthouse desktop` audits the session's own live page.
    [
      (driving || admin) && (args.stageDown || args.stageStatus || args.stageSweep),
      "the session modes do not combine with --stage-status/--stage-down/--stage-sweep",
    ],
  ];
}

/** Every session NAME the argv carries is judged once, by the one rule above. */
export function sessionNameErrors(args: Args): readonly string[] {
  return [args.session, args.sessionDaemon, args.sessionStatusName, args.sessionClose, args.sessionExport]
    .filter((name): name is string => name !== null)
    .map((name) => sessionNameRefusal(name))
    .filter((refusal): refusal is string => refusal !== null);
}
