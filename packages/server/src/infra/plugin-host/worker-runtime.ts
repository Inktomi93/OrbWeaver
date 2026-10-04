// infra/plugin-host/worker-runtime — one isolated guest runtime and its broker bridge.
// ASSUMES(single-replica): pending calls are promises owned by this Worker; multi-replica coordination belongs
// at the broker's DB-backed runtime lease and command queue, never inside a Worker-local promise table.

import { AsyncLocalStorage } from "node:async_hooks";
import process from "node:process";
import type { MessagePort } from "node:worker_threads";
import { parentPort, workerData } from "node:worker_threads";
import type { PluginHandlerRef, PluginInstance, PluginInvocationLiveness, PluginInvokeArgs } from "@orb/contracts/plugin";
import { createRemoteBridge, createRemoteNetEgress } from "./bridge-rpc.ts";
import { PLUGIN_AUTHORITY_TAIL_MS } from "./budgets.ts";
import type { CreateInstanceInputIn } from "./contract/port.ts";
import type { BrokerWorkerMessage, PluginBridgeOperation, PluginSyncOperation, WorkerBrokerMessage } from "./contract/process-protocol.ts";
import { createLocalPluginHost } from "./port.ts";
import { decodeProcessValue, fromRpcError, PLUGIN_BROKER_SYNC_RESULT_BYTES, PLUGIN_BROKER_SYNC_TIMEOUT_MS, rpcError } from "./process-protocol.ts";

interface WorkerIdentity {
  readonly runtimeId: string;
}

interface InvokeCommandValue {
  readonly handler: PluginHandlerRef;
  readonly argsJson: string | { readonly builderId: string };
  readonly chat?: Parameters<ReturnType<typeof createLocalPluginHost>["invoke"]>[3];
}

interface SnippetCommandValue {
  readonly code: string;
  readonly grants: CreateInstanceInputIn["grants"];
  readonly chat: Parameters<ReturnType<typeof createLocalPluginHost>["runSnippet"]>[0]["chat"];
}

function requireParentPort(): MessagePort {
  if (parentPort === null) {
    throw new Error("plugin broker worker: missing parent port");
  }
  return parentPort;
}

const port = requireParentPort();

// The permission model does not inherit to a Worker started with `execArgv: []`, so code in this Worker could start
// one with no grants and read the filesystem through it. Drop this Worker's permission to start Workers before any
// guest code loads. Defense in depth only; the complete fix is a separate OS user for the broker (finding 4 in
// `docs/law/container-deployment-security.md`). `@types/node` declares `process.permission` always present and has no
// `drop`; at runtime it is absent without `--permission`, and `drop` exists from Node 26.3.0.
function runtimePermission(): (typeof process.permission & { readonly drop?: (scope: string) => void }) | undefined {
  return process.permission;
}
const permission = runtimePermission();
permission?.drop?.("worker");
// Fail closed: a Node without `drop` would leave the permission in place. Throwing here ends the Worker before any
// guest code runs, and the broker's exit handler fails the runtime.
if (permission?.has("worker") === true) {
  throw new Error("plugin broker worker: could not drop the permission to start Workers");
}

const identity = workerData as WorkerIdentity;
const commandAuthority = new AsyncLocalStorage<string>();
let nextRequest = 0;
interface PendingBridgeCall {
  readonly authorityId: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  unsubscribe?: () => void;
}
const pending = new Map<string, PendingBridgeCall>();

// A command authority stays live in the parent until this Worker can no longer post a bridge call under it:
// the command has completed and every call posted under it has settled, or the fixed tail after completion
// has expired. Guest bytecode runs only inside a command or in the job pump a settlement triggers, so a guest
// continuation resumed by a late host result still reaches the parent under the authority it inherited. The
// tail is the bound: a chain that re-arms `pendingCalls` on every settlement never idles, so idleness alone
// would keep the command's frozen phase and chat alive forever. The parent enforces the same tail itself.
interface AuthorityLease {
  pendingCalls: number;
  commandDone: boolean;
  tail: ReturnType<typeof setTimeout> | undefined;
}
const authorityLeases = new Map<string, AuthorityLease>();

