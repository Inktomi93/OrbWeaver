// @subject packages/server/src/infra/plugin-host/worker-runtime.ts
// @subject packages/server/src/infra/plugin-host/process-permission.ts
// The real broker, under its production permission flags, runs a snippet on the real worker runtime. An observer
// preloaded into that guest Worker checks, after the runtime has loaded, whether the Worker can still start a Worker.
// The same observer, in the broker's main thread and in the guest Worker, tries what the permission flags deny: a read
// of the data dir's key, the workspace root and its `.env`, and on Linux the app's process environment; the `node:sqlite`
// builtin, which the permission model does not gate; a child process; and a loopback connection. Each denial has its
// positive in the same run: a read of the code the broker loads, and the test process's own sqlite, spawn and connect.

import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { InvocationChat, PluginCapability } from "@orb/contracts/plugin";
import { mintTypeId } from "@orb/kit/ids";
import type { createPluginHost } from "@orb/server/infra/plugin-host";
import type { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";
import { formatPluginBrokerArguments } from "#server/infra/plugin-host/process-argv.ts";
import { parsePluginIpcMessage } from "#server/infra/plugin-host/process-channel.ts";
import { pluginBrokerExecArgv } from "#server/infra/plugin-host/process-permission.ts";
import { parseBrokerParentMessage, parseMessageLine, serializeMessage } from "#server/infra/plugin-host/process-protocol.ts";
import { NATIVE_TIMEOUT_MS } from "./process-runtime.fixtures.ts";

const BROKER_ENTRY = fileURLToPath(new URL("../../../../packages/server/src/infra/plugin-host/broker-entry.ts", import.meta.url));
const PROBE_TAG = "orb-worker-permission-probe:";
const MAIN_PROBE_TAG = "orb-broker-permission-probe:";
const WORKSPACE_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
// The reads a broker thread is denied beyond the staged key: the workspace data dir's key, the workspace root's manifest,
// which exists in every checkout, its `.env` and, on Linux, the parent process's environment.
const DENIED_READS = [
  join(WORKSPACE_ROOT, "data", "secrets", "credentials_key"),
  join(WORKSPACE_ROOT, "package.json"),
  join(WORKSPACE_ROOT, ".env"),
  ...(process.platform === "linux" ? [`/proc/${String(process.pid)}/environ`] : []),
];
// Code the broker loads, which its flags grant.
const ALLOWED_READ = join(WORKSPACE_ROOT, "packages", "server", "package.json");
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const DENIED = "denied:ERR_ACCESS_DENIED";

type ProbeMode = "node-with-drop" | "node-without-drop";
type IpcEnvelope = NonNullable<ReturnType<typeof parsePluginIpcMessage>>;
type BrokerFrame = NonNullable<ReturnType<typeof parseBrokerParentMessage>>;
type SnippetCommandValue = Omit<Parameters<ReturnType<typeof createPluginHost>["runSnippet"]>[0], "bridge" | "owner">;

// What one thread of the broker could do of what its permission flags deny: each path's read, whether the `node:sqlite`
// builtin is present, a child process start, and a loopback connection.
const restrictionsSchema = z.strictObject({
  reads: z.record(z.string(), z.string()),
  sqlite: z.enum(["present", "absent"]),
  spawn: z.string(),
  net: z.string(),
});
type Restrictions = z.infer<typeof restrictionsSchema>;

interface ProbeReport extends Restrictions {
  readonly hasWorker: boolean;
  readonly directRead: string;
  readonly nested: string;
}

const probeReportSchema = restrictionsSchema.extend({ hasWorker: z.boolean(), directRead: z.string(), nested: z.string() });

/** The paths each broker thread tries to read, and the loopback port it tries to reach. */
interface RestrictionTargets {
  readonly reads: readonly string[];
  readonly port: number;
}

interface BrokerRun {
  readonly response: Extract<BrokerFrame, { readonly kind: "response" }>;
  readonly bridged: readonly string[];
  readonly probe: ProbeReport | undefined;
  readonly main: Restrictions | undefined;
}

// Runs in every thread of the broker through `--import`. In the main thread it reports what that thread can do at once;
// in the guest Worker it waits for the runtime. The runtime registers its port listener after its permission drop, so
// polling for that listener orders the observation after the drop. A Worker started with `execArgv: []` carries no
// permission model, which is what the drop must prevent.
function probeSource(mode: ProbeMode, target: string, restricted: RestrictionTargets): string {
  return `import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { connect } from "node:net";
import { isMainThread, parentPort, Worker } from "node:worker_threads";
const { tag, mainTag, mode, target, reads, port } = ${JSON.stringify({ tag: PROBE_TAG, mainTag: MAIN_PROBE_TAG, mode, target, ...restricted })};
const NESTED = \`const { parentPort, workerData } = require("node:worker_threads");
let read;
try { read = "read:" + require("node:fs").readFileSync(workerData).length; } catch (error) { read = "denied:" + error.code; }
parentPort.postMessage((process.permission === undefined ? "unrestricted " : "restricted ") + read);\`;
const code = (error) => (error && typeof error === "object" && "code" in error ? String(error.code) : "thrown");
function readOutcome(path) {
  try { return "read:" + readFileSync(path).length; } catch (error) { return "denied:" + code(error); }
}
function directRead() {
  return readOutcome(target);
}
function spawnOutcome() {
  try { spawn(process.execPath, ["--version"], { stdio: "ignore" }).kill(); return "spawned"; } catch (error) { return "denied:" + code(error); }
}
function netOutcome() {
  return new Promise((resolve) => {
    try {
      const socket = connect({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve("connected"); });
      socket.once("error", (error) => resolve("denied:" + code(error)));
    } catch (error) { resolve("denied:" + code(error)); }
  });
}
async function restrictions() {
  return {
    reads: Object.fromEntries(reads.map((path) => [path, readOutcome(path)])),
    sqlite: process.getBuiltinModule("node:sqlite") === undefined ? "absent" : "present",
    spawn: spawnOutcome(),
    net: await netOutcome(),
  };
}
function nested() {
  return new Promise((resolve) => {
    let child;
    try { child = new Worker(NESTED, { eval: true, execArgv: [], workerData: target }); } catch (error) { resolve("denied:" + code(error)); return; }
    child.once("message", (value) => { resolve(String(value)); void child.terminate(); });
    child.once("error", (error) => resolve("nested-error:" + code(error)));
  });
}
async function observe() {
  const report = { hasWorker: process.permission.has("worker"), directRead: directRead(), nested: await nested(), ...(await restrictions()) };
  process.stdout.write(tag + JSON.stringify(report) + "\\n");
}
function afterRuntimeLoads() {
  if (parentPort.listenerCount("message") > 0) { void observe(); } else { setImmediate(afterRuntimeLoads); }
}
if (isMainThread) {
  void restrictions().then((report) => process.stdout.write(mainTag + JSON.stringify(report) + "\\n"));
} else {
  // A Node before 26.3.0 has no permission.drop; removing it here reproduces that runtime for the refusal case.
  if (mode === "node-without-drop") { delete process.permission.drop; }
  setImmediate(afterRuntimeLoads);
}
`;
}

// The last report a broker line carries under `prefix`, or undefined.
function taggedReport<T>(output: string, prefix: string, schema: z.ZodType<T>): T | undefined {
  const line = output
    .split("\n")
    .slice(0, -1)
    .find((candidate) => candidate.startsWith(prefix));
  return line === undefined ? undefined : schema.parse(JSON.parse(line.slice(prefix.length)));
}

// Plays the watchdog's half of the inherited channel: one snippet command, whose one host call is held until the
// probe has reported, so the Worker cannot finish and be terminated before the observation lands.
async function runSnippetInBroker(
  directory: string,
  ids: ReturnType<typeof createSeededIds>,
  mode: ProbeMode,
  restricted: RestrictionTargets,
): Promise<BrokerRun> {
  const brokerDirectory = join(directory, "broker");
  await mkdir(brokerDirectory, { mode: PRIVATE_DIRECTORY_MODE });
  const target = join(directory, "credentials_key");
  await writeFile(target, ids.uuid(), { mode: PRIVATE_FILE_MODE });
  const generation = ids.uuid();
  const broker = spawn(
    process.execPath,
    [
      ...pluginBrokerExecArgv(),
      `--import=data:text/javascript,${encodeURIComponent(probeSource(mode, target, { reads: [target, ...restricted.reads], port: restricted.port }))}`,
      BROKER_ENTRY,
      ...formatPluginBrokerArguments({ directory: brokerDirectory, workerMaximum: 1, generation, nodeEnvironment: "test", logLevel: "silent" }),
    ],
    // The broker writes its heartbeats on stderr, which only a watchdog reads.
    { cwd: brokerDirectory, env: { ["NODE_ENV"]: "test" }, stdio: ["ignore", "pipe", "ignore", "ipc"] },
  );
  await using lifetime = new AsyncDisposableStack();
  const exited = once(broker, "exit");
  lifetime.defer(async () => {
    if (broker.exitCode === null && broker.signalCode === null) {
      broker.kill("SIGKILL");
    }
    await exited;
  });
  const probe = Promise.withResolvers<ProbeReport>();
  let reported: ProbeReport | undefined;
  let main: Restrictions | undefined;
  let output = "";
  broker.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    main ??= taggedReport(output, MAIN_PROBE_TAG, restrictionsSchema);
    const report = taggedReport(output, PROBE_TAG, probeReportSchema);
    if (reported === undefined && report !== undefined) {
      reported = report;
      probe.resolve(report);
    }
  });
  const send = (frame: Parameters<typeof serializeMessage>[0]): void => {
    broker.send({ kind: "frame", generation, frame: serializeMessage(frame) } satisfies Extract<IpcEnvelope, { readonly kind: "frame" }>);
  };
  const chat: InvocationChat = { chatId: mintTypeId("chat", ids.next), canWrite: false, automationDepth: 0 };
  const grants: readonly PluginCapability[] = ["global_vars"];
  const value: SnippetCommandValue = { code: 'orb.host(1).variables.get("held").then((value) => orb.host(1).log.info("served " + value));', grants, chat };
  const commandId = ids.uuid();
  const bridged: string[] = [];
  const response = await new Promise<BrokerRun["response"]>((resolve, reject) => {
    exited.then(([code]) => reject(new Error(`test: broker exited before it answered (${String(code)})`)), reject);
    broker.on("message", (raw: unknown) => {
      const envelope = parsePluginIpcMessage(raw);
      if (envelope?.kind === "ready") {
        send({ kind: "command", id: commandId, operation: "snippet", runtimeId: ids.uuid(), authorityId: ids.uuid(), value });
        return;
      }
      if (envelope?.kind !== "frame") {
        return;
      }
      const frame = parseBrokerParentMessage(parseMessageLine(envelope.frame));
      if (frame?.kind === "bridge") {
        bridged.push(frame.operation);
        probe.promise.then(() => send({ kind: "bridge-result", id: frame.id, ok: true, value: "after the probe" }), reject);
      } else if (frame?.kind === "response" && frame.id === commandId) {
        resolve(frame);
      }
    });
  });
  return { response, bridged, probe: reported, main };
}

