import { AsyncLocalStorage } from "node:async_hooks";
import { parentPort, workerData } from "node:worker_threads";
import type { MessagePort } from "node:worker_threads";
import type { PluginHandlerRef, PluginInstance, PluginInvocationLiveness, PluginInvokeArgs } from "@orb/contracts/plugin";
import { createRemoteBridge } from "./bridge-rpc.ts";
import { createLocalPluginHost } from "./port.ts";
import type { CreateInstanceInputIn } from "./port.ts";
import type { BrokerWorkerMessage, PluginBridgeOperation, PluginSyncOperation, WorkerBrokerMessage } from "./process-protocol.ts";
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

const identity = workerData as WorkerIdentity;
const commandAuthority = new AsyncLocalStorage<string>();
let nextRequest = 0;
interface PendingBridgeCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  unsubscribe?: () => void;
}
const pending = new Map<string, PendingBridgeCall>();

function post(message: WorkerBrokerMessage): void {
  port.postMessage(message);
}

function callAsync(operation: PluginBridgeOperation, args: readonly unknown[], liveness?: PluginInvocationLiveness): Promise<unknown> {
  const authorityId = commandAuthority.getStore();
  if (authorityId === undefined) {
    return Promise.reject(new Error("plugin broker worker: bridge call escaped its command authority"));
  }
  const id = `${identity.runtimeId}:bridge:${nextRequest++}`;
  return new Promise((resolve, reject) => {
    const request: PendingBridgeCall = { resolve, reject };
    pending.set(id, request);
    const unsubscribe = liveness?.onAbort(() => {
      const active = pending.get(id);
      if (active === undefined) {
        return;
      }
      pending.delete(id);
      active.unsubscribe?.();
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

const bridge = createRemoteBridge(callAsync, callSync);
const host = createLocalPluginHost({
  nowEpochMs: () => callSync("seam.nowEpochMs", []) as number,
  nextRandom: () => callSync("seam.nextRandom", []) as number,
  mintId: () => callSync("seam.mintId", []) as string,
  mirrorLog: (label, level, message) => post({ kind: "log", label, level, message }),
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
    const request = pending.get(message.id);
    if (request === undefined) {
      return;
    }
    pending.delete(message.id);
    request.unsubscribe?.();
    if (message.ok) {
      request.resolve(message.value);
    } else {
      request.reject(fromRpcError(message.error, "plugin bridge call failed"));
    }
    return;
  }
  if (message.kind === "bridge-cancel") {
    const request = pending.get(message.id);
    if (request !== undefined) {
      pending.delete(message.id);
      request.unsubscribe?.();
      request.reject(new Error("plugin broker: parent cancelled the bridge call"));
    }
    return;
  }
  // @orb-waive caught-failure-ownership(commandAuthority.run): every command rejection is encoded into the response with the same command id, while the returned chain is fulfilled by that rejection arm. Ends if the error response stops carrying the rejection.
  void commandAuthority
    .run(message.authorityId, () => run(message))
    .then(
      (value) => post({ kind: "response", id: message.id, ok: true, value }),
      (error) => post({ kind: "response", id: message.id, ok: false, error: rpcError(error) }),
    );
});

post({ kind: "ready" });