function post(message: WorkerBrokerMessage): void {
  port.postMessage(message);
}

function openLease(authorityId: string): AuthorityLease {
  let lease = authorityLeases.get(authorityId);
  if (lease === undefined) {
    lease = { pendingCalls: 0, commandDone: false, tail: undefined };
    authorityLeases.set(authorityId, lease);
  }
  return lease;
}

function releaseAuthority(authorityId: string): void {
  const lease = authorityLeases.get(authorityId);
  if (lease === undefined) {
    return;
  }
  clearTimeout(lease.tail);
  authorityLeases.delete(authorityId);
  post({ kind: "authority-released", authorityId });
}

function releaseAuthorityIfIdle(authorityId: string): void {
  const lease = authorityLeases.get(authorityId);
  if (lease === undefined || !lease.commandDone || lease.pendingCalls > 0) {
    return;
  }
  releaseAuthority(authorityId);
}

// The idle check waits one macrotask: the job pump this settlement triggers runs in the same microtask flush
// and posts its follow-on calls first, so a release can never overtake a call posted under the same authority.
function settleBridgeCall(id: string): PendingBridgeCall | undefined {
  const request = pending.get(id);
  if (request !== undefined) {
    pending.delete(id);
    request.unsubscribe?.();
    const lease = authorityLeases.get(request.authorityId);
    if (lease !== undefined) {
      lease.pendingCalls -= 1;
    }
    setImmediate(() => releaseAuthorityIfIdle(request.authorityId));
  }
  return request;
}

function completeCommand(authorityId: string, response: Extract<WorkerBrokerMessage, { readonly kind: "response" }>): void {
  post(response);
  const lease = openLease(authorityId);
  lease.commandDone = true;
  if (lease.pendingCalls === 0) {
    releaseAuthority(authorityId);
    return;
  }
  lease.tail = setTimeout(() => releaseAuthority(authorityId), PLUGIN_AUTHORITY_TAIL_MS);
  lease.tail.unref();
}

function callAsync(operation: PluginBridgeOperation, args: readonly unknown[], liveness?: PluginInvocationLiveness): Promise<unknown> {
  const authorityId = commandAuthority.getStore();
  if (authorityId === undefined) {
    return Promise.reject(new Error("plugin broker worker: bridge call escaped its command authority"));
  }
  const id = `${identity.runtimeId}:bridge:${nextRequest++}`;
  return new Promise((resolve, reject) => {
    const request: PendingBridgeCall = { authorityId, resolve, reject };
    pending.set(id, request);
    // A call posted after the lease expired is not counted: the parent refuses it as stale.
    const lease = authorityLeases.get(authorityId);
    if (lease !== undefined) {
      lease.pendingCalls += 1;
    }
    const unsubscribe = liveness?.onAbort(() => {
      const active = settleBridgeCall(id);
      if (active === undefined) {
        return;
      }
      post({ kind: "bridge-cancel", id });
      const error = new Error("plugin bridge call cancelled with its invocation");
      error.name = "AbortError";
      active.reject(error);
    });
    if (unsubscribe !== undefined) {
      request.unsubscribe = unsubscribe;
    }
    if (!pending.has(id)) {
      unsubscribe?.();
      return;
    }
    post({ kind: "bridge", id, authorityId, operation, args });
  });
}

