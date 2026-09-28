// infra/plugin-host/process-runtime — authority-bearing parent adapter and logical-to-physical runtime pool.

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Socket } from "node:net";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import type {
  InvocationChat,
  PluginBridge,
  PluginCapability,
  PluginHandlerRef,
  PluginInstance,
  PluginInvocationLiveness,
  PluginInvokeArgs,
  PluginLogLevel,
} from "@orb/contracts/plugin";
import { PLUGIN_SURFACE_TIERS } from "@orb/contracts/plugin";
import { DomainConflictError } from "@orb/kit/errors";
import { getLog } from "#foundation/observability";
import { createAdmission } from "./admission.ts";
import type { BridgeAuthority } from "./bridge-rpc.ts";
import { authorizeBridgeCall, authorizeSyncCall, dispatchBridgeCall, dispatchSyncCall } from "./bridge-rpc.ts";
import { PLUGIN_LOG_RING_CHARS, PLUGIN_LOG_RING_LINES, PLUGIN_RUNTIME_REQUEST_QUEUE_MAX, PLUGIN_SNIPPET_RUNTIME_MAX } from "./budgets.ts";
import type { CreateInstanceInputIn, CreateInstanceOutcomeOut, PluginHostSeamDeps, PluginLogLineOut, SnippetRunOut } from "./port.ts";
import type { BrokerParentMessage, ParentBrokerMessage } from "./process-protocol.ts";
import {
  fromRpcError,
  isBridgeOperation,
  parseBrokerParentMessage,
  parseMessageLine,
  PLUGIN_BROKER_MESSAGE_MAX_BYTES,
  PLUGIN_BROKER_PROTOCOL_VERSION,
  rpcError,
  serializeMessage,
} from "./process-protocol.ts";
import type { WarmRuntimeLease } from "./warm-runtime-pool.ts";
import { WarmRuntimePool } from "./warm-runtime-pool.ts";
import { resolvePluginBrokerWorkerMaximum } from "./worker-capacity.ts";

const SOCKET_ENV = "PLUGIN_BROKER_SOCKET";
const TOKEN_FILE_ENV = "PLUGIN_BROKER_TOKEN_FILE";
const EXIT_ON_DISCONNECT_ENV = "PLUGIN_BROKER_EXIT_ON_PARENT_DISCONNECT";
const COMMAND_TIMEOUT_MS = {
  create: 30_000,
  invoke: 120_000,
  snippet: 30_000,
  dispose: 30_000,
} as const;
const CONNECT_TIMEOUT_MS = 10_000;
const CONNECT_RETRY_MS = 25;
const TOKEN_BYTES = 32;
const TOKEN_MIN_CHARS = 32;
const TOKEN_MAX_CHARS = 128;
const { env: runtimeEnvironment } = process;

interface Binding {
  runtimeId: string | undefined;
  readonly bridge: PluginBridge;
  readonly grants: ReadonlySet<PluginCapability>;
  readonly authorities: Map<string, BridgeAuthority>;
  readonly seams: PluginHostSeamDeps;
  readonly invokeArgs: Map<string, (chatHandle: string | null) => string>;
  readonly log: PluginLogLineOut[];
  readonly label?: string;
  chars: number;
  suppressLogs: boolean;
  crashed: Error | null;
  disposed: boolean;
  onCrash: (error: Error) => void;
  readonly releaseAdmission?: () => void;
  readonly runtimeConfig?: Omit<CreateInstanceInputIn, "bridge" | "mainJs">;
  readonly reloadMainJs?: () => Promise<string>;
  catalog?: PluginInstance;
}

interface CreateLogicalInstanceInputIn extends CreateInstanceInputIn {
  /** Low-level process-host tests may omit this only when they never force a cold wake. The domain-facing
   *  PluginHostPort requires the loader, so every installed production runtime has durable replay source. */
  readonly reloadMainJs?: () => Promise<string>;
}

