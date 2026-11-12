// infra/plugin-host/broker-entry — inherited parent channel and physical Worker owner.
// ASSUMES(single-replica): these maps own live Workers inside one broker; a multi-replica replacement is a
// DB-backed runtime lease and command queue, while each Worker remains owned by exactly one broker process.
//
// A STUCK WORKER ENDS ALONE (D347). One native call or one interrupt poll period has a length the guest picks, so the
// guest-CPU window cannot end it, and nothing in that Worker's thread runs until it returns. The broker's thread
// can: each Worker reports its open span of guest work in shared slots, and a span still open
// `PLUGIN_WORKER_OVERRUN_MAX_MS` past its window terminates that Worker. Nothing a command does ends this broker: only
// its watchdog does, when this thread's heartbeat stops, and the heartbeat timer runs whatever the Workers are doing.

import { randomUUID } from "node:crypto";
import { write } from "node:fs";
import process from "node:process";
import { Worker } from "node:worker_threads";
import {
  PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS,
  PLUGIN_COMMAND_CPU_BUDGET_MS,
  PLUGIN_WORKER_OVERRUN_MAX_MS,
  PLUGIN_WORKER_SPAN_CHECK_MS,
  pluginIpcShareBytes,
} from "./budgets.ts";
import type {
  BrokerBridgeResult,
  BrokerParentMessage,
  BrokerWorkerMessage,
  ParentBrokerMessage,
  PluginFrameRoute,
  WorkerBrokerMessage,
} from "./contract/process-protocol.ts";
import { parsePluginBrokerArguments } from "./process-argv.ts";
import { PluginIpcSender, PluginIpcShares, parsePluginIpcMessage } from "./process-channel.ts";
import {
  channelFullBridgeResult,
  channelFullResponse,
  encodeProcessValue,
  PLUGIN_BROKER_SYNC_TIMEOUT_MS,
  PLUGIN_HOST_UNAVAILABLE,
  PLUGIN_INVOCATION_ENDED,
  PLUGIN_STALE_RUNTIME,
  parseMessageLine,
  parseParentBrokerMessage,
  parseWorkerBrokerMessage,
  rpcError,
  SPAN_CLOSED_TOTAL_SLOT,
  SPAN_SEQUENCE_SLOT,
  SPAN_SLOTS_BYTES,
  SPAN_WINDOW_SLOT,
  serializeMessage,
} from "./process-protocol.ts";

const SYNC_TIMEOUT_MARGIN_MS = 500;
const { workerMaximum, generation, nodeEnvironment, logLevel } = parsePluginBrokerArguments(process.argv.slice(2));
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
// Beats go on stderr, never behind a frame: a large frame in the IPC queue would hold every beat sent after it until it
// is read, and the watchdog would see a working broker as silent (D347). The watchdog pipes this process's stderr,
// reads each beat line and passes any other line on to its own stderr. This thread still sends each beat, so a hung
// main thread is silent there too; a Worker's stderr reaches it only through this thread.
//
// THE WRITE NEVER BLOCKS THIS THREAD. Node writes `process.stderr` synchronously to a pipe on Windows, so a beat goes
// through `fs.write` on the thread pool instead, one at a time, to the descriptor Node fixes for stderr on every
// platform. A beat due while the last write is still pending is skipped, not queued: a watchdog that stops reading
// holds one pool thread and no memory, and this thread goes on ending stuck Workers and forwarding their messages.
// Once Node has opened `process.stderr` on a POSIX pipe the descriptor is non-blocking, so a full pipe answers `EAGAIN`
// (the beat is dropped whole) or takes part of a line (the rest goes first next time, so every line stays one beat).
// `EPIPE` means the watchdog is gone, and an unsupervised broker serves nothing.
const beatDescriptor = process.stderr.fd;
let beatPending = false;
let unwrittenBeat: Buffer | null = null;
function writeBeat(line: Buffer): void {
  beatPending = true;
  write(beatDescriptor, line, (error, written) => {
    beatPending = false;
    if (error === null) {
      unwrittenBeat = written < line.byteLength ? line.subarray(written) : null;
      return;
    }
    if (error.code === "EAGAIN") {
      return;
    }
    // Any other fault but a closed pipe is a defect and stays loud.
    if (error.code !== "EPIPE") {
      throw error;
    }
    abandon();
  });
}
const heartbeat = setInterval(() => {
  if (!process.connected || beatPending) {
    return;
  }
  if (unwrittenBeat !== null) {
    writeBeat(unwrittenBeat);
    return;
  }
  const beat = {
    kind: "plugin-broker-memory",
    sentAtMs: performance.now(),
    rssBytes: process.memoryUsage.rss(),
    peakPhysicalWorkers,
    execArgv: process.execArgv,
    nodeOptions: null,
  };
  writeBeat(Buffer.from(`${JSON.stringify(beat)}\n`));
}, PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS);
heartbeat.unref();