function callSync(operation: PluginSyncOperation, args: readonly unknown[]): unknown {
  const authorityId = commandAuthority.getStore();
  if (authorityId === undefined) {
    throw new Error("plugin broker worker: synchronous bridge call escaped its command authority");
  }
  const controlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const resultBuffer = new SharedArrayBuffer(PLUGIN_BROKER_SYNC_RESULT_BYTES);
  const control = new Int32Array(controlBuffer);
  post({ kind: "sync-bridge", authorityId, operation, args, control: controlBuffer, result: resultBuffer });
  const wait = Atomics.wait(control, 0, 0, PLUGIN_BROKER_SYNC_TIMEOUT_MS);
  if (wait === "timed-out") {
    throw new Error(`plugin broker: synchronous ${operation} timed out`);
  }
  const length = Atomics.load(control, 1);
  if (length <= 0 || length > resultBuffer.byteLength) {
    throw new Error(`plugin broker: invalid synchronous ${operation} response`);
  }
  const text = new TextDecoder().decode(new Uint8Array(resultBuffer, 0, length));
  const response = decodeProcessValue(JSON.parse(text)) as {
    readonly ok: boolean;
    readonly value?: unknown;
    readonly error?: { readonly name: string; readonly message: string };
  };
  if (!response.ok) {
    throw fromRpcError(response.error, `plugin broker: synchronous ${operation} failed`);
  }
  return response.value;
}

const bridge = createRemoteBridge(callAsync);
const host = createLocalPluginHost({
  nowEpochMs: () => callSync("seam.nowEpochMs", []) as number,
  nextRandom: () => callSync("seam.nextRandom", []) as number,
  mintId: () => callSync("seam.mintId", []) as string,
  mirrorLog: (label, level, message) => post({ kind: "log", label, level, message }),
  netEgress: createRemoteNetEgress(callAsync),
});

let instance: PluginInstance | undefined;

async function run(message: Extract<BrokerWorkerMessage, { readonly kind: "command" }>): Promise<unknown> {
  if (message.operation === "create") {
    if (instance !== undefined) {
      throw new Error("plugin broker worker: runtime already activated");
    }
    const input = message.value as Omit<CreateInstanceInputIn, "bridge">;
    const outcome = await host.createInstance({ ...input, bridge });
    if (outcome.ok) {
      instance = outcome.instance;
    }
    return outcome;
  }
  if (message.operation === "invoke") {
    if (instance === undefined) {
      throw new Error("plugin broker worker: invoke on inactive runtime");
    }
    const input = message.value as InvokeCommandValue;
    const argsSource = input.argsJson;
    const argsJson: PluginInvokeArgs =
      typeof argsSource === "string" ? argsSource : (chatHandle): string => callSync("invokeArgs", [argsSource.builderId, chatHandle]) as string;
    return await host.invoke(instance, input.handler, argsJson, input.chat);
  }
  if (message.operation === "snippet") {
    const input = message.value as SnippetCommandValue;
    return await host.runSnippet({ ...input, bridge });
  }
  if (instance !== undefined) {
    host.dispose(instance);
    instance = undefined;
  }
  return null;
}

port.on("message", (message: BrokerWorkerMessage) => {
  if (message.kind === "bridge-result") {
    const request = settleBridgeCall(message.id);
    if (request === undefined) {
      return;
    }
    if (message.ok) {
      request.resolve(message.value);
    } else {
      request.reject(fromRpcError(message.error, "plugin bridge call failed"));
    }
    return;
  }
  if (message.kind === "bridge-cancel") {
    const request = settleBridgeCall(message.id);
    if (request !== undefined) {
      request.reject(new Error("plugin broker: parent cancelled the bridge call"));
    }
    return;
  }
  openLease(message.authorityId);
  // @orb-waive caught-failure-ownership(run): every command rejection is encoded into the response with the same command id. Ends if the error response stops carrying the rejection.
  void commandAuthority
    .run(message.authorityId, () => run(message))
    .then(
      (value) => completeCommand(message.authorityId, { kind: "response", id: message.id, ok: true, value }),
      (error) => completeCommand(message.authorityId, { kind: "response", id: message.id, ok: false, error: rpcError(error) }),
    );
});

post({ kind: "ready" });
