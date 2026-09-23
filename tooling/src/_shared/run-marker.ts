// THE RUN MARKER — how a run proves which live processes are ITS OWN, so a killed run can take its whole
// tree with it (#1848). Sibling of proc.ts's `killPidGroup`, and deliberately the half that door cannot do.
//
// THE DEFECT. Every tooling child is spawned `detached` and reaped by its PROCESS GROUP — which is correct
// for `pnpm → node → tool`, and blind to anything that leaves the group. Playwright starts each browser in
// its OWN session, and vite/esbuild service processes do the same, so a stage killed at its timeout (or a
// lane's `test:ct` interrupted, or a snap killed mid-drive) leaves the browsers running with their parent
// reaped: 72 `chrome-headless-shell` processes, some 40 h old and re-parented to the chrome roots
// themselves, were alive on this box on 2026-09-06 and had to be killed by hand — plus a stale CT vite
// server still holding :3100, which is why the next run printed "Port 3100 is in use, trying another one".
//
// THE MECHANISM, IN TWO CHANNELS. A run mints one high-entropy marker and exports it in the ENVIRONMENT of
// every child it spawns. `/proc/<pid>/environ` is the SPAWN environment — exported before the exec and
// unforgeable afterwards — so a live pid carrying this exact value was started by THIS run and by nothing
// else. That is the same evidence `stack/lib/dev-process-identity.ts` uses to adopt a leaderless dev-stack
// survivor (#1013); this module is the general form, and the two agree on the mechanism on purpose.
// CHROMIUM IS THE EXCEPTION AND IT IS THE REASON THE SECOND CHANNEL EXISTS: a chromium process rewrites its
// own environ area for its process title, so its `/proc/<pid>/environ` reads EMPTY (measured 2026-09-06 —
// see RUN_MARKER_ARG_PREFIX). A browser is therefore stamped through its ARGV as well, and every reader
// here asks both files.
//
// SCOPED BY THE VALUE, NEVER BY THE PROGRAM NAME. `pkill -f chrome-headless` would kill a SIBLING LANE's
// CT fleet — the exact class of harm this exists to prevent (and the standing "never pkill by name"
// rule). Every sweep here signals only pids
// whose environ carries the caller's own marker, minus this process and its own ancestors.
//
// TWO SWEEPS, because a run can end two ways:
//   • `sweepRunMarker` — MY run is ending (timeout, refusal, release). TERM, a grace, then KILL survivors.
//   • `sweepAbandonedRunMarkers` — SOMEBODY's run ended without cleaning up: a marker whose OWNER PID is
//     gone can have no legitimate live descendants, whoever minted it. This is the arm that covers SIGKILL
//     and a hard power-off of a lane, and it is why the marker embeds its owner's pid.
//
// TWO IDENTITIES, AND THE LAW THAT SEPARATES THEM (#2504). A process belongs to two runs at once: the OUTER
// run (`ORB_RUN_MARKER`, INHERITED by every descendant — #1848's requirement, so the outer run's kill path
// still reaches a browser a nested launcher started) and a LEASE (`ORB_RUN_LEASE`, MINTED by whoever takes a
// scoped resource — a snap session daemon, one `test:ct` invocation — and never inherited). Both are stamped
// on the child, in both channels; the sweeps match EITHER, because the marker's entropy is the whole proof
// and the channel it arrived on adds nothing to it.
//   THE LAW IS: A TEARDOWN SWEEPS THE IDENTITY IT MINTED, NEVER ONE IT INHERITED. Inherit-before-mint had
// widened the SUBJECT of `sweepOwnBrowsers` and of the CT lease release to the OUTER run while their comments
// still described the inner one — so a reparented session daemon's shutdown SIGKILLed the whole battery that
// contained it (`tests:tooling` under a marker: exit 137, 11 files, no summary; unmarked: 556 files and a
// verdict). Every sweep door therefore takes its subject as a REQUIRED argument its caller minted, and no
// door here answers "the marker I happen to be carrying".
//
// A SWEEP THAT SIGNALS NOTHING IS NORMAL AND SAYS SO. The result is reported by the caller into its own
// transcript — a teardown that silently killed seven processes, or silently found none, is the same
// unreadable line, and the count is what tells an operator whether the leak is closed.
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import process from "node:process";
import { budget } from "./load-budget.ts";
import { exportProcessEnv, processEnvValue } from "./process-env.ts";