interface PendingCommand {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

interface SocketConnectionState {
  buffer: string;
  authenticated: boolean;
}

interface MutableLiveness extends PluginInvocationLiveness {
  abort: () => void;
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

interface ProcessPluginHost {
  readonly createInstance: (input: CreateLogicalInstanceInputIn) => Promise<CreateInstanceOutcomeOut>;
  readonly invoke: (
    instance: PluginInstance,
    handler: PluginHandlerRef,
    argsJson: PluginInvokeArgs,
    chat?: InvocationChat | null,
    signal?: AbortSignal,
  ) => Promise<string>;
  readonly runSnippet: (input: {
    readonly code: string;
    readonly grants: readonly PluginCapability[];
    readonly bridge: PluginBridge;
    readonly chat: InvocationChat;
  }) => Promise<SnippetRunOut>;
  readonly readLog: (instance: PluginInstance) => readonly PluginLogLineOut[];
  readonly dispose: (instance: PluginInstance) => void;
}

const bindings = new Map<string, Binding>();
const logicalBindings = new Set<Binding>();

const acquireSnippetAdmission = createAdmission(PLUGIN_SNIPPET_RUNTIME_MAX);

function releaseBinding(binding: Binding): void {
  binding.releaseAdmission?.();
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
  private socket: Socket | undefined;
  private connecting: Promise<void> | undefined;
  private managedChild: ChildProcess | undefined;
  private managedEndpoint: { readonly socketPath: string; readonly tokenPath: string } | undefined;
  private readonly pending = new Map<string, PendingCommand>();
  private readonly liveness = new Map<string, MutableLiveness>();
  private killOnCommand: Extract<ParentBrokerMessage, { readonly kind: "command" }>["operation"] | undefined;
  private killOnBridge: Extract<BrokerParentMessage, { readonly kind: "bridge" }>["operation"] | undefined;
  private nextCommand = 0;

  async terminateManagedForTest(): Promise<void> {
    const child = this.managedChild;
    if (child === undefined || child.exitCode !== null) {
      return;
    }
    child.ref();
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill("SIGKILL");
      this.socket?.destroy(unavailableError());
    });
    if (this.managedChild === child) {
      this.managedChild = undefined;
      this.managedEndpoint = undefined;
    }
  }

  killManagedOnCommandForTest(operation: Extract<ParentBrokerMessage, { readonly kind: "command" }>["operation"]): void {
    this.killOnCommand = operation;
  }

  killManagedOnBridgeForTest(operation: Extract<BrokerParentMessage, { readonly kind: "bridge" }>["operation"]): void {
    this.killOnBridge = operation;
  }

