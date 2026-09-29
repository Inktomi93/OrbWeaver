import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { PluginBridge, PluginHandlerRef, PluginInstance } from "@orb/contracts/plugin";

const execFileAsync = promisify(execFile);
const THIS_FILE = fileURLToPath(import.meta.url);
const CHILD_TIMEOUT_MS = 180_000;
const PROCESS_CLEANUP_TIMEOUT_MS = 10_000;
const PRESSURE_RECOVERY_TIMEOUT_MS = 30_000;
const PROCESS_POLL_MS = 50;
const LOGICAL_PLUGIN_COUNT = 100;
const CHURN_WORKER_MAXIMUM = 2;
const PRESSURE_WORKER_MAXIMUM = 4;
const PRESSURE_LIMIT_HEADROOM_BYTES = 32 * 1_048_576;
const PRESSURE_ALLOCATION_MEBIBYTES = 20;

type ChildMode = "baseline" | "churn" | "pressure";

interface ProcessSample {
  readonly pid: number;
  readonly parentPid: number;
  readonly rssBytes: number;
  readonly threadCount: number | null;
  readonly command: string;
}

interface RuntimeLog {
  readonly execArgv: readonly string[];
  readonly nodeOptions: null;
  readonly rssLimitBytes: number;
}

interface ChurnMessage {
  readonly kind: "churn-ready";
  readonly logicalPlugins: number;
  readonly configuredWorkerMaximum: number;
  readonly activationMs: number;
  readonly warmMs: number;
  readonly coldMs: number;
  readonly churnMs: number;
  readonly coldReloads: number;
}

interface PressureFailureMessage {
  readonly kind: "pressure-failure";
  readonly errorName: string;
}

interface PressureRecoveryMessage {
  readonly kind: "pressure-recovered";
  readonly value: string;
}

interface BaselineMessage {
  readonly kind: "baseline-ready";
}

type ChildMessage = BaselineMessage | ChurnMessage | PressureFailureMessage | PressureRecoveryMessage;

interface ProbeChild {
  readonly child: ChildProcess;
  readonly messages: ChildMessage[];
  readonly stdout: () => string;
  readonly stderr: () => string;
  readonly waitFor: <T extends ChildMessage["kind"]>(kind: T) => Promise<Extract<ChildMessage, { readonly kind: T }>>;
  marker?: string;
}

export interface PluginBrokerPlatformProofReceipt {
  readonly schemaVersion: 1;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  readonly nodeVersion: string;
  readonly endpointKind: "named-pipe" | "unix-domain-socket";
  readonly logicalPlugins: number;
  readonly configuredWorkerMaximum: number;
  readonly activationMs: number;
  readonly warmMs: number;
  readonly coldMs: number;
  readonly churnMs: number;
  readonly churnCallsPerSecond: number;
  readonly coldReloads: number;
  readonly brokerBaselineRssBytes: number;
  readonly appBaselineRssBytes: number;
  readonly appRssBytesAfterChurn: number;
  readonly brokerPid: number;
  readonly brokerRssBytesAfterChurn: number;
  readonly brokerRssBytesAfterRecovery: number;
  readonly brokerOsThreadCountAfterChurn: number | null;
  readonly peakPhysicalWorkersAfterChurn: number;
  readonly watchdogPid: number;
  readonly appDeathCleanupMs: number;
  readonly watchdogLimitBytes: number;
  readonly watchdogObservedRssBytes: number;
  readonly watchdogOvershootBytes: number;
  readonly pressureFailureName: string;
  readonly recoveryValue: string;
  readonly brokerExecArgv: readonly string[];
  readonly brokerNodeOptions: null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function processSampleFromWindows(value: unknown): ProcessSample | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const pid = finiteNumber(Reflect.get(value, "ProcessId"));
  const parentPid = finiteNumber(Reflect.get(value, "ParentProcessId"));
  const rssBytes = finiteNumber(Reflect.get(value, "WorkingSetSize"));
  const threadCount = finiteNumber(Reflect.get(value, "ThreadCount"));
  const command = Reflect.get(value, "CommandLine");
  return pid !== null && parentPid !== null && rssBytes !== null && typeof command === "string" ? { pid, parentPid, rssBytes, threadCount, command } : null;
}

