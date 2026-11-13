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
  SnippetResult,
} from "@orb/contracts/plugin";
import {
  PLUGIN_LOG_LEVELS,
  PLUGIN_SURFACE_TIERS,
  PLUGIN_UI_HOST_CALL_FAILED,
  PluginInstallerDisabledError,
  pluginCommandRegistrationMetaSchema,
  pluginFrameBodySchema,
  pluginSurfaceRegistrationMetaSchema,
  snippetResultSchema,
} from "@orb/contracts/plugin";
import { DomainConflictError, DomainError, DomainInternalFaultError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import type { TimerScheduler } from "@orb/kit/time";
import { MS_PER_MINUTE, MS_PER_SECOND } from "@orb/kit/time";
import { getLog } from "#foundation/observability";
import { EgressBlockedError, ImageRejectedError } from "#infra/network";
import type { BackgroundWork } from "#infra/tasks";
import { createBackgroundWork } from "#infra/tasks";
import { createScopedTimers } from "#infra/timers";
import { createAdmission } from "./admission.ts";
import type { BridgeAuthority } from "./bridge-rpc.ts";
import { authorizeBridgeCall, authorizeSyncCall, dispatchBridgeCall, dispatchSyncCall, MalformedBridgeArgumentsError } from "./bridge-rpc.ts";
import {
  PLUGIN_AUTHORITY_TAIL_CALLS_MAX,
  PLUGIN_AUTHORITY_TAIL_MS,
  PLUGIN_BROKER_LOSS_WINDOW_MS,
  PLUGIN_BROKER_LOSSES_MAX,
  PLUGIN_COMMAND_TIMEOUT_MS,
  PLUGIN_LOG_RING_CHARS,
  PLUGIN_LOG_RING_LINES,
  PLUGIN_RUNTIME_REQUEST_QUEUE_MAX,
  PLUGIN_SNIPPET_RUNTIME_MAX,
  PLUGIN_WATCHDOG_STOP_GRACE_MS,
  pluginBrokerRestartHoldMs,
  pluginIpcShareBytes,
} from "./budgets.ts";
import type { PluginNetEgress } from "./contract/net-egress.ts";
import type { CreateInstanceInputIn, CreateInstanceOutcomeOut, CreateLogicalInstanceInputIn, PluginHostSeamDeps, ProcessPluginHost } from "./contract/port.ts";
import type { BrokerParentMessage, ParentBrokerMessage, RpcResult } from "./contract/process-protocol.ts";
import { createPluginNetEgress } from "./net-egress.ts";
import { PluginIpcSender, PluginIpcShares, parsePluginIpcMessage } from "./process-channel.ts";
import { pluginWatchdogExecArgv } from "./process-permission.ts";
import {
  CodedHostUnavailableError,
  channelFullBridgeResult,
  channelFullResponse,
  fromRpcError,
  isBridgeOperation,
  PLUGIN_CHANNEL_FULL,
  PLUGIN_HOST_UNAVAILABLE,
  PLUGIN_INVOCATION_ENDED,
  PLUGIN_STALE_RUNTIME,
  parseBrokerParentMessage,
  parseMessageLine,
  rpcError,
  serializeMessage,
} from "./process-protocol.ts";
import type { WarmRuntimeLease } from "./warm-runtime-pool.ts";
import { WarmRuntimePool } from "./warm-runtime-pool.ts";

const CONNECT_TIMEOUT_MS = 10_000;
// How a halt record names a runtime that ran a snippet, which has no plugin slug.
const SNIPPET_RUNNER = "a snippet";

/** One broker loss inside the window (D347): when, on the host's monotonic clock, and each owner's plugins whose runtimes
 *  the lost broker held. */
interface BrokerLoss {
  readonly at: number;
  readonly running: ReadonlyMap<UserId, ReadonlySet<string>>;
}

/** A logical instance can restart from its runtime config. A snippet holds an admission until release. */
type BindingLifetime =
  | {
      readonly runtimeConfig: Omit<CreateInstanceInputIn, "bridge" | "mainJs">;
      readonly reloadMainJs?: CreateLogicalInstanceInputIn["reloadMainJs"];
      readonly label?: string;
      readonly releaseAdmission?: never;
    }
  | {
      readonly releaseAdmission: () => void;
      readonly runtimeConfig?: never;
      readonly reloadMainJs?: never;
      readonly label?: never;
    };

type Binding = BindingLifetime & {
  readonly registry: RuntimeRegistry;
  /** Whose share of the Workers this binding's runtime draws on. */
  readonly owner: UserId;
  readonly timers: TimerScheduler;
  runtimeId: string | undefined;
  lifecycleGeneration: number;
  readonly bridge: PluginBridge;
  /** Built from the domain-supplied `netHosts` held here, never from anything the broker sends. */
  readonly netEgress: PluginNetEgress;
  readonly grants: ReadonlySet<PluginCapability>;
  readonly authorities: Map<string, BridgeAuthority>;
  /** For each command still running, whether the app refused one of its host calls because the installer is
   *  disabled. The guest's own rethrow of that refusal reaches the app as a plain error, which the crash policy
   *  would count; this record, kept only in the app, lets the command fail as the refusal instead. */
  readonly standingRefused: Map<string, boolean>;
  /** Per-authority tails armed when a command completes; the parent's own time and call bound on a lying Worker. */
  readonly authorityTails: Map<string, AuthorityTail>;
  readonly seams: PluginHostSeamDeps;
  readonly invokeArgs: Map<string, (chatHandle: string | null) => string>;
  readonly log: PluginLogView[];
  chars: number;
  suppressLogs: boolean;
  crashed: Error | null;
  /** An ended invocation's refusal that no command carried, because the broker ended this binding's runtime with
   *  none pending; the next invoke rejects with it once. */
  owedRefusal: Error | null;
  disposed: boolean;
  /** Set once this binding's first command has actually reached a live broker connection. A binding still
   *  waiting on `ensureConnected()` was never served by the connection that just died and a belated exit
   *  event for it must not crash a binding it never touched. */
  dispatched: boolean;
  onCrash: (error: Error) => void;
  /** The broker terminated this binding's runtime for overrunning its window; the binding stays usable. */
  onEnded: () => void;
  catalog?: PluginInstance;
  retirement: { readonly runtimeId: string; readonly done: Promise<void> } | undefined;
};

interface AuthorityTail {
  readonly timer: () => void;
  /** Bridge calls admitted under the authority since its command returned. */
  calls: number;
}

interface PendingCommand {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly runtimeId: string;
  readonly operation: Extract<ParentBrokerMessage, { readonly kind: "command" }>["operation"];
  /** Cancels the backstop, which is armed only while this is its runtime's oldest outstanding command. */
  cancelBackstop: () => void;
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

type NewBindingInput = BindingLifetime & {
  readonly owner: UserId;
  readonly bridge: PluginBridge;
  readonly grants: readonly PluginCapability[];
};

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

// The app's live runtimes by id, each holding its share of the queues the app sends on from registration until it is
// forgotten (D348). Forgetting one tells the broker, which holds the runtime's own share until then.
class RuntimeRegistry {
  private readonly bindings = new Map<string, Binding>();
  private readonly shares = new PluginIpcShares();
  private readonly forgotten: (runtimeId: string) => void;

  constructor(forgotten: (runtimeId: string) => void) {
    this.forgotten = forgotten;
  }

  get(runtimeId: string): Binding | undefined {
    return this.bindings.get(runtimeId);
  }

  shareOf(runtimeId: string): string | undefined {
    return this.shares.of(runtimeId);
  }

  set(runtimeId: string, binding: Binding): void {
    this.bindings.set(runtimeId, binding);
    this.shares.acquire(runtimeId);
  }

  delete(runtimeId: string): void {
    if (!this.bindings.delete(runtimeId)) {
      return;
    }
    this.shares.release(runtimeId);
    this.forgotten(runtimeId);
  }

  values(): MapIterator<Binding> {
    return this.bindings.values();
  }

  [Symbol.iterator](): MapIterator<[string, Binding]> {
    return this.bindings.entries();
  }
}

class BrokerClient {
  readonly bindings = new RuntimeRegistry((runtimeId) => this.releaseBrokerShare(runtimeId));
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
  /** Each runtime's outstanding command ids, oldest first. */
  private readonly outstanding = new Map<string, string[]>();
  private readonly bridgeCalls = new Map<string, ActiveBridgeCall>();
  private closing: Promise<void> | undefined;
  private nextCommand = 0;
  private losses: readonly BrokerLoss[] = [];
  /** The watchdog whose stopped report was already counted as a loss. Its exit before its next ready is the same event:
   *  a watchdog that stops itself reports its broker stopped, then exits. */
  private lossCountedFor: ChildProcess | undefined;
  /** Until when plugin calls are refused after a run of broker losses. */
  private heldUntil = Number.NEGATIVE_INFINITY;
  /** Set once the host stops restarting its broker; every later call is refused with it. */
  private halted: Error | undefined;

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
        this.stopWatchdog(child);
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
    if (this.generation === undefined && this.connecting !== undefined && this.managedChild !== undefined) {
      this.stopWatchdog(this.managedChild);
    }
  }

  // STOP IS A CLOSED IPC CHANNEL, NEVER A SIGNAL (D347). On Windows `kill()` ends a process at once whatever signal it
  // names, and a `SIGTERM` handler never runs, so a signal cannot carry a stop the child gets to act on. Closing the
  // channel can: the watchdog sees `disconnect` on every platform, the event it also sees when this process dies, stops
  // its broker the same way, and exits. Its exit is the acknowledgement; `kill()` after the grace is only the fallback.
  private stopWatchdog(child: ChildProcess): void {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    const cancel = this.timers.timeout(() => {
      getLog(this.seams.log).warn({ graceMs: PLUGIN_WATCHDOG_STOP_GRACE_MS }, "plugin host: the broker watchdog did not exit after its stop; ending it");
      child.kill("SIGKILL");
    }, PLUGIN_WATCHDOG_STOP_GRACE_MS);
    child.once("exit", cancel);
    if (child.connected) {
      child.disconnect();
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
      this.pending.set(id, { resolve, reject, runtimeId, operation, cancelBackstop: () => undefined });
      const outstanding = this.outstanding.get(runtimeId);
      if (outstanding === undefined) {
        this.outstanding.set(runtimeId, [id]);
        this.armBackstop(id);
      } else {
        outstanding.push(id);
      }
      try {
        // A dispose is the host's own small frame; every other command carries a value its plugin sized, so it takes its
        // runtime's share and a full channel refuses that command alone, as host-unavailable.
        const share = this.bindings.shareOf(runtimeId);
        if (operation === "dispose") {
          sender.send({ kind: "frame", generation, frame: serialized });
        } else if (share === undefined) {
          // Forgotten while the connection was awaited: the broker would refuse it as a stale runtime.
          this.settleCommand(id);
          reject(new PluginHostUnavailableError(PLUGIN_STALE_RUNTIME));
        } else if (
          !sender.offer({
            kind: "frame",
            generation,
            frame: serialized,
            route: { share, refusal: { frame: serializeMessage(channelFullResponse(id)), back: true } },
          })
        ) {
          this.settleCommand(id);
          reject(new PluginHostUnavailableError(PLUGIN_CHANNEL_FULL));
        }
        // the write failure rejects the command promise (reject(error)) and stopConnection terminates the unusable channel. Ends if either the reject or the stopConnection call is removed.
      } catch (error) {
        this.settleCommand(id);
        reject(error instanceof Error ? error : unavailableError());
        this.stopConnection(error instanceof Error ? error : unavailableError());
      }
    });
  }

  // A runtime runs its commands one at a time, so only its oldest outstanding command is timed, from when it became the
  // oldest: the commands queued ahead of a command are never charged to it (D347).
  private armBackstop(id: string): void {
    const pending = this.pending.get(id);
    if (pending === undefined) {
      return;
    }
    pending.cancelBackstop = this.timers.timeout(() => this.backstop(id), PLUGIN_COMMAND_TIMEOUT_MS[pending.operation]);
  }

  // Forget a command that has answered or failed, and time the next command of its runtime if this was the oldest.
  private settleCommand(id: string): PendingCommand | undefined {
    const pending = this.pending.get(id);
    if (pending === undefined) {
      return;
    }
    this.pending.delete(id);
    pending.cancelBackstop();
    const outstanding = this.outstanding.get(pending.runtimeId) ?? [];
    const [oldest] = outstanding;
    const rest = outstanding.filter((other) => other !== id);
    if (rest.length === 0) {
      this.outstanding.delete(pending.runtimeId);
    } else {
      this.outstanding.set(pending.runtimeId, rest);
    }
    if (oldest === id && rest[0] !== undefined) {
      this.armBackstop(rest[0]);
    }
    return pending;
  }

  // The broker ends a stuck Worker itself, well inside this backstop; a command still unanswered here is late on its
  // own account. It fails alone, as its plugin's strike, and the broker is asked to end that runtime. The broker itself
  // is never killed for a late command: only its watchdog's heartbeat bound replaces it (D347).
  private backstop(id: string): void {
    const pending = this.settleCommand(id);
    if (pending === undefined) {
      return;
    }
    const ended = new Error(`plugin broker: a ${pending.operation} command ran past its ${PLUGIN_COMMAND_TIMEOUT_MS[pending.operation]}ms backstop`);
    ended.name = PLUGIN_INVOCATION_ENDED;
    pending.reject(ended);
    const sender = this.sender;
    const generation = this.generation;
    if (sender === undefined || generation === undefined) {
      return;
    }
    try {
      sender.send({ kind: "frame", generation, frame: serializeMessage({ kind: "end-runtime", runtimeId: pending.runtimeId, commandId: id }) });
      // a channel that cannot carry this frame cannot carry any: stopConnection ends it, as every other send failure does. Ends if the channel gains another failure owner.
    } catch (error) {
      this.stopConnection(error instanceof Error ? error : unavailableError());
    }
  }

  // A host that stopped restarting its broker refuses every call; one inside a hold refuses until the hold passes. Taken
  // where a plugin call enters the host, never per command, so a call already running can still retire its runtime.
  admit(): void {
    if (this.halted !== undefined) {
      throw this.halted;
    }
    const waitMs = this.heldUntil - this.monotonicNow();
    if (waitMs > 0) {
      throw new PluginHostUnavailableError(`plugin host: restarting after repeated broker losses; retry in ${String(Math.ceil(waitMs / MS_PER_SECOND))} s`);
    }
  }

  // REPEATED BROKER LOSSES ARE BOUNDED (D347). A lone loss recovers at once. Each further loss inside the window holds
  // plugin calls for a doubling time, so a loss that a call can cause repeats at most that often; past the count the
  // host stops restarting the broker until the server restarts, and tells the owner why through `onHalted`.
  private recordBrokerLoss(reason: string): void {
    if (this.closed || this.halted !== undefined) {
      return;
    }
    const now = this.monotonicNow();
    this.losses = [...this.losses.filter((loss) => now - loss.at < PLUGIN_BROKER_LOSS_WINDOW_MS), { at: now, running: this.runningPlugins() }];
    if (this.losses.length <= PLUGIN_BROKER_LOSSES_MAX) {
      this.heldUntil = now + pluginBrokerRestartHoldMs(this.losses.length);
      return;
    }
    const minutes = PLUGIN_BROKER_LOSS_WINDOW_MS / MS_PER_MINUTE;
    const message = `the plugin host stopped after its broker was lost ${String(this.losses.length)} times within ${String(minutes)} minutes (last: ${reason}); plugins stay paused until the server restarts`;
    this.halted = new PluginHostUnavailableError(message);
    this.seams.onHalted(this.haltRecords(message));
    // Nothing respawns the watchdog while the host is halted.
    this.generation = undefined;
    this.sender?.close();
    if (this.managedChild !== undefined) {
      this.stopWatchdog(this.managedChild);
    }
    this.onDisconnect(this.halted);
  }

  // The broker's share for a runtime passes on once this host forgets the runtime, so the notice goes out before any
  // command the freed Worker lets through, on the same ordered channel. A lost connection forgets with its broker.
  private releaseBrokerShare(runtimeId: string): void {
    const sender = this.sender;
    const generation = this.generation;
    if (sender === undefined || generation === undefined) {
      return;
    }
    try {
      sender.send({ kind: "frame", generation, frame: serializeMessage({ kind: "runtime-forgotten", runtimeId }) });
      // a channel that cannot carry this control frame cannot carry any: stopConnection ends it, as every other send failure does. Ends if the channel gains another failure owner.
    } catch (error) {
      this.stopConnection(error instanceof Error ? error : unavailableError());
    }
  }

  // Each owner's plugins whose runtimes are on the broker now: those registered and already sent a command.
  private runningPlugins(): ReadonlyMap<UserId, ReadonlySet<string>> {
    const running = new Map<UserId, Set<string>>();
    for (const [, binding] of this.bindings) {
      if (binding.dispatched) {
        running.set(binding.owner, (running.get(binding.owner) ?? new Set()).add(binding.label ?? SNIPPET_RUNNER));
      }
    }
    return running;
  }

  // A halt record for each owner of a resident plugin or of a lost runtime. Each names only that owner's own plugins, so
  // no owner learns what another runs.
  private haltRecords(message: string): ReadonlyMap<UserId, string> {
    const owners = new Set([...Array.from(this.logicalBindings, (binding) => binding.owner), ...this.losses.flatMap((loss) => [...loss.running.keys()])]);
    return new Map(
      Array.from(owners, (owner): [UserId, string] => {
        const atEachLoss = this.losses.map((loss, index) => `${String(index + 1)}: ${[...(loss.running.get(owner) ?? [])].join(", ") || "none"}`);
        return [owner, `${message}. Your plugins running at each loss: ${atEachLoss.join("; ")}`];
      }),
    );
  }

  private async ensureConnected(): Promise<void> {
    if (this.halted !== undefined) {
      throw this.halted;
    }
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
    await this.connecting;
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
        this.seams.env.LOG_LEVEL,
      ],
      {
        env: { ["NODE_ENV"]: this.seams.env.NODE_ENV },
        // Workers can read their process cwd under Node permissions; keep the app's data directory outside it.
        cwd: directory,
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      },
    );
    // Joined on exit, not close: once this side has closed the channel to stop the watchdog, Node emits no close.
    const closed = new Promise<void>((resolve) => {
      child.once("exit", () => {
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
      pluginIpcShareBytes(this.seams.env.PLUGIN_BROKER_WORKER_MAX),
    );
    const onWatchdogGone = (error: Error): void => {
      if (this.managedChild !== child) {
        return;
      }
      if (this.lossCountedFor !== child) {
        this.recordBrokerLoss(error.message);
      }
      this.lossCountedFor = undefined;
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
      // Counted before the disconnect forgets the lost runtimes, so the loss records which plugins it took.
      this.recordBrokerLoss(message.error.message);
      this.lossCountedFor = child;
      this.generation = undefined;
      this.onDisconnect(unavailableError());
      return;
    }
    this.consumeFrame(message.frame);
  }

  private acceptReady(generation: string): void {
    this.lossCountedFor = undefined;
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
    if (message.kind === "runtime-ended") {
      this.handleRuntimeEnded(message);
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
    const pending = this.settleCommand(message.id);
    if (pending === undefined) {
      return;
    }
    if (message.ok) {
      pending.resolve(message.value);
    } else {
      pending.reject(
        message.error.name === PLUGIN_HOST_UNAVAILABLE
          ? new PluginHostUnavailableError(message.error.message)
          : fromRpcError(message.error, "plugin broker command failed"),
      );
    }
  }

  // The broker terminated this runtime's stuck Worker. The plugin's logical instance is not crashed: it is forgotten
  // from the pool, so its next call cold-starts a fresh runtime from its durable source.
  private handleRuntimeEnded(message: Extract<BrokerParentMessage, { readonly kind: "runtime-ended" }>): void {
    const binding = this.bindings.get(message.runtimeId);
    if (binding === undefined) {
      return;
    }
    this.bindings.delete(message.runtimeId);
    binding.runtimeId = undefined;
    clearAuthorities(binding);
    binding.invokeArgs.clear();
    // The stall ran after its command returned, so no command answered for it: the plugin's next invocation does, once,
    // as the ended refusal it would have carried, and that is the strike (D347).
    if (message.error !== undefined) {
      binding.owedRefusal = fromRpcError(message.error, "plugin worker ended");
    }
    binding.onEnded();
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
      this.sendBridgeResult(message.runtimeId, message.id, { ok: false, error: rpcError(new Error("plugin broker: stale, crashed, or disposed runtime id")) });
      return;
    }
    const authority = binding.authorities.get(message.authorityId);
    if (authority === undefined) {
      this.sendBridgeResult(message.runtimeId, message.id, { ok: false, error: rpcError(new Error("plugin broker: stale command authority")) });
      return;
    }
    if (isBridgeOperation(message.operation)) {
      if (!admitTailCall(binding, message.authorityId)) {
        this.sendBridgeResult(message.runtimeId, message.id, {
          ok: false,
          error: rpcError(new Error("plugin broker: command authority spent its continuation call budget")),
        });
        return;
      }
      try {
        authorizeBridgeCall(authority, message.operation, message.args);
      } catch (error) {
        this.sendBridgeResult(message.runtimeId, message.id, { ok: false, error: rpcError(error) });
        return;
      }
      const liveness = createLiveness();
      const completion = Promise.withResolvers<void>();
      this.bridgeCalls.set(message.id, { binding, liveness, settled: completion.promise });
      // the failed host operation is sent to the worker through sendBridgeResult(..., error) and its bridgeCalls record is removed. Ends if either action is removed.
      dispatchBridgeCall(binding, message.operation, message.args, liveness).then(
        (value) => {
          this.bridgeCalls.delete(message.id);
          this.sendBridgeResult(message.runtimeId, message.id, { ok: true, value });
          completion.resolve();
        },
        (error) => {
          this.bridgeCalls.delete(message.id);
          if (error instanceof PluginInstallerDisabledError && binding.standingRefused.has(message.authorityId)) {
            binding.standingRefused.set(message.authorityId, true);
          }
          this.sendBridgeResult(message.runtimeId, message.id, { ok: false, error: rpcError(this.guestFacingFailure(binding, message.operation, error)) });
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
      this.sendBridgeResult(message.runtimeId, message.id, { ok: true, value });
    } catch (error) {
      this.sendBridgeResult(message.runtimeId, message.id, { ok: false, error: rpcError(error) });
    }
  }

  // What the guest reads of a failed bridge operation. A named refusal keeps its name and text. Any other error, a
  // database fault among them, crosses as one fixed sentence: its own message can carry server internals, such as a
  // failed query's SQL and bound values. The operator still reads that error in the server log.
  private guestFacingFailure(binding: Binding, operation: string, error: unknown): unknown {
    if (isNamedBridgeRefusal(error)) {
      return error;
    }
    getLog(this.seams.log).warn({ plugin: binding.label ?? SNIPPET_RUNNER, operation, err: error }, "plugin host: a bridge operation failed");
    return new Error(PLUGIN_UI_HOST_CALL_FAILED);
  }

  // A host result goes on its plugin's runtime share. One that does not fit is refused, never held: the plugin may
  // retry, and the parent keeps no result a plugin cannot take. A runtime already forgotten holds no share, so its
  // result is refused the same way and the broker still hears an answer.
  private sendBridgeResult(runtimeId: string, id: string, result: RpcResult): void {
    const sender = this.sender;
    const generation = this.generation;
    if (sender === undefined || generation === undefined) {
      return;
    }
    try {
      const frame = serializeMessage({ kind: "bridge-result", id, ...result });
      const refused = serializeMessage(channelFullBridgeResult(id));
      const share = this.bindings.shareOf(runtimeId);
      if (share === undefined || !sender.offer({ kind: "frame", generation, frame, route: { share, refusal: { frame: refused, back: false } } })) {
        sender.send({ kind: "frame", generation, frame: refused });
      }
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

  // A lost broker is the host's failure, never one plugin's: every command it held fails as host-unavailable, which the
  // crash policy does not count as a strike (D347). An enabled plugin's logical instance is not crashed with it: its
  // runtime is forgotten, as when the broker ends a stuck Worker, so its next call cold-starts on the new broker from
  // its durable source with no owner action. A snippet's one-shot binding fails with the broker.
  private onDisconnect(cause: Error): void {
    const error = cause instanceof PluginHostUnavailableError ? cause : new PluginHostUnavailableError(cause.message);
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      pending.cancelBackstop();
      pending.reject(error);
    }
    this.outstanding.clear();
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
      clearAuthorities(binding);
      binding.invokeArgs.clear();
      binding.runtimeId = undefined;
      binding.onEnded();
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

/** A refusal the host made for a reason the plugin did not cause: its broker stopped answering or was lost, its
 *  runtime was replaced before the command ran, or the host is shutting down. It is a conflict, which the domain's
 *  crash policy never counts as a strike against the plugin (D347). */
class PluginHostUnavailableError extends DomainConflictError {
  constructor(message: string) {
    super(message);
    this.name = PLUGIN_HOST_UNAVAILABLE;
  }
}

/** A failed bridge operation whose name and text a guest may read: a domain refusal (any {@link DomainError} but the
 *  internal fault, which carries a tripwire's text), the host's coded unavailable refusal, an egress block, an image
 *  rejection, or malformed arguments. Each names a fact about the guest's own call, never a server internal. */
function isNamedBridgeRefusal(error: unknown): boolean {
  return (
    (error instanceof DomainError && !(error instanceof DomainInternalFaultError)) ||
    error instanceof CodedHostUnavailableError ||
    error instanceof EgressBlockedError ||
    error instanceof ImageRejectedError ||
    error instanceof MalformedBridgeArgumentsError
  );
}

function unavailableError(): Error {
  return new PluginHostUnavailableError("plugin broker became unavailable; its RSS watchdog or a process failure stopped every resident runtime");
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
  if (value["tier"] === "frame") {
    return onAction === undefined && pluginFrameBodySchema.safeParse(frame).success;
  }
  return frame === undefined && (onAction === undefined || typeof onAction === "string");
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

function parseSnippetOutcome(value: unknown): SnippetResult {
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
  const bridgeSettlement: Omit<BackgroundWork, keyof AsyncDisposable> = bridgeResources.use(createBackgroundWork(seams.log, seams.traces));
  let closed = false;
  let closing: Promise<void> | undefined;
  let pool: Pick<WarmRuntimePool<Binding, UserId>, "acquire" | "discard" | "fail" | "remove">;

  const runOwned = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (closed) {
      throw new PluginHostUnavailableError("plugin host: logical host is closed");
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

  // A supervisor label needs uniqueness only. `seams.mintId` is the business id source: this runs when a worker
  // answers, so drawing there would move every later id by however the worker's timing falls.
  let settlements = 0;
  const releaseOwnedBinding = (binding: Binding): void => {
    settlements += 1;
    bridgeSettlement.supervise(`plugin-host:bridge-settlement:${String(settlements)}`, "plugin.host.bridge.settlement", {}, async () => {
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
    binding.standingRefused.set(authorityId, false);
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
    } catch (error) {
      // A command that fails after the app refused one of its calls for the installer's standing fails as that refusal,
      // whatever the guest threw: only the app sets this record, so a guest cannot claim it.
      throw binding.standingRefused.get(authorityId) === true ? new PluginInstallerDisabledError() : error;
    } finally {
      binding.standingRefused.delete(authorityId);
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

  pool = poolResources.use(
    new WarmRuntimePool(workerMaximum, retireRuntime, PLUGIN_RUNTIME_REQUEST_QUEUE_MAX, {
      ownerOf: (binding: Binding) => binding.owner,
      residentOwners: () => Array.from(logicalBindings, (binding) => binding.owner),
    }),
  );

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

  const newBinding = ({ owner, bridge, grants, ...lifetime }: NewBindingInput): Binding => {
    const binding: Binding = {
      registry: bindings,
      owner,
      timers,
      runtimeId: undefined,
      lifecycleGeneration: 0,
      bridge,
      // A snippet carries no runtimeConfig and so no hosts: every snippet fetch is refused, as in-process.
      netEgress: createPluginNetEgress(lifetime.runtimeConfig?.netHosts ?? [], bridge, seams.safeFetch),
      grants: new Set(grants),
      authorities: new Map(),
      standingRefused: new Map(),
      authorityTails: new Map(),
      seams,
      invokeArgs: new Map(),
      log: [],
      chars: 0,
      suppressLogs: false,
      crashed: null,
      owedRefusal: null,
      disposed: false,
      dispatched: false,
      retirement: undefined,
      onCrash: (error) => pool.fail(binding, error),
      onEnded: () => pool.discard(binding),
      ...lifetime,
    };
    ownedBindings.add(binding);
    return binding;
  };

  const operations: Omit<ProcessPluginHost, keyof AsyncDisposable> = {
    createInstance: async (input): Promise<CreateInstanceOutcomeOut> => {
      const { owner, bridge, mainJs, reloadMainJs, ...runtimeConfig } = input;
      const binding = newBinding({
        owner,
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
      const owed = binding.owedRefusal;
      if (owed !== null) {
        binding.owedRefusal = null;
        throw owed;
      }
      const generation = binding.lifecycleGeneration;
      const lease = await pool.acquire(binding, { signal });
      return await invokeWithLease({ binding, lease, handler, argsJson, chat }, generation);
    },
    runSnippet: async (input): Promise<SnippetResult> => {
      const releaseAdmission = acquireSnippetAdmission();
      if (releaseAdmission === null) {
        throw new DomainConflictError(`the plugin host is running its maximum of ${PLUGIN_SNIPPET_RUNTIME_MAX} snippets — wait a moment and run it again`);
      }
      const binding = newBinding({ owner: input.owner, bridge: input.bridge, grants: input.grants, releaseAdmission });
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
        } catch (error) {
          // The broker terminated this snippet's stuck Worker. The run started, so it answers as a snippet the wall
          // ended does; its log lines died with the Worker.
          if (error instanceof Error && error.name === PLUGIN_INVOCATION_ENDED) {
            return { logLines: [], error: error.message, errorKind: "runtime" };
          }
          throw error;
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
    createInstance: (...args) =>
      runOwned(() => {
        broker.admit();
        return operations.createInstance(...args);
      }),
    invoke: (...args) =>
      runOwned(() => {
        broker.admit();
        return operations.invoke(...args);
      }),
    runSnippet: (...args) =>
      runOwned(() => {
        broker.admit();
        return operations.runSnippet(...args);
      }),
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
        const failure = new PluginHostUnavailableError("plugin host: logical host is closing");
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