/** The variable every marked child carries. Spelled ONCE; the launchers set it, this module reads it. */
export const RUN_MARKER_ENV = "ORB_RUN_MARKER";

/** `<ownerPid>-<epochMs>-<random>` — long and alphabet-restricted enough that no unrelated process could
 *  carry it by accident, and self-describing enough that the abandoned sweep can ask whether the run that
 *  minted it is still alive. Anything else is not a marker (a hand-set variable never authorizes a kill). */
const MARKER_RE = /^(?<pid>[1-9]\d*)-(?<minted>[1-9]\d*)-(?<nonce>[a-z0-9]{8})$/u;
/** 4 bytes: the 8 hex chars MARKER_RE requires. */
const NONCE_BYTES = 4;
/** The marker text that FOLLOWS a prefix, up to the first separator (NUL, space, or end). */
const MARKER_VALUE_RE = /^[^\0\s]+/u;
const PID_DIR_RE = /^\d+$/u;
const PPID_RE = /^PPid:\s+(\d+)$/mu;

/** How long a TERMed process may take to leave before the sweep escalates to KILL. Short by design — the
 *  processes this reaches are ALREADY orphans of a dead run, so the grace buys an orderly chromium exit,
 *  not a chance to finish work. Load-scaled like every wall clock in tooling (`tooling-clock-budget`). */
const SWEEP_GRACE_BASE_MS = 2000;

/** One sweep's receipt. `terminated` got SIGTERM, `killed` were still alive after the grace. */
export interface RunMarkerSweep {
  readonly marker: string;
  readonly terminated: readonly number[];
  readonly killed: readonly number[];
}

