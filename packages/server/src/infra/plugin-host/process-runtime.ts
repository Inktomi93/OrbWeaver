// infra/plugin-host/process-runtime — authority-bearing parent adapter and logical-to-physical runtime pool.
// ASSUMES(single-replica): the maps below own live process handles for this app replica; a multi-replica
// replacement requires a DB-backed runtime lease and command queue, while bridge authority stays app-local.

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { CHAT_TRIGGER_TYPES, DOMAIN_TRIGGER_TYPES } from "@orb/contracts/automation";
import { PROMPT_TRANSFORM_POINTS } from "@orb/contracts/chat";
import type {
  InvocationChat,
  PluginBridge,
  PluginCapability,
  PluginCommandRegistration,
  PluginDisplayTransformRegistration,
  PluginEventSubscription,
  PluginHandlerRef,
  PluginInstance,
  PluginInvocationLiveness,
  PluginInvokeArgs,
  PluginLogLevel,
  PluginLogView,
  PluginMacroRegistration,
  PluginPubsubSubscription,
  PluginSurfaceRegistration,
  PluginToolRegistration,
  PluginTransformRegistration,
} from "@orb/contracts/plugin";
import {
  PLUGIN_LOG_LEVELS,
  PLUGIN_SURFACE_TIERS,
  pluginCommandRegistrationMetaSchema,
  pluginFrameBodySchema,
  pluginSurfaceRegistrationMetaSchema,
  snippetResultSchema,
} from "@orb/contracts/plugin";
import { DomainConflictError } from "@orb/kit/errors";
import type { TimerScheduler } from "@orb/kit/time";
import { getLog } from "#foundation/observability";
import type { BackgroundWork } from "#infra/tasks";
import { createBackgroundWork } from "#infra/tasks";
import { createScopedTimers } from "#infra/timers";
import { createAdmission } from "./admission.ts";
import type { BridgeAuthority } from "./bridge-rpc.ts";
import { authorizeBridgeCall, authorizeSyncCall, dispatchBridgeCall, dispatchSyncCall } from "./bridge-rpc.ts";
import {
  PLUGIN_AUTHORITY_TAIL_CALLS_MAX,
  PLUGIN_AUTHORITY_TAIL_MS,
  PLUGIN_LOG_RING_CHARS,
  PLUGIN_LOG_RING_LINES,
  PLUGIN_RUNTIME_REQUEST_QUEUE_MAX,
  PLUGIN_SNIPPET_RUNTIME_MAX,
} from "./budgets.ts";
import type { PluginNetEgress } from "./contract/net-egress.ts";
import type { CreateInstanceInputIn, CreateInstanceOutcomeOut, PluginHostSeamDeps, ProcessPluginHost, SnippetRunOut } from "./contract/port.ts";
import type { BrokerParentMessage, ParentBrokerMessage, RpcResult } from "./contract/process-protocol.ts";
import { createPluginNetEgress } from "./net-egress.ts";
import { PluginIpcSender, parsePluginIpcMessage } from "./process-channel.ts";
import { pluginWatchdogExecArgv } from "./process-permission.ts";
import { fromRpcError, isBridgeOperation, parseBrokerParentMessage, parseMessageLine, rpcError, serializeMessage } from "./process-protocol.ts";
import type { WarmRuntimeLease } from "./warm-runtime-pool.ts";
import { WarmRuntimePool } from "./warm-runtime-pool.ts";

const COMMAND_TIMEOUT_MS = {
  create: 30_000,
  invoke: 120_000,
  snippet: 30_000,
  dispose: 30_000,
} as const;
const CONNECT_TIMEOUT_MS = 10_000;

interface Binding {
  readonly registry: Map<string, Binding>;
  readonly timers: TimerScheduler;
  runtimeId: string | undefined;
  lifecycleGeneration: number;
  readonly bridge: PluginBridge;
  /** Built from the domain-supplied `netHosts` held here, never from anything the broker sends. */
  readonly netEgress: PluginNetEgress;
  readonly grants: ReadonlySet<PluginCapability>;
  readonly authorities: Map<string, BridgeAuthority>;
  /** Per-authority tails armed when a command completes; the parent's own time and call bound on a lying Worker. */
  readonly authorityTails: Map<string, AuthorityTail>;
  readonly seams: PluginHostSeamDeps;
  readonly invokeArgs: Map<string, (chatHandle: string | null) => string>;
  readonly log: PluginLogView[];
  readonly label?: string;
  chars: number;
  suppressLogs: boolean;
  crashed: Error | null;
  disposed: boolean;
  /** Set once this binding's first command has actually reached a live broker connection. A binding still
   *  waiting on `ensureConnected()` was never served by the connection that just died and a belated exit
   *  event for it must not crash a binding it never touched. */
  dispatched: boolean;
  onCrash: (error: Error) => void;
  readonly releaseAdmission?: () => void;
  readonly runtimeConfig?: Omit<CreateInstanceInputIn, "bridge" | "mainJs">;
  readonly reloadMainJs?: () => Promise<string>;
  catalog?: PluginInstance;
  retirement: { readonly runtimeId: string; readonly done: Promise<void> } | undefined;
}

interface AuthorityTail {
  readonly timer: () => void;
  /** Bridge calls admitted under the authority since its command returned. */
  calls: number;
}

interface PendingCommand {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: () => void;
}

interface MutableLiveness extends PluginInvocationLiveness {
  abort: () => void;
}

interface ActiveBridgeCall {
  readonly binding: Binding;
  readonly liveness: MutableLiveness;
  readonly settled: Promise<void>;
}

interface AuthorityCommand {
  readonly binding: Binding;
  readonly operation: Extract<ParentBrokerMessage, { readonly kind: "command" }>["operation"];
  readonly phase: BridgeAuthority["phase"];
  readonly chat: InvocationChat | null;
  readonly value?: unknown;
}

interface NewBindingInput {
  readonly bridge: PluginBridge;
  readonly grants: readonly PluginCapability[];
  readonly runtimeConfig?: Omit<CreateInstanceInputIn, "bridge" | "mainJs">;
  readonly reloadMainJs?: () => Promise<string>;
  readonly label?: string;
  readonly releaseAdmission?: () => void;
}

