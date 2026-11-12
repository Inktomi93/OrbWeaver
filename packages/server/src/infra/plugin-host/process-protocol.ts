import type { PluginHostRefusalCode, PluginLogLevel } from "@orb/contracts/plugin";
import { PLUGIN_CHANNEL_FULL_CODE, PLUGIN_HOST_REFUSAL_CODES, PLUGIN_LOG_LEVELS } from "@orb/contracts/plugin";
import type {
  BrokerParentMessage,
  ParentBrokerMessage,
  PluginBridgeOperation,
  PluginCommandOperation,
  PluginSyncOperation,
  RpcError,
  RpcResult,
  WorkerBrokerMessage,
} from "./contract/process-protocol.ts";
import { PLUGIN_BRIDGE_OPERATIONS, PLUGIN_COMMAND_OPERATIONS, PLUGIN_SYNC_OPERATIONS } from "./contract/process-protocol.ts";

export const PLUGIN_BROKER_SYNC_TIMEOUT_MS = 10_000;
/** The error name of a refusal the host made for a reason the plugin did not cause: a broker that stopped answering,
 *  a runtime replaced before the command ran, shutdown. The parent turns it into a refusal that is never a strike. */
export const PLUGIN_HOST_UNAVAILABLE = "PluginHostUnavailable";
/** What a call or reply refused by a full channel carries, under {@link PLUGIN_HOST_UNAVAILABLE} and with
 *  {@link PLUGIN_CHANNEL_FULL_CODE}: the host's own capacity, which the plugin may retry and which is never a strike. */
export const PLUGIN_CHANNEL_FULL = "plugin host: a channel between the plugin host's processes is full; this call was refused, retry it";
/** What a command for a runtime the host already ended or retired is refused with, under {@link PLUGIN_HOST_UNAVAILABLE}:
 *  the host's own lifecycle, not the plugin's doing. */
export const PLUGIN_STALE_RUNTIME = "plugin host: stale or unknown runtime id";
/** The error name of an invocation the host ended: at its settlement wall, or by terminating its stuck Worker. */
export const PLUGIN_INVOCATION_ENDED = "PluginInvocationEnded";
/** The Int32 slots a Worker shares with its broker to report its guest work: the open span's sequence number (0 while
 *  no span is open), that span's CPU window in ms, and the running total of closed spans in ms, which wraps. */
export const SPAN_SEQUENCE_SLOT = 0;
export const SPAN_WINDOW_SLOT = 1;
export const SPAN_CLOSED_TOTAL_SLOT = 2;
export const SPAN_SLOTS_BYTES = (SPAN_CLOSED_TOTAL_SLOT + 1) * Int32Array.BYTES_PER_ELEMENT;
export const PLUGIN_BROKER_SYNC_RESULT_BYTES = 2_097_152;
/** The broker's file descriptor for its heartbeat pipe to the watchdog, apart from the IPC channel, so a beat never
 *  waits behind a large frame in that channel's queue (D347). Index 4 of the watchdog's spawn `stdio`. */
export const PLUGIN_BROKER_BEAT_FD = 4;
/** The longest heartbeat line the watchdog reads; a longer one is a malformed beat. */
export const PLUGIN_BROKER_BEAT_MAX_BYTES = 8192;
/** Largest inherited-channel JSON frame. `net.fetchAsset` may carry a 5 MiB image as base64. */
export const PLUGIN_BROKER_MESSAGE_MAX_BYTES = 10_485_760;
const PROCESS_ID_MIN_CHARS = 16;

function parseWorkerResponse(value: Readonly<Record<string, unknown>>): WorkerBrokerMessage | null {
  if (typeof value["id"] !== "string") {
    return null;
  }
  const result = parseRpcResult(value);
  return result === null ? null : { kind: "response", id: value["id"], ...result };
}