/** The reads and signals a sweep performs — injected so a test drives the whole decision without a box. */
export interface RunMarkerDeps {
  readonly listPids?: () => readonly number[];
  /** Every identity one pid carries — its outer RUN marker and its LEASE, either channel, 0-2 values. */
  readonly identitiesOf?: (pid: number) => readonly string[];
  readonly parentOf?: (pid: number) => number | null;
  readonly signal?: (pid: number, signal: NodeJS.Signals) => void;
  readonly alive?: (pid: number) => boolean;
  readonly selfPid?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export function mintRunMarker(pid: number = process.pid, mintedAtMs: number = Date.now()): string {
  // CRYPTO, not Math.random: this nonce is what makes a marker unguessable and un-collidable, and it is
  // read back as authorization to SIGNAL a process. (It is also what the determinism gate requires.)
  return `${String(pid)}-${String(mintedAtMs)}-${randomBytes(NONCE_BYTES).toString("hex")}`;
}

/** The pid of the run that minted this marker, or null when the string is not a marker at all. */
export function runMarkerOwnerPid(marker: string): number | null {
  const owner = MARKER_RE.exec(marker)?.groups?.["pid"];
  return owner === undefined ? null : Number(owner);
}

/** The environment overlay a launcher spreads onto its child's env. The ONE spelling of the pair, so a
 *  launcher never re-types the variable name. */
export function runMarkerEnv(marker: string): Readonly<Record<string, string>> {
  return { [RUN_MARKER_ENV]: marker };
}

/** THE SECOND CHANNEL, AND CHROMIUM NEEDS IT (measured 2026-09-06, #1848). A chromium process REWRITES ITS
 *  OWN environ area to set its process title, so `/proc/<pid>/environ` for every browser and renderer comes
 *  back EMPTY — `chromium.launch({ env })` reaches the process, and then the process erases the evidence.
 *  Probed directly: 5 fresh chromium pids, 0-1 environ entries each, marker absent from all of them; the
 *  same launch with this ARG has the marker in the browser ROOT's `/proc/<pid>/cmdline`. So a browser is
 *  stamped through its argv instead — an UNKNOWN switch, which chromium accepts and ignores.
 *
 *  MARKING THE ROOT IS ENOUGH, and that was measured too: the zygote/renderer children do not inherit the
 *  switch, but SIGKILLing the marked root left ZERO of its six chromium processes alive. Which is also why
 *  the leak looked the way it did — the 40-hour survivors were re-parented to the chrome roots themselves. */
export const RUN_MARKER_ARG_PREFIX = "--orb-run-marker=";

export function runMarkerArg(marker: string): string {
  return `${RUN_MARKER_ARG_PREFIX}${marker}`;
}

/** THE LEASE CHANNEL (#2504) — the same two files, a second pair of keys, and the reason it exists is that
 *  the RUN channel is INHERITED: a launcher that swept it reached its own grandparents' siblings. A lease is
 *  minted by the process that takes a scoped resource, rides beside the run marker on every child it starts,
 *  and is swept by that process alone. Same grammar as a marker (`MARKER_RE`), so the abandoned sweep reaps a
 *  dead lease owner's browsers even while the OUTER run is still alive — the orphan window got smaller. */
export const RUN_LEASE_ENV = "ORB_RUN_LEASE";
export const RUN_LEASE_ARG_PREFIX = "--orb-run-lease=";

export function runLeaseEnv(lease: string): Readonly<Record<string, string>> {
  return { [RUN_LEASE_ENV]: lease };
}

export function runLeaseArg(lease: string): string {
  return `${RUN_LEASE_ARG_PREFIX}${lease}`;
}

/** The marker THIS process carries, or null. A nested launcher (a `test:ct` inside a verify stage) must
 *  REUSE its parent's marker rather than mint a second one: overwriting it would orphan every browser from
 *  the outer run's sweep, which is the hole this whole module exists to close. */
export function inheritedRunMarker(read: (key: string) => string | undefined = processEnvValue): string | null {
  const raw = read(RUN_MARKER_ENV);
  return raw !== undefined && MARKER_RE.test(raw) ? raw : null;
}

/** Every pid the /proc filesystem currently lists. */
function listPidsFromProc(): readonly number[] {
  return readdirSync("/proc")
    .filter((entry) => PID_DIR_RE.test(entry))
    .map(Number);
}

/** EVERY IDENTITY one live process carries — its outer RUN marker and its LEASE — each read from its
 *  `/proc/<pid>/environ`, else its `/proc/<pid>/cmdline`. Both /proc files are read ONCE, because a sweep
 *  asks this of every pid on the box. An empty array = unreadable, gone, or unmarked — all three are "not
 *  provably mine", the fail-closed direction, so an unreadable process is never signalled. */
export function processRunIdentities(pid: number, read: (path: string) => Buffer = readFileSync): readonly string[] {
  const environ = readProcFile(pid, "environ", read);
  const cmdline = readProcFile(pid, "cmdline", read);
  return [
    markerIn(environ, `${RUN_MARKER_ENV}=`) ?? markerIn(cmdline, RUN_MARKER_ARG_PREFIX),
    markerIn(environ, `${RUN_LEASE_ENV}=`) ?? markerIn(cmdline, RUN_LEASE_ARG_PREFIX),
  ].filter((value): value is string => value !== null);
}

function readProcFile(pid: number, name: string, read: (path: string) => Buffer): string | null {
  // @orb-waive caught-failure-ownership(catch): a pid that exits mid-scan (or another user's) answers null, which every caller reads as "not provably mine" and therefore DO NOT SIGNAL. Ends if null ever authorizes a signal.
  try {
    return read(`/proc/${String(pid)}/${name}`).toString("utf8");
  } catch {
    return null;
  }
}

/** The marker inside one /proc blob, or null.
 *
 *  IT SEARCHES, IT DOES NOT SPLIT, AND THAT IS FORCED BY CHROMIUM (measured 2026-09-06): a chromium
 *  process rewrites its argv area into ONE string, so `/proc/<pid>/cmdline` comes back as a single
 *  NUL-terminated field holding every switch — a per-field `startsWith` finds nothing there. An ordinary
 *  process's cmdline/environ is NUL-SEPARATED and a search over it is the same answer. The marker's own
 *  entropy is what keeps the search honest: it is a value nothing unrelated carries. */
function markerIn(blob: string | null, prefix: string): string | null {
  const at = blob?.indexOf(prefix) ?? -1;
  if (blob === null || at === -1) {
    return null;
  }
  const value = MARKER_VALUE_RE.exec(blob.slice(at + prefix.length))?.[0] ?? "";
  return MARKER_RE.test(value) ? value : null;
}

/** The default /proc reader, named so both sweep doors share one spelling. */
function identitiesFromProc(pid: number): readonly string[] {
  return processRunIdentities(pid);
}

/** A pid's parent, from `/proc/<pid>/status`. Used only to EXCLUDE — never to select a target. */
function parentFromProc(pid: number): number | null {
  // @orb-waive caught-failure-ownership(catch): an unreadable /proc/<pid>/status ends the ancestor walk, which can only make the exclusion set SMALLER-BUT-SAFE — the walk starts at THIS process, whose own status is always readable. Ends if the walk is ever used to select targets rather than exclude them.
  try {
    const match = PPID_RE.exec(readFileSync(`/proc/${String(pid)}/status`, "utf8"));
    return match?.[1] === undefined ? null : Number(match[1]);
  } catch {
    return null;
  }
}

function aliveBySignal(pid: number): boolean {
  // @orb-waive caught-failure-ownership(catch): `kill(pid, 0)` ASKS a question and throws to answer "no" — the throw IS the ESRCH answer, exactly as _shared/run-retention.ts's pidAlive states it. Ends if this needs to tell EPERM from ESRCH.
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** proc.ts's own errno shape, re-derived here rather than imported: this module has to stay importable BY
 *  proc.ts (it is the sweep half of the same teardown), and importing back would be a cycle. */
function errnoIs(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function signalPid(pid: number, signal: NodeJS.Signals): void {
  // @orb-waive caught-failure-ownership(error): ESRCH is the DESIRED end state of a teardown signal (the process left between the scan and the signal); every other signal error rethrows. Ends if a caller starts requiring proof that a specific signal landed.
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (!errnoIs(error, "ESRCH")) {
      throw error;
    }
  }
}

/** This process and every ancestor of it — the set a sweep must never signal. A verify runner spawning a
 *  marked stage is itself unmarked, but a NESTED launcher (test:ct inside `pnpm test`) inherited the
 *  marker and would otherwise sweep itself and its own parents mid-run. */
function selfAndAncestors(selfPid: number, parentOf: (pid: number) => number | null): ReadonlySet<number> {
  const chain = new Set<number>();
  let cursor: number | null = selfPid;
  while (cursor !== null && cursor > 1 && !chain.has(cursor)) {
    chain.add(cursor);
    cursor = parentOf(cursor);
  }
  return chain;
}

/** Every live pid carrying `marker` in EITHER channel, minus this process and its ancestors. A lease and a
 *  run marker are matched the same way on purpose: the value's entropy is the proof, never the channel. */
export function markedPids(marker: string, deps: RunMarkerDeps = {}): readonly number[] {
  const listPids = deps.listPids ?? listPidsFromProc;
  const identitiesOf = deps.identitiesOf ?? identitiesFromProc;
  const excluded = selfAndAncestors(deps.selfPid ?? process.pid, deps.parentOf ?? parentFromProc);
  return listPids().filter((pid) => !excluded.has(pid) && identitiesOf(pid).includes(marker));
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** THE SWEEP. Signal every process carrying `marker`: SIGTERM, a grace, then SIGKILL to whatever is left.
 *  Called AFTER the process-group kill, never instead of it — the group kill is what reaps the ordinary
 *  tree, and this reaps what left the group. */
export async function sweepRunMarker(marker: string, deps: RunMarkerDeps = {}): Promise<RunMarkerSweep> {
  const signal = deps.signal ?? signalPid;
  const alive = deps.alive ?? aliveBySignal;
  const sleep = deps.sleep ?? defaultSleep;
  const terminated = markedPids(marker, deps);
  for (const pid of terminated) {
    signal(pid, "SIGTERM");
  }
  if (terminated.length === 0) {
    return { marker, terminated, killed: [] };
  }
  await sleep(budget(SWEEP_GRACE_BASE_MS));
  const killed = terminated.filter((pid) => alive(pid));
  for (const pid of killed) {
    signal(pid, "SIGKILL");
  }
  return { marker, terminated, killed };
}

/** The SYNCHRONOUS form, for a process that is itself dying (a SIGINT/SIGTERM handler re-raising the
 *  signal): there is no time for a grace, so the orphans get SIGKILL directly. A handler that awaited would
 *  be cut off mid-grace by the re-raise and leave exactly the browsers it was written to reap. */
export function sweepRunMarkerNow(marker: string, deps: RunMarkerDeps = {}): RunMarkerSweep {
  const signal = deps.signal ?? signalPid;
  const killed = markedPids(marker, deps);
  for (const pid of killed) {
    signal(pid, "SIGKILL");
  }
  return { marker, terminated: [], killed };
}

/** THE ABANDONED SWEEP: every marked process whose OWNER RUN is gone. A marker embeds the pid of the
 *  process that minted it, so "the owner is not alive" is a complete proof that nothing legitimate is
 *  waiting on these processes — whichever run, account or worktree they came from. This is the arm that
 *  covers a SIGKILLed runner, which by definition ran no cleanup of its own; a LIVE sibling's fleet is
 *  never touched, because its owner pid answers. */
export async function sweepAbandonedRunMarkers(deps: RunMarkerDeps = {}): Promise<readonly RunMarkerSweep[]> {
  const sweeps: RunMarkerSweep[] = [];
  for (const marker of abandonedMarkers(deps)) {
    sweeps.push(await sweepRunMarker(marker, deps));
  }
  return sweeps;
}

/** THIS PROCESS'S MARKER, minted once and reused — the door a launcher that is not a verify STAGE uses
 *  (snap's browser doors). Inherit-before-mint for the same reason `runVerify` does it: a snap running
 *  inside a marked run must keep the outer marker or its browsers vanish from the outer sweep.
 *
 *  THE MEMO IS THE ENVIRONMENT, NOT A MODULE VARIABLE, and that is a fix rather than a style choice
 *  (measured 2026-09-06): under vitest this module is reachable BOTH as `@orb/tooling/_shared/run-marker`
 *  and as a relative path, which are two module instances — so a module-scoped memo minted TWO markers,
 *  the browser was stamped with one and the sweep asked about the other, and the pin failed against the
 *  fixed launcher. Publishing it makes every instance, every child process and every nested launcher agree
 *  by construction, which is exactly the property the whole marker depends on. */
export function currentRunMarker(): string {
  const existing = inheritedRunMarker();
  if (existing !== null) {
    return existing;
  }
  const minted = mintRunMarker();
  exportProcessEnv(RUN_MARKER_ENV, minted);
  return minted;
}

/** TAKE A LEASE: mint THIS process's own scoped identity and publish it, so every browser this process
 *  launches from here on carries it beside the outer run marker. It OVERWRITES any inherited value by
 *  design — inheriting a lease is how a shutdown ends up sweeping its parent's fleet (#2504), so the door
 *  that publishes one cannot also be the door that adopts one.
 *
 *  PUBLISHED RATHER THAN PASSED because the stamp site is deep (`_shared/browser.ts`'s launch doors, three
 *  frames below the daemon that owns the lease) and because two module instances under vitest must agree —
 *  the same reason `currentRunMarker` memoizes in the environment. A launcher whose stamp site is its OWN
 *  call (the CT runner hands `runLease` to `spawnCt`) mints with {@link mintRunMarker} and publishes nothing. */
export function beginRunLease(pid: number = process.pid, mintedAtMs: number = Date.now()): string {
  const lease = mintRunMarker(pid, mintedAtMs);
  exportProcessEnv(RUN_LEASE_ENV, lease);
  return lease;
}

/** The lease THIS process published, or null when it holds none. Read by the stamp sites only — a sweep
 *  never asks this question, because a sweep's subject is a value its caller minted. */
export function currentRunLease(read: (key: string) => string | undefined = processEnvValue): string | null {
  const raw = read(RUN_LEASE_ENV);
  return raw !== undefined && MARKER_RE.test(raw) ? raw : null;
}

/** THE SYNCHRONOUS ABANDONED SWEEP, for a teardown path that cannot await (a signal handler, snap's sync
 *  stage teardown). Same rule as {@link sweepAbandonedRunMarkers} — only markers whose OWNER RUN is gone —
 *  but SIGKILL with no grace, because these processes have already outlived everything that could be
 *  waiting on them. Returns one receipt per abandoned run. */
export function sweepAbandonedRunMarkersNow(deps: RunMarkerDeps = {}): readonly RunMarkerSweep[] {
  return abandonedMarkers(deps).map((marker) => sweepRunMarkerNow(marker, deps));
}

/** Every identity on the box — run marker OR lease — whose minting process is gone, minus this process's
 *  own chain. Reading BOTH channels is what lets a SIGKILLed lease owner's browsers be reaped while the
 *  outer run it was nested inside is still alive and still legitimately holds the run marker (#2504). */
function abandonedMarkers(deps: RunMarkerDeps): readonly string[] {
  const listPids = deps.listPids ?? listPidsFromProc;
  const identitiesOf = deps.identitiesOf ?? identitiesFromProc;
  const alive = deps.alive ?? aliveBySignal;
  const excluded = selfAndAncestors(deps.selfPid ?? process.pid, deps.parentOf ?? parentFromProc);
  const abandoned = new Set<string>();
  for (const pid of listPids()) {
    for (const marker of excluded.has(pid) ? [] : identitiesOf(pid)) {
      const owner = runMarkerOwnerPid(marker);
      if (owner !== null && !alive(owner)) {
        abandoned.add(marker);
      }
    }
  }
  return [...abandoned];
}

/** The signals that mean "this run is over" for a launcher's OWN process. SIGHUP is in the set because a
 *  lane's terminal going away is one of the ways a fleet got orphaned; SIGKILL cannot be handled at all,
 *  which is what {@link sweepAbandonedRunMarkers} exists to cover. */
const TEARDOWN_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

/** A disposable handle on the installed teardown handlers. `dispose()` is mandatory on every exit path —
 *  a launcher that leaves handlers installed changes the process's signal behaviour for whatever runs next. */
export interface RunMarkerTeardown {
  readonly dispose: () => void;
}

/** ARM THE Ctrl-C PATH. While a marked run is live, SIGINT/SIGTERM/SIGHUP first tear the run's own tree
 *  down — the caller's group kill, then a SYNCHRONOUS marker sweep — and then re-raise the signal with
 *  default handling, so the launcher still dies of the signal it was sent and its exit code stays honest.
 *  `marker === undefined` installs nothing and returns an inert handle: an unmarked caller keeps exactly
 *  the behaviour it had. */
export function armRunMarkerTeardown(marker: string | undefined, killGroup: () => void, deps: RunMarkerDeps = {}): RunMarkerTeardown {
  if (marker === undefined) {
    return { dispose: (): void => undefined };
  }
  const onSignal = (signal: NodeJS.Signals): void => {
    killGroup();
    const line = describeRunMarkerSweep(sweepRunMarkerNow(marker, deps));
    if (line !== null) {
      process.stderr.write(`${line}\n`);
    }
    dispose();
    process.kill(process.pid, signal);
  };
  const dispose = (): void => {
    for (const signal of TEARDOWN_SIGNALS) {
      process.removeListener(signal, onSignal);
    }
  };
  for (const signal of TEARDOWN_SIGNALS) {
    process.on(signal, onSignal);
  }
  return { dispose };
}

/** The one line a sweep writes into its caller's transcript — `null` when there was nothing to report, so
 *  a quiet run stays quiet and a sweep that DID reap says exactly what it took. */
export function describeRunMarkerSweep(sweep: RunMarkerSweep): string | null {
  const reached = new Set([...sweep.terminated, ...sweep.killed]);
  if (reached.size === 0) {
    return null;
  }
  return (
    `[run-marker] swept ${String(reached.size)} process(es) that outlived the process-group kill ` +
    `(marker ${sweep.marker}): SIGTERM ${sweep.terminated.length === 0 ? "none" : sweep.terminated.join(",")}` +
    `${sweep.killed.length === 0 ? "" : `, SIGKILL ${sweep.killed.join(",")}`}`
  );
}
