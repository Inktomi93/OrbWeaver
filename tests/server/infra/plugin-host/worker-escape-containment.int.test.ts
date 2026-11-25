// @subject packages/server/src/infra/plugin-host/broker-entry.ts
// @subject packages/server/src/infra/plugin-host/watchdog-policy.ts
// What a guest Worker could do once past its WASM sandbox reaches only that Worker. The real broker runs under its
// production flags with an observer preloaded into every thread through `--import`; in a guest Worker the observer
// stands in for code that escaped QuickJS. Grown past its heap ceiling, that Worker ends alone and the same broker serves
// the next runtime. A heartbeat line it writes on the broker's stderr, the pipe the watchdog reads its beats from, is not
// read as a beat. Each case plays the watchdog's half of the inherited channel.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { InvocationChat, PluginCapability } from "@orb/contracts/plugin";
import { mintTypeId } from "@orb/kit/ids";
import { jsonValueSchema } from "@orb/kit/json";
import type { createPluginHost } from "@orb/server/infra/plugin-host";
import type { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { PLUGIN_BROKER_LIVENESS_BOUND_MS, PLUGIN_WORKER_HEAP_MAX_MEBIBYTES } from "#server/infra/plugin-host/budgets.ts";
import { formatPluginBrokerArguments } from "#server/infra/plugin-host/process-argv.ts";
import { parsePluginIpcMessage } from "#server/infra/plugin-host/process-channel.ts";
import { pluginBrokerExecArgv } from "#server/infra/plugin-host/process-permission.ts";
import { PLUGIN_BROKER_BEAT_KEY_CHARS, parseBrokerParentMessage, parseMessageLine, serializeMessage } from "#server/infra/plugin-host/process-protocol.ts";
import { readBrokerStderrLine } from "#server/infra/plugin-host/watchdog-policy.ts";
import { NATIVE_TIMEOUT_MS } from "./process-runtime.fixtures.ts";

const BROKER_ENTRY = fileURLToPath(new URL("../../../../packages/server/src/infra/plugin-host/broker-entry.ts", import.meta.url));
const PROBE_TAG = "orb-escaped-worker-probe:";
const PRIVATE_DIRECTORY_MODE = 0o700;
// Twice the ceiling, in one-MiB arrays of unboxed doubles, which live on the Worker's own heap.
const BOMB_MEBIBYTES = 2 * PLUGIN_WORKER_HEAP_MAX_MEBIBYTES;
const DOUBLES_PER_MEBIBYTE = 131_072;
// A string the guest can still build and copy inside its own 32 MiB heap: the largest value the host dumps out of it.
const LARGEST_DUMP_CHARS = 12 * 1_048_576;
// A forged beat names a resident size no live process has, so the case can tell it from the broker's own beats.
const FORGED_RSS_BYTES = 1;
const FORGED_LINES = 16;
const HEARTBEAT_KIND = "plugin-broker-memory";

type IpcEnvelope = NonNullable<ReturnType<typeof parsePluginIpcMessage>>;
type BrokerFrame = NonNullable<ReturnType<typeof parseBrokerParentMessage>>;
type SnippetResponse = Extract<BrokerFrame, { readonly kind: "response" }>;
type SnippetCommandValue = Omit<Parameters<ReturnType<typeof createPluginHost>["runSnippet"]>[0], "bridge" | "owner">;

interface ProbeTargets {
  readonly bombRuntime?: string;
  readonly forgeRuntime?: string;
}

// Runs in every thread of the broker. In a guest Worker it waits for the runtime to register its port listener, then
// does what escaped code could: grow the Worker's heap, or write heartbeat lines on stderr, which the broker's main
// thread passes to its own.
function probeSource(targets: ProbeTargets): string {
  const forged = [
    JSON.stringify({
      kind: HEARTBEAT_KIND,
      sentAtMs: Number.MAX_SAFE_INTEGER,
      rssBytes: FORGED_RSS_BYTES,
      peakPhysicalWorkers: 0,
      execArgv: [],
      nodeOptions: null,
    }),
    JSON.stringify({
      kind: HEARTBEAT_KIND,
      key: "x".repeat(PLUGIN_BROKER_BEAT_KEY_CHARS),
      sentAtMs: Number.MAX_SAFE_INTEGER,
      rssBytes: FORGED_RSS_BYTES,
      peakPhysicalWorkers: 0,
      execArgv: [],
      nodeOptions: null,
    }),
  ];
  return `import { isMainThread, parentPort, workerData } from "node:worker_threads";
const { tag, bombRuntime, forgeRuntime, bombMebibytes, doubles, forged, forgedLines } = ${JSON.stringify({
    tag: PROBE_TAG,
    ...targets,
    bombMebibytes: BOMB_MEBIBYTES,
    doubles: DOUBLES_PER_MEBIBYTE,
    forged,
    forgedLines: FORGED_LINES,
  })};
function act() {
  if (workerData.runtimeId === bombRuntime) {
    const held = [];
    for (let i = 0; i < bombMebibytes; i++) { held.push(new Array(doubles).fill(i + 0.5)); }
    process.stdout.write(tag + "survived " + held.length + "\\n");
  }
  if (workerData.runtimeId === forgeRuntime) {
    for (let i = 0; i < forgedLines; i++) { process.stderr.write(forged[i % forged.length] + "\\n"); }
    process.stdout.write(tag + "forged\\n");
  }
}
function afterRuntimeLoads() {
  if (parentPort.listenerCount("message") > 0) { act(); } else { setImmediate(afterRuntimeLoads); }
}
if (!isMainThread) { setImmediate(afterRuntimeLoads); }
`;
}

interface ProbedBroker extends AsyncDisposable {
  readonly ready: Extract<IpcEnvelope, { readonly kind: "ready" }>;
  readonly reports: readonly string[];
  /** Settles once the probe reports `report`, its first word; never, when the probe never gets that far. */
  readonly reported: (report: string) => Promise<void>;
  readonly stderr: readonly string[];
  readonly alive: () => boolean;
  /** Run one snippet whose one host call is answered once `release` settles. */
  readonly snippet: (runtimeId: string, code: string, release: Promise<unknown>) => Promise<SnippetResponse>;
}

async function startProbedBroker(directory: string, ids: ReturnType<typeof createSeededIds>, targets: ProbeTargets): Promise<ProbedBroker> {
  await using construction = new AsyncDisposableStack();
  const brokerDirectory = join(directory, "broker");
  await mkdir(brokerDirectory, { mode: PRIVATE_DIRECTORY_MODE });
  const generation = ids.uuid();
  const broker = spawn(
    process.execPath,
    [
      ...pluginBrokerExecArgv(),
      `--import=data:text/javascript,${encodeURIComponent(probeSource(targets))}`,
      BROKER_ENTRY,
      ...formatPluginBrokerArguments({ directory: brokerDirectory, workerMaximum: 2, generation, nodeEnvironment: "test", logLevel: "silent" }),
    ],
    { cwd: brokerDirectory, env: { ["NODE_ENV"]: "test" }, stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  const exited = once(broker, "exit");
  construction.defer(async () => {
    if (broker.exitCode === null && broker.signalCode === null) {
      broker.kill("SIGKILL");
    }
    await exited;
  });
  const reports: string[] = [];
  const waiting = new Map<string, PromiseWithResolvers<void>>();
  const awaitReport = (prefix: string): PromiseWithResolvers<void> => {
    const waiter = waiting.get(prefix) ?? Promise.withResolvers<void>();
    waiting.set(prefix, waiter);
    return waiter;
  };
  const stderr: string[] = [];
  const { stdout, stderr: beatPipe } = broker;
  if (!(stdout instanceof Readable && beatPipe instanceof Readable)) {
    throw new Error("test: the broker was spawned with piped stdout and stderr");
  }
  createInterface({ input: stdout }).on("line", (line) => {
    if (line.startsWith(PROBE_TAG)) {
      const report = line.slice(PROBE_TAG.length);
      reports.push(report);
      awaitReport(report.split(" ")[0] ?? report).resolve();
    }
  });
  createInterface({ input: beatPipe, crlfDelay: Number.POSITIVE_INFINITY }).on("line", (line) => stderr.push(line));

  const send = (frame: Parameters<typeof serializeMessage>[0]): void => {
    broker.send({ kind: "frame", generation, frame: serializeMessage(frame) } satisfies Extract<IpcEnvelope, { readonly kind: "frame" }>);
  };
  const releases = new Map<string, Promise<unknown>>();
  const answers = new Map<string, PromiseWithResolvers<SnippetResponse>>();
  const ready = Promise.withResolvers<Extract<IpcEnvelope, { readonly kind: "ready" }>>();
  exited.then(([code]) => {
    const gone = new Error(`test: the broker exited (${String(code)})`);
    ready.reject(gone);
    for (const answer of answers.values()) {
      answer.reject(gone);
    }
  }, ready.reject);
  broker.on("message", (raw: unknown) => {
    const envelope = parsePluginIpcMessage(raw);
    if (envelope?.kind === "ready") {
      ready.resolve(envelope);
      return;
    }
    if (envelope?.kind !== "frame") {
      return;
    }
    const frame = parseBrokerParentMessage(parseMessageLine(envelope.frame));
    if (frame?.kind === "bridge") {
      // A release that fails is the case's own wait failing; it fails the snippets waiting on the broker.
      releases.get(frame.runtimeId)?.then(
        () => send({ kind: "bridge-result", id: frame.id, ok: true, value: "after the probe" }),
        (error: unknown) => {
          for (const answer of answers.values()) {
            answer.reject(error);
          }
        },
      );
    } else if (frame?.kind === "response") {
      answers.get(frame.id)?.resolve(frame);
    }
  });
  const chat: InvocationChat = { chatId: mintTypeId("chat", ids.next), canWrite: false, automationDepth: 0 };
  const grants: readonly PluginCapability[] = ["global_vars"];
  const owned = construction.move();
  return {
    ready: await ready.promise,
    reports,
    reported: (report): Promise<void> => awaitReport(report).promise,
    stderr,
    alive: (): boolean => broker.exitCode === null && broker.signalCode === null,
    snippet: (runtimeId, code, release): Promise<SnippetResponse> => {
      const commandId = ids.uuid();
      const answer = Promise.withResolvers<SnippetResponse>();
      answers.set(commandId, answer);
      releases.set(runtimeId, release);
      const value: SnippetCommandValue = { code, grants, chat };
      send({ kind: "command", id: commandId, operation: "snippet", runtimeId, authorityId: ids.uuid(), value });
      return answer.promise;
    },
    [Symbol.asyncDispose]: (): Promise<void> => owned.disposeAsync(),
  };
}

const HELD_READ = 'orb.host(1).variables.get("held").then((value) => orb.host(1).log.info("served " + value));';

// Whether a stderr line names the forged resident size; the broker's own text lines are not JSON objects.
function forgedRss(line: string): boolean {
  const value = jsonValueSchema.parse(JSON.parse(line));
  return typeof value === "object" && value !== null && !Array.isArray(value) && value["rssBytes"] === FORGED_RSS_BYTES;
}

test("a guest Worker grown past its heap ceiling ends alone, and the same broker serves the next runtime's largest host-side copy", {
  tags: ["slow"],
  timeout: NATIVE_TIMEOUT_MS,
}, async ({ importStagingDir, ids }) => {
  const bombRuntime = ids.uuid();
  await using broker = await startProbedBroker(importStagingDir, ids, { bombRuntime });
  // The held call is answered only if the Worker outlives its growth, which a Worker with no ceiling does.
  const bombed = await broker.snippet(bombRuntime, HELD_READ, broker.reported("survived"));
  expect(bombed).toMatchObject({ ok: false, error: { message: expect.stringMatching(/memory limit/u) } });
  expect(broker.reports).toEqual([]);

  // Positive control: the broker that ran it is still serving, and the ceiling holds the largest transient an honest
  // guest makes the host build, the whole read of its settled result. A host call refuses an argument this long unread.
  const code = `const h = orb.host(1);
    h.variables.get("held").then((value) => { h.log.info("served " + value); return "x".repeat(${String(LARGEST_DUMP_CHARS)}); });`;
  const served = await broker.snippet(ids.uuid(), code, Promise.resolve());
  expect(served).toMatchObject({ ok: true, value: { logLines: ["[info] served after the probe"] } });
  expect(broker.alive()).toBe(true);
});

test("a heartbeat line a guest Worker writes on the broker's stderr is not read as a beat, while the broker's own beats are", {
  tags: ["slow"],
  timeout: NATIVE_TIMEOUT_MS,
}, async ({ importStagingDir, ids }) => {
  const forgeRuntime = ids.uuid();
  await using broker = await startProbedBroker(importStagingDir, ids, { forgeRuntime });
  const forgedLines = (): readonly string[] => broker.stderr.filter((line) => line.startsWith("{") && forgedRss(line));
  const forgedAll = (async (): Promise<void> => {
    await broker.reported("forged");
    await expect.poll(() => forgedLines().length, { timeout: NATIVE_TIMEOUT_MS }).toBe(FORGED_LINES);
  })();
  expect(await broker.snippet(forgeRuntime, HELD_READ, forgedAll)).toMatchObject({ ok: true });
  // The broker beats every interval; one liveness bound holds several of its beats.
  await expect
    .poll(() => broker.stderr.filter((line) => readBrokerStderrLine(line, broker.ready.beatKey).kind === "beat").length, {
      timeout: PLUGIN_BROKER_LIVENESS_BOUND_MS * 4,
    })
    .toBeGreaterThan(1);

  // Every forged line reached the pipe the watchdog reads, and none of them is a beat.
  expect(forgedLines().map((line) => readBrokerStderrLine(line, broker.ready.beatKey).kind)).toEqual(Array.from({ length: FORGED_LINES }, () => "unkeyed"));
});
