// infra/plugin-host/broker-entry — inherited parent channel and physical Worker owner.
// ASSUMES(single-replica): these maps own live Workers inside one broker; a multi-replica replacement is a
// DB-backed runtime lease and command queue, while each Worker remains owned by exactly one broker process.

import { randomUUID } from "node:crypto";
import process from "node:process";
import { Worker } from "node:worker_threads";
import type { BrokerBridgeResult, BrokerParentMessage, BrokerWorkerMessage, ParentBrokerMessage, WorkerBrokerMessage } from "./contract/process-protocol.ts";
import { parsePluginBrokerArguments } from "./process-argv.ts";
import { PluginIpcSender, parsePluginIpcMessage } from "./process-channel.ts";
import {
  encodeProcessValue,
  PLUGIN_BROKER_SYNC_TIMEOUT_MS,
  parseMessageLine,
  parseParentBrokerMessage,
  parseWorkerBrokerMessage,
  rpcError,
  serializeMessage,
} from "./process-protocol.ts";
import { PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS } from "./watchdog-policy.ts";

const SYNC_TIMEOUT_MARGIN_MS = 500;
const { workerMaximum, generation, nodeEnvironment } = parsePluginBrokerArguments(process.argv.slice(2));
if (process.send === undefined) {
  throw new Error("plugin broker: refusing to run without its watchdog's IPC channel");
}
// The watchdog enforces this broker's memory and heartbeat limits, so an unsupervised broker must serve nothing.
// POSIX reparents the broker the instant its watchdog dies; the IPC channel reports the loss on every platform,
// including Windows, where the parent pid never changes. Either signal alone counts.
const supervisorPid = process.ppid;
function supervised(): boolean {
  return process.connected && process.ppid === supervisorPid;
}
const heartbeat = setInterval(() => {
  // IPC can close after the connected check; the completion callback owns that teardown race.
  if (!process.connected) {
    return;
  }
  process.send?.(
    {
      kind: "plugin-broker-memory",
      rssBytes: process.memoryUsage.rss(),
      peakPhysicalWorkers,
      execArgv: process.execArgv,
      nodeOptions: null,
    },
    (error) => {
      if (error !== null) {
        abandon();
      }
    },
  );
}, PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS);
heartbeat.unref();

interface Runtime {
  readonly worker: Worker;
  readonly pendingCommands: Map<string, Extract<ParentBrokerMessage, { readonly kind: "command" }>["operation"]>;
  expectedExit: boolean;
  counted: boolean;
}

type PendingBridge =
  | { readonly kind: "async"; readonly runtimeId: string; readonly worker: Worker }
  | { readonly kind: "sync"; readonly runtimeId: string; readonly control: Int32Array; readonly result: Uint8Array; readonly timer: NodeJS.Timeout };

const runtimes = new Map<string, Runtime>();
const pendingBridge = new Map<string, PendingBridge>();
let physicalWorkerCount = 0;
let peakPhysicalWorkers = 0;
const sender = new PluginIpcSender(
  (message, callback) => {
    process.send?.(message, callback);
  },
  () => abandon(),
);
function send(message: BrokerParentMessage): void {
  if (supervised()) {
    sender.send({ kind: "frame", generation, frame: serializeMessage(message) });
  }
}

function settleSync(target: Extract<PendingBridge, { readonly kind: "sync" }>, response: BrokerBridgeResult): void {
  clearTimeout(target.timer);
  const bytes = new TextEncoder().encode(JSON.stringify(encodeProcessValue({ ok: response.ok, value: response.value, error: response.error })));
  const payload =
    bytes.byteLength <= target.result.byteLength
      ? bytes
      : new TextEncoder().encode(JSON.stringify({ ok: false, error: { name: "RangeError", message: "plugin broker: synchronous response too large" } }));
  target.result.set(payload);
  Atomics.store(target.control, 1, payload.byteLength);
  Atomics.store(target.control, 0, 1);
  Atomics.notify(target.control, 0);
}

function failRuntime(runtimeId: string, error: Error, notify: boolean): void {
  const runtime = runtimes.get(runtimeId);
  if (runtime === undefined) {
    return;
  }
  runtimes.delete(runtimeId);
  for (const id of runtime.pendingCommands.keys()) {
    send({ kind: "response", id, ok: false, error: rpcError(error) });
  }
  runtime.pendingCommands.clear();
  for (const [id, request] of pendingBridge) {
    if (request.runtimeId !== runtimeId) {
      continue;
    }
    pendingBridge.delete(id);
    if (request.kind === "sync") {
      settleSync(request, { kind: "bridge-result", id, ok: false, error: rpcError(error) });
    } else {
      send({ kind: "bridge-cancel", id });
    }
  }
  if (notify) {
    send({ kind: "runtime-crashed", runtimeId, error: rpcError(error) });
  }
}