async function windowsProcesses(): Promise<readonly ProcessSample[]> {
  const script = "@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,ThreadCount,CommandLine) | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync("pwsh", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    maxBuffer: 16 * 1_048_576,
  });
  const parsed: unknown = JSON.parse(stdout);
  return (Array.isArray(parsed) ? parsed : [parsed]).map(processSampleFromWindows).filter((sample): sample is ProcessSample => sample !== null);
}

function processSampleFromPs(line: string): ProcessSample | null {
  const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/u.exec(line);
  if (match === null) {
    return null;
  }
  const [, pid, parentPid, rssKib, command] = match;
  return pid === undefined || parentPid === undefined || rssKib === undefined || command === undefined
    ? null
    : { pid: Number(pid), parentPid: Number(parentPid), rssBytes: Number(rssKib) * 1024, threadCount: null, command };
}

async function darwinProcesses(): Promise<readonly ProcessSample[]> {
  const { stdout } = await execFileAsync("/bin/ps", ["-axo", "pid=,ppid=,rss=,command="], { encoding: "utf8", maxBuffer: 16 * 1_048_576 });
  return stdout
    .split("\n")
    .map(processSampleFromPs)
    .filter((sample): sample is ProcessSample => sample !== null);
}

async function linuxProcess(pid: string): Promise<ProcessSample | null> {
  const [statusResult, commandResult] = await Promise.allSettled([readFile(`/proc/${pid}/status`, "utf8"), readFile(`/proc/${pid}/cmdline`, "utf8")]);
  if (statusResult.status !== "fulfilled" || commandResult.status !== "fulfilled") {
    return null;
  }
  const parentPid = /^PPid:\s+(\d+)$/mu.exec(statusResult.value)?.[1];
  const rssKib = /^VmRSS:\s+(\d+)\s+kB$/mu.exec(statusResult.value)?.[1];
  const threadCount = /^Threads:\s+(\d+)$/mu.exec(statusResult.value)?.[1];
  if (parentPid === undefined || rssKib === undefined || threadCount === undefined) {
    return null;
  }
  return {
    pid: Number(pid),
    parentPid: Number(parentPid),
    rssBytes: Number(rssKib) * 1024,
    threadCount: Number(threadCount),
    command: commandResult.value.replaceAll("\0", " ").trim(),
  };
}

async function linuxProcesses(): Promise<readonly ProcessSample[]> {
  const entries = await readdir("/proc");
  const samples = await Promise.all(entries.filter((entry) => /^\d+$/u.test(entry)).map(linuxProcess));
  return samples.filter((sample): sample is ProcessSample => sample !== null);
}

async function processTable(): Promise<readonly ProcessSample[]> {
  if (process.platform === "win32") {
    return await windowsProcesses();
  }
  if (process.platform === "darwin") {
    return await darwinProcesses();
  }
  return await linuxProcesses();
}

function descendantsOf(rootPid: number, samples: readonly ProcessSample[]): readonly ProcessSample[] {
  const descendants: ProcessSample[] = [];
  const parents = new Set([rootPid]);
  for (;;) {
    const next = samples.filter((sample) => parents.has(sample.parentPid) && !parents.has(sample.pid));
    if (next.length === 0) {
      return descendants;
    }
    for (const sample of next) {
      parents.add(sample.pid);
      descendants.push(sample);
    }
  }
}

function runtimeProcess(descendants: readonly ProcessSample[], entry: "broker-entry.ts" | "broker-watchdog.ts"): ProcessSample {
  const matches = descendants.filter((sample) => sample.command.includes(entry));
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new Error(`plugin platform proof: expected one ${entry} descendant, observed ${matches.length}`);
  }
  return matches[0];
}

interface PluginProcessTree {
  readonly app: ProcessSample;
  readonly watchdog: ProcessSample;
  readonly broker: ProcessSample;
}