  async command(
    operation: Extract<ParentBrokerMessage, { readonly kind: "command" }>["operation"],
    runtimeId: string,
    authorityId: string,
    value?: unknown,
  ): Promise<unknown> {
    await this.ensureConnected();
    const socket = this.socket;
    if (socket === undefined || socket.destroyed) {
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
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const error = new Error(`plugin broker: ${operation} timed out`);
        reject(error);
        socket.destroy(error);
      }, COMMAND_TIMEOUT_MS[operation]);
      this.pending.set(id, { resolve, reject, timer });
      try {
        socket.write(serialized);
        // @orb-waive caught-failure-ownership(error): the command promise is rejected with the write failure and the unusable socket is destroyed. Ends if either caller delivery or connection teardown is removed.
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error instanceof Error ? error : unavailableError());
        socket.destroy();
        return;
      }
      if (this.killOnCommand === operation) {
        this.killOnCommand = undefined;
        // @orb-waive caught-failure-ownership(error): the test-only forced broker death is transferred to the same disconnect owner as a real child exit. Ends if onDisconnect stops rejecting pending work and invalidating bindings.
        this.terminateManagedForTest().catch((error: unknown) => this.onDisconnect(error instanceof Error ? error : unavailableError()));
      }
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.socket !== undefined && !this.socket.destroyed) {
      return;
    }
    this.connecting ??= this.connectOnce().finally(() => {
      this.connecting = undefined;
    });
    return await this.connecting;
  }

  private async connectOnce(): Promise<void> {
    let endpoint = this.managedEndpoint;
    if (endpoint === undefined) {
      const directory = mkdtempSync(join(tmpdir(), "orb-plugin-broker-"));
      const socketPath = process.platform === "win32" ? `\\\\.\\pipe\\orb-plugin-broker-${process.pid}-${randomUUID()}` : join(directory, "broker.sock");
      const tokenPath = join(directory, "token");
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      writeFileSync(tokenPath, randomBytes(TOKEN_BYTES).toString("base64url"), { mode: 0o600, flag: "wx" });
      const child = spawn(process.execPath, [fileURLToPath(new URL("./broker-watchdog.ts", import.meta.url))], {
        env: { ...runtimeEnvironment, [SOCKET_ENV]: socketPath, [TOKEN_FILE_ENV]: tokenPath, [EXIT_ON_DISCONNECT_ENV]: "1" },
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
      child.unref();
      child.channel?.unref();
      this.managedChild = child;
      endpoint = { socketPath, tokenPath };
      this.managedEndpoint = endpoint;
      child.once("error", (error) => {
        if (this.managedChild !== child) {
          return;
        }
        this.managedChild = undefined;
        this.managedEndpoint = undefined;
        this.onDisconnect(error);
      });
      child.once("exit", () => {
        if (this.managedChild === child) {
          this.managedChild = undefined;
          this.managedEndpoint = undefined;
          this.onDisconnect(unavailableError());
        }
      });
    }
    await this.connectWithRetry(endpoint.socketPath, endpoint.tokenPath, Date.now() + CONNECT_TIMEOUT_MS);
  }

  private async connectWithRetry(socketPath: string, tokenPath: string, deadline: number): Promise<void> {
    try {
      const token = readFileSync(tokenPath, "utf8").trim();
      if (token.length < TOKEN_MIN_CHARS || token.length > TOKEN_MAX_CHARS) {
        throw new Error("plugin broker: token file length is outside the accepted range");
      }
      await this.openSocket(socketPath, token);
      // @orb-waive caught-failure-ownership(error): connection failures are retried only inside the bounded deadline; the terminal failure is rethrown unchanged. Ends if the deadline no longer forces a throw.
    } catch (error) {
      if (
        Date.now() >= deadline ||
        this.managedEndpoint?.socketPath !== socketPath ||
        (this.managedChild !== undefined && this.managedChild.exitCode !== null)
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS));
      await this.connectWithRetry(socketPath, tokenPath, deadline);
    }
  }

  private async openSocket(socketPath: string, token: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = connect(socketPath);
      const state: SocketConnectionState = { buffer: "", authenticated: false };
      const onError = (error: Error): void => {
        // @orb-waive caught-failure-ownership(error): pre-authentication failures reject the connection attempt; post-authentication failures enter the global disconnect owner. Ends if either state loses its error delivery.
        if (!state.authenticated) {
          reject(error);
        } else {
          this.onDisconnect(error);
        }
      };
      socket.setEncoding("utf8");
      socket.once("error", onError);
      socket.on("data", (chunk) => this.consumeSocketData(socket, state, chunk, resolve));
      socket.once("close", () => {
        if (!state.authenticated) {
          reject(unavailableError());
        }
        if (this.socket === socket) {
          this.socket = undefined;
          this.onDisconnect(unavailableError());
        }
      });
      socket.write(serializeMessage({ kind: "authenticate", version: PLUGIN_BROKER_PROTOCOL_VERSION, token }));
    });
  }

  private consumeSocketData(socket: Socket, state: SocketConnectionState, chunk: Buffer | string, resolve: () => void): void {
    state.buffer += chunk.toString();
    if (Buffer.byteLength(state.buffer, "utf8") > PLUGIN_BROKER_MESSAGE_MAX_BYTES && !state.buffer.includes("\n")) {
      socket.destroy(new Error("plugin broker: response frame exceeds the message cap"));
      return;
    }
    for (let newline = state.buffer.indexOf("\n"); newline >= 0; newline = state.buffer.indexOf("\n")) {
      const line = state.buffer.slice(0, newline);
      state.buffer = state.buffer.slice(newline + 1);
      const message = this.parseBrokerLine(line, socket);
      if (message === null) {
        return;
      }
      if (!state.authenticated) {
        if (message.kind !== "authenticated" || message.version !== PLUGIN_BROKER_PROTOCOL_VERSION) {
          socket.destroy(new Error("plugin broker: authentication refused"));
          return;
        }
        state.authenticated = true;
        this.socket = socket;
        socket.unref();
        resolve();
      } else {
        this.handle(message);
      }
    }
  }

  private parseBrokerLine(line: string, socket: Socket): BrokerParentMessage | null {
    try {
      const message = parseBrokerParentMessage(parseMessageLine(line));
      if (message === null) {
        socket.destroy(new Error("plugin broker: malformed broker response"));
      }
      return message;
      // @orb-waive caught-failure-ownership(error): malformed or oversized broker bytes are transferred to socket.destroy, which rejects pending work through the disconnect owner. Ends if socket destruction stops carrying the failure.
    } catch (error) {
      socket.destroy(error instanceof Error ? error : new Error("plugin broker: malformed broker response"));
      return null;
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
    if (message.kind === "bridge") {
      this.handleBridge(message);
    }
  }

  private handleResponse(message: Extract<BrokerParentMessage, { readonly kind: "response" }>): void {
    const pending = this.pending.get(message.id);
    if (pending === undefined) {
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) {
      pending.resolve(message.value);
    } else {
      pending.reject(fromRpcError(message.error, "plugin broker command failed"));
    }
  }

  private handleBridgeCancel(id: string): void {
    const liveness = this.liveness.get(id);
    if (liveness === undefined) {
      return;
    }
    this.liveness.delete(id);
    liveness.abort();
  }

  private handleRuntimeCrash(message: Extract<BrokerParentMessage, { readonly kind: "runtime-crashed" }>): void {
    const binding = bindings.get(message.runtimeId);
    if (binding === undefined) {
      return;
    }
    bindings.delete(message.runtimeId);
    binding.runtimeId = undefined;
    const error = fromRpcError(message.error, "plugin worker crashed");
    binding.crashed = error;
    binding.authorities.clear();
    binding.invokeArgs.clear();
    releaseBinding(binding);
    binding.onCrash(error);
  }

  private handleLog(message: Extract<BrokerParentMessage, { readonly kind: "log" }>): void {
    const binding = bindings.get(message.runtimeId);
    if (binding === undefined || binding.crashed !== null || binding.suppressLogs) {
      return;
    }
    retainLog(binding, message.level, message.message);
    if (binding.label !== undefined) {
      getLog()[message.level]({ plugin: binding.label }, message.message);
    }
  }

  private handleBridge(message: Extract<BrokerParentMessage, { readonly kind: "bridge" }>): void {
    if (this.killOnBridge === message.operation) {
      this.killOnBridge = undefined;
      // @orb-waive caught-failure-ownership(error): the test-only forced broker death is transferred to the same disconnect owner as a real child exit. Ends if onDisconnect stops rejecting pending work and invalidating bindings.
      this.terminateManagedForTest().catch((error: unknown) => this.onDisconnect(error instanceof Error ? error : unavailableError()));
      return;
    }
    const binding = bindings.get(message.runtimeId);
    if (binding === undefined || binding.crashed !== null) {
      this.sendBridgeResult(message.id, false, undefined, new Error("plugin broker: stale or crashed runtime id"));
      return;
    }
    const authority = binding.authorities.get(message.authorityId);
    if (authority === undefined) {
      this.sendBridgeResult(message.id, false, undefined, new Error("plugin broker: stale command authority"));
      return;
    }
    if (isBridgeOperation(message.operation)) {
      try {
        authorizeBridgeCall(authority, message.operation, message.args);
        // @orb-waive caught-failure-ownership(error): authorization refusal is serialized back to the worker as this bridge call's explicit failure result. Ends if sendBridgeResult stops carrying the caught error.
      } catch (error) {
        this.sendBridgeResult(message.id, false, undefined, error);
        return;
      }
      const liveness = createLiveness();
      this.liveness.set(message.id, liveness);
      dispatchBridgeCall(binding.bridge, message.operation, message.args, liveness).then(
        (value) => {
          this.liveness.delete(message.id);
          this.sendBridgeResult(message.id, true, value);
        },
        (error) => {
          // @orb-waive caught-failure-ownership(error): the rejected async bridge operation is serialized back to the worker and its liveness record is removed. Ends if either ownership action is removed.
          this.liveness.delete(message.id);
          this.sendBridgeResult(message.id, false, undefined, error);
        },
      );
      return;
    }
    try {
      authorizeSyncCall(authority, message.operation);
      const value = dispatchSyncCall(message.operation, message.args, {
        seams: binding.seams,
        bridge: binding.bridge,
        invokeArgs: binding.invokeArgs,
      });
      this.sendBridgeResult(message.id, true, value);
      // @orb-waive caught-failure-ownership(error): synchronous authorization or dispatch refusal is serialized back to the worker as this bridge call's explicit failure result. Ends if sendBridgeResult stops carrying the caught error.
    } catch (error) {
      this.sendBridgeResult(message.id, false, undefined, error);
    }
  }

  private sendBridgeResult(id: string, ok: boolean, value?: unknown, error?: unknown): void {
    const socket = this.socket;
    if (socket === undefined || socket.destroyed) {
      return;
    }
    try {
      socket.write(serializeMessage({ kind: "bridge-result", id, ok, value, ...(error === undefined ? {} : { error: rpcError(error) }) }));
      // @orb-waive caught-failure-ownership(serializationError): serialization failure is replaced by a minimal protocol error response carrying that failure. Ends if the fallback response stops preserving the error.
    } catch (serializationError) {
      try {
        socket.write(serializeMessage({ kind: "bridge-result", id, ok: false, error: rpcError(serializationError) }));
        // @orb-waive caught-failure-ownership(socketError): a failure to send even the minimal response destroys the socket with that failure, rejecting all pending work through the disconnect owner. Ends if socket.destroy stops carrying it.
      } catch (socketError) {
        socket.destroy(socketError instanceof Error ? socketError : unavailableError());
      }
    }
  }

  private onDisconnect(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    for (const liveness of this.liveness.values()) {
      liveness.abort();
    }
    this.liveness.clear();
    for (const binding of logicalBindings) {
      if (binding.crashed !== null) {
        continue;
      }
      binding.crashed = error;
      binding.authorities.clear();
      binding.invokeArgs.clear();
      releaseBinding(binding);
      binding.onCrash(error);
      binding.runtimeId = undefined;
    }
    for (const binding of bindings.values()) {
      if (logicalBindings.has(binding)) {
        continue;
      }
      if (binding.crashed !== null) {
        continue;
      }
      binding.crashed = error;
      binding.authorities.clear();
      binding.invokeArgs.clear();
      releaseBinding(binding);
      binding.onCrash(error);
      binding.runtimeId = undefined;
    }
    bindings.clear();
  }
}