function parseWorkerBridge(value: Readonly<Record<string, unknown>>): WorkerBrokerMessage | null {
  return typeof value["id"] === "string" &&
    typeof value["authorityId"] === "string" &&
    typeof value["operation"] === "string" &&
    isBridgeOperation(value["operation"]) &&
    Array.isArray(value["args"])
    ? { kind: "bridge", id: value["id"], authorityId: value["authorityId"], operation: value["operation"], args: value["args"] }
    : null;
}

function parseWorkerSyncBridge(value: Readonly<Record<string, unknown>>): WorkerBrokerMessage | null {
  return typeof value["authorityId"] === "string" &&
    typeof value["operation"] === "string" &&
    isSyncOperation(value["operation"]) &&
    Array.isArray(value["args"]) &&
    value["control"] instanceof SharedArrayBuffer &&
    value["control"].byteLength === Int32Array.BYTES_PER_ELEMENT * 2 &&
    value["result"] instanceof SharedArrayBuffer &&
    value["result"].byteLength === PLUGIN_BROKER_SYNC_RESULT_BYTES
    ? {
        kind: "sync-bridge",
        authorityId: value["authorityId"],
        operation: value["operation"],
        args: value["args"],
        control: value["control"],
        result: value["result"],
      }
    : null;
}

function parseWorkerLog(value: Readonly<Record<string, unknown>>): WorkerBrokerMessage | null {
  return typeof value["label"] === "string" && isPluginLogLevel(value["level"]) && typeof value["message"] === "string"
    ? { kind: "log", label: value["label"], level: value["level"], message: value["message"] }
    : null;
}

/** Validate the untyped worker_threads message before the broker trusts its routing fields. */
export function parseWorkerBrokerMessage(message: unknown): WorkerBrokerMessage | null {
  if (!isRecord(message) || typeof message["kind"] !== "string") {
    return null;
  }
  if (message["kind"] === "ready") {
    return { kind: "ready" };
  }
  if (message["kind"] === "bridge-cancel") {
    return typeof message["id"] === "string" ? { kind: "bridge-cancel", id: message["id"] } : null;
  }
  if (message["kind"] === "bridge") {
    return parseWorkerBridge(message);
  }
  if (message["kind"] === "sync-bridge") {
    return parseWorkerSyncBridge(message);
  }
  if (message["kind"] === "log") {
    return parseWorkerLog(message);
  }
  if (message["kind"] === "authority-released") {
    return typeof message["authorityId"] === "string" ? { kind: "authority-released", authorityId: message["authorityId"] } : null;
  }
  return message["kind"] === "response" ? parseWorkerResponse(message) : null;
}

/** A {@link PLUGIN_HOST_UNAVAILABLE} refusal that says why in its code, which crosses every hop and reaches the guest
 *  beside its name, so a plugin tells a full channel from a lost host without reading the message. */
export class CodedHostUnavailableError extends Error {
  readonly code: PluginHostRefusalCode;
  constructor(code: PluginHostRefusalCode, message: string) {
    super(message);
    this.name = PLUGIN_HOST_UNAVAILABLE;
    this.code = code;
  }
}

export function rpcError(error: unknown): RpcError {
  if (error instanceof CodedHostUnavailableError) {
    return { name: error.name, message: error.message, code: error.code };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "Error", message: String(error) };
}

export function fromRpcError(error: RpcError | undefined, fallback: string): Error {
  if (error === undefined) {
    return new Error(fallback);
  }
  if (error.code !== undefined) {
    return new CodedHostUnavailableError(error.code, error.message);
  }
  const restored = new Error(error.message);
  restored.name = error.name;
  return restored;
}

// A refusal code off the wire: only a host-unavailable refusal carries one, and only a code the host mints.
function parseRefusalCode(name: string, code: unknown): PluginHostRefusalCode | null | undefined {
  if (code === undefined) {
    return undefined;
  }
  return name === PLUGIN_HOST_UNAVAILABLE ? (PLUGIN_HOST_REFUSAL_CODES.find((known) => known === code) ?? null) : null;
}

