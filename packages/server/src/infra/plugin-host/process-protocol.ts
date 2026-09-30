import type { PluginLogLevel } from "@orb/contracts/plugin";
import { PLUGIN_LOG_LEVELS } from "@orb/contracts/plugin";
import type {
  BrokerParentMessage,
  ParentBrokerMessage,
  PluginBridgeOperation,
  PluginCommandOperation,
  PluginSyncOperation,
  RpcError,
  WorkerBrokerMessage,
} from "./contract/process-protocol.ts";
import { PLUGIN_BRIDGE_OPERATIONS, PLUGIN_COMMAND_OPERATIONS, PLUGIN_SYNC_OPERATIONS } from "./contract/process-protocol.ts";

export const PLUGIN_BROKER_SYNC_TIMEOUT_MS = 10_000;
export const PLUGIN_BROKER_SYNC_RESULT_BYTES = 2_097_152;
/** Largest inherited-channel JSON frame. `net.fetchAsset` may carry a 5 MiB image as base64. */
export const PLUGIN_BROKER_MESSAGE_MAX_BYTES = 10_485_760;
const PROCESS_ID_MIN_CHARS = 16;

function parseWorkerResponse(value: Readonly<Record<string, unknown>>): WorkerBrokerMessage | null {
  if (typeof value["id"] !== "string" || typeof value["ok"] !== "boolean") {
    return null;
  }
  const error = parseRpcError(value["error"]);
  return {
    kind: "response",
    id: value["id"],
    ok: value["ok"],
    value: value["value"],
    ...(error === undefined ? {} : { error }),
  };
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

export function rpcError(error: unknown): RpcError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "Error", message: String(error) };
}

export function fromRpcError(error: RpcError | undefined, fallback: string): Error {
  if (error === undefined) {
    return new Error(fallback);
  }
  const restored = new Error(error.message);
  restored.name = error.name;
  return restored;
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
  if (typeof value["id"] !== "string" || typeof value["ok"] !== "boolean") {
    return null;
  }
  const error = parseRpcError(value["error"]);
  return { kind: "bridge-result", id: value["id"], ok: value["ok"], value: value["value"], ...(error === undefined ? {} : { error }) };
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
  return message["kind"] === "command" ? parseParentCommand(message) : null;
}

function parseBrokerResponse(value: Readonly<Record<string, unknown>>): BrokerParentMessage | null {
  if (typeof value["id"] !== "string" || typeof value["ok"] !== "boolean") {
    return null;
  }
  const error = parseRpcError(value["error"]);
  return { kind: "response", id: value["id"], ok: value["ok"], value: value["value"], ...(error === undefined ? {} : { error }) };
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

function parseBrokerAuthorityReleased(value: Readonly<Record<string, unknown>>): BrokerParentMessage | null {
  return typeof value["runtimeId"] === "string" && typeof value["authorityId"] === "string"
    ? { kind: "authority-released", runtimeId: value["runtimeId"], authorityId: value["authorityId"] }
    : null;
}

function parseBrokerRuntimeMessage(kind: string, value: Readonly<Record<string, unknown>>): BrokerParentMessage | null {
  if (kind === "runtime-crashed") {
    return parseBrokerRuntimeCrashed(value);
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

function parseRpcError(errorValue: unknown): RpcError | undefined {
  if (!isRecord(errorValue) || typeof errorValue["name"] !== "string" || typeof errorValue["message"] !== "string") {
    return;
  }
  return { name: errorValue["name"], message: errorValue["message"] };
}

const BYTE_TAG = "$orbBytes";
const UNDEFINED_TAG = "$orbUndefined";
const PROCESS_VALUE_MAX_DEPTH = 128;

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
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encodeAtDepth(child, depth + 1)]));
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
  return Object.fromEntries(Object.entries(encoded).map(([key, child]) => [key, decodeAtDepth(child, depth + 1)]));
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