function unavailableError(): Error {
  const error = new Error("plugin broker became unavailable; its RSS watchdog or a process failure stopped every resident runtime");
  error.name = "PluginHostUnavailable";
  return error;
}

const PLUGIN_INSTANCE_KEYS = ["tools", "transforms", "events", "pubsub", "surfaces", "commands", "displayTransforms", "macros"] as const;

const broker = new BrokerClient();

/** @public twin: tests/server/infra/plugin-host/process-runtime.test.ts */
export function __terminateManagedPluginBrokerForTest(): Promise<void> {
  return broker.terminateManagedForTest();
}

/** @public twin: tests/server/infra/plugin-host/process-runtime.test.ts */
export function __killManagedPluginBrokerOnCommandForTest(operation: Extract<ParentBrokerMessage, { readonly kind: "command" }>["operation"]): void {
  broker.killManagedOnCommandForTest(operation);
}

/** @public twin: tests/server/infra/plugin-host/process-runtime.test.ts */
export function __killManagedPluginBrokerOnBridgeForTest(operation: Extract<BrokerParentMessage, { readonly kind: "bridge" }>["operation"]): void {
  broker.killManagedOnBridgeForTest(operation);
}

function requireRegistrationGrant(grants: ReadonlySet<PluginCapability>, capability: PluginCapability, registrations: readonly unknown[], label: string): void {
  if (registrations.length > 0 && !grants.has(capability)) {
    throw new Error(`plugin broker: activation returned ${label} without capability ${capability}`);
  }
}