function brokerMarker(command: string): string | undefined {
  return /orb-plugin-broker-[a-zA-Z0-9-]+/u.exec(command)?.[0];
}

async function waitForProcessTree(probe: ProbeChild): Promise<PluginProcessTree> {
  const appPid = probe.child.pid;
  if (appPid === undefined) {
    throw new Error("plugin platform proof: app child has no pid");
  }
  const deadline = performance.now() + CHILD_TIMEOUT_MS;
  while (performance.now() < deadline) {
    const samples = await processTable();
    const app = samples.find((sample) => sample.pid === appPid);
    const descendants = descendantsOf(appPid, samples);
    const watchdog = descendants.find((sample) => sample.command.includes("broker-watchdog.ts"));
    const broker = descendants.find((sample) => sample.command.includes("broker-entry.ts"));
    if (app !== undefined && watchdog !== undefined && broker !== undefined) {
      const marker = brokerMarker(watchdog.command);
      if (marker === undefined || !broker.command.includes(marker)) {
        throw new Error("plugin platform proof: broker and watchdog do not share the owned endpoint marker");
      }
      probe.marker = marker;
      return { app, watchdog: runtimeProcess(descendants, "broker-watchdog.ts"), broker: runtimeProcess(descendants, "broker-entry.ts") };
    }
    await sleep(PROCESS_POLL_MS);
  }
  throw new Error("plugin platform proof: broker process tree did not appear before the deadline");
}

async function waitForOwnedProcessesToExit(pids: ReadonlySet<number>, marker: string): Promise<number> {
  const startedAt = performance.now();
  const deadline = startedAt + PROCESS_CLEANUP_TIMEOUT_MS;
  while (performance.now() < deadline) {
    const samples = await processTable();
    const live = new Set(samples.map((sample) => sample.pid));
    if ([...pids].every((pid) => !live.has(pid)) && !samples.some((sample) => sample.command.includes(marker))) {
      return performance.now() - startedAt;
    }
    await sleep(PROCESS_POLL_MS);
  }
  throw new Error(`plugin platform proof: owned broker processes remained after app death: ${marker}`);
}

function isChildMessage(value: unknown): value is ChildMessage {
  if (typeof value !== "object" || value === null || typeof Reflect.get(value, "kind") !== "string") {
    return false;
  }
  const kind = Reflect.get(value, "kind");
  if (kind === "baseline-ready") {
    return true;
  }
  if (kind === "pressure-failure") {
    return typeof Reflect.get(value, "errorName") === "string";
  }
  if (kind === "pressure-recovered") {
    return typeof Reflect.get(value, "value") === "string";
  }
  return (
    kind === "churn-ready" &&
    ["logicalPlugins", "configuredWorkerMaximum", "activationMs", "warmMs", "coldMs", "churnMs", "coldReloads"].every(
      (key) => finiteNumber(Reflect.get(value, key)) !== null,
    )
  );
}