interface Runtime {
  readonly worker: Worker;
  /** The share of the queues this runtime's frames are charged to, held until its Worker exits. */
  readonly share: string;
  readonly pendingCommands: Map<string, Extract<ParentBrokerMessage, { readonly kind: "command" }>["operation"]>;
  /** The Worker's span slots: the open span's sequence (0 when none) and its window. */
  readonly spans: Int32Array;
  /** The span this broker last saw open, and when it first saw it, on this broker's own clock. */
  watched: { readonly sequence: number; readonly sinceMs: number };
  /** The oldest pending command as this broker first saw it, with the Worker's closed-span total at that moment. */
  command: { readonly id: string; readonly closedTotalAtStartMs: number } | undefined;
  expectedExit: boolean;
  counted: boolean;
}

type PendingBridge =
  | { readonly kind: "async"; readonly runtimeId: string; readonly worker: Worker }
  | { readonly kind: "sync"; readonly runtimeId: string; readonly control: Int32Array; readonly result: Uint8Array; readonly timer: NodeJS.Timeout };

const runtimes = new Map<string, Runtime>();
const shares = new PluginIpcShares();
// What still keeps a runtime's share from the next runtime: its Worker, until it exits and can send nothing more, and
// the parent, until it forgets the runtime on its last frame. Each hop is in order, so by then every frame charged to the
// share has crossed every hop, and the next holder inherits no bytes (D348).
const SHARE_HOLDERS = ["worker", "parent"] as const;
type ShareHolder = (typeof SHARE_HOLDERS)[number];
const shareHolds = new Map<string, Set<ShareHolder>>();

function dropShareHold(runtimeId: string, holder: ShareHolder): void {
  const holds = shareHolds.get(runtimeId);
  if (holds === undefined) {
    return;
  }
  holds.delete(holder);
  if (holds.size === 0) {
    shareHolds.delete(runtimeId);
    shares.release(runtimeId);
  }
}
const pendingBridge = new Map<string, PendingBridge>();
let physicalWorkerCount = 0;
let peakPhysicalWorkers = 0;
const sender = new PluginIpcSender(
  (message, callback) => {
    process.send?.(message, callback);
  },
  () => abandon(),
  pluginIpcShareBytes(workerMaximum),
);
function send(message: BrokerParentMessage): void {
  if (supervised()) {
    sender.send({ kind: "frame", generation, frame: serializeMessage(message) });
  }
}

