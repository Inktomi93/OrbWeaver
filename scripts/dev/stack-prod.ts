// ── stack-prod: the PRODUCTION half of `pnpm stack` ──────────────────────────────────────────────────
//
//   pnpm stack up prod [--debug] [--build]     boot production, detached, verified by INSTANCE IDENTITY
//   pnpm stack down prod                       SIGTERM → watch the bounded drain → confirm gone
//   pnpm stack restart prod [--debug] [--build]
//   pnpm stack status prod
//
// This replaces the hand-rolled incantation the debug handoff doc used to make an operator retype
// (`setsid nohup env NODE_ENV=production node … & disown`, plus `ss | grep | grep -oP pid=` to find the
// pid, plus `tail -f` to eyeball the drain). Every trap that recipe carried is closed here:
//   • cwd — `.env` AND `CLIENT_DIST_DIR` are both cwd-relative; the spawn cwd is DERIVED from this file's
//     location, so the command works from anywhere.
//   • dead boot — prod throws at startup without packages/client/dist/index.html. Checked BEFORE the old
//     instance is stopped, and reported as the build command instead of as a stack trace in a log.
//   • identity — a health check validates the PORT, and a stale incumbent answers. Nothing here trusts
//     /healthz alone: see classifyInstance in _kit/stack-mode.ts.
//   • .env editing — `--debug` arms DEBUG_TOKEN/WIRE_CAPTURE/RPG_TRACE as a spawn-time env OVERLAY. The
//     file is never written. The overlay lives on the CHILD's env object; this launcher never mutates its
//     own process.env, so nothing an operator runs later in the same shell inherits a debug posture.
//
// NO SERVER BUILD STEP: node 26 runs `packages/server/src/entry/index.ts` directly (type stripping).
// `--build` builds only the CLIENT bundle, and only through @orb/client's own `vite build` script.
//
// Dev tooling (throwaway launcher; global KISS applies — NOT the architecture). The DEV mode of
// `pnpm stack` is untouched and still lives in scripts/dev/stack.sh.

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { Dirent } from "node:fs";
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { parseEnv } from "node:util";
import type { DebugPosture, InstanceClassification, ObservedInstance, ProdRecord, StackInvocation } from "./_kit/stack-mode.ts";
import {
  buildProdSpawnPlan,
  CLIENT_DIST_INDEX_REL,
  classifyDebugPosture,
  classifyDist,
  classifyDrainTail,
  classifyInstance,
  DRAIN_WATCH_MS,
  debugConflictMessage,
  debugPostureText,
  decideDown,
  decideSpawnLock,
  decideUp,
  formatDispatch,
  mayRemovePidfile,
  parseListenerPid,
  parseProcStartTicks,
  parseProdRecord,
  parseStackArgv,
  resolveDebugArming,
  SERVER_ENTRY_REL,
  STACK_USAGE,
  serializeProdRecord,
  spawnerForPort,
} from "./_kit/stack-mode.ts";

const REPO_ROOT = join(dirname(import.meta.dirname), "..");
const DEFAULT_PORT = 8788;
const BOOT_POLL_MAX_MS = 120_000;
const POLL_INTERVAL_MS = 500;
const PROBE_TIMEOUT_MS = 2000;
const TOKEN_BYTES = 24;
const EXIT_REFUSED = 1;
const EXIT_MISUSE = 3;
// Two takes: one for the clean case, one after breaking a lock whose holder is dead.
const LOCK_TAKE_ATTEMPTS = 2;
// process.argv is [node, script, verb, ...] — the operator's own argv starts here.
const ARGV_AFTER_VERB = 3;
const MS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
// Log lines echoed when a boot dies or times out — enough to carry a stack trace, short enough to read.
const BOOT_FAILURE_LOG_LINES = 20;
const DEFAULT_LOG_LINES = 40;
// The trees whose source can make the built bundle stale. The SERVER is deliberately absent: node runs
// its .ts directly, so no server edit ever needs a client rebuild.
const CLIENT_SOURCE_DIRS = [
  "packages/client/src",
  "packages/ui/src",
  // `publicDir` is copied verbatim into outDir on every build (vite config/shared-options: publicDir), so
  // an edit here changes the shipped bundle without touching a single module.
  "packages/client/public",
];
// Non-directory inputs that also invalidate a build. `index.html` is not an afterthought in vite — it IS
// the build entry and part of the module graph (vite guide: "index.html and Project Root"), and a config
// change requires a rebuild (vite guide/build: "changes to the config and its dependencies require
// restarting the build command").
const CLIENT_SOURCE_FILES = ["packages/client/index.html", "packages/client/vite.config.ts"];