async function terminateRuntime(runtimeId: string): Promise<void> {
  const runtime = runtimes.get(runtimeId);
  if (runtime === undefined) {
    return;
  }
  runtime.expectedExit = true;
  failRuntime(runtimeId, new Error("plugin broker: runtime terminated by lifecycle"), false);
  try {
    await runtime.worker.terminate();
  } finally {
    releaseWorkerSlot(runtime);
  }
}

function releaseWorkerSlot(runtime: Runtime): void {
  if (!runtime.counted) {
    return;
  }
  runtime.counted = false;
  physicalWorkerCount -= 1;
}

function terminateDetached(worker: Worker): void {
  // @orb-waive caught-failure-ownership(worker.terminate): detached termination fails the broker closed on the microtask queue. Ends if the queued throw is removed.
  worker.terminate().catch((error: unknown) => {
    queueMicrotask(() => {
      throw error;
    });
  });
}

function resetAll(): void {
  for (const [runtimeId, runtime] of runtimes) {
    runtime.expectedExit = true;
    runtimes.delete(runtimeId);
    terminateDetached(runtime.worker);
  }
  for (const [id, request] of pendingBridge) {
    pendingBridge.delete(id);
    if (request.kind === "sync") {
      settleSync(request, { kind: "bridge-result", id, ok: false, error: { name: "PluginHostUnavailable", message: "plugin broker: parent disconnected" } });
    } else {
      request.worker.postMessage({ kind: "bridge-cancel", id } satisfies BrokerWorkerMessage);
    }
  }
}

function createRuntime(runtimeId: string): Runtime {
  if (runtimes.has(runtimeId)) {
    throw new Error("plugin broker: duplicate runtime id");
  }
  if (physicalWorkerCount >= workerMaximum) {
    throw new Error(`plugin broker: physical Worker capacity (${workerMaximum}) exhausted`);
  }
  const worker = new Worker(new URL("./worker-runtime.ts", import.meta.url), {
    workerData: { runtimeId },
    // Guest Workers receive no app environment or inherited IPC authority, so do not inherit
    // process.env across this trust boundary even though QuickJS itself has no ambient Node surface.
    env: { ["NODE_ENV"]: nodeEnvironment },
  });
  const runtime: Runtime = { worker, pendingCommands: new Map(), expectedExit: false, counted: true };
  physicalWorkerCount += 1;
  peakPhysicalWorkers = Math.max(peakPhysicalWorkers, physicalWorkerCount);
  runtimes.set(runtimeId, runtime);
  worker.on("message", (value: unknown) => {
    const message = parseWorkerBrokerMessage(value);
    if (message === null) {
      const error = new Error("plugin broker: worker sent a malformed message");
      failRuntime(runtimeId, error, true);
      terminateDetached(worker);
      return;
    }
    handleWorkerMessage(runtimeId, runtime, message);
  });
  worker.on("error", (error) => failRuntime(runtimeId, error instanceof Error ? error : new Error(String(error)), true));
  worker.on("exit", (code) => {
    releaseWorkerSlot(runtime);
    if (!runtime.expectedExit && runtimes.get(runtimeId) === runtime) {
      failRuntime(runtimeId, new Error(`plugin broker: worker exited (${code})`), true);
    }
  });
  return runtime;
}

function handleWorkerMessage(runtimeId: string, runtime: Runtime, message: WorkerBrokerMessage): void {
  if (message.kind === "ready") {
    return;
  }
  if (message.kind === "bridge") {
    if (pendingBridge.has(message.id)) {
      const error = new Error("plugin broker: worker reused a pending bridge id");
      failRuntime(runtimeId, error, true);
      terminateDetached(runtime.worker);
      return;
    }
    pendingBridge.set(message.id, { kind: "async", runtimeId, worker: runtime.worker });
    send({ kind: "bridge", id: message.id, runtimeId, authorityId: message.authorityId, operation: message.operation, args: message.args });
    return;
  }
  if (message.kind === "bridge-cancel") {
    const target = pendingBridge.get(message.id);
    if (target?.runtimeId === runtimeId && pendingBridge.delete(message.id)) {
      send(message);
    } else if (target !== undefined) {
      const error = new Error("plugin broker: worker tried to cancel another runtime's bridge call");
      failRuntime(runtimeId, error, true);
      terminateDetached(runtime.worker);
    }
    return;
  }
  if (message.kind === "sync-bridge") {
    const id = `${runtimeId}:sync:${randomUUID()}`;
    const control = new Int32Array(message.control);
    const result = new Uint8Array(message.result);
    const timer = setTimeout(() => {
      const target = pendingBridge.get(id);
      if (target?.kind !== "sync") {
        return;
      }
      pendingBridge.delete(id);
      settleSync(target, {
        kind: "bridge-result",
        id,
        ok: false,
        error: { name: "PluginHostUnavailable", message: "plugin broker: synchronous parent call timed out" },
      });
    }, PLUGIN_BROKER_SYNC_TIMEOUT_MS - SYNC_TIMEOUT_MARGIN_MS);
    pendingBridge.set(id, { kind: "sync", runtimeId, control, result, timer });
    send({ kind: "bridge", id, runtimeId, authorityId: message.authorityId, operation: message.operation, args: message.args });
    return;
  }
  if (message.kind === "log") {
    send({ kind: "log", runtimeId, label: message.label, level: message.level, message: message.message });
    return;
  }
  if (message.kind === "authority-released") {
    send({ kind: "authority-released", runtimeId, authorityId: message.authorityId });
    return;
  }
  handleWorkerCommandResponse(runtimeId, runtime, message);
}