interface BoundInvokeArgs {
  readonly wireArgs: string | { readonly builderId: string };
  readonly builderId?: string;
}

interface LeasedInvokeInput {
  readonly binding: Binding;
  readonly lease: WarmRuntimeLease;
  readonly handler: PluginHandlerRef;
  readonly argsJson: PluginInvokeArgs;
  readonly chat: InvocationChat | null | undefined;
}

function releaseBinding(binding: Binding): void {
  binding.releaseAdmission?.();
}

function disarmAuthorityTail(binding: Binding, authorityId: string): void {
  const tail = binding.authorityTails.get(authorityId);
  if (tail === undefined) {
    return;
  }
  tail.timer();
  binding.authorityTails.delete(authorityId);
}

function releaseAuthority(binding: Binding, authorityId: string): void {
  disarmAuthorityTail(binding, authorityId);
  binding.authorities.delete(authorityId);
}

function clearAuthorities(binding: Binding): void {
  for (const authorityId of binding.authorityTails.keys()) {
    disarmAuthorityTail(binding, authorityId);
  }
  binding.authorities.clear();
}

// Armed once the command has returned. The Worker reports release when its calls have settled; this timer and
// the call count are the parent's own bound, so a hung or lying Worker cannot keep the command's frozen phase and
// chat alive past the continuation window or spend it on unbounded effects.
function armAuthorityTail(binding: Binding, authorityId: string): void {
  if (!binding.authorities.has(authorityId) || binding.authorityTails.has(authorityId)) {
    return;
  }
  const timer = binding.timers.timeoutUnref(() => releaseAuthority(binding, authorityId), PLUGIN_AUTHORITY_TAIL_MS);
  binding.authorityTails.set(authorityId, { timer, calls: 0 });
}

// The Worker's `authority-released` is looked up through `bindings`, so a runtime dropped from it can no longer
// release its authorities; clear them with it, or each tail lingers for the whole continuation window.
function forgetRuntime(binding: Binding, runtimeId: string): void {
  binding.registry.delete(runtimeId);
  if (binding.runtimeId === runtimeId) {
    binding.runtimeId = undefined;
    clearAuthorities(binding);
  }
}

// A command's own calls are uncounted; a continuation's calls after the command returned draw on the tail.
function admitTailCall(binding: Binding, authorityId: string): boolean {
  const tail = binding.authorityTails.get(authorityId);
  if (tail === undefined) {
    return true;
  }
  if (tail.calls >= PLUGIN_AUTHORITY_TAIL_CALLS_MAX) {
    return false;
  }
  tail.calls += 1;
  return true;
}

function retainLog(binding: Binding, level: PluginLogLevel, message: string): void {
  const line = { level, message, at: binding.seams.nowEpochMs() };
  binding.log.push(line);
  binding.chars += message.length;
  while (binding.log.length > 0 && (binding.log.length > PLUGIN_LOG_RING_LINES || binding.chars > PLUGIN_LOG_RING_CHARS)) {
    const evicted = binding.log.shift();
    binding.chars -= evicted?.message.length ?? 0;
  }
}