// Queue a frame a plugin sized on its share. False when the channel refused it, or when it is larger than any frame may
// be: the caller answers with the refusal in its place.
function offer(message: BrokerParentMessage, route: PluginFrameRoute): boolean {
  if (!supervised()) {
    return true;
  }
  let frame: string;
  try {
    frame = serializeMessage(message);
  } catch (error) {
    // Only the frame cap throws a RangeError here; any other failure is a host defect and stays loud.
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
  return sender.offer({ kind: "frame", generation, frame, route });
}

// A command's answer, on its runtime's share; one that does not fit is answered with the channel-full refusal, which
// the parent turns into a host-unavailable failure of that command alone.
function answer(share: string, message: Extract<BrokerParentMessage, { readonly kind: "response" }>): void {
  const refused = channelFullResponse(message.id);
  if (!offer(message, { share, refusal: { frame: serializeMessage(refused), back: false } })) {
    send(refused);
  }
}

// A Worker's call to the parent, on its runtime's share; one that does not fit is refused straight back to the Worker.
function forwardBridge(share: string, message: Extract<BrokerParentMessage, { readonly kind: "bridge" }>): boolean {
  return offer(message, { share, refusal: { frame: serializeMessage(channelFullBridgeResult(message.id)), back: true } });
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
    releaseWorkerSlot(runtimeId, runtime);
  }
}

function releaseWorkerSlot(runtimeId: string, runtime: Runtime): void {
  if (!runtime.counted) {
    return;
  }
  runtime.counted = false;
  physicalWorkerCount -= 1;
  dropShareHold(runtimeId, "worker");
}

function terminateDetached(worker: Worker): void {
  // the handler rethrows inside queueMicrotask, which raises an uncaught exception that ends the broker process; the watchdog sees the exit and the app rejects pending work through onDisconnect. Ends if the queued rethrow is removed or an uncaughtException handler absorbs it.
  worker.terminate().catch((error: unknown) => {
    queueMicrotask(() => {
      throw error;
    });
  });
}

/** End a runtime whose Worker has run guest work past its budget by `PLUGIN_WORKER_OVERRUN_MAX_MS`: one span past its
 *  window, or the spans of the command it serves past that command's budget; or whose command the parent's backstop
 *  gave up on while this broker still held it. Its bridge calls are cancelled at once, so an in-flight fetch aborts; a write the parent already started runs to
 *  its end and its result is dropped. Only after the Worker has exited, and its slot is free for a replacement, does
 *  the parent hear of it: first `runtime-ended`, so the logical instance is rebuilt on its next call rather than
 *  crashed, then the commands. The oldest is the one the Worker was running or was blocked behind, and fails with the
 *  ended invocation's refusal; any queued behind it never ran and fail as host-unavailable. */
function endStuckRuntime(runtimeId: string, runtime: Runtime): void {
  runtimes.delete(runtimeId);
  runtime.expectedExit = true;
  const [stuck, ...queued] = runtime.pendingCommands.keys();
  runtime.pendingCommands.clear();
  for (const [id, request] of pendingBridge) {
    if (request.runtimeId !== runtimeId) {
      continue;
    }
    pendingBridge.delete(id);
    if (request.kind === "sync") {
      clearTimeout(request.timer);
    } else {
      send({ kind: "bridge-cancel", id });
    }
  }
  // the terminate rejection is rethrown inside queueMicrotask, which ends the broker; the watchdog sees the exit and the parent rejects pending work through onDisconnect. Ends if the queued rethrow is removed.
  const ended = {
    name: PLUGIN_INVOCATION_ENDED,
    message: "plugin host: invocation ended — its Worker ran past its bounds and was terminated",
  };
  runtime.worker.terminate().then(
    () => {
      releaseWorkerSlot(runtimeId, runtime);
      // With no command pending, the stall ran after its command returned: the ended refusal rides on this notice, so
      // the plugin's next invocation carries it and the plugin still takes the strike.
      send(stuck === undefined ? { kind: "runtime-ended", runtimeId, error: ended } : { kind: "runtime-ended", runtimeId });
      if (stuck !== undefined) {
        send({ kind: "response", id: stuck, ok: false, error: ended });
      }
      for (const id of queued) {
        send({
          kind: "response",
          id,
          ok: false,
          error: { name: PLUGIN_HOST_UNAVAILABLE, message: "plugin broker: the runtime was replaced before this command ran" },
        });
      }
    },
    (error: unknown) => {
      queueMicrotask(() => {
        throw error;
      });
    },
  );
}

