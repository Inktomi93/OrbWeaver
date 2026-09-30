// infra/plugin-host/broker-entry — authenticated parent socket and physical Worker owner.
// ASSUMES(single-replica): these maps own live Workers inside one broker; a multi-replica replacement is a
// DB-backed runtime lease and command queue, while each Worker remains owned by exactly one broker process.

import { randomBytes, randomUUID } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { Socket } from "node:net";
import { createServer } from "node:net";
import { dirname } from "node:path";
import process from "node:process";
import { Worker } from "node:worker_threads";
import type { BrokerBridgeResult, BrokerParentMessage, BrokerWorkerMessage, ParentBrokerMessage, WorkerBrokerMessage } from "./contract/process-protocol.ts";
import { parsePluginBrokerArguments } from "./process-argv.ts";
import {
  encodeProcessValue,
  PLUGIN_BROKER_MESSAGE_MAX_BYTES,
  PLUGIN_BROKER_PROTOCOL_VERSION,
  PLUGIN_BROKER_SYNC_TIMEOUT_MS,
  parseMessageLine,
  parseParentBrokerMessage,
  parseWorkerBrokerMessage,
  rpcError,
  serializeMessage,
  tokenMatches,
} from "./process-protocol.ts";
import { PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS } from "./watchdog-policy.ts";

const TOKEN_MIN_CHARS = 32;
const TOKEN_MAX_CHARS = 128;
const PRIVATE_MODE_BASE = 0o100;
const SYNC_TIMEOUT_MARGIN_MS = 500;
const AUTH_TIMEOUT_MS = 5000;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const { socketPath, tokenPath, workerMaximum, nodeEnvironment } = parsePluginBrokerArguments(process.argv.slice(2));
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
  // The watchdog's own IPC channel can close between ticks (its own forced teardown) — `process.send`
  // outside of that guard throws an uncaught 'error' event on the process object with nothing armed to
  // catch it, crashing this broker over a heartbeat nobody would have read anyway.
  if (!process.connected) {
    return;
  }
  process.send?.({
    kind: "plugin-broker-memory",
    rssBytes: process.memoryUsage.rss(),
    peakPhysicalWorkers,
    execArgv: process.execArgv,
    nodeOptions: null,
  });
}, PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS);
heartbeat.unref();