function spawnProbe(root: string, mode: ChildMode, memoryLimitBytes: number, workerMaximum: number): ProbeChild {
  const child = spawn(process.execPath, [THIS_FILE, `--child=${mode}`, `--root=${root}`], {
    env: {
      // biome-ignore lint/style/noProcessEnv: a proof child inherits the runner environment before overriding only its broker budget inputs.
      ...process.env,
      ["NODE_ENV"]: "production",
      ["ORB_ENV_NO_FILE"]: "1",
      ["PLUGIN_BROKER_MEMORY_LIMIT_BYTES"]: String(memoryLimitBytes),
      ["PLUGIN_BROKER_WORKER_MAX"]: String(workerMaximum),
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const messages: ChildMessage[] = [];
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.on("message", (message: unknown) => {
    if (isChildMessage(message)) {
      messages.push(message);
    }
  });
  return {
    child,
    messages,
    stdout: () => stdout,
    stderr: () => stderr,
    waitFor: async <T extends ChildMessage["kind"]>(kind: T): Promise<Extract<ChildMessage, { readonly kind: T }>> => {
      const deadline = performance.now() + CHILD_TIMEOUT_MS;
      while (performance.now() < deadline) {
        const message = messages.find((candidate): candidate is Extract<ChildMessage, { readonly kind: T }> => candidate.kind === kind);
        if (message !== undefined) {
          return message;
        }
        if (child.exitCode !== null) {
          throw new Error(`plugin platform proof: ${mode} child exited ${child.exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
        }
        await sleep(PROCESS_POLL_MS);
      }
      throw new Error(`plugin platform proof: ${mode} child did not report ${kind}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    },
  };
}

async function killAppAndProveCleanup(probe: ProbeChild, tree: PluginProcessTree): Promise<number> {
  const childPid = probe.child.pid;
  if (childPid === undefined) {
    throw new Error("plugin platform proof: app child has no pid");
  }
  const exited = once(probe.child, "exit");
  if (!probe.child.kill("SIGKILL")) {
    throw new Error("plugin platform proof: app child refused the termination signal");
  }
  const marker = probe.marker;
  if (marker === undefined) {
    throw new Error("plugin platform proof: owned endpoint marker was not captured");
  }
  const [cleanupMs] = await Promise.all([waitForOwnedProcessesToExit(new Set([tree.watchdog.pid, tree.broker.pid]), marker), exited]);
  return cleanupMs;
}

async function stopProbe(probe: ProbeChild): Promise<void> {
  const pid = probe.child.pid;
  const marker =
    probe.marker ??
    (pid === undefined
      ? undefined
      : descendantsOf(pid, await processTable())
          .map((sample) => brokerMarker(sample.command))
          .find((value) => value !== undefined));
  if (probe.child.exitCode === null && probe.child.signalCode === null) {
    const exited = once(probe.child, "exit");
    probe.child.kill("SIGKILL");
    await Promise.race([exited, sleep(PROCESS_CLEANUP_TIMEOUT_MS)]);
  }
  if (marker !== undefined) {
    const owned = (await processTable()).filter((sample) => sample.command.includes(marker));
    for (const sample of owned) {
      try {
        process.kill(sample.pid, "SIGKILL");
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
          throw error;
        }
      }
    }
    await waitForOwnedProcessesToExit(new Set(), marker);
  }
}

function parseRuntimeLog(stderr: string): RuntimeLog {
  const line = stderr.split("\n").find((candidate) => candidate.startsWith("plugin broker watchdog: runtime "));
  if (line === undefined) {
    throw new Error(`plugin platform proof: watchdog runtime receipt was absent\n${stderr}`);
  }
  const parsed: unknown = JSON.parse(line.slice("plugin broker watchdog: runtime ".length));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("plugin platform proof: malformed watchdog runtime receipt");
  }
  const execArgv = Reflect.get(parsed, "execArgv");
  const nodeOptions = Reflect.get(parsed, "nodeOptions");
  const rssLimitBytes = Reflect.get(parsed, "rssLimitBytes");
  if (!(Array.isArray(execArgv) && execArgv.every((value) => typeof value === "string")) || nodeOptions !== null || finiteNumber(rssLimitBytes) === null) {
    throw new Error("plugin platform proof: malformed watchdog runtime receipt fields");
  }
  return { execArgv, nodeOptions, rssLimitBytes };
}

function parsePeakPhysicalWorkers(stderr: string, expectedMaximum: number): number {
  const prefix = "plugin broker watchdog: residency ";
  const lines = stderr.split("\n").filter((line) => line.startsWith(prefix));
  if (lines.length === 0) {
    throw new Error(`plugin platform proof: physical Worker residency receipt was absent\n${stderr}`);
  }
  let peak = 0;
  for (const line of lines) {
    const parsed: unknown = JSON.parse(line.slice(prefix.length));
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("plugin platform proof: malformed physical Worker residency receipt");
    }
    const observed = Reflect.get(parsed, "peakPhysicalWorkers");
    const maximum = Reflect.get(parsed, "workerMaximum");
    if (typeof observed !== "number" || !Number.isSafeInteger(observed) || maximum !== expectedMaximum || observed < 0 || observed > expectedMaximum) {
      throw new Error("plugin platform proof: physical Worker residency exceeded or disagreed with the configured maximum");
    }
    peak = Math.max(peak, observed);
  }
  if (peak !== expectedMaximum) {
    throw new Error(`plugin platform proof: expected ${expectedMaximum} physical Workers, observed a peak of ${peak}`);
  }
  return peak;
}

function parseWatchdogOverflow(stderr: string): { readonly observedRssBytes: number; readonly limitBytes: number } {
  const match = /plugin broker: RSS (\d+) exceeded the configured (\d+)-byte watchdog ceiling/u.exec(stderr);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error(`plugin platform proof: watchdog did not report an RSS overflow\n${stderr}`);
  }
  return { observedRssBytes: Number(match[1]), limitBytes: Number(match[2]) };
}

function probeRoot(options: { readonly root?: string } = {}): string {
  return resolve(options.root ?? process.cwd());
}

export async function runPluginBrokerPlatformProof(options: { readonly root?: string } = {}): Promise<PluginBrokerPlatformProofReceipt> {
  const root = probeRoot(options);
  const defaultLimitBytes = 1_073_741_824;

  const baseline = spawnProbe(root, "baseline", defaultLimitBytes, 1);
  let baselineRssBytes = 0;
  let appBaselineRssBytes = 0;
  try {
    await baseline.waitFor("baseline-ready");
    const baselineTree = await waitForProcessTree(baseline);
    baselineRssBytes = baselineTree.broker.rssBytes;
    appBaselineRssBytes = baselineTree.app.rssBytes;
    await killAppAndProveCleanup(baseline, baselineTree);
  } finally {
    await stopProbe(baseline);
  }

  const churn = spawnProbe(root, "churn", defaultLimitBytes, CHURN_WORKER_MAXIMUM);
  let churnMessage: ChurnMessage;
  let churnTree: PluginProcessTree;
  let runtime: RuntimeLog;
  let peakPhysicalWorkersAfterChurn: number;
  let appDeathCleanupMs: number;
  try {
    churnMessage = await churn.waitFor("churn-ready");
    churnTree = await waitForProcessTree(churn);
    await sleep(100);
    runtime = parseRuntimeLog(churn.stderr());
    peakPhysicalWorkersAfterChurn = parsePeakPhysicalWorkers(churn.stderr(), CHURN_WORKER_MAXIMUM);
    appDeathCleanupMs = await killAppAndProveCleanup(churn, churnTree);
  } finally {
    await stopProbe(churn);
  }

  const pressureLimitBytes = baselineRssBytes + PRESSURE_LIMIT_HEADROOM_BYTES;
  const pressure = spawnProbe(root, "pressure", pressureLimitBytes, PRESSURE_WORKER_MAXIMUM);
  let failure: PressureFailureMessage;
  let recovered: PressureRecoveryMessage;
  let pressureTree: PluginProcessTree;
  let overflow: { readonly observedRssBytes: number; readonly limitBytes: number };
  try {
    failure = await pressure.waitFor("pressure-failure");
    recovered = await pressure.waitFor("pressure-recovered");
    pressureTree = await waitForProcessTree(pressure);
    overflow = parseWatchdogOverflow(pressure.stderr());
    await killAppAndProveCleanup(pressure, pressureTree);
  } finally {
    await stopProbe(pressure);
  }

  if (churnMessage.logicalPlugins !== LOGICAL_PLUGIN_COUNT || churnMessage.configuredWorkerMaximum !== CHURN_WORKER_MAXIMUM) {
    throw new Error("plugin platform proof: churn receipt did not preserve the 100-to-2 logical/physical ratio");
  }
  if (churnMessage.coldReloads < LOGICAL_PLUGIN_COUNT - CHURN_WORKER_MAXIMUM) {
    throw new Error("plugin platform proof: churn did not force the expected durable cold reloads");
  }
  if (failure.errorName !== "PluginHostUnavailable") {
    throw new Error(`plugin platform proof: RSS kill surfaced ${failure.errorName} instead of PluginHostUnavailable`);
  }
  if (recovered.value !== "recovered") {
    throw new Error(`plugin platform proof: fresh lifecycle returned ${recovered.value} after watchdog restart`);
  }
  if (overflow.limitBytes !== pressureLimitBytes || overflow.observedRssBytes <= overflow.limitBytes) {
    throw new Error("plugin platform proof: watchdog overflow receipt does not match the configured calibrated limit");
  }
  if (runtime.rssLimitBytes !== defaultLimitBytes) {
    throw new Error("plugin platform proof: watchdog runtime receipt does not match the configured baseline limit");
  }

  return {
    schemaVersion: 1,
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    endpointKind: process.platform === "win32" ? "named-pipe" : "unix-domain-socket",
    logicalPlugins: churnMessage.logicalPlugins,
    configuredWorkerMaximum: churnMessage.configuredWorkerMaximum,
    activationMs: churnMessage.activationMs,
    warmMs: churnMessage.warmMs,
    coldMs: churnMessage.coldMs,
    churnMs: churnMessage.churnMs,
    churnCallsPerSecond: (LOGICAL_PLUGIN_COUNT * 1000) / churnMessage.churnMs,
    coldReloads: churnMessage.coldReloads,
    brokerBaselineRssBytes: baselineRssBytes,
    appBaselineRssBytes,
    appRssBytesAfterChurn: churnTree.app.rssBytes,
    brokerPid: churnTree.broker.pid,
    brokerRssBytesAfterChurn: churnTree.broker.rssBytes,
    brokerRssBytesAfterRecovery: pressureTree.broker.rssBytes,
    brokerOsThreadCountAfterChurn: churnTree.broker.threadCount,
    peakPhysicalWorkersAfterChurn,
    watchdogPid: churnTree.watchdog.pid,
    appDeathCleanupMs,
    watchdogLimitBytes: overflow.limitBytes,
    watchdogObservedRssBytes: overflow.observedRssBytes,
    watchdogOvershootBytes: overflow.observedRssBytes - overflow.limitBytes,
    pressureFailureName: failure.errorName,
    recoveryValue: recovered.value,
    brokerExecArgv: runtime.execArgv,
    brokerNodeOptions: runtime.nodeOptions,
  };
}

function emptyBridge(): PluginBridge {
  return {
    chat: {
      listMessages: () => Promise.resolve([]),
      getVariables: () => Promise.resolve({}),
      listCharacters: () => Promise.resolve([]),
      applyVariableOps: () => Promise.resolve({ outcome: "applied" }),
      requestTurn: () => Promise.resolve(),
    },
    worldInfo: { listBooks: () => Promise.resolve([]), listEntries: () => Promise.resolve([]), upsertEntry: () => Promise.resolve() },
    imagery: { generatePicture: () => Promise.resolve({ assetId: "asset_platform_proof" }) },
    variables: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve() },
    assets: { read: () => Promise.resolve(null), storeFetched: () => Promise.resolve({ assetId: "asset_platform_proof" }) },
    search: { documents: () => Promise.resolve([]) },
    storage: {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      list: () => Promise.resolve([]),
      compareAndSet: () => Promise.resolve({ applied: true, current: "next" }),
    },
    notifications: { post: () => Promise.resolve() },
    llm: { quiet: () => Promise.resolve({ text: "quiet" }) },
    suggest: () => Promise.resolve(),
    admitEgress: () => undefined,
    admitAssetEgress: () => undefined,
    surfaceQuickReply: () => Promise.resolve(),
    ui: { setState: () => Promise.resolve(), toast: () => Promise.resolve(), openDialog: () => Promise.resolve() },
    databank: { ingest: () => Promise.resolve({ documentId: "document_platform_proof" }) },
    character: {
      ingest: () => Promise.resolve({ characterId: "character_platform_proof", created: true }),
      ingestAsset: () => Promise.resolve({ characterId: "character_platform_proof", created: true }),
      setCardData: () => Promise.resolve(),
      getCardData: () => Promise.resolve(null),
    },
    pubsub: { emit: () => Promise.resolve() },
  };
}

function childArgument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

function sendChildMessage(message: ChildMessage): void {
  process.send?.(message);
}

async function childRuntime(
  root: string,
): Promise<ReturnType<typeof import("../../../../packages/server/src/infra/plugin-host/process-runtime.ts")["createPluginHost"]>> {
  const runtimeUrl = pathToFileURL(resolve(root, "packages/server/src/infra/plugin-host/process-runtime.ts")).href;
  const { createPluginHost } = await import(runtimeUrl);
  return createPluginHost({ nowEpochMs: Date.now, nextRandom: Math.random, mintId: randomUUID });
}

async function activateTool(
  host: Awaited<ReturnType<typeof childRuntime>>,
  source: string,
  reload: () => Promise<string> = () => Promise.resolve(source),
): Promise<{ readonly instance: PluginInstance; readonly handler: PluginHandlerRef }> {
  const outcome = await host.createInstance({ mainJs: source, reloadMainJs: reload, grants: ["tools.register"], bridge: emptyBridge(), chat: null });
  if (!outcome.ok) {
    throw new Error(outcome.error);
  }
  const handler = outcome.instance.tools[0]?.handler;
  if (handler === undefined) {
    throw new Error("plugin platform proof: tool registration was absent");
  }
  return { instance: outcome.instance, handler };
}

async function keepChildAlive(): Promise<never> {
  const timer = setInterval(() => undefined, 60_000);
  process.once("disconnect", () => clearInterval(timer));
  return await new Promise<never>(() => undefined);
}

async function runBaselineChild(root: string): Promise<never> {
  const host = await childRuntime(root);
  const outcome = await host.createInstance({
    mainJs: "'baseline';",
    reloadMainJs: () => Promise.resolve("'baseline';"),
    grants: [],
    bridge: emptyBridge(),
    chat: null,
  });
  if (!outcome.ok) {
    throw new Error(outcome.error);
  }
  sendChildMessage({ kind: "baseline-ready" });
  return await keepChildAlive();
}

function countedReload(source: string, counter: { count: number }): () => Promise<string> {
  return () => {
    counter.count += 1;
    return Promise.resolve(source);
  };
}

async function runChurnChild(root: string): Promise<never> {
  const host = await childRuntime(root);
  const residents: { readonly instance: PluginInstance; readonly handler: PluginHandlerRef }[] = [];
  const coldReloads = { count: 0 };
  const activationStartedAt = performance.now();
  for (let index = 0; index < LOGICAL_PLUGIN_COUNT; index += 1) {
    const expected = `value-${index}`;
    const source = `const h=orb.host(1);h.tools.register({name:"tool_${index}",description:"proof",parameters:{type:"object",properties:{}},handler:()=>${JSON.stringify(expected)}});`;
    residents.push(await activateTool(host, source, countedReload(source, coldReloads)));
  }
  const activationMs = performance.now() - activationStartedAt;
  const newest = residents.at(-1);
  const oldest = residents[0];
  if (newest === undefined || oldest === undefined) {
    throw new Error("plugin platform proof: churn residents were not created");
  }
  const warmStartedAt = performance.now();
  await host.invoke(newest.instance, newest.handler, "{}", null);
  const warmMs = performance.now() - warmStartedAt;
  const coldStartedAt = performance.now();
  await host.invoke(oldest.instance, oldest.handler, "{}", null);
  const coldMs = performance.now() - coldStartedAt;
  const churnStartedAt = performance.now();
  const values: string[] = [];
  for (const resident of residents) {
    values.push(await host.invoke(resident.instance, resident.handler, "{}", null));
  }
  const churnMs = performance.now() - churnStartedAt;
  if (!values.every((value, index) => value === `value-${index}`)) {
    throw new Error("plugin platform proof: churn returned a value from the wrong logical plugin");
  }
  sendChildMessage({
    kind: "churn-ready",
    logicalPlugins: residents.length,
    configuredWorkerMaximum: CHURN_WORKER_MAXIMUM,
    activationMs,
    warmMs,
    coldMs,
    churnMs,
    coldReloads: coldReloads.count,
  });
  return await keepChildAlive();
}

function pressureSource(index: number): string {
  return `
    const held=[];
    for(let i=0;i<${PRESSURE_ALLOCATION_MEBIBYTES};i+=1){const block=new Uint8Array(1048576);block.fill(i);held.push(block);}
    globalThis.__orbPressure=held;
    const h=orb.host(1);
    h.tools.register({name:"pressure_${index}",description:"proof",parameters:{type:"object",properties:{}},handler:()=>"pressure"});`;
}

async function runPressureChild(root: string): Promise<never> {
  const host = await childRuntime(root);
  const attempts = await Promise.allSettled(Array.from({ length: PRESSURE_WORKER_MAXIMUM }, (_, index) => activateTool(host, pressureSource(index))));
  const residents = attempts.flatMap((attempt) => (attempt.status === "fulfilled" ? [attempt.value] : []));
  const activationFailure = attempts.find((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected");
  let failure: unknown = activationFailure?.reason;
  const failureDeadline = performance.now() + CHILD_TIMEOUT_MS;
  while (failure === undefined && performance.now() < failureDeadline) {
    const resident = residents[0];
    if (resident === undefined) {
      break;
    }
    const result = await Promise.allSettled([host.invoke(resident.instance, resident.handler, "{}", null)]);
    const rejected = result[0];
    if (rejected?.status === "rejected") {
      failure = rejected.reason;
      break;
    }
    await sleep(PROCESS_POLL_MS);
  }
  const errorName = failure instanceof Error ? failure.name : "UnknownFailure";
  sendChildMessage({ kind: "pressure-failure", errorName });

  const recoveryDeadline = performance.now() + PRESSURE_RECOVERY_TIMEOUT_MS;
  for (let attempt = 0; performance.now() < recoveryDeadline; attempt += 1) {
    const source = `const h=orb.host(1);h.tools.register({name:"recovery_${attempt}",description:"proof",parameters:{type:"object",properties:{}},handler:()=>"recovered"});`;
    const result = await Promise.allSettled([activateTool(host, source)]);
    const recovered = result[0];
    if (recovered?.status === "fulfilled") {
      const value = await host.invoke(recovered.value.instance, recovered.value.handler, "{}", null);
      sendChildMessage({ kind: "pressure-recovered", value });
      return await keepChildAlive();
    }
    await sleep(100);
  }
  throw new Error("plugin platform proof: watchdog did not admit a fresh lifecycle after restart");
}

async function runChild(mode: ChildMode, root: string): Promise<never> {
  if (mode === "baseline") {
    return await runBaselineChild(root);
  }
  if (mode === "churn") {
    return await runChurnChild(root);
  }
  return await runPressureChild(root);
}

async function main(): Promise<void> {
  const childMode = childArgument("--child");
  const root = childArgument("--root") ?? process.cwd();
  if (childMode === "baseline" || childMode === "churn" || childMode === "pressure") {
    await runChild(childMode, root);
    return;
  }
  if (!process.argv.includes("--run-proof")) {
    return;
  }
  const output = childArgument("--json") ?? resolve(tmpdir(), `orb-plugin-broker-proof-${process.platform}.json`);
  const result = await Promise.allSettled([runPluginBrokerPlatformProof({ root })]);
  const settled = result[0];
  if (settled === undefined) {
    throw new Error("plugin platform proof: proof result was absent");
  }
  if (settled.status === "rejected") {
    const failure = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
    await writeFile(output, `${JSON.stringify({ schemaVersion: 1, platform: process.platform, error: failure }, null, 2)}\n`, "utf8");
    throw settled.reason;
  }
  const json = `${JSON.stringify(settled.value, null, 2)}\n`;
  await writeFile(output, json, "utf8");
  process.stdout.write(json);
}

await main();
