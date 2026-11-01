// @subject packages/server/src/infra/plugin-host/worker-runtime.ts
// The real broker, under its production permission flags, runs a snippet on the real worker runtime. An observer
// preloaded into that guest Worker checks, after the runtime has loaded, whether the Worker can still start a Worker.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { InvocationChat, PluginCapability } from "@orb/contracts/plugin";
import { mintTypeId } from "@orb/kit/ids";
import type { createPluginHost } from "@orb/server/infra/plugin-host";
import type { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { formatPluginBrokerArguments } from "#server/infra/plugin-host/process-argv.ts";
import { parsePluginIpcMessage } from "#server/infra/plugin-host/process-channel.ts";
import { pluginBrokerExecArgv } from "#server/infra/plugin-host/process-permission.ts";
import { parseBrokerParentMessage, parseMessageLine, serializeMessage } from "#server/infra/plugin-host/process-protocol.ts";
import { NATIVE_TIMEOUT_MS } from "./process-runtime.fixtures.ts";

const BROKER_ENTRY = fileURLToPath(new URL("../../../../packages/server/src/infra/plugin-host/broker-entry.ts", import.meta.url));
const PROBE_TAG = "orb-worker-permission-probe:";
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const DENIED = "denied:ERR_ACCESS_DENIED";

type ProbeMode = "node-with-drop" | "node-without-drop";
type IpcEnvelope = NonNullable<ReturnType<typeof parsePluginIpcMessage>>;
type BrokerFrame = NonNullable<ReturnType<typeof parseBrokerParentMessage>>;
type SnippetCommandValue = Omit<Parameters<ReturnType<typeof createPluginHost>["runSnippet"]>[0], "bridge">;

interface ProbeReport {
  readonly hasWorker: boolean;
  readonly directRead: string;
  readonly nested: string;
}

interface BrokerRun {
  readonly response: Extract<BrokerFrame, { readonly kind: "response" }>;
  readonly bridged: readonly string[];
  readonly probe: ProbeReport | undefined;
}

// Runs in every thread of the broker through `--import`; it acts only in the guest Worker. The runtime registers its
// port listener after its permission drop, so polling for that listener orders the observation after the drop. A
// Worker started with `execArgv: []` carries no permission model, which is what the drop must prevent.
function probeSource(mode: ProbeMode, target: string): string {
  return `import { readFileSync } from "node:fs";
import { isMainThread, parentPort, Worker } from "node:worker_threads";
const { tag, mode, target } = ${JSON.stringify({ tag: PROBE_TAG, mode, target })};
const NESTED = \`const { parentPort, workerData } = require("node:worker_threads");
let read;
try { read = "read:" + require("node:fs").readFileSync(workerData).length; } catch (error) { read = "denied:" + error.code; }
parentPort.postMessage((process.permission === undefined ? "unrestricted " : "restricted ") + read);\`;
const code = (error) => (error && typeof error === "object" && "code" in error ? String(error.code) : "thrown");
function directRead() {
  try { return "read:" + readFileSync(target).length; } catch (error) { return "denied:" + code(error); }
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
  const report = { hasWorker: process.permission.has("worker"), directRead: directRead(), nested: await nested() };
  process.stdout.write(tag + JSON.stringify(report) + "\\n");
}
function afterRuntimeLoads() {
  if (parentPort.listenerCount("message") > 0) { void observe(); } else { setImmediate(afterRuntimeLoads); }
}
if (!isMainThread) {
  // A Node before 26.3.0 has no permission.drop; removing it here reproduces that runtime for the refusal case.
  if (mode === "node-without-drop") { delete process.permission.drop; }
  setImmediate(afterRuntimeLoads);
}
`;
}

function isProbeReport(value: unknown): value is ProbeReport {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "hasWorker") === "boolean" &&
    typeof Reflect.get(value, "directRead") === "string" &&
    typeof Reflect.get(value, "nested") === "string"
  );
}

// Plays the watchdog's half of the inherited channel: one snippet command, whose one host call is held until the
// probe has reported, so the Worker cannot finish and be terminated before the observation lands.
async function runSnippetInBroker(directory: string, ids: ReturnType<typeof createSeededIds>, mode: ProbeMode): Promise<BrokerRun> {
  const brokerDirectory = join(directory, "broker");
  await mkdir(brokerDirectory, { mode: PRIVATE_DIRECTORY_MODE });
  const target = join(directory, "credentials_key");
  await writeFile(target, ids.uuid(), { mode: PRIVATE_FILE_MODE });
  const generation = ids.uuid();
  const broker = spawn(
    process.execPath,
    [
      ...pluginBrokerExecArgv(),
      `--import=data:text/javascript,${encodeURIComponent(probeSource(mode, target))}`,
      BROKER_ENTRY,
      ...formatPluginBrokerArguments({ directory: brokerDirectory, workerMaximum: 1, generation, nodeEnvironment: "test", logLevel: "silent" }),
    ],
    { cwd: brokerDirectory, env: { ["NODE_ENV"]: "test" }, stdio: ["ignore", "pipe", "inherit", "ipc"] },
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
  let output = "";
  broker.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    const line = output
      .split("\n")
      .slice(0, -1)
      .find((candidate) => candidate.startsWith(PROBE_TAG));
    const report: unknown = line === undefined ? undefined : JSON.parse(line.slice(PROBE_TAG.length));
    if (reported === undefined && isProbeReport(report)) {
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
  return { response, bridged, probe: reported };
}

test("a guest Worker on the real runtime cannot start a Worker after its permission drop, and still serves a host call", {
  timeout: NATIVE_TIMEOUT_MS,
}, async ({ importStagingDir, ids }) => {
  const run = await runSnippetInBroker(importStagingDir, ids, "node-with-drop");
  // Positive control: the runtime loaded under the production flags, made its host call and finished the snippet.
  expect(run.bridged).toEqual(["variables.get"]);
  expect(run.response).toMatchObject({ ok: true, value: { logLines: ["[info] served after the probe"] } });
  // The permission model is live in the Worker, so the refusal below is the drop and not a missing model.
  expect(run.probe).toEqual({ hasWorker: false, directRead: DENIED, nested: DENIED });
});

test("the runtime refuses to start on a Node without permission.drop before any guest code runs", { timeout: NATIVE_TIMEOUT_MS }, async ({
  importStagingDir,
  ids,
}) => {
  const run = await runSnippetInBroker(importStagingDir, ids, "node-without-drop");
  // The Worker ended at load: the observer never ran and the guest never reached its host call.
  expect(run.probe).toBeUndefined();
  expect(run.bridged).toEqual([]);
  expect(run.response).toMatchObject({ ok: false, error: { message: expect.stringContaining("could not drop the permission to start Workers") } });
});