function createLiveness(): MutableLiveness {
  let aborted = false;
  const listeners = new Set<() => void>();
  return {
    get aborted(): boolean {
      return aborted;
    },
    onAbort: (listener): (() => void) => {
      if (aborted) {
        listener();
        return () => undefined;
      }
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    abort: (): void => {
      if (aborted) {
        return;
      }
      aborted = true;
      for (const listener of listeners) {
        listener();
      }
      listeners.clear();
    },
  };
}

class BrokerClient {
  readonly bindings = new Map<string, Binding>();
  readonly logicalBindings = new Set<Binding>();
  private readonly seams: PluginHostSeamDeps;
  private readonly timers: TimerScheduler;
  private readonly monotonicNow: () => number;
  private readonly children = new Map<ChildProcess, Promise<void>>();
  private closed = false;

  constructor(seams: PluginHostSeamDeps, timers: TimerScheduler) {
    this.seams = seams;
    this.timers = timers;
    this.monotonicNow = seams.monotonicNow;
  }

  private sender: PluginIpcSender | undefined;
  private generation: string | undefined;
  private readonly readyListeners = new Set<() => void>();
  private connecting: Promise<void> | undefined;
  private managedChild: ChildProcess | undefined;
  private directoryResources = new AsyncDisposableStack();
  private readonly pending = new Map<string, PendingCommand>();
  private readonly bridgeCalls = new Map<string, ActiveBridgeCall>();
  private closing: Promise<void> | undefined;
  private nextCommand = 0;

  hasManagedChild(): boolean {
    return this.managedChild !== undefined;
  }

  private hasGeneration(): boolean {
    return this.generation !== undefined;
  }

  private isClosed(): boolean {
    return this.closed;
  }

  cancelBindings(owned: ReadonlySet<Binding>): void {
    for (const call of this.bridgeCalls.values()) {
      if (owned.has(call.binding)) {
        call.liveness.abort();
      }
    }
  }

  async settleBindings(owned: ReadonlySet<Binding>): Promise<void> {
    for (;;) {
      const calls = [...this.bridgeCalls.values()].filter((call) => owned.has(call.binding));
      if (calls.length === 0) {
        return;
      }
      await Promise.all(calls.map((call) => call.settled));
    }
  }

  async closeManaged(): Promise<void> {
    this.cancelStartup();
    this.closing ??= (async (): Promise<void> => {
      await using cleanup = new AsyncDisposableStack();
      cleanup.defer(async (): Promise<void> => {
        const directories = this.directoryResources;
        this.directoryResources = new AsyncDisposableStack();
        await directories.disposeAsync();
      });
      cleanup.defer(async (): Promise<void> => {
        await Promise.all([...this.children.values()]);
      });
      this.sender?.close();
      this.generation = undefined;
      this.onDisconnect(unavailableError());
      for (const child of this.children.keys()) {
        child.ref();
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGTERM");
        }
      }
      for (const listener of this.readyListeners) {
        listener();
      }
      await this.connecting;
    })();
    await this.closing;
  }

  cancelStartup(): void {
    this.closed = true;
    // Teardown retires Workers before closeManaged joins the watchdog. Idle children are unref'ed,
    // but those retirement acknowledgments still belong to this process after its HTTP listener closes.
    for (const child of this.children.keys()) {
      child.ref();
    }
    if (this.generation === undefined && this.connecting !== undefined) {
      this.managedChild?.kill("SIGTERM");
    }
  }

  async command(input: {
    readonly operation: Extract<ParentBrokerMessage, { readonly kind: "command" }>["operation"];
    readonly runtimeId: string;
    readonly authorityId: string;
    readonly value?: unknown;
    readonly onConnected?: () => void;
  }): Promise<unknown> {
    const { operation, runtimeId, authorityId, value, onConnected } = input;
    await this.ensureConnected();
    onConnected?.();
    const generation = this.generation;
    const sender = this.sender;
    if (generation === undefined || sender === undefined) {
      throw unavailableError();
    }
    const id = `parent:${process.pid}:${this.nextCommand++}`;
    const serialized = serializeMessage({
      kind: "command",
      id,
      operation,
      runtimeId,
      authorityId,
      value,
    });
    return await new Promise((resolve, reject) => {
      const timer = this.timers.timeout(() => {
        this.pending.delete(id);
        const error = new Error(`plugin broker: ${operation} timed out`);
        reject(error);
        this.stopConnection(error);
      }, COMMAND_TIMEOUT_MS[operation]);
      this.pending.set(id, { resolve, reject, timer });
      try {
        sender.send({ kind: "frame", generation, frame: serialized });
        // the write failure rejects the command promise (reject(error)) and stopConnection terminates the unusable channel. Ends if either the reject or the stopConnection call is removed.
      } catch (error) {
        this.pending.delete(id);
        timer();
        reject(error instanceof Error ? error : unavailableError());
        this.stopConnection(error instanceof Error ? error : unavailableError());
      }
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.generation !== undefined) {
      return;
    }
    if (this.closed) {
      throw unavailableError();
    }
    await this.closing;
    if (this.hasGeneration()) {
      return;
    }
    this.connecting ??= this.connectOnce().finally(() => {
      this.connecting = undefined;
    });
    return await this.connecting;
  }

  private async connectOnce(deadline = this.monotonicNow() + CONNECT_TIMEOUT_MS): Promise<void> {
    if (this.closed) {
      throw unavailableError();
    }
    if (this.managedChild === undefined) {
      if (this.isClosed()) {
        throw unavailableError();
      }
      this.spawnManaged();
    }
    if (this.generation !== undefined) {
      return;
    }
    try {
      await this.waitForReady(deadline);
    } catch (error) {
      if (!(this.isClosed() || this.hasManagedChild()) && this.monotonicNow() < deadline) {
        await this.connectOnce(deadline);
        return;
      }
      throw error;
    }
  }

  private waitForReady(deadline: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = this.timers.timeout(
        () => {
          this.readyListeners.delete(ready);
          reject(unavailableError());
        },
        Math.max(0, deadline - this.monotonicNow()),
      );
      const ready = (): void => {
        if (this.generation === undefined && this.managedChild !== undefined) {
          return;
        }
        timer();
        this.readyListeners.delete(ready);
        if (this.generation === undefined) {
          reject(unavailableError());
        } else {
          resolve();
        }
      };
      this.readyListeners.add(ready);
      ready();
    });
  }

  private spawnManaged(): void {
    const directory = mkdtempSync(join(tmpdir(), "orb-plugin-broker-"));
    this.directoryResources.defer(() => rm(directory, { recursive: true, force: true }));
    const child = (this.seams.spawn ?? spawn)(
      process.execPath,
      [
        ...pluginWatchdogExecArgv(),
        fileURLToPath(new URL("./broker-watchdog.ts", import.meta.url)),
        directory,
        String(this.seams.env.PLUGIN_BROKER_WORKER_MAX),
        String(this.seams.env.PLUGIN_BROKER_MEMORY_LIMIT_BYTES),
        this.seams.env.NODE_ENV,
      ],
      {
        env: { ["NODE_ENV"]: this.seams.env.NODE_ENV },
        // Workers can read their process cwd under Node permissions; keep the app's data directory outside it.
        cwd: directory,
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      },
    );
    const closed = new Promise<void>((resolve) => {
      child.once("close", () => {
        this.children.delete(child);
        resolve();
      });
    });
    this.children.set(child, closed);
    child.unref();
    child.channel?.unref();
    this.managedChild = child;
    this.sender = new PluginIpcSender(
      (message, callback) => {
        child.send(message, callback);
      },
      (error) => this.stopConnection(error),
    );
    const onWatchdogGone = (error: Error): void => {
      if (this.managedChild !== child) {
        return;
      }
      this.managedChild = undefined;
      this.sender?.close();
      this.sender = undefined;
      this.generation = undefined;
      this.onDisconnect(error);
      for (const listener of this.readyListeners) {
        listener();
      }
    };
    child.once("error", onWatchdogGone);
    child.once("exit", () => onWatchdogGone(unavailableError()));
    child.on("message", (value: unknown) => this.consumeWatchdogMessage(child, value));
  }

  private consumeWatchdogMessage(child: ChildProcess, value: unknown): void {
    if (this.managedChild !== child) {
      return;
    }
    const message = parsePluginIpcMessage(value);
    if (message === null) {
      this.stopConnection(new Error("plugin broker: malformed inherited-channel envelope"));
      return;
    }
    if (message.kind === "ready") {
      this.acceptReady(message.generation);
      return;
    }
    if (message.generation !== this.generation) {
      return;
    }
    if (message.kind === "stopped") {
      this.generation = undefined;
      this.onDisconnect(unavailableError());
      return;
    }
    this.consumeFrame(message.frame);
  }

  private acceptReady(generation: string): void {
    if (this.generation !== undefined && this.generation !== generation) {
      this.onDisconnect(unavailableError());
    }
    this.generation = generation;
    for (const listener of this.readyListeners) {
      listener();
    }
  }

  private stopConnection(error: Error): void {
    this.generation = undefined;
    this.sender?.close();
    this.managedChild?.kill("SIGKILL");
    this.onDisconnect(error);
  }

  private consumeFrame(frame: string): void {
    try {
      const message = parseBrokerParentMessage(parseMessageLine(frame));
      if (message === null) {
        throw new Error("plugin broker: malformed broker response");
      }
      this.handle(message);
      // malformed broker bytes call stopConnection, whose onDisconnect(error) call rejects pending commands and crashes bindings. Ends if stopConnection stops calling onDisconnect.
    } catch (error) {
      this.stopConnection(error instanceof Error ? error : unavailableError());
    }
  }

  private handle(message: BrokerParentMessage): void {
    if (message.kind === "response") {
      this.handleResponse(message);
      return;
    }
    if (message.kind === "bridge-cancel") {
      this.handleBridgeCancel(message.id);
      return;
    }
    if (message.kind === "runtime-crashed") {
      this.handleRuntimeCrash(message);
      return;
    }
    if (message.kind === "log") {
      this.handleLog(message);
      return;
    }
    if (message.kind === "authority-released") {
      const binding = this.bindings.get(message.runtimeId);
      if (binding !== undefined) {
        releaseAuthority(binding, message.authorityId);
      }
      return;
    }
    // A bridge delivery that fails outside its RPC result path invalidates the broker connection and all
    // live command authorities. The channel's disconnect owner rejects pending work and crashes residents.
    try {
      this.handleBridge(message);
    } catch (error) {
      this.stopConnection(error instanceof Error ? error : unavailableError());
    }
  }

  private handleResponse(message: Extract<BrokerParentMessage, { readonly kind: "response" }>): void {
    const pending = this.pending.get(message.id);
    if (pending === undefined) {
      return;
    }
    this.pending.delete(message.id);
    pending.timer();
    if (message.ok) {
      pending.resolve(message.value);
    } else {
      pending.reject(fromRpcError(message.error, "plugin broker command failed"));
    }
  }

  private handleBridgeCancel(id: string): void {
    const call = this.bridgeCalls.get(id);
    if (call === undefined) {
      return;
    }
    call.liveness.abort();
  }

  private handleRuntimeCrash(message: Extract<BrokerParentMessage, { readonly kind: "runtime-crashed" }>): void {
    const binding = this.bindings.get(message.runtimeId);
    if (binding === undefined) {
      return;
    }
    this.bindings.delete(message.runtimeId);
    binding.runtimeId = undefined;
    const error = fromRpcError(message.error, "plugin worker crashed");
    binding.crashed = error;
    clearAuthorities(binding);
    binding.invokeArgs.clear();
    releaseBinding(binding);
    binding.onCrash(error);
  }

  private handleLog(message: Extract<BrokerParentMessage, { readonly kind: "log" }>): void {
    const binding = this.bindings.get(message.runtimeId);
    if (binding === undefined || binding.crashed !== null || binding.suppressLogs) {
      return;
    }
    retainLog(binding, message.level, message.message);
    if (binding.label !== undefined) {
      getLog(this.seams.log)[message.level]({ plugin: binding.label }, message.message);
    }
  }

  private handleBridge(message: Extract<BrokerParentMessage, { readonly kind: "bridge" }>): void {
    const binding = this.bindings.get(message.runtimeId);
    if (binding === undefined || binding.crashed !== null || binding.disposed) {
      this.sendBridgeResult(message.id, { ok: false, error: rpcError(new Error("plugin broker: stale, crashed, or disposed runtime id")) });
      return;
    }
    const authority = binding.authorities.get(message.authorityId);
    if (authority === undefined) {
      this.sendBridgeResult(message.id, { ok: false, error: rpcError(new Error("plugin broker: stale command authority")) });
      return;
    }
    if (isBridgeOperation(message.operation)) {
      if (!admitTailCall(binding, message.authorityId)) {
        this.sendBridgeResult(message.id, { ok: false, error: rpcError(new Error("plugin broker: command authority spent its continuation call budget")) });
        return;
      }
      try {
        authorizeBridgeCall(authority, message.operation, message.args);
      } catch (error) {
        this.sendBridgeResult(message.id, { ok: false, error: rpcError(error) });
        return;
      }
      const liveness = createLiveness();
      const completion = Promise.withResolvers<void>();
      this.bridgeCalls.set(message.id, { binding, liveness, settled: completion.promise });
      // the failed host operation is sent to the worker through sendBridgeResult(..., error) and its bridgeCalls record is removed. Ends if either action is removed.
      dispatchBridgeCall(binding, message.operation, message.args, liveness).then(
        (value) => {
          this.bridgeCalls.delete(message.id);
          this.sendBridgeResult(message.id, { ok: true, value });
          completion.resolve();
        },
        (error) => {
          this.bridgeCalls.delete(message.id);
          this.sendBridgeResult(message.id, { ok: false, error: rpcError(error) });
          completion.resolve();
        },
      );
      return;
    }
    try {
      authorizeSyncCall(authority, message.operation);
      const value = dispatchSyncCall(message.operation, message.args, {
        seams: binding.seams,
        invokeArgs: binding.invokeArgs,
      });
      this.sendBridgeResult(message.id, { ok: true, value });
    } catch (error) {
      this.sendBridgeResult(message.id, { ok: false, error: rpcError(error) });
    }
  }

  private sendBridgeResult(id: string, result: RpcResult): void {
    const sender = this.sender;
    const generation = this.generation;
    if (sender === undefined || generation === undefined) {
      return;
    }
    try {
      const frame = serializeMessage({ kind: "bridge-result", id, ...result });
      sender.send({ kind: "frame", generation, frame });
      // an oversized or unserializable host result is replaced by a bridge-result frame carrying rpcError(serializationError); the failure of that fallback is owned by the inner channelError catch. Ends if the fallback frame stops carrying the error.
    } catch (serializationError) {
      // a failed error response calls stopConnection, whose onDisconnect rejects pending work. Ends if stopConnection stops calling onDisconnect.
      try {
        sender.send({ kind: "frame", generation, frame: serializeMessage({ kind: "bridge-result", id, ok: false, error: rpcError(serializationError) }) });
      } catch (channelError) {
        this.stopConnection(channelError instanceof Error ? channelError : unavailableError());
      }
    }
  }

  private onDisconnect(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      pending.timer();
      pending.reject(error);
    }
    for (const call of this.bridgeCalls.values()) {
      call.liveness.abort();
    }
    // A binding that never dispatched a command onto a live connection was never served by the one that
    // just died — a belated exit/close for a forcibly-killed broker must not crash a binding whose own
    // reconnect is still in flight, and its `this.bindings` registration must survive for that reconnect to use.
    for (const binding of this.logicalBindings) {
      if (binding.crashed !== null || !binding.dispatched) {
        continue;
      }
      binding.crashed = error;
      clearAuthorities(binding);
      binding.invokeArgs.clear();
      releaseBinding(binding);
      binding.onCrash(error);
      binding.runtimeId = undefined;
    }
    for (const binding of this.bindings.values()) {
      if (this.logicalBindings.has(binding) || binding.crashed !== null || !binding.dispatched) {
        continue;
      }
      binding.crashed = error;
      clearAuthorities(binding);
      binding.invokeArgs.clear();
      releaseBinding(binding);
      binding.onCrash(error);
      binding.runtimeId = undefined;
    }
    for (const [runtimeId, binding] of this.bindings) {
      if (binding.dispatched) {
        this.bindings.delete(runtimeId);
      }
    }
  }
}