// biome-ignore lint/style/noProcessEnv: a launcher's whole job is reading the ambient env it will pass on.
const AMBIENT = process.env;

function runDir(): string {
  return AMBIENT["STACK_RUN_DIR"] ?? join(REPO_ROOT, ".cache", "stack");
}

const PIDFILE = (): string => join(runDir(), "prod.json");
const LOG_PATH = (): string => join(runDir(), "prod.log");
const TOKEN_PATH = (): string => join(runDir(), "debug-token");
const LOCK_PATH = (): string => join(runDir(), "prod.spawn.lock");

function log(msg: string): void {
  process.stdout.write(`stack[prod]: ${msg}\n`);
}

function result(line: string): void {
  process.stdout.write(`\nRESULT stack ${line}\n`);
}

// ── env + port resolution (must MATCH foundation/env, which loads .env with override:true) ───────────

function readEnvFile(): Readonly<Record<string, string | undefined>> {
  try {
    return parseEnv(readFileSync(join(REPO_ROOT, ".env"), "utf8"));
  } catch {
    return {};
  }
}

/** The port the server will ACTUALLY bind. `.env` wins over the shell — the same precedence
 *  foundation/env applies — so probing the shell's PORT alone would watch the wrong socket. */
function resolvePort(fileEnv: Readonly<Record<string, string | undefined>>): number {
  const raw = fileEnv["PORT"] ?? AMBIENT["PORT"];
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

// ── probes ───────────────────────────────────────────────────────────────────────────────────────────

async function probeHealthz(port: number): Promise<{ healthy: boolean; harness: boolean | null }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) {
      return { healthy: false, harness: null };
    }
    const body = (await res.json()) as { harness?: unknown };
    return { healthy: true, harness: typeof body.harness === "boolean" ? body.harness : null };
  } catch {
    return { healthy: false, harness: null };
  }
}

/** The debug-posture probe — and, when it answers 200, the STRONGEST instance identity available.
 *
 *  The gate never needs (or is given) the secret: 404 = the surface is off, 401 = the token gate is
 *  armed, 200 = the admin arm passed and the body carries the SERVING PROCESS'S OWN `pid`. That pid beats
 *  `ss` outright — it comes from inside the process answering on the port, not from a socket table. */