// Whether the command the Worker serves has run past its kind's CPU budget, summed over every span since this broker
// first saw it as the oldest pending: the Worker's total of closed spans, which a stuck Worker cannot move but host code
// alone writes, plus the open span's age on this broker's clock. A chain of spans each under the one-span bound ends
// here (D347).
function commandOverran(runtime: Runtime, openMs: number): boolean {
  const [oldest] = runtime.pendingCommands;
  if (oldest === undefined) {
    runtime.command = undefined;
    return false;
  }
  const [id, operation] = oldest;
  const closedTotalMs = Atomics.load(runtime.spans, SPAN_CLOSED_TOTAL_SLOT);
  if (runtime.command?.id !== id) {
    runtime.command = { id, closedTotalAtStartMs: closedTotalMs };
  }
  // The total wraps as an Int32; the difference stored back into an Int32 is right across one wrap.
  const [closedSinceStartMs = 0] = Int32Array.of(closedTotalMs - runtime.command.closedTotalAtStartMs);
  const spentMs = closedSinceStartMs + openMs;
  return spentMs > PLUGIN_COMMAND_CPU_BUDGET_MS[operation] + PLUGIN_WORKER_OVERRUN_MAX_MS;
}

// Two bounds, each ending this Worker alone and each read on this broker's clock (D347): one span still open past its
// window, timed from when the broker first saw its sequence so a Worker's clock is never trusted for an open span; and
// the spans of the command the Worker serves, summed past the command's budget. Each is reached at most one check late.
const spanCheck = setInterval(() => {
  const nowMs = performance.now();
  for (const [runtimeId, runtime] of runtimes) {
    const sequence = Atomics.load(runtime.spans, SPAN_SEQUENCE_SLOT);
    if (sequence !== runtime.watched.sequence) {
      runtime.watched = { sequence, sinceMs: nowMs };
    }
    const openMs = sequence === 0 ? 0 : nowMs - runtime.watched.sinceMs;
    if (openMs > Atomics.load(runtime.spans, SPAN_WINDOW_SLOT) + PLUGIN_WORKER_OVERRUN_MAX_MS || commandOverran(runtime, openMs)) {
      endStuckRuntime(runtimeId, runtime);
    }
  }
}, PLUGIN_WORKER_SPAN_CHECK_MS);
spanCheck.unref();

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
  const spans = new SharedArrayBuffer(SPAN_SLOTS_BYTES);
  const worker = new Worker(new URL("./worker-runtime.ts", import.meta.url), {
    workerData: { runtimeId, logLevel, spans },
    // Guest Workers receive no app environment or inherited IPC authority, so do not inherit
    // process.env across this trust boundary even though QuickJS itself has no ambient Node surface.
    env: { ["NODE_ENV"]: nodeEnvironment },
  });
  const runtime: Runtime = {
    worker,
    share: shares.acquire(runtimeId),
    pendingCommands: new Map(),
    spans: new Int32Array(spans),
    watched: { sequence: 0, sinceMs: 0 },
    command: undefined,
    expectedExit: false,
    counted: true,
  };
  shareHolds.set(runtimeId, new Set(SHARE_HOLDERS));
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
    releaseWorkerSlot(runtimeId, runtime);
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
    forwardAsyncBridge(runtimeId, runtime, message);
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
    forwardSyncBridge(runtimeId, runtime, message);
    return;
  }
  if (message.kind === "log") {
    // A log line that finds its runtime's share full is dropped: the plugin's own log ring still holds it.
    offer({ kind: "log", runtimeId, label: message.label, level: message.level, message: message.message }, { share: runtime.share });
    return;
  }
  if (message.kind === "authority-released") {
    send({ kind: "authority-released", runtimeId, authorityId: message.authorityId });
    return;
  }
  handleWorkerCommandResponse(runtimeId, runtime, message);
}