function requireRegistrationRecords(registrations: Readonly<Record<string, readonly unknown[]>>): void {
  const requiredHandler = new Map<string, string>([
    ["tools", "handler"],
    ["transforms", "handler"],
    ["events", "handler"],
    ["pubsub", "handler"],
    ["commands", "onRun"],
    ["displayTransforms", "handler"],
    ["macros", "handler"],
  ]);
  for (const [label, values] of Object.entries(registrations)) {
    for (const value of values) {
      requireRegistrationRecord(label, value, requiredHandler.get(label));
    }
  }
}

function requireRegistrationRecord(label: string, value: unknown, handlerKey: string | undefined): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`plugin broker: malformed ${label} registration`);
  }
  if (handlerKey !== undefined && typeof Reflect.get(value, handlerKey) !== "string") {
    throw new Error(`plugin broker: malformed ${label} handler reference`);
  }
  if (label === "surfaces") {
    const onAction = Reflect.get(value, "onAction");
    if (onAction !== undefined && typeof onAction !== "string") {
      throw new Error("plugin broker: malformed surface handler reference");
    }
  }
}

function parseActivationFailure(value: Readonly<Record<string, unknown>>): CreateInstanceOutcomeOut {
  const error = value["error"];
  const log = value["log"];
  if (typeof error !== "string" || !Array.isArray(log)) {
    throw new Error("plugin broker: malformed activation failure");
  }
  for (const line of log) {
    if (
      typeof line !== "object" ||
      line === null ||
      !("level" in line) ||
      !["info", "warn", "error"].includes(String(line.level)) ||
      !("message" in line) ||
      typeof line.message !== "string" ||
      !("at" in line) ||
      typeof line.at !== "number" ||
      !Number.isFinite(line.at)
    ) {
      throw new Error("plugin broker: malformed activation log");
    }
  }
  return { ok: false, error, log: log as readonly PluginLogLineOut[] };
}