// A loopback listener the broker's threads try to reach; this process's own connection to it is the positive.
async function loopbackListener(): Promise<{ readonly port: number } & AsyncDisposable> {
  const server = createServer((socket) => socket.end());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("test: the loopback listener has no TCP port");
  }
  return {
    port: address.port,
    [Symbol.asyncDispose]: async (): Promise<void> => {
      server.close();
      await once(server, "close");
    },
  };
}

function connected(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

test("a guest Worker on the real runtime cannot start a Worker after its permission drop, and still serves a host call", {
  timeout: NATIVE_TIMEOUT_MS,
}, async ({ importStagingDir, ids }) => {
  await using listener = await loopbackListener();
  const run = await runSnippetInBroker(importStagingDir, ids, "node-with-drop", { reads: [...DENIED_READS, ALLOWED_READ], port: listener.port });
  // Positive control: the runtime loaded under the production flags, made its host call and finished the snippet.
  expect(run.bridged).toEqual(["variables.get"]);
  expect(run.response).toMatchObject({ ok: true, value: { logLines: ["[info] served after the probe"] } });
  // The permission model is live in the Worker, so the refusal below is the drop and not a missing model.
  expect(run.probe).toMatchObject({ hasWorker: false, directRead: DENIED, nested: DENIED });

  // Positive controls for the denials below: outside the broker's flags, this process reaches the same listener, holds
  // the sqlite builtin and starts a child.
  expect(await connected(listener.port)).toBe(true);
  expect(process.getBuiltinModule("node:sqlite")).toBeDefined();
  expect(spawnSync(process.execPath, ["--version"]).status).toBe(0);
  const threads = { main: run.main, worker: run.probe };
  for (const thread of Object.values(threads)) {
    // Every read but the broker's own code is denied: the data dir's key and each of `DENIED_READS`.
    const reads = Object.entries(thread?.reads ?? {});
    expect(Object.keys(thread?.reads ?? {})).toEqual(expect.arrayContaining([...DENIED_READS, ALLOWED_READ]));
    expect(reads.filter(([path]) => path !== ALLOWED_READ).map(([, outcome]) => outcome)).toEqual(
      Array.from({ length: DENIED_READS.length + 1 }, () => DENIED),
    );
    expect(reads.find(([path]) => path === ALLOWED_READ)?.[1]).toMatch(/^read:[1-9]/u);
    expect(thread).toMatchObject({ sqlite: "absent", spawn: DENIED, net: DENIED });
  }
});

test("the runtime refuses to start on a Node without permission.drop before any guest code runs", { timeout: NATIVE_TIMEOUT_MS }, async ({
  importStagingDir,
  ids,
}) => {
  await using listener = await loopbackListener();
  const run = await runSnippetInBroker(importStagingDir, ids, "node-without-drop", { reads: [], port: listener.port });
  // The Worker ended at load: the observer never ran and the guest never reached its host call.
  expect(run.probe).toBeUndefined();
  expect(run.bridged).toEqual([]);
  expect(run.response).toMatchObject({ ok: false, error: { message: expect.stringContaining("could not drop the permission to start Workers") } });
});