function handleWorkerCommandResponse(runtimeId: string, runtime: Runtime, message: Extract<WorkerBrokerMessage, { readonly kind: "response" }>): void {
  const operation = runtime.pendingCommands.get(message.id);
  if (operation === undefined) {
    const error = new Error("plugin broker: worker answered an unknown command id");
    failRuntime(runtimeId, error, true);
    terminateDetached(runtime.worker);
    return;
  }
  runtime.pendingCommands.delete(message.id);
  const createActivated = operation === "create" && message.ok && activationSucceeded(message.value);
  if (operation === "snippet" || operation === "dispose" || (operation === "create" && !createActivated)) {
    // Capacity is a count of physical Workers, not map entries. Do not acknowledge a terminal command until
    // termination has completed: the parent may reserve the returned slot immediately after this response.
    // @orb-waive caught-failure-ownership(terminateRuntime): termination failure becomes the command's explicit error response; success is not acknowledged before the physical Worker exits. Ends if the rejection arm stops carrying the error.
    terminateRuntime(runtimeId).then(
      () => send(message),
      (error: unknown) => send({ kind: "response", id: message.id, ok: false, error: rpcError(error) }),
    );
    return;
  }
  send(message);
}

function activationSucceeded(value: unknown): boolean {
  return typeof value === "object" && value !== null && Reflect.get(value, "ok") === true;
}

function handleCommand(message: Extract<ParentBrokerMessage, { readonly kind: "command" }>): void {
  try {
    const runtimeId = message.runtimeId;
    const runtime = message.operation === "create" || message.operation === "snippet" ? createRuntime(runtimeId) : runtimes.get(runtimeId);
    if (runtime === undefined) {
      throw new Error("plugin broker: stale or unknown runtime id");
    }
    runtime.pendingCommands.set(message.id, message.operation);
    const workerMessage: BrokerWorkerMessage = {
      kind: "command",
      id: message.id,
      operation: message.operation,
      authorityId: message.authorityId,
      value: message.value,
    };
    runtime.worker.postMessage(workerMessage);
    // @orb-waive caught-failure-ownership(error): malformed, stale, or capacity-refused commands become the matching RPC error response to the inherited parent. Ends if send stops carrying the caught error.
  } catch (error) {
    send({ kind: "response", id: message.id, ok: false, error: rpcError(error) });
  }
}

function handleParentMessage(message: ParentBrokerMessage): void {
  if (message.kind === "command") {
    handleCommand(message);
    return;
  }
  if (message.kind === "bridge-cancel") {
    const target = pendingBridge.get(message.id);
    if (target?.kind === "async") {
      target.worker.postMessage(message satisfies BrokerWorkerMessage);
    }
    return;
  }
  const target = pendingBridge.get(message.id);
  if (target === undefined) {
    return;
  }
  pendingBridge.delete(message.id);
  if (target.kind === "sync") {
    settleSync(target, message);
  } else {
    target.worker.postMessage(message satisfies BrokerWorkerMessage);
  }
}

function abandon(): void {
  sender.close();
  resetAll();
  process.exit(0);
}

process.on("message", (value: unknown) => {
  if (!supervised()) {
    abandon();
    return;
  }
  const envelope = parsePluginIpcMessage(value);
  if (envelope === null || envelope.kind !== "frame" || envelope.generation !== generation) {
    abandon();
    return;
  }
  // @orb-waive caught-failure-ownership(catch): invalid inherited-channel input terminates the broker and its Workers; the app rejects pending work on disconnect. Ends if channel loss stops rejecting app commands.
  try {
    const message = parseParentBrokerMessage(parseMessageLine(envelope.frame));
    if (message === null) {
      abandon();
      return;
    }
    handleParentMessage(message);
  } catch {
    abandon();
  }
});
sender.send({ kind: "ready", generation });
process.on("SIGTERM", abandon);
process.on("disconnect", abandon);