export function isBridgeOperation(value: string): value is PluginBridgeOperation {
  return PLUGIN_BRIDGE_OPERATIONS.some((operation) => operation === value);
}

function isSyncOperation(value: string): value is PluginSyncOperation {
  return PLUGIN_SYNC_OPERATIONS.some((operation) => operation === value);
}

function isCommandOperation(value: string): value is PluginCommandOperation {
  return PLUGIN_COMMAND_OPERATIONS.some((operation) => operation === value);
}

function isPluginLogLevel(value: unknown): value is PluginLogLevel {
  return typeof value === "string" && PLUGIN_LOG_LEVELS.some((level) => level === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseParentBridgeResult(value: Readonly<Record<string, unknown>>): ParentBrokerMessage | null {
  if (typeof value["id"] !== "string") {
    return null;
  }
  const result = parseRpcResult(value);
  return result === null ? null : { kind: "bridge-result", id: value["id"], ...result };
}

function parseParentCommand(value: Readonly<Record<string, unknown>>): ParentBrokerMessage | null {
  if (typeof value["id"] !== "string" || typeof value["operation"] !== "string") {
    return null;
  }
  if (!isCommandOperation(value["operation"])) {
    return null;
  }
  if (
    typeof value["runtimeId"] !== "string" ||
    value["runtimeId"].length < PROCESS_ID_MIN_CHARS ||
    typeof value["authorityId"] !== "string" ||
    value["authorityId"].length < PROCESS_ID_MIN_CHARS
  ) {
    return null;
  }
  return {
    kind: "command",
    id: value["id"],
    operation: value["operation"],
    runtimeId: value["runtimeId"],
    authorityId: value["authorityId"],
    value: value["value"],
  };
}

export function parseParentBrokerMessage(message: unknown): ParentBrokerMessage | null {
  if (!isRecord(message) || typeof message["kind"] !== "string") {
    return null;
  }
  if (message["kind"] === "bridge-cancel") {
    return typeof message["id"] === "string" ? { kind: "bridge-cancel", id: message["id"] } : null;
  }
  if (message["kind"] === "bridge-result") {
    return parseParentBridgeResult(message);
  }
  if (message["kind"] === "runtime-forgotten") {
    return typeof message["runtimeId"] === "string" ? { kind: "runtime-forgotten", runtimeId: message["runtimeId"] } : null;
  }
  if (message["kind"] === "end-runtime") {
    return typeof message["runtimeId"] === "string" && typeof message["commandId"] === "string"
      ? { kind: "end-runtime", runtimeId: message["runtimeId"], commandId: message["commandId"] }
      : null;
  }
  return message["kind"] === "command" ? parseParentCommand(message) : null;
}

function parseBrokerResponse(value: Readonly<Record<string, unknown>>): BrokerParentMessage | null {
  if (typeof value["id"] !== "string") {
    return null;
  }
  const result = parseRpcResult(value);
  return result === null ? null : { kind: "response", id: value["id"], ...result };
}

function parseRpcResult(value: Readonly<Record<string, unknown>>): RpcResult | null {
  if (value["ok"] === true) {
    return value["error"] === undefined ? { ok: true, value: value["value"] } : null;
  }
  if (value["ok"] !== false || value["value"] !== undefined) {
    return null;
  }
  const error = parseRpcError(value["error"]);
  return error === undefined ? null : { ok: false, error };
}

function parseBrokerBridge(value: Readonly<Record<string, unknown>>): BrokerParentMessage | null {
  if (
    typeof value["id"] !== "string" ||
    typeof value["runtimeId"] !== "string" ||
    typeof value["authorityId"] !== "string" ||
    typeof value["operation"] !== "string" ||
    !(isBridgeOperation(value["operation"]) || isSyncOperation(value["operation"])) ||
    !Array.isArray(value["args"])
  ) {
    return null;
  }
  return {
    kind: "bridge",
    id: value["id"],
    runtimeId: value["runtimeId"],
    authorityId: value["authorityId"],
    operation: value["operation"],
    args: value["args"],
  };
}

function parseBrokerLog(value: Readonly<Record<string, unknown>>): BrokerParentMessage | null {
  if (
    typeof value["runtimeId"] !== "string" ||
    typeof value["label"] !== "string" ||
    !isPluginLogLevel(value["level"]) ||
    typeof value["message"] !== "string"
  ) {
    return null;
  }
  return {
    kind: "log",
    runtimeId: value["runtimeId"],
    label: value["label"],
    level: value["level"],
    message: value["message"],
  };
}

function parseBrokerRuntimeCrashed(value: Readonly<Record<string, unknown>>): BrokerParentMessage | null {
  const error = parseRpcError(value["error"]);
  return typeof value["runtimeId"] === "string" && error !== undefined ? { kind: "runtime-crashed", runtimeId: value["runtimeId"], error } : null;
}

function parseBrokerRuntimeEnded(value: Readonly<Record<string, unknown>>): BrokerParentMessage | null {
  if (typeof value["runtimeId"] !== "string") {
    return null;
  }
  if (value["error"] === undefined) {
    return { kind: "runtime-ended", runtimeId: value["runtimeId"] };
  }
  const error = parseRpcError(value["error"]);
  return error === undefined ? null : { kind: "runtime-ended", runtimeId: value["runtimeId"], error };
}

function parseBrokerAuthorityReleased(value: Readonly<Record<string, unknown>>): BrokerParentMessage | null {
  return typeof value["runtimeId"] === "string" && typeof value["authorityId"] === "string"
    ? { kind: "authority-released", runtimeId: value["runtimeId"], authorityId: value["authorityId"] }
    : null;
}

function parseBrokerRuntimeMessage(kind: string, value: Readonly<Record<string, unknown>>): BrokerParentMessage | null {
  if (kind === "runtime-crashed") {
    return parseBrokerRuntimeCrashed(value);
  }
  if (kind === "runtime-ended") {
    return parseBrokerRuntimeEnded(value);
  }
  if (kind === "log") {
    return parseBrokerLog(value);
  }
  return kind === "authority-released" ? parseBrokerAuthorityReleased(value) : null;
}

export function parseBrokerParentMessage(message: unknown): BrokerParentMessage | null {
  if (!isRecord(message) || typeof message["kind"] !== "string") {
    return null;
  }
  if (message["kind"] === "response") {
    return parseBrokerResponse(message);
  }
  if (message["kind"] === "bridge") {
    return parseBrokerBridge(message);
  }
  if (message["kind"] === "bridge-cancel") {
    return typeof message["id"] === "string" ? { kind: "bridge-cancel", id: message["id"] } : null;
  }
  return parseBrokerRuntimeMessage(message["kind"], message);
}

/** An error off the wire, or undefined when it is not one. */
export function parseRpcError(errorValue: unknown): RpcError | undefined {
  if (!isRecord(errorValue) || typeof errorValue["name"] !== "string" || typeof errorValue["message"] !== "string") {
    return;
  }
  const code = parseRefusalCode(errorValue["name"], errorValue["code"]);
  if (code === null) {
    return;
  }
  return code === undefined ? { name: errorValue["name"], message: errorValue["message"] } : { name: errorValue["name"], message: errorValue["message"], code };
}

const BYTE_TAG = "$orbBytes";
const UNDEFINED_TAG = "$orbUndefined";
// Guest data must never decode as a tag, so every data key in this reserved prefix crosses escaped. A bare
// reserved key on the wire is therefore always the encoder's own tag. Escaping the key adds no nesting, so
// `PROCESS_VALUE_MAX_DEPTH` keeps its meaning for marker-shaped data.
const RESERVED_KEY_PREFIX = "$orb";
const ESCAPED_KEY_PREFIX = `${RESERVED_KEY_PREFIX}Escaped:`;
const PROCESS_VALUE_MAX_DEPTH = 128;

function encodeKey(key: string): string {
  return key.startsWith(RESERVED_KEY_PREFIX) ? `${ESCAPED_KEY_PREFIX}${key}` : key;
}

function decodeKey(key: string): string {
  return key.startsWith(ESCAPED_KEY_PREFIX) ? key.slice(ESCAPED_KEY_PREFIX.length) : key;
}

function encodeAtDepth(value: unknown, depth: number): unknown {
  if (depth > PROCESS_VALUE_MAX_DEPTH) {
    throw new RangeError(`plugin broker: process value exceeds depth ${PROCESS_VALUE_MAX_DEPTH}`);
  }
  if (value === undefined) {
    return { [UNDEFINED_TAG]: true };
  }
  if (value instanceof Uint8Array) {
    return { [BYTE_TAG]: Buffer.from(value).toString("base64") };
  }
  if (Array.isArray(value)) {
    return value.map((child) => encodeAtDepth(child, depth + 1));
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [encodeKey(key), encodeAtDepth(child, depth + 1)]));
  }
  return value;
}