function readOrCreateToken(path: string): string {
  try {
    const stat = lstatSync(path);
    const privateOnPosix =
      process.platform === "win32" || (stat.mode % PRIVATE_MODE_BASE === 0 && (process.getuid === undefined || stat.uid === process.getuid()));
    if (!(stat.isFile() && privateOnPosix)) {
      throw new Error("plugin broker: token file must be a private regular file for the broker account");
    }
    const existing = readFileSync(path, "utf8").trim();
    if (existing.length < TOKEN_MIN_CHARS || existing.length > TOKEN_MAX_CHARS) {
      throw new Error("plugin broker: token file length is outside the accepted range");
    }
    return existing;
    // @orb-waive caught-failure-ownership(error): ENOENT alone is the create-new-token state; every other read or validation failure is rethrown. Ends if a second error code is accepted here.
  } catch (error) {
    if (!(error instanceof Error && "code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }
  mkdirSync(dirname(path), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const token = randomBytes(TOKEN_MIN_CHARS).toString("base64url");
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, token, { mode: PRIVATE_FILE_MODE, flag: "wx" });
  renameSync(temporary, path);
  return token;
}

interface Runtime {
  readonly worker: Worker;
  readonly pendingCommands: Map<string, Extract<ParentBrokerMessage, { readonly kind: "command" }>["operation"]>;
  expectedExit: boolean;
  counted: boolean;
}

type PendingBridge =
  | { readonly kind: "async"; readonly runtimeId: string; readonly worker: Worker }
  | { readonly kind: "sync"; readonly runtimeId: string; readonly control: Int32Array; readonly result: Uint8Array; readonly timer: NodeJS.Timeout };

const token = readOrCreateToken(tokenPath);
const runtimes = new Map<string, Runtime>();
const pendingBridge = new Map<string, PendingBridge>();
let physicalWorkerCount = 0;
let peakPhysicalWorkers = 0;
let activeSocket: Socket | undefined;
let authenticated = false;
const socketIsNamedPipe = process.platform === "win32" && socketPath.startsWith("\\\\.\\pipe\\");

function send(message: BrokerParentMessage): void {
  if (activeSocket !== undefined && !activeSocket.destroyed) {
    activeSocket.write(serializeMessage(message));
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
    // The broker owns the socket and token-file path. A guest Worker needs neither, so do not inherit
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
    // @orb-waive caught-failure-ownership(error): malformed, stale, or capacity-refused commands become the matching RPC error response to the authenticated parent. Ends if send stops carrying the caught error.
  } catch (error) {
    send({ kind: "response", id: message.id, ok: false, error: rpcError(error) });
  }
}

function handleParentMessage(message: ParentBrokerMessage): void {
  if (!authenticated) {
    if (message.kind !== "authenticate" || message.version !== PLUGIN_BROKER_PROTOCOL_VERSION || !tokenMatches(token, message.token)) {
      activeSocket?.destroy();
      return;
    }
    authenticated = true;
    activeSocket?.setTimeout(0);
    send({ kind: "authenticated", version: PLUGIN_BROKER_PROTOCOL_VERSION });
    return;
  }
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
  if (message.kind === "bridge-result") {
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
}

if (!socketIsNamedPipe) {
  mkdirSync(dirname(socketPath), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  chmodSync(dirname(socketPath), PRIVATE_DIRECTORY_MODE);
  rmSync(socketPath, { force: true });
}
// `server.close` alone stops new accepts but keeps serving the open app connection, so drop that too; its close
// handler resets every runtime and exits.
function abandon(): void {
  resetAll();
  server.close(() => process.exit(0));
  activeSocket?.destroy();
}

const server = createServer((socket) => {
  if (!supervised()) {
    socket.destroy();
    abandon();
    return;
  }
  if (activeSocket !== undefined && !activeSocket.destroyed) {
    socket.destroy();
    return;
  }
  activeSocket = socket;
  authenticated = false;
  let buffer = "";
  socket.setTimeout(AUTH_TIMEOUT_MS, () => socket.destroy());
  socket.setEncoding("utf8");
  // The parent's own forced teardown (a SIGKILL to the watchdog, an abrupt destroy) can reset this
  // connection at the OS level. With no listener, Node's default for an unhandled 'error' event is to
  // throw, crashing this broker process — the "close" handler below already does the one full reset either
  // arm needs, so an error here needs no separate handling.
  socket.on("error", () => undefined);
  socket.on("data", (chunk) => {
    buffer += chunk;
    if (Buffer.byteLength(buffer, "utf8") > PLUGIN_BROKER_MESSAGE_MAX_BYTES && !buffer.includes("\n")) {
      socket.destroy();
      return;
    }
    for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
      if (!supervised()) {
        abandon();
        return;
      }
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      try {
        const message = parseParentBrokerMessage(parseMessageLine(line));
        if (message === null) {
          socket.destroy();
          return;
        }
        handleParentMessage(message);
        // @orb-waive caught-failure-ownership(catch): malformed authenticated wire input destroys the sole parent socket; close then resets every runtime and pending bridge. Ends if socket close stops owning full broker reset.
      } catch {
        socket.destroy();
        return;
      }
    }
  });
  socket.on("close", () => {
    if (activeSocket === socket) {
      activeSocket = undefined;
      authenticated = false;
      resetAll();
      server.close(() => process.exit(0));
    }
  });
});

server.listen(socketPath, () => {
  if (!socketIsNamedPipe) {
    chmodSync(socketPath, PRIVATE_FILE_MODE);
  }
});
process.on("SIGTERM", abandon);
process.on("disconnect", abandon);
