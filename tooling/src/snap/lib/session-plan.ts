// The session substrate's PURE core (docs/design/1208-instrument-substrate.md §3.3–§3.5 + §10.1), the
// sibling of lib/stage-plan.ts: the flag PARTITION every browser-lifetime consumer shares (a scenario's
// checkpoints and a session's calls — ONE table, promoted here from ops/scenario.ts), the refusal rows,
// the registry paths, the access/sweep verdicts, the limits, the parse-time session rows and every refusal
// text. No I/O: the imperative halves are ops/session-registry.ts (rows, sockets, liveness),
// ops/session-client.ts (the caller), ops/session-daemon.ts + ops/session-daemon-call.ts (the daemon); the
// wire readers are ./session-wire.ts. Pinned both ways by tests/tooling/snap/lib/session-plan.test.ts.
//
// TWO PARTITION LAYERS ON PURPOSE. `inheritSessionArgs` is the scenario's mapping byte-for-byte — the
// scenario's own refusal rows read the INHERITED `isolated`, so folding the stage/load/tab fields into
// that mapping would make every checkpoint of an `--isolated` scenario refuse itself. A session ALSO needs
// those fields from its boot (a call's nav budgets are a function of the stage, `throttle=` on the RESULT
// line is a function of the boot's load arm, the tab count is the browser's) — `inheritSessionBinding`
// is that second layer, applied by the daemon AFTER the refusal rows judged the call's own values.
import { basename, extname, join } from "node:path";
import { splitPageSuffix } from "../../_shared/argv.ts";
import { routeSlug } from "../../_shared/artifacts.ts";
import type { SessionAccess, SessionCallTarget, SessionLimits, SessionRow, SessionSweepVerdict } from "../contract/session.ts";
import type { Args } from "../contract/types.ts";
import { describeStageAgePhrase } from "./stage-plan.ts";

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
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
/** How long the client waits for a booting daemon to answer `ping` — the launcher's own readiness ceiling
 *  (`stack.sh` READINESS_TIMEOUT 240 s) plus a browser boot; a BASE for phase 1b's `budget()`. */
export const SESSION_BOOT_TIMEOUT_MS = 240_000;
export const SESSION_READY_POLL_MS = 200;
/** How long `--session-close`/`--session-sweep` wait for a signalled daemon to leave before SIGKILL. */
export const SESSION_CLOSE_GRACE_MS = 10_000;

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
 *  P3 leak wearing a socket. `--cascade` is here because its runtime is a launch property (phase 3 revisits).
 *  NOT here: `--no-failure-evidence` — a session records no trace/HAR at all (the daemon forces it off at
 *  boot), so the flag names nothing a later call could change; refusing it would refuse every operator's
 *  habitual argv over a property sessions do not have. */
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
  "--cascade",
  "--probe",
  "--ls",
  "--vnc",
  "--debug-token",
  "--strict-console",
  "--pages",
  "--contexts",
  "--as",
  "--fixture-server",
  "--fixture-base",
  "--cpu-throttle",
  "--network",
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

/** The scenario's partition, verbatim (ops/scenario.ts `inheritScenarioSession` before #1231): a
 *  per-lifetime flag comes from the BOOT command, a per-capture flag from the call, the two `--ls` seed
 *  lists concatenate, and `out` falls back to the given name. */
export function inheritSessionArgs(bootArgs: Args, call: Args, name: string): Args {
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
    viewport: bootArgs.viewport,
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
    probe: bootArgs.probe,
    localStorage: [...bootArgs.localStorage, ...call.localStorage],
    out: call.out ?? name,
  };
}

/** The session-only second layer (see the header): the WHERE, the load arm and the tab count are the
 *  daemon's browser, so a call's nav budgets, its `throttle=` pair and its page count read the boot's. `json`
 *  is deliberately the CALL's: every session call is its own run, and a run decides its own manifest
 *  (the scenario's `json: global` is a per-RUN fact about one JSON-owned run). */
export function inheritSessionBinding(bootArgs: Args, merged: Args, call: Args): Args {
  return {
    ...merged,
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
    json: call.json,
  };
}

/** The per-capture refusal rows a scenario checkpoint has always carried (ops/scenario.ts before #1231),
 *  judged on the INHERITED args for the mode rows and on the RAW parse for the shim rows. Shared with the
 *  session daemon so one table refuses the same combinations everywhere. */