function requireSurfaceGrants(surfaces: readonly unknown[], grants: ReadonlySet<PluginCapability>): void {
  for (const surface of surfaces) {
    if (
      typeof surface !== "object" ||
      surface === null ||
      Array.isArray(surface) ||
      !("tier" in surface) ||
      typeof surface.tier !== "string" ||
      !PLUGIN_SURFACE_TIERS.includes(surface.tier as (typeof PLUGIN_SURFACE_TIERS)[number])
    ) {
      throw new Error("plugin broker: malformed surface registration");
    }
    const capability: PluginCapability = surface.tier === "frame" ? "ui.frame" : "ui.surface";
    if (!grants.has(capability)) {
      throw new Error(`plugin broker: activation returned a ${surface.tier} surface without capability ${capability}`);
    }
  }
}

function requireActivationInstance(value: unknown): Record<string, readonly unknown[]> {
  if (typeof value !== "object" || value === null) {
    throw new Error("plugin broker: malformed activation instance");
  }
  if (Object.keys(value).some((key) => !PLUGIN_INSTANCE_KEYS.includes(key as (typeof PLUGIN_INSTANCE_KEYS)[number]))) {
    throw new Error("plugin broker: activation instance contains an unknown registration class");
  }
  for (const key of PLUGIN_INSTANCE_KEYS) {
    if (!Array.isArray(Reflect.get(value, key))) {
      throw new Error("plugin broker: malformed activation registrations");
    }
  }
  return value as Record<string, readonly unknown[]>;
}

function parseCreateOutcome(value: unknown, grants: ReadonlySet<PluginCapability>): CreateInstanceOutcomeOut {
  if (typeof value !== "object" || value === null || !("ok" in value) || typeof value.ok !== "boolean") {
    throw new Error("plugin broker: malformed activation response");
  }
  if (!value.ok) {
    return parseActivationFailure(value);
  }
  const registrations = requireActivationInstance(Reflect.get(value, "instance"));
  requireRegistrationRecords(registrations);
  requireRegistrationGrant(grants, "tools.register", registrations["tools"] ?? [], "tools");
  requireRegistrationGrant(grants, "chat.transform", registrations["transforms"] ?? [], "transforms");
  requireRegistrationGrant(grants, "chat.transform", registrations["displayTransforms"] ?? [], "display transforms");
  requireRegistrationGrant(grants, "chat.transform", registrations["macros"] ?? [], "macros");
  requireRegistrationGrant(grants, "events.subscribe", registrations["events"] ?? [], "event subscriptions");
  requireRegistrationGrant(grants, "plugin_events", registrations["pubsub"] ?? [], "private-event subscriptions");
  requireRegistrationGrant(grants, "ui.surface", registrations["commands"] ?? [], "commands");
  requireSurfaceGrants(registrations["surfaces"] ?? [], grants);
  return { ok: true, instance: registrations as PluginInstance };
}