function forwardAsyncBridge(runtimeId: string, runtime: Runtime, message: Extract<WorkerBrokerMessage, { readonly kind: "bridge" }>): void {
  pendingBridge.set(message.id, { kind: "async", runtimeId, worker: runtime.worker });
  if (
    !forwardBridge(runtime.share, {
      kind: "bridge",
      id: message.id,
      runtimeId,
      authorityId: message.authorityId,
      operation: message.operation,
      args: message.args,
    })
  ) {
    pendingBridge.delete(message.id);
    runtime.worker.postMessage(channelFullBridgeResult(message.id) satisfies BrokerWorkerMessage);
  }
}

function forwardSyncBridge(runtimeId: string, runtime: Runtime, message: Extract<WorkerBrokerMessage, { readonly kind: "sync-bridge" }>): void {
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
  const pending = { kind: "sync", runtimeId, control, result, timer } as const;
  pendingBridge.set(id, pending);
  if (!forwardBridge(runtime.share, { kind: "bridge", id, runtimeId, authorityId: message.authorityId, operation: message.operation, args: message.args })) {
    pendingBridge.delete(id);
    settleSync(pending, channelFullBridgeResult(id));
  }
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
    // the rejection arm sends an ok:false response carrying rpcError(error) to the parent, whose handleResponse rejects the command promise; success is not acknowledged before the physical Worker exits. Ends if that arm stops carrying the error.
    terminateRuntime(runtimeId).then(
      () => answer(runtime.share, message),
      (error: unknown) => send({ kind: "response", id: message.id, ok: false, error: rpcError(error) }),
    );
    return;
  }
  answer(runtime.share, message);
}

function activationSucceeded(value: unknown): boolean {
  return typeof value === "object" && value !== null && Reflect.get(value, "ok") === true;
}

function handleCommand(message: Extract<ParentBrokerMessage, { readonly kind: "command" }>): void {
  try {
    const runtimeId = message.runtimeId;
    const runtime = message.operation === "create" || message.operation === "snippet" ? createRuntime(runtimeId) : runtimes.get(runtimeId);
    if (runtime === undefined) {
      // A runtime this broker already ended or retired: the host's own lifecycle, not the plugin's doing.
      const stale = new Error(PLUGIN_STALE_RUNTIME);
      stale.name = PLUGIN_HOST_UNAVAILABLE;
      throw stale;
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
    // malformed, stale, or capacity-refused commands are sent to the parent as an ok:false response carrying rpcError(error), which handleResponse rejects. Ends if this send stops carrying the caught error.
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
  if (message.kind === "runtime-forgotten") {
    dropShareHold(message.runtimeId, "parent");
    return;
  }
  if (message.kind === "end-runtime") {
    // A command the Worker already answered leaves the Worker alone: its answer is in flight, so it is not stuck.
    const runtime = runtimes.get(message.runtimeId);
    if (runtime?.pendingCommands.has(message.commandId) === true) {
      endStuckRuntime(message.runtimeId, runtime);
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
  // Any failure to read or handle an inherited-channel frame calls abandon(), which ends the broker; the watchdog
  // reports the exit as a stopped frame and process-runtime's consumeWatchdogMessage runs onDisconnect, which rejects
  // pending app commands. The cause goes to stderr first, the broker's only report channel, which the watchdog reads
  // and passes on to its own stderr.
  try {
    const message = parseParentBrokerMessage(parseMessageLine(envelope.frame));
    if (message === null) {
      abandon();
      return;
    }
    handleParentMessage(message);
  } catch (error) {
    const { name, message } = rpcError(error);
    process.stderr.write(`plugin broker: an app frame could not be handled (${name}: ${message})\n`);
    abandon();
  }
});
// The watchdog stops this broker by closing the channel (broker-watchdog.ts `stopBroker`); a dead watchdog closes it too.
sender.send({ kind: "ready", generation });
process.on("disconnect", abandon);