export function checkpointArgErrors(inherited: Args, raw: Args, label: string): readonly string[] {
  return (
    [
      [inherited.pages > 1 || inherited.contexts > 1 || inherited.as !== null, "scenario checkpoints do not support --pages/--contexts/--as"],
      [inherited.watchMs > 0 || inherited.baseline || inherited.diff, "scenario checkpoints do not support --watch/--baseline/--diff"],
      [inherited.scenario !== null || inherited.matrix, "scenario checkpoints cannot nest --scenario/--matrix"],
      [
        inherited.isolated || inherited.stageDown || inherited.stageStatus,
        "scenario checkpoint args cannot manage stages; put stage flags on the outer command",
      ],
      [
        raw.appearance !== null,
        "scenario checkpoints share ONE browser context, so the appearance shim is session-level; put --appearance/--appearance-preset/--full-motion on the outer command",
      ],
      [raw.theme !== null, "scenario checkpoints share ONE browser context, so the theme shim is session-level; put --theme on the outer command"],
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
    ? "scenario checkpoints must use identical --ls seeds because they share one browser lifetime"
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

// ── refusal texts (each names the remedy) ─────────────────────────────────────────────────────────────

export function foreignSessionRefusal(row: SessionRow, nowMs: number): string {
  return (
    `SESSION REFUSED  ${row.name} is owned by ANOTHER checkout — ${row.ownerCheckout} (daemon pid ${row.daemonPid}, ` +
    `last used ${describeStageAgePhrase(row.lastUsedAt, nowMs)}). A session's browser is private to its lane (F4): wait for it, ` +
    "boot your own under a different name, or tear theirs down deliberately with `pnpm snap --session-close " +
    `${row.name} --force\` (it kills THEIR run) — tooling/src/snap/lib/session-plan.ts.`
  );
}

export function sessionCapRefusal(name: string, live: readonly SessionRow[], cap: number, nowMs: number): string {
  const rows = live.map(
    (row) => `  ${row.name}  owner ${row.ownerCheckout} · pid ${row.daemonPid} · last used ${describeStageAgePhrase(row.lastUsedAt, nowMs)}`,
  );
  return [
    `SESSION REFUSED  cannot boot ${name}: ${live.length} session(s) are live and the cap is ${cap} (ORB_SESSION_CAP) — nothing was measured.`,
    ...rows,
    "  Close one you own (`pnpm snap --session-close <name>`), reap the idle/dead ones (`pnpm snap --session-sweep`), or wait —",
    "  tooling/src/snap/lib/session-plan.ts.",
  ].join("\n");
}

/** `12s` under a minute, `3m` past it — the age of an in-flight op for the busy line. */
function describeOpAge(ageMs: number): string {
  const minutes = Math.round(ageMs / MS_PER_MINUTE);
  return minutes === 0 ? `${Math.round(ageMs / MS_PER_SECOND)}s` : `${minutes}m`;
}

export function sessionBusyRefusal(name: string, op: string, ageMs: number): string {
  return (
    `SESSION BUSY  ${name} is mid-\`${op}\` (${describeOpAge(ageMs)} in) — ` +
    "one request at a time per session: two callers driving one page is the shared-tab defect wearing a socket. Wait for it or use another name — tooling/src/snap/lib/session-plan.ts."
  );
}

/** The loud marker (§3.8). The row is the evidence: the daemon cannot stamp its own death, so the last
 *  call boundary is the last time it was known alive, and the in-flight op (if any) is what it died in. */
export function sessionDeadText(row: SessionRow, detail: string): string {
  const mid = row.inflightOp === null ? `idle since ${row.lastUsedAt} (last op ${row.lastOp ?? "none"})` : `mid-\`${row.inflightOp}\``;
  return [
    `SESSION DEAD   ${row.name} died ${mid} (daemon pid ${row.daemonPid} gone; ${detail})`,
    `               remedies: \`pnpm snap --session-sweep\` reaps the browser group + clears the marker; re-run \`--session ${row.name} …\` to reboot — tooling/src/snap/lib/session-plan.ts`,
  ].join("\n");
}

export function neverNavigatedRefusal(name: string): string {
  return `ARG ERROR    session ${name} has never navigated — a call with no route and no --file drives the LIVE page, and there is none yet; name a route (or --file <html>) on this call`;
}

export function cascadeNotBootedRefusal(name: string): string {
  return `ARG ERROR    --cascade needs the DevTools-SDK runtime, which is a launch property: session ${name} booted without it — close it and reboot with --cascade on the first call`;
}

export function sessionOnlyFlagsRefusal(name: string, flags: readonly string[]): string {
  return `ARG ERROR    ${flags.join(" ")} name(s) a property of the session's browser lifetime and only the boot call may set it; session ${name} is already up — close it (\`pnpm snap --session-close ${name}\`) and reboot with the flag, or drop it`;
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
 *  one argv is an ambiguous ask (the stage-admin rule); `--session-daemon` is the daemon's own entry; phase 1
 *  drives single-page calls only — the matrix rides a session in phase 3 (F10). Each row is
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
      driving && (args.matrix || args.scenario !== null || contextsMode),
      "--session does not combine with --matrix/--scenario/--contexts/--as in phase 1 — the appearance matrix rides a session in phase 3 (docs/design/1208-instrument-substrate.md §12.2 F10)",
    ],
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