async function probeDebug(port: number): Promise<{ posture: DebugPosture; pid: number | null }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/_debug/info`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    const posture = classifyDebugPosture(res.status);
    if (posture !== "open") {
      return { posture, pid: null };
    }
    const body = (await res.json()) as { pid?: unknown };
    return { posture, pid: typeof body.pid === "number" ? body.pid : null };
  } catch {
    return { posture: "unknown", pid: null };
  }
}

function listenerPid(port: number): number | null {
  const res = spawnSync("ss", ["-ltnp"], { encoding: "utf8" });
  return res.stdout === undefined ? null : parseListenerPid(res.stdout, port);
}

function procStartTicks(pid: number): string | null {
  try {
    return parseProcStartTicks(readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return null;
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function observe(port: number): Promise<ObservedInstance & { readonly posture: DebugPosture }> {
  const health = await probeHealthz(port);
  const debug = await probeDebug(port);
  // Prefer the pid the SERVING PROCESS reports about itself; fall back to the socket table's owner.
  const pid = debug.pid ?? listenerPid(port);
  return {
    healthy: health.healthy,
    harness: health.harness,
    listenerPid: pid,
    listenerStartTicks: pid === null ? null : procStartTicks(pid),
    posture: debug.posture,
  };
}

function readRecord(): ProdRecord | null {
  try {
    return parseProdRecord(readFileSync(PIDFILE(), "utf8"));
  } catch {
    return null;
  }
}

async function classify(
  port: number,
): Promise<{ record: ProdRecord | null; observed: ObservedInstance & { readonly posture: DebugPosture }; classification: InstanceClassification }> {
  const record = readRecord();
  const observed = await observe(port);
  return { record, observed, classification: classifyInstance({ record, observed, recordProcessAlive: record !== null && processAlive(record.pid) }) };
}

// ── client bundle ────────────────────────────────────────────────────────────────────────────────────

function newestMtimeMs(dir: string): number | null {
  let newest: number | null = null;
  // `Dirent<string>`, not `ReturnType<typeof readdirSync>`: that alias resolves to the BUFFER overload
  // (`Dirent<NonSharedBuffer>`) under node's current typings, and `entry.name` then isn't a string.
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const mtime = entry.isDirectory() ? newestMtimeMs(full) : safeMtimeMs(full);
    if (mtime !== null && (newest === null || mtime > newest)) {
      newest = mtime;
    }
  }
  return newest;
}

function safeMtimeMs(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

function distVerdict(): ReturnType<typeof classifyDist> {
  const sourceMtimes = [
    ...CLIENT_SOURCE_DIRS.map((rel) => newestMtimeMs(join(REPO_ROOT, rel))),
    ...CLIENT_SOURCE_FILES.map((rel) => safeMtimeMs(join(REPO_ROOT, rel))),
  ].filter((m): m is number => m !== null);
  return classifyDist({
    distIndexMtimeMs: safeMtimeMs(join(REPO_ROOT, CLIENT_DIST_INDEX_REL)),
    newestSourceMtimeMs: sourceMtimes.length === 0 ? null : Math.max(...sourceMtimes),
  });
}

/** The ONLY build in this repo: @orb/client's own `vite build`, invoked through its package script (never
 *  a hand-rolled vite call). Runs BEFORE anything is stopped, so a failed build never leaves a live
 *  instance killed and a dead bundle behind. */
function buildClient(): boolean {
  log("building the client bundle (pnpm --filter @orb/client build)…");
  const res = spawnSync("pnpm", ["--filter", "@orb/client", "build"], { cwd: REPO_ROOT, stdio: "inherit" });
  if (res.status !== 0) {
    log("client build FAILED — nothing was stopped; the running instance (if any) is untouched.");
    return false;
  }
  return true;
}

// ── debug arming ─────────────────────────────────────────────────────────────────────────────────────

/** Mint-once-and-reuse: a re-launch that rotated the token would silently break every saved operator
 *  curl. The file is 0600 and its VALUE is never printed — status reports that debug is armed and where
 *  the token lives, never what it is (a credential echoed into a terminal is a credential leaked). */
function debugToken(): string {
  const path = TOKEN_PATH();
  try {
    const existing = readFileSync(path, "utf8").trim();
    if (existing.length > 0) {
      return existing;
    }
  } catch {
    // no token yet — mint below
  }
  const minted = randomBytes(TOKEN_BYTES).toString("hex");
  mkdirSync(runDir(), { recursive: true });
  writeFileSync(path, `${minted}\n`, { mode: 0o600 });
  return minted;
}

/** Resolve `--debug` into a spawn overlay, or refuse loudly. Returns `undefined` when debug was not asked
 *  for; exits non-zero on a `.env` conflict (see resolveDebugArming's precedence note). */
function armDebug(invocation: StackInvocation, fileEnv: Readonly<Record<string, string | undefined>>): Readonly<Record<string, string>> | undefined {
  if (!invocation.debug) {
    return;
  }
  const arming = resolveDebugArming({ fileEnv, token: debugToken() });
  if (arming.kind === "refused") {
    process.stderr.write(`${debugConflictMessage(arming.conflicts)}\n`);
    process.exit(EXIT_REFUSED);
  }
  for (const note of arming.notes) {
    log(note);
  }
  log(`debug surface ARMED — /api/_debug/* + wire capture + rpg trace. Token in ${TOKEN_PATH()} (mode 0600; not printed).`);
  return arming.overlay;
}

// ── the spawn-window lock ────────────────────────────────────────────────────────────────────────────

/** The adopt/refuse decision and the spawn are SEPARATE syscalls, so two `up prod` runs can both read
 *  "port free" and both spawn. The loser then dies on EADDRINUSE — but only after its `writeFileSync`
 *  clobbered the winner's record. `wx` is the atomic take (the same shape `scripts/dev/engines.ts` uses
 *  for its adopt window, which paid for this exact class with a duplicate vLLM fleet). A lock whose
 *  holder pid is dead is a crashed launcher's leftover and is broken loudly. */