export function encodeProcessValue(value: unknown): unknown {
  return encodeAtDepth(value, 0);
}

function decodeAtDepth(encoded: unknown, depth: number): unknown {
  if (depth > PROCESS_VALUE_MAX_DEPTH) {
    throw new RangeError(`plugin broker: process value exceeds depth ${PROCESS_VALUE_MAX_DEPTH}`);
  }
  if (Array.isArray(encoded)) {
    return encoded.map((child) => decodeAtDepth(child, depth + 1));
  }
  if (!isRecord(encoded)) {
    return encoded;
  }
  if (encoded[UNDEFINED_TAG] === true && Object.keys(encoded).length === 1) {
    return;
  }
  if (typeof encoded[BYTE_TAG] === "string" && Object.keys(encoded).length === 1) {
    return Uint8Array.from(Buffer.from(encoded[BYTE_TAG], "base64"));
  }
  return Object.fromEntries(Object.entries(encoded).map(([key, child]) => [decodeKey(key), decodeAtDepth(child, depth + 1)]));
}

export function decodeProcessValue(value: unknown): unknown {
  return decodeAtDepth(value, 0);
}

export function serializeMessage(value: ParentBrokerMessage | BrokerParentMessage): string {
  const serialized = `${JSON.stringify(encodeProcessValue(value))}\n`;
  if (Buffer.byteLength(serialized, "utf8") > PLUGIN_BROKER_MESSAGE_MAX_BYTES) {
    throw new RangeError(`plugin broker: message exceeds ${PLUGIN_BROKER_MESSAGE_MAX_BYTES}-byte cap`);
  }
  return serialized;
}

export function parseMessageLine(line: string): unknown {
  if (Buffer.byteLength(line, "utf8") > PLUGIN_BROKER_MESSAGE_MAX_BYTES) {
    throw new RangeError(`plugin broker: message exceeds ${PLUGIN_BROKER_MESSAGE_MAX_BYTES}-byte cap`);
  }
  return decodeProcessValue(JSON.parse(line));
}

/** The result a bridge call gets when a full channel refused it or its result. */
export function channelFullBridgeResult(id: string): Extract<ParentBrokerMessage, { readonly kind: "bridge-result" }> {
  return { kind: "bridge-result", id, ok: false, error: channelFullError() };
}

/** The answer a command gets when a full channel refused it or its answer. */
export function channelFullResponse(id: string): Extract<BrokerParentMessage, { readonly kind: "response" }> {
  return { kind: "response", id, ok: false, error: channelFullError() };
}

function channelFullError(): RpcError {
  return { name: PLUGIN_HOST_UNAVAILABLE, message: PLUGIN_CHANNEL_FULL, code: PLUGIN_CHANNEL_FULL_CODE };
}