function parseSnippetOutcome(value: unknown): SnippetRunOut {
  if (
    typeof value !== "object" ||
    value === null ||
    !("logLines" in value) ||
    !Array.isArray(value.logLines) ||
    value.logLines.some((line) => typeof line !== "string")
  ) {
    throw new Error("plugin broker: malformed snippet response");
  }
  const response = value as { readonly logLines: readonly string[]; readonly error?: unknown; readonly errorKind?: unknown; readonly errorLine?: unknown };
  if (response.error !== undefined && typeof response.error !== "string") {
    throw new Error("plugin broker: malformed snippet error");
  }
  if (response.errorKind !== undefined && response.errorKind !== "parse" && response.errorKind !== "runtime") {
    throw new Error("plugin broker: malformed snippet error kind");
  }
  if (response.errorLine !== undefined && (typeof response.errorLine !== "number" || !Number.isInteger(response.errorLine))) {
    throw new Error("plugin broker: malformed snippet error line");
  }
  return response as SnippetRunOut;
}

export function createPluginHost(seams: PluginHostSeamDeps): ProcessPluginHost {
  const workerMaximum = resolvePluginBrokerWorkerMaximum(runtimeEnvironment);
  const instances = new Map<PluginInstance, Binding>();
  let pool: WarmRuntimePool<Binding>;

  const commandWithAuthority = async ({ binding, operation, phase, chat, value }: AuthorityCommand): Promise<unknown> => {
    const runtimeId = binding.runtimeId;
    if (runtimeId === undefined) {
      throw new Error("plugin host: physical runtime is not active");
    }
    const authorityId = randomUUID();
    binding.authorities.set(authorityId, { grants: binding.grants, chat, phase });
    try {
      return await broker.command(operation, runtimeId, authorityId, value);
    } finally {
      binding.authorities.delete(authorityId);
    }
  };

  const retireRuntime = async (binding: Binding): Promise<void> => {
    const runtimeId = binding.runtimeId;
    if (runtimeId === undefined) {
      return;
    }
    try {
      await commandWithAuthority({ binding, operation: "dispose", phase: "lifecycle", chat: null });
    } finally {
      bindings.delete(runtimeId);
      if (binding.runtimeId === runtimeId) {
        binding.runtimeId = undefined;
      }
      binding.authorities.clear();
      binding.invokeArgs.clear();
    }
  };

  const activationCleanupError = (error: unknown, cleanupError: unknown): AggregateError =>
    new AggregateError([error, cleanupError], "plugin host: activation failed and its runtime could not be retired", { cause: error });

  pool = new WarmRuntimePool(workerMaximum, retireRuntime, PLUGIN_RUNTIME_REQUEST_QUEUE_MAX);

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
        // @orb-waive caught-failure-ownership(cleanupError): failed activation cleanup is combined with the primary activation error and both are thrown to the caller. Ends if activationCleanupError stops retaining either failure.
      } catch (cleanupError) {
        bindings.delete(runtimeId);
        if (binding.runtimeId === runtimeId) {
          binding.runtimeId = undefined;
        }
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

  const startRuntime = async (binding: Binding, phase: "activation" | "rehydration", initialMainJs?: string): Promise<CreateInstanceOutcomeOut> => {
    const runtimeConfig = binding.runtimeConfig;
    if (runtimeConfig === undefined) {
      throw new Error("plugin host: resident runtime is missing its activation configuration");
    }
    const mainJs = initialMainJs ?? (await binding.reloadMainJs?.());
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
      // @orb-waive caught-failure-ownership(error): cleanupFailedActivation always throws the primary error or an aggregate containing it after retiring the partial runtime. Ends if it gains a returning path.
    } catch (error) {
      return await cleanupFailedActivation(binding, runtimeId, error);
    }
    if (!outcome.ok) {
      bindings.delete(runtimeId);
      if (binding.runtimeId === runtimeId) {
        binding.runtimeId = undefined;
      }
      return outcome;
    }
    return await retainCatalog(binding, outcome);
  };

  const wakeBinding = async (binding: Binding): Promise<void> => {
    const outcome = await startRuntime(binding, "rehydration");
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

  const invokeWithLease = async ({ binding, lease, handler, argsJson, chat }: LeasedInvokeInput): Promise<string> => {
    let builderId: string | undefined;
    try {
      if (lease.cold) {
        await wakeBinding(binding);
        lease.ready();
      }
      if (binding.crashed !== null) {
        throw binding.crashed;
      }
      const boundArgs = bindInvokeArgs(binding, argsJson);
      builderId = boundArgs.builderId;
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
      // @orb-waive caught-failure-ownership(error): failed leased invocation discards an unpublished cold slot when needed, then rethrows the same failure; the finally block releases arguments and lease. Ends if the rethrow is removed.
    } catch (error) {
      discardFailedColdLease(binding, lease);
      throw error;
    } finally {
      releaseInvokeLease(binding, lease, builderId);
    }
  };

  const newBinding = ({ bridge, grants, runtimeConfig, reloadMainJs, label, releaseAdmission }: NewBindingInput): Binding => {
    const binding: Binding = {
      runtimeId: undefined,
      bridge,
      grants: new Set(grants),
      authorities: new Map(),
      seams,
      invokeArgs: new Map(),
      log: [],
      chars: 0,
      suppressLogs: false,
      crashed: null,
      disposed: false,
      onCrash: (error) => pool.fail(binding, error),
      ...(runtimeConfig === undefined ? {} : { runtimeConfig }),
      ...(reloadMainJs === undefined ? {} : { reloadMainJs }),
      ...(label === undefined ? {} : { label }),
      ...(releaseAdmission === undefined ? {} : { releaseAdmission }),
    };
    return binding;
  };

  return {
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
        // @orb-waive caught-failure-ownership(error): admission refusal removes the not-yet-published logical binding and rethrows to createInstance. Ends if the rethrow is removed.
        binding.disposed = true;
        logicalBindings.delete(binding);
        throw error;
      });
      try {
        const outcome = await startRuntime(binding, "activation", mainJs);
        if (!outcome.ok) {
          binding.disposed = true;
          logicalBindings.delete(binding);
          pool.discard(binding);
          return outcome;
        }
        lease.ready();
        instances.set(outcome.instance, binding);
        return outcome;
        // @orb-waive caught-failure-ownership(error): activation failure removes every unpublished logical and pool entry, then rethrows to the domain lifecycle. Ends if the rethrow is removed.
      } catch (error) {
        binding.disposed = true;
        logicalBindings.delete(binding);
        pool.discard(binding);
        throw error;
      } finally {
        lease.release();
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
      const lease = await pool.acquire(binding, { signal });
      return await invokeWithLease({ binding, lease, handler, argsJson, chat });
    },
    runSnippet: async (input): Promise<SnippetRunOut> => {
      const releaseAdmission = acquireSnippetAdmission();
      if (releaseAdmission === null) {
        throw new DomainConflictError(`the plugin host is running its maximum of ${PLUGIN_SNIPPET_RUNTIME_MAX} snippets — wait a moment and run it again`);
      }
      const binding = newBinding({ bridge: input.bridge, grants: input.grants, releaseAdmission });
      const lease = await pool.acquire(binding).catch((error: unknown) => {
        // @orb-waive caught-failure-ownership(error): snippet admission refusal releases its separate process admission and rethrows to the caller. Ends if the rethrow is removed.
        releaseBinding(binding);
        throw error;
      });
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
        bindings.delete(runtimeId);
        if (binding.runtimeId === runtimeId) {
          binding.runtimeId = undefined;
        }
        pool.discard(binding);
        lease.release();
        releaseBinding(binding);
      }
    },
    readLog: (instance): readonly PluginLogLineOut[] => {
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
      const error = new Error("plugin host: invocation refused because the logical instance was disposed");
      pool.remove(binding, error);
    },
  };
}