function acquireSpawnLock(): boolean {
  mkdirSync(runDir(), { recursive: true });
  for (let attempt = 0; attempt < LOCK_TAKE_ATTEMPTS; attempt += 1) {
    if (takeSpawnLock()) {
      return true;
    }
    if (!handleHeldSpawnLock()) {
      return false;
    }
  }
  log("could not take the spawn lock after breaking a stale one — another launcher won the race; no-op.");
  return false;
}

/** The atomic take. `wx` fails if the file exists — that failure IS the mutual exclusion. */
function takeSpawnLock(): boolean {
  try {
    writeFileSync(LOCK_PATH(), `${process.pid}\n`, { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

/** Someone holds the lock. Returns true to retry the take, false to give up (a live holder owns it). */
function handleHeldSpawnLock(): boolean {
  let holder: number | null = null;
  try {
    holder = Number(readFileSync(LOCK_PATH(), "utf8").trim());
  } catch {
    holder = null; // vanished between the failed create and the read — a racing release
  }
  const action = decideSpawnLock(holder, holder !== null && processAlive(holder));
  if (action === "refuse") {
    log(`another launcher (pid ${holder ?? "?"}) is mid-spawn — this up is a no-op. Re-run when it finishes, or check \`stack status prod\`.`);
    return false;
  }
  if (action === "break-stale") {
    log(`breaking a stale spawn lock (holder pid ${holder ?? "?"} is dead).`);
    try {
      unlinkSync(LOCK_PATH());
    } catch {
      // lost the break race to another launcher — the retry's `wx` decides
    }
  }
  return true;
}

function releaseSpawnLock(): void {
  try {
    unlinkSync(LOCK_PATH());
  } catch {
    // already gone
  }
}

// ── verbs ────────────────────────────────────────────────────────────────────────────────────────────

async function doUp(invocation: StackInvocation): Promise<number> {
  const fileEnv = readEnvFile();
  const port = resolvePort(fileEnv);
  const { classification } = await classify(port);
  const decision = decideUp(classification);

  if (decision.action === "adopt") {
    log(`already up — ${decision.reason}. Adopted in place; nothing spawned.`);
    await reportDebugPosture(port);
    result(`mode=prod status=already-up port=${port} pid=${readRecord()?.pid ?? 0}`);
    return 0;
  }
  if (decision.action === "refuse") {
    const owner = spawnerForPort(port);
    log(`REFUSED — ${decision.reason}.`);
    if (owner !== undefined) {
      log(`:${port} is also the ${owner.name} port (${owner.discriminator}). Stop that first, or point PORT elsewhere.`);
    }
    result(`mode=prod status=refused port=${port}`);
    return EXIT_REFUSED;
  }

  // Build BEFORE anything else — a failed build must never leave the box with no bundle and no server.
  if (invocation.build && !buildClient()) {
    result("mode=prod status=build-failed");
    return EXIT_REFUSED;
  }
  const dist = distVerdict();
  if (dist.state === "missing") {
    log(`REFUSED — ${dist.message}`);
    result("mode=prod status=no-client-bundle");
    return EXIT_REFUSED;
  }
  if (dist.state === "stale") {
    log(`WARN — ${dist.message}`);
  }

  const overlay = armDebug(invocation, fileEnv);
  return await spawnProd(port, overlay !== undefined, overlay);
}

async function spawnProd(port: number, debug: boolean, overlay: Readonly<Record<string, string>> | undefined): Promise<number> {
  if (!acquireSpawnLock()) {
    result(`mode=prod status=spawn-locked port=${port}`);
    return EXIT_REFUSED;
  }
  try {
    return await spawnProdLocked(port, debug, overlay);
  } finally {
    releaseSpawnLock();
  }
}

/** The spawn itself, running under the spawn lock — see `acquireSpawnLock`. */
async function spawnProdLocked(port: number, debug: boolean, overlay: Readonly<Record<string, string>> | undefined): Promise<number> {
  mkdirSync(runDir(), { recursive: true });
  const plan = buildProdSpawnPlan({
    repoRoot: REPO_ROOT,
    nodePath: process.execPath,
    baseEnv: AMBIENT,
    ...(overlay === undefined ? {} : { debugOverlay: overlay }),
    logPath: LOG_PATH(),
  });
  const logFd = openSync(plan.logPath, "a");
  // `detached:true` calls setsid(2) in the child BEFORE exec — so the child is its own session/group
  // leader (pgid === pid), survives this launcher's exit, and one group-kill takes its whole tree. This
  // is the `setsid nohup … & disown` of the manual recipe, done by the runtime instead of by three
  // shell words that each had to be remembered.
  const child = spawn(plan.command, [...plan.args], { cwd: plan.cwd, env: { ...plan.env }, stdio: ["ignore", logFd, logFd], detached: true });
  // The child holds its own dups; the parent copy would leak an fd per launch (engines audit, 08-03).
  closeSync(logFd);
  if (child.pid === undefined) {
    log("spawn failed — no pid.");
    result("mode=prod status=spawn-failed");
    return EXIT_REFUSED;
  }
  const pid = child.pid;
  // unref BEFORE the poll: the handle would otherwise hold this launcher's event loop open for as long
  // as the server lives (the immortal-launcher class the engines fleet paid for).
  child.unref();
  const record: ProdRecord = {
    mode: "prod",
    pid,
    pgid: pid,
    port,
    startedAt: new Date().toISOString(),
    startTicks: procStartTicks(pid) ?? "",
    debug,
    repoRoot: REPO_ROOT,
    logPath: plan.logPath,
  };
  writeFileSync(PIDFILE(), serializeProdRecord(record));
  log(`spawned pid ${pid} (NODE_ENV=production node ${SERVER_ENTRY_REL}) — log ${plan.logPath}`);

  const deadline = Date.now() + BOOT_POLL_MAX_MS;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) {
      log("the server EXITED during boot — last log lines:");
      process.stdout.write(tailLog(BOOT_FAILURE_LOG_LINES));
      // GUARDED, never unconditional: only clear the record if it is still OURS. An overlapping `up`
      // whose child died on EADDRINUSE would otherwise delete the winner's pidfile, and `down prod`
      // would then refuse to stop the instance this tool started.
      if (mayRemovePidfile(readRecord(), pid)) {
        removePidfile();
      } else {
        log("another launcher's record is on disk — leaving its pidfile intact.");
      }
      result(`mode=prod status=boot-failed log=${plan.logPath}`);
      return EXIT_REFUSED;
    }
    // biome-ignore lint/performance/noAwaitInLoops: a readiness poll is inherently serial.
    const observed = await observe(port);
    const verdict = classifyInstance({ record, observed, recordProcessAlive: true });
    if (verdict.verdict === "ours-healthy") {
      log(`up — ${verdict.reason}`);
      await reportDebugPosture(port);
      result(`mode=prod status=up pid=${pid} port=${port} debug=${debug} log=${plan.logPath}`);
      return 0;
    }
    // biome-ignore lint/performance/noAwaitInLoops: same poll.
    await sleep(POLL_INTERVAL_MS);
  }
  log(`TIMEOUT after ${BOOT_POLL_MAX_MS / MS_PER_SECOND}s waiting for a verified-healthy instance — last log lines:`);
  process.stdout.write(tailLog(BOOT_FAILURE_LOG_LINES));
  result(`mode=prod status=boot-timeout pid=${pid} log=${plan.logPath}`);
  return EXIT_REFUSED;
}

async function doDown(): Promise<number> {
  const port = resolvePort(readEnvFile());
  const { record, classification } = await classify(port);
  const decision = decideDown(classification);
  if (decision.action === "noop") {
    log(`nothing to stop — ${decision.reason}.`);
    removePidfile();
    result(`mode=prod status=stopped port=${port}`);
    return 0;
  }
  if (decision.action === "refuse" || record === null) {
    log(`REFUSED — ${decision.reason}. This tool only signals an instance whose identity it can prove.`);
    result(`mode=prod status=refused port=${port}`);
    return EXIT_REFUSED;
  }

  const logSizeAtSignal = safeSize(record.logPath);
  log(`SIGTERM → pid ${record.pid}; watching the bounded drain (${DRAIN_WATCH_MS / MS_PER_SECOND}s max)…`);
  try {
    process.kill(record.pid, "SIGTERM");
  } catch {
    log("the process vanished before the signal landed.");
  }
  const outcome = await watchDrain(record, logSizeAtSignal);
  if (outcome === "deadline-hit") {
    log("drain deadline hit — long-lived streams were force-closed (expected during a deploy; a client saw a truncated stream).");
  } else if (outcome === "complete") {
    log("shutdown: complete");
  } else {
    log(`the process did not report a clean shutdown within ${DRAIN_WATCH_MS / MS_PER_SECOND}s — escalating to SIGKILL on the process group.`);
    try {
      process.kill(-record.pgid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  await waitGone(record.pid);
  removePidfile();
  log(`stopped (pid ${record.pid}).`);
  result(`mode=prod status=stopped pid=${record.pid} port=${port} drain=${outcome}`);
  return 0;
}

/** Watch the prod log from the byte offset at SIGTERM for the lifecycle's own shutdown lines. Reading the
 *  log (not just polling the pid) is what turns the doc's "tail -f and eyeball it" into a verdict. */
async function watchDrain(record: ProdRecord, fromOffset: number): Promise<ReturnType<typeof classifyDrainTail>> {
  const deadline = Date.now() + DRAIN_WATCH_MS;
  while (Date.now() < deadline) {
    const tail = readFrom(record.logPath, fromOffset);
    const outcome = classifyDrainTail(tail);
    if (outcome !== "pending") {
      return outcome;
    }
    if (!processAlive(record.pid)) {
      return classifyDrainTail(readFrom(record.logPath, fromOffset));
    }
    // biome-ignore lint/performance/noAwaitInLoops: a drain watch is inherently serial.
    await sleep(POLL_INTERVAL_MS);
  }
  return "pending";
}

async function waitGone(pid: number): Promise<void> {
  const deadline = Date.now() + DRAIN_WATCH_MS;
  while (Date.now() < deadline && processAlive(pid)) {
    // biome-ignore lint/performance/noAwaitInLoops: serial wait.
    await sleep(POLL_INTERVAL_MS);
  }
}

async function doStatus(): Promise<number> {
  const port = resolvePort(readEnvFile());
  const { record, observed, classification } = await classify(port);
  const dist = distVerdict();
  const foreign = observed.listenerPid !== null && classification.verdict === "foreign" ? spawnerForPort(port) : undefined;

  process.stdout.write(`mode          : prod (NODE_ENV=production · node ${SERVER_ENTRY_REL} · no server build step)\n`);
  process.stdout.write(`pidfile       : ${PIDFILE()} ${record === null ? "(none)" : `→ pid ${record.pid}, started ${record.startedAt}`}\n`);
  process.stdout.write(
    `server :${port}  : ${observed.listenerPid === null ? "not bound" : `pid ${observed.listenerPid}`} · healthz ${observed.healthy ? "ok" : "unreachable"}${observed.harness === true ? " · HARNESS STACK" : ""}\n`,
  );
  process.stdout.write(`identity      : ${classification.verdict} — ${classification.reason}\n`);
  if (foreign !== undefined) {
    process.stdout.write(`               :${port} is also the ${foreign.name} port (${foreign.discriminator})\n`);
  }
  process.stdout.write(`uptime        : ${record === null || !observed.healthy ? "—" : uptimeText(record.startedAt)}\n`);
  process.stdout.write(`debug         : ${debugPostureText(observed.posture, TOKEN_PATH())}\n`);
  process.stdout.write(`client bundle : ${dist.state} — ${dist.message}\n`);
  process.stdout.write(`log           : ${LOG_PATH()}\n`);
  result(
    `mode=prod status=${classification.verdict} port=${port} pid=${observed.listenerPid ?? 0} healthz=${observed.healthy ? "ok" : "unreachable"} debug=${observed.posture} dist=${dist.state}`,
  );
  return 0;
}

/** Report the live gate's posture after a launch — probed, never echoed from our own overlay. */
async function reportDebugPosture(port: number): Promise<void> {
  const { posture } = await probeDebug(port);
  log(`/api/_debug/*: ${debugPostureText(posture, TOKEN_PATH())}`);
}

function uptimeText(startedAt: string): string {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) {
    return "—";
  }
  const seconds = Math.round((Date.now() - started) / MS_PER_SECOND);
  return `${Math.floor(seconds / SECONDS_PER_HOUR)}h ${Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)}m ${seconds % SECONDS_PER_MINUTE}s`;
}

function removePidfile(): void {
  try {
    unlinkSync(PIDFILE());
  } catch {
    // already gone
  }
}

function safeSize(path: string): number {
  return safeMtimeMs(path) === null ? 0 : statSync(path).size;
}

function readFrom(path: string, offset: number): string {
  try {
    return readFileSync(path, "utf8").slice(offset);
  } catch {
    return "";
  }
}

function tailLog(lines: number): string {
  try {
    return `${readFileSync(LOG_PATH(), "utf8").split("\n").slice(-lines).join("\n")}\n`;
  } catch {
    return "(no log)\n";
  }
}

// ── entry ────────────────────────────────────────────────────────────────────────────────────────────

/** `debug-env` — the internal verb scripts/dev/stack.sh calls for the DEV mode's `--debug` overlay, so
 *  both modes resolve arming through ONE implementation (including the `.env` conflict refusal). Prints
 *  `KEY=value` lines on stdout; the caller reads them with `read`, never `eval`. */
function doDebugEnv(): number {
  const arming = resolveDebugArming({ fileEnv: readEnvFile(), token: debugToken() });
  if (arming.kind === "refused") {
    process.stderr.write(`${debugConflictMessage(arming.conflicts)}\n`);
    return EXIT_REFUSED;
  }
  for (const note of arming.notes) {
    process.stderr.write(`stack[debug]: ${note}\n`);
  }
  process.stderr.write(`stack[debug]: token in ${TOKEN_PATH()} (mode 0600; never printed).\n`);
  for (const [key, value] of Object.entries(arming.overlay)) {
    process.stdout.write(`${key}=${value}\n`);
  }
  return 0;
}

/** `classify` — the internal verb `scripts/dev/stack.sh` calls FIRST, for EVERY invocation, before it
 *  does anything at all. The shell used to re-implement the grammar in bash and only look for a mode in
 *  argument position 2; anything it did not recognise fell through to DEV. That is how
 *  `restart --force prod` became "SIGKILL the port holders AND the detached vLLM fleet, then boot dev" —
 *  a destructive verb aimed at the wrong mode. Now there is ONE grammar (`parseStackArgv`, the one the
 *  unit tests pin), the shell switches on its output, and anything unclassifiable exits 2 with usage. */
function doClassify(argv: readonly string[]): number {
  const parsed = parseStackArgv(argv);
  if (!parsed.ok) {
    process.stderr.write(`stack: ${parsed.error}\n${STACK_USAGE}\n`);
    return EXIT_MISUSE;
  }
  process.stdout.write(formatDispatch(parsed.invocation));
  return 0;
}

async function main(): Promise<number> {
  if (process.argv[2] === "debug-env") {
    return doDebugEnv();
  }
  if (process.argv[2] === "classify") {
    // `--` separates our verb from the operator's argv, so an operator arg named `classify` is inert.
    const sep = process.argv.indexOf("--", ARGV_AFTER_VERB);
    return doClassify(sep === -1 ? process.argv.slice(ARGV_AFTER_VERB) : process.argv.slice(sep + 1));
  }
  const parsed = parseStackArgv(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`stack[prod]: ${parsed.error}\n${STACK_USAGE}\n`);
    return EXIT_MISUSE;
  }
  const invocation = parsed.invocation;
  switch (invocation.verb) {
    case "up":
      return await doUp(invocation);
    case "down":
      return await doDown();
    case "restart": {
      // BUILD FIRST, then stop. A restart --build that stopped the server first would open a window
      // where the box has no server AND (on a failed build) no bundle to boot one against.
      if (invocation.build && !buildClient()) {
        result("mode=prod status=build-failed");
        return EXIT_REFUSED;
      }
      const down = await doDown();
      if (down !== 0) {
        return down;
      }
      return await doUp({ ...invocation, build: false });
    }
    case "status":
      return await doStatus();
    case "logs":
      process.stdout.write(tailLog(Number(invocation.rest[0] ?? DEFAULT_LOG_LINES)));
      return 0;
    default:
      process.stderr.write("stack[prod]: unreachable verb\n");
      return EXIT_MISUSE;
  }
}

process.exit(await main());