function unavailableError(): Error {
  const error = new Error("plugin broker became unavailable; its RSS watchdog or a process failure stopped every resident runtime");
  error.name = "PluginHostUnavailable";
  return error;
}

const PLUGIN_INSTANCE_KEYS = ["tools", "transforms", "events", "pubsub", "surfaces", "commands", "displayTransforms", "macros"] as const;

function requireRegistrationGrant(grants: ReadonlySet<PluginCapability>, capability: PluginCapability, registrations: readonly unknown[], label: string): void {
  if (registrations.length > 0 && !grants.has(capability)) {
    throw new Error(`plugin broker: activation returned ${label} without capability ${capability}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(value: Readonly<Record<string, unknown>>, key: string): boolean {
  return typeof value[key] === "string";
}

function isPluginLogLevel(value: unknown): value is PluginLogLevel {
  return typeof value === "string" && PLUGIN_LOG_LEVELS.some((level) => level === value);
}

function isToolRegistration(value: unknown): value is PluginToolRegistration {
  return isRecord(value) && hasString(value, "name") && hasString(value, "description") && isRecord(value["parameters"]) && hasString(value, "handler");
}

function isTransformRegistration(value: unknown): value is PluginTransformRegistration {
  return (
    isRecord(value) &&
    hasString(value, "name") &&
    typeof value["point"] === "string" &&
    PROMPT_TRANSFORM_POINTS.some((point) => point === value["point"]) &&
    hasString(value, "handler")
  );
}

function isEventRegistration(value: unknown): value is PluginEventSubscription {
  return (
    isRecord(value) &&
    typeof value["type"] === "string" &&
    (CHAT_TRIGGER_TYPES.some((type) => type === value["type"]) || DOMAIN_TRIGGER_TYPES.some((type) => type === value["type"])) &&
    hasString(value, "handler")
  );
}

function isPubsubRegistration(value: unknown): value is PluginPubsubSubscription {
  return isRecord(value) && hasString(value, "emitterSlug") && hasString(value, "name") && hasString(value, "handler");
}

function isSurfaceRegistration(value: unknown): value is PluginSurfaceRegistration {
  if (!(isRecord(value) && pluginSurfaceRegistrationMetaSchema.safeParse(value).success)) {
    return false;
  }
  const onAction = value["onAction"];
  const frame = value["frame"];
  return (onAction === undefined || typeof onAction === "string") && (frame === undefined || pluginFrameBodySchema.safeParse(frame).success);
}

function isCommandRegistration(value: unknown): value is PluginCommandRegistration {
  return isRecord(value) && pluginCommandRegistrationMetaSchema.safeParse(value).success && hasString(value, "onRun");
}

function isDisplayTransformRegistration(value: unknown): value is PluginDisplayTransformRegistration {
  return isRecord(value) && hasString(value, "name") && hasString(value, "handler");
}

function isMacroRegistration(value: unknown): value is PluginMacroRegistration {
  return isRecord(value) && hasString(value, "name") && hasString(value, "description") && hasString(value, "handler");
}

function isPluginInstance(value: unknown): value is PluginInstance {
  if (!isRecord(value) || Object.keys(value).some((key) => !PLUGIN_INSTANCE_KEYS.some((candidate) => candidate === key))) {
    return false;
  }
  return (
    Array.isArray(value["tools"]) &&
    value["tools"].every(isToolRegistration) &&
    Array.isArray(value["transforms"]) &&
    value["transforms"].every(isTransformRegistration) &&
    Array.isArray(value["events"]) &&
    value["events"].every(isEventRegistration) &&
    Array.isArray(value["pubsub"]) &&
    value["pubsub"].every(isPubsubRegistration) &&
    Array.isArray(value["surfaces"]) &&
    value["surfaces"].every(isSurfaceRegistration) &&
    Array.isArray(value["commands"]) &&
    value["commands"].every(isCommandRegistration) &&
    Array.isArray(value["displayTransforms"]) &&
    value["displayTransforms"].every(isDisplayTransformRegistration) &&
    Array.isArray(value["macros"]) &&
    value["macros"].every(isMacroRegistration)
  );
}

function parseActivationFailure(value: Readonly<Record<string, unknown>>): CreateInstanceOutcomeOut {
  const error = value["error"];
  const log = value["log"];
  if (typeof error !== "string" || !Array.isArray(log)) {
    throw new Error("plugin broker: malformed activation failure");
  }
  const parsedLog: PluginLogView[] = [];
  for (const line of log) {
    if (
      !(isRecord(line) && isPluginLogLevel(line["level"])) ||
      typeof line["message"] !== "string" ||
      typeof line["at"] !== "number" ||
      !Number.isFinite(line["at"])
    ) {
      throw new Error("plugin broker: malformed activation log");
    }
    parsedLog.push({ level: line["level"], message: line["message"], at: line["at"] });
  }
  return { ok: false, error, log: parsedLog };
}

function requireSurfaceGrants(surfaces: readonly PluginSurfaceRegistration[], grants: ReadonlySet<PluginCapability>): void {
  for (const surface of surfaces) {
    if (!PLUGIN_SURFACE_TIERS.some((tier) => tier === surface.tier)) {
      throw new Error("plugin broker: malformed surface registration");
    }
    const capability: PluginCapability = surface.tier === "frame" ? "ui.frame" : "ui.surface";
    if (!grants.has(capability)) {
      throw new Error(`plugin broker: activation returned a ${surface.tier} surface without capability ${capability}`);
    }
  }
}

function requireActivationInstance(value: unknown): PluginInstance {
  if (!isPluginInstance(value)) {
    throw new Error("plugin broker: malformed activation instance");
  }
  return value;
}

function parseCreateOutcome(value: unknown, grants: ReadonlySet<PluginCapability>): CreateInstanceOutcomeOut {
  if (typeof value !== "object" || value === null || !("ok" in value) || typeof value.ok !== "boolean") {
    throw new Error("plugin broker: malformed activation response");
  }
  if (!value.ok) {
    return parseActivationFailure(value);
  }
  const registrations = requireActivationInstance(Reflect.get(value, "instance"));
  requireRegistrationGrant(grants, "tools.register", registrations.tools, "tools");
  requireRegistrationGrant(grants, "chat.transform", registrations.transforms, "transforms");
  requireRegistrationGrant(grants, "chat.transform", registrations.displayTransforms, "display transforms");
  requireRegistrationGrant(grants, "chat.transform", registrations.macros, "macros");
  requireRegistrationGrant(grants, "events.subscribe", registrations.events, "event subscriptions");
  requireRegistrationGrant(grants, "plugin_events", registrations.pubsub, "private-event subscriptions");
  requireRegistrationGrant(grants, "ui.surface", registrations.commands, "commands");
  requireSurfaceGrants(registrations.surfaces, grants);
  return { ok: true, instance: registrations };
}

function parseSnippetOutcome(value: unknown): SnippetRunOut {
  const parsed = snippetResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("plugin broker: malformed snippet response");
  }
  return parsed.data;
}

export function createPluginHost(seams: PluginHostSeamDeps): ProcessPluginHost {
  const timerResources = new DisposableStack();
  // biome-ignore lint/nursery/useDisposables: timerResources owns this scheduler until returned host teardown; local using would close it before host use.
  const timers: TimerScheduler = timerResources.use(createScopedTimers(seams.timers));
  const broker = new BrokerClient(seams, timers);
  const { bindings, logicalBindings } = broker;
  const acquireSnippetAdmission = createAdmission(PLUGIN_SNIPPET_RUNTIME_MAX);
  const workerMaximum = seams.env.PLUGIN_BROKER_WORKER_MAX;
  const instances = new Map<PluginInstance, Binding>();
  const ownedBindings = new Set<Binding>();
  const pending = new Set<Promise<void>>();
  const poolResources = new AsyncDisposableStack();
  const bridgeResources = new AsyncDisposableStack();
  // biome-ignore lint/nursery/useDisposables: bridgeResources owns settlement during returned host teardown; the borrowed operation view must not close at return.
  const bridgeSettlement: Omit<BackgroundWork, keyof AsyncDisposable> = bridgeResources.use(createBackgroundWork(seams.log));
  let closed = false;
  let closing: Promise<void> | undefined;
  let pool: Pick<WarmRuntimePool<Binding>, "acquire" | "discard" | "fail" | "remove">;

  const runOwned = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (closed) {
      throw new Error("plugin host: logical host is closed");
    }
    const completion = Promise.withResolvers<void>();
    pending.add(completion.promise);
    try {
      return await operation();
    } finally {
      pending.delete(completion.promise);
      completion.resolve();
    }
  };

  const releaseOwnedBinding = (binding: Binding): void => {
    bridgeSettlement.supervise(`plugin-host:bridge-settlement:${seams.mintId()}`, "plugin.host.bridge.settlement", {}, async () => {
      await broker.settleBindings(new Set([binding]));
      ownedBindings.delete(binding);
    });
  };

  const commandWithAuthority = async ({ binding, operation, phase, chat, value }: AuthorityCommand): Promise<unknown> => {
    const runtimeId = binding.runtimeId;
    if (runtimeId === undefined) {
      throw new Error("plugin host: physical runtime is not active");
    }
    const authorityId = randomUUID();
    // The authority outlives the command: a guest continuation resumed by a host call that settles after the
    // command returned still issues its own host calls under this id. The Worker reports `authority-released`
    // once the command has completed and every call posted under the id has settled; the tail armed below
    // ends it regardless; retire, crash and disconnect clear the whole map.
    binding.authorities.set(authorityId, { grants: binding.grants, chat, phase });
    try {
      return await broker.command({
        operation,
        runtimeId,
        authorityId,
        value,
        onConnected: (): void => {
          binding.dispatched = true;
        },
      });
    } finally {
      armAuthorityTail(binding, authorityId);
    }
  };

  const retireRuntime = async (binding: Binding): Promise<void> => {
    const runtimeId = binding.runtimeId;
    if (runtimeId === undefined) {
      return;
    }
    const existing = binding.retirement;
    if (existing?.runtimeId === runtimeId) {
      await existing.done;
      return;
    }
    const done = (async (): Promise<void> => {
      try {
        await commandWithAuthority({ binding, operation: "dispose", phase: "lifecycle", chat: null });
      } finally {
        bindings.delete(runtimeId);
        if (binding.runtimeId === runtimeId) {
          binding.runtimeId = undefined;
        }
        clearAuthorities(binding);
        binding.invokeArgs.clear();
      }
    })();
    const retirement = { runtimeId, done };
    binding.retirement = retirement;
    try {
      await done;
    } finally {
      if (binding.retirement === retirement) {
        binding.retirement = undefined;
      }
      if (binding.disposed && binding.runtimeId === undefined) {
        releaseOwnedBinding(binding);
      }
    }
  };

  const lifecycleError = (): Error => new Error("plugin host: invocation refused because the logical instance lifecycle changed");

  const requireLifecycle = (binding: Binding, generation: number): void => {
    if (binding.disposed || binding.lifecycleGeneration !== generation) {
      throw lifecycleError();
    }
  };

  const activationCleanupError = (error: unknown, cleanupError: unknown): AggregateError =>
    new AggregateError([error, cleanupError], "plugin host: activation failed and its runtime could not be retired", { cause: error });

  pool = poolResources.use(new WarmRuntimePool(workerMaximum, retireRuntime, PLUGIN_RUNTIME_REQUEST_QUEUE_MAX));

  const activateRuntime = async (
    binding: Binding,
    phase: "activation" | "rehydration",
    serializable: Omit<CreateInstanceInputIn, "bridge">,
  ): Promise<CreateInstanceOutcomeOut> => {
    binding.suppressLogs = phase === "rehydration";
    try {
      return parseCreateOutcome(
        await commandWithAuthority({ binding, operation: "create", phase, chat: serializable.chat, value: serializable }),
        binding.grants,
      );
    } finally {
      binding.suppressLogs = false;
    }
  };

  const cleanupFailedActivation = async (binding: Binding, runtimeId: string, error: unknown): Promise<never> => {
    if (binding.runtimeId === runtimeId && binding.crashed === null) {
      try {
        await retireRuntime(binding);
      } catch (cleanupError) {
        forgetRuntime(binding, runtimeId);
        throw activationCleanupError(error, cleanupError);
      }
    }
    throw error;
  };

  const retainCatalog = async (binding: Binding, outcome: Extract<CreateInstanceOutcomeOut, { readonly ok: true }>): Promise<CreateInstanceOutcomeOut> => {
    if (binding.catalog !== undefined && !isDeepStrictEqual(outcome.instance, binding.catalog)) {
      const error = new Error("plugin host: rehydrated registrations differ from the enabled plugin catalog");
      binding.crashed = error;
      try {
        await retireRuntime(binding);
      } finally {
        pool.fail(binding, error);
      }
      throw error;
    }
    binding.catalog ??= outcome.instance;
    return { ok: true, instance: binding.catalog };
  };

  const startRuntime = async (
    binding: Binding,
    phase: "activation" | "rehydration",
    generation: number,
    initialMainJs?: string,
  ): Promise<CreateInstanceOutcomeOut> => {
    requireLifecycle(binding, generation);
    const runtimeConfig = binding.runtimeConfig;
    if (runtimeConfig === undefined) {
      throw new Error("plugin host: resident runtime is missing its activation configuration");
    }
    const mainJs = initialMainJs ?? (await binding.reloadMainJs?.());
    requireLifecycle(binding, generation);
    if (mainJs === undefined) {
      throw new Error("plugin host: resident runtime is missing its durable source loader");
    }
    const serializable: Omit<CreateInstanceInputIn, "bridge"> = { ...runtimeConfig, mainJs };
    const runtimeId = randomUUID();
    binding.runtimeId = runtimeId;
    bindings.set(runtimeId, binding);
    let outcome: CreateInstanceOutcomeOut;
    try {
      outcome = await activateRuntime(binding, phase, serializable);
      requireLifecycle(binding, generation);
    } catch (error) {
      return await cleanupFailedActivation(binding, runtimeId, error);
    }
    if (!outcome.ok) {
      forgetRuntime(binding, runtimeId);
      return outcome;
    }
    try {
      const retained = await retainCatalog(binding, outcome);
      requireLifecycle(binding, generation);
      return retained;
    } catch (error) {
      return await cleanupFailedActivation(binding, runtimeId, error);
    }
  };

  const wakeBinding = async (binding: Binding, generation: number): Promise<void> => {
    const outcome = await startRuntime(binding, "rehydration", generation);
    requireLifecycle(binding, generation);
    if (!outcome.ok) {
      pool.discard(binding);
      throw new Error(`plugin host: sleeping runtime could not be rebuilt: ${outcome.error}`);
    }
  };

  const bindInvokeArgs = (binding: Binding, argsJson: PluginInvokeArgs): BoundInvokeArgs => {
    if (typeof argsJson !== "function") {
      return { wireArgs: argsJson };
    }
    const builderId = randomUUID();
    binding.invokeArgs.set(builderId, argsJson);
    return { wireArgs: { builderId }, builderId };
  };

  const discardFailedColdLease = (binding: Binding, lease: WarmRuntimeLease): void => {
    if (lease.cold && binding.runtimeId === undefined && binding.crashed === null) {
      pool.discard(binding);
    }
  };

  const releaseInvokeLease = (binding: Binding, lease: WarmRuntimeLease, builderId: string | undefined): void => {
    if (builderId !== undefined) {
      binding.invokeArgs.delete(builderId);
    }
    lease.release();
  };

  const invokeWithLease = async ({ binding, lease, handler, argsJson, chat }: LeasedInvokeInput, generation: number): Promise<string> => {
    let builderId: string | undefined;
    try {
      requireLifecycle(binding, generation);
      if (lease.cold) {
        await wakeBinding(binding, generation);
        requireLifecycle(binding, generation);
        lease.ready();
      }
      if (binding.crashed !== null) {
        throw binding.crashed;
      }
      const boundArgs = bindInvokeArgs(binding, argsJson);
      builderId = boundArgs.builderId;
      requireLifecycle(binding, generation);
      const result = await commandWithAuthority({
        binding,
        operation: "invoke",
        phase: "invocation",
        chat: chat ?? null,
        value: { handler, argsJson: boundArgs.wireArgs, chat },
      });
      if (typeof result !== "string") {
        throw new Error("plugin broker: malformed invoke response");
      }
      return result;
    } catch (error) {
      discardFailedColdLease(binding, lease);
      throw error;
    } finally {
      releaseInvokeLease(binding, lease, builderId);
    }
  };

  const newBinding = ({ bridge, grants, runtimeConfig, reloadMainJs, label, releaseAdmission }: NewBindingInput): Binding => {
    const binding: Binding = {
      registry: bindings,
      timers,
      runtimeId: undefined,
      lifecycleGeneration: 0,
      bridge,
      // A snippet carries no runtimeConfig and so no hosts: every snippet fetch is refused, as in-process.
      netEgress: createPluginNetEgress(runtimeConfig?.netHosts ?? [], bridge, seams.safeFetch),
      grants: new Set(grants),
      authorities: new Map(),
      authorityTails: new Map(),
      seams,
      invokeArgs: new Map(),
      log: [],
      chars: 0,
      suppressLogs: false,
      crashed: null,
      disposed: false,
      dispatched: false,
      retirement: undefined,
      onCrash: (error) => pool.fail(binding, error),
      ...(runtimeConfig === undefined ? {} : { runtimeConfig }),
      ...(reloadMainJs === undefined ? {} : { reloadMainJs }),
      ...(label === undefined ? {} : { label }),
      ...(releaseAdmission === undefined ? {} : { releaseAdmission }),
    };
    ownedBindings.add(binding);
    return binding;
  };

  const operations: Omit<ProcessPluginHost, keyof AsyncDisposable> = {
    createInstance: async (input): Promise<CreateInstanceOutcomeOut> => {
      const { bridge, mainJs, reloadMainJs, ...runtimeConfig } = input;
      const binding = newBinding({
        bridge,
        grants: input.grants,
        runtimeConfig,
        ...(reloadMainJs === undefined ? {} : { reloadMainJs }),
        ...(input.label === undefined ? {} : { label: input.label }),
      });
      logicalBindings.add(binding);
      const lease = await pool.acquire(binding).catch((error: unknown) => {
        binding.disposed = true;
        logicalBindings.delete(binding);
        releaseOwnedBinding(binding);
        throw error;
      });
      try {
        const outcome = await startRuntime(binding, "activation", binding.lifecycleGeneration, mainJs);
        if (!outcome.ok) {
          binding.disposed = true;
          logicalBindings.delete(binding);
          pool.discard(binding);
          return outcome;
        }
        lease.ready();
        instances.set(outcome.instance, binding);
        return outcome;
      } catch (error) {
        binding.disposed = true;
        logicalBindings.delete(binding);
        pool.discard(binding);
        throw error;
      } finally {
        lease.release();
        if (binding.disposed && binding.runtimeId === undefined) {
          releaseOwnedBinding(binding);
        }
      }
    },
    invoke: async (...invokeParameters: Parameters<ProcessPluginHost["invoke"]>): Promise<string> => {
      const [instance, handler, argsJson, chat, signal] = invokeParameters;
      const binding = instances.get(instance);
      if (binding === undefined || binding.disposed) {
        throw new Error("plugin host: invoke on an unknown/disposed instance");
      }
      if (binding.crashed !== null) {
        throw binding.crashed;
      }
      const generation = binding.lifecycleGeneration;
      const lease = await pool.acquire(binding, { signal });
      return await invokeWithLease({ binding, lease, handler, argsJson, chat }, generation);
    },
    runSnippet: async (input): Promise<SnippetRunOut> => {
      const releaseAdmission = acquireSnippetAdmission();
      if (releaseAdmission === null) {
        throw new DomainConflictError(`the plugin host is running its maximum of ${PLUGIN_SNIPPET_RUNTIME_MAX} snippets — wait a moment and run it again`);
      }
      const binding = newBinding({ bridge: input.bridge, grants: input.grants, releaseAdmission });
      const lease = await pool.acquire(binding).catch((error: unknown) => {
        releaseBinding(binding);
        releaseOwnedBinding(binding);
        throw error;
      });
      try {
        requireLifecycle(binding, binding.lifecycleGeneration);
        const runtimeId = randomUUID();
        binding.runtimeId = runtimeId;
        bindings.set(runtimeId, binding);
        try {
          return parseSnippetOutcome(
            await commandWithAuthority({
              binding,
              operation: "snippet",
              phase: "snippet",
              chat: input.chat,
              value: { code: input.code, grants: input.grants, chat: input.chat },
            }),
          );
        } finally {
          forgetRuntime(binding, runtimeId);
        }
      } finally {
        pool.discard(binding);
        lease.release();
        releaseBinding(binding);
        releaseOwnedBinding(binding);
      }
    },
    readLog: (instance): readonly PluginLogView[] => {
      const binding = instances.get(instance);
      return binding === undefined ? [] : [...binding.log];
    },
    dispose: (instance): void => {
      const binding = instances.get(instance);
      if (binding === undefined) {
        return;
      }
      instances.delete(instance);
      logicalBindings.delete(binding);
      binding.disposed = true;
      binding.lifecycleGeneration += 1;
      const error = new Error("plugin host: invocation refused because the logical instance was disposed");
      pool.remove(binding, error);
      if (binding.runtimeId === undefined) {
        releaseOwnedBinding(binding);
      }
    },
  };

  // biome-ignore lint/nursery/useDisposables: the caller adopts this returned host; local await using would close it before return.
  const host: ProcessPluginHost = {
    ...operations,
    createInstance: (...args) => runOwned(() => operations.createInstance(...args)),
    invoke: (...args) => runOwned(() => operations.invoke(...args)),
    runSnippet: (...args) => runOwned(() => operations.runSnippet(...args)),
    [Symbol.asyncDispose]: (): Promise<void> => {
      closing ??= (async (): Promise<void> => {
        closed = true;
        await using cleanup = new AsyncDisposableStack();
        cleanup.defer(() => timerResources.dispose());
        cleanup.defer(() => broker.closeManaged());
        cleanup.defer(async (): Promise<void> => {
          await broker.settleBindings(ownedBindings);
          for (const binding of ownedBindings) {
            clearAuthorities(binding);
            binding.invokeArgs.clear();
            releaseBinding(binding);
          }
          ownedBindings.clear();
        });
        cleanup.defer(() => bridgeResources.disposeAsync());
        cleanup.defer(async (): Promise<void> => {
          while (pending.size > 0) {
            await Promise.all([...pending]);
          }
        });
        cleanup.defer(() => poolResources.disposeAsync());
        const failure = new Error("plugin host: logical host is closing");
        for (const binding of ownedBindings) {
          logicalBindings.delete(binding);
          binding.disposed = true;
          binding.lifecycleGeneration += 1;
          pool.remove(binding, failure);
        }
        instances.clear();
        broker.cancelStartup();
        broker.cancelBindings(ownedBindings);
      })();
      return closing;
    },
  };
  return host;
}
