import { timingSafeEqual } from "node:crypto";

export const PLUGIN_BROKER_PROTOCOL_VERSION = 1;
export const PLUGIN_BROKER_SYNC_TIMEOUT_MS = 10_000;
export const PLUGIN_BROKER_SYNC_RESULT_BYTES = 2_097_152;
/** Largest authenticated JSON-line frame. `net.fetchAsset` may carry a 5 MiB image as base64. */
export const PLUGIN_BROKER_MESSAGE_MAX_BYTES = 10_485_760;
const PROCESS_ID_MIN_CHARS = 16;

export const PLUGIN_BRIDGE_OPERATIONS = [
  "chat.listMessages",
  "chat.getVariables",
  "chat.listCharacters",
  "chat.applyVariableOps",
  "chat.requestTurn",
  "worldInfo.listBooks",
  "worldInfo.listEntries",
  "worldInfo.upsertEntry",
  "imagery.generatePicture",
  "variables.get",
  "variables.set",
  "variables.delete",
  "assets.read",
  "assets.storeFetched",
  "search.documents",
  "storage.get",
  "storage.set",
  "storage.delete",
  "storage.list",
  "storage.compareAndSet",
  "notifications.post",
  "llm.quiet",
  "suggest",
  "surfaceQuickReply",
  "ui.setState",
  "ui.toast",
  "ui.openDialog",
  "databank.ingest",
  "character.ingest",
  "character.ingestAsset",
  "character.setCardData",
  "character.getCardData",
  "pubsub.emit",
] as const;

export type PluginBridgeOperation = (typeof PLUGIN_BRIDGE_OPERATIONS)[number];

export const PLUGIN_SYNC_OPERATIONS = ["seam.nowEpochMs", "seam.nextRandom", "seam.mintId", "admitEgress", "admitAssetEgress", "invokeArgs"] as const;
export type PluginSyncOperation = (typeof PLUGIN_SYNC_OPERATIONS)[number];

const BRIDGE_OPERATION_SET: ReadonlySet<string> = new Set(PLUGIN_BRIDGE_OPERATIONS);
const SYNC_OPERATION_SET: ReadonlySet<string> = new Set(PLUGIN_SYNC_OPERATIONS);

export interface RpcError {
  readonly name: string;
  readonly message: string;
}

interface BrokerCommand {
  readonly kind: "command";
  readonly id: string;
  readonly operation: "create" | "invoke" | "snippet" | "dispose";
  readonly runtimeId: string;
  readonly authorityId: string;
  readonly value?: unknown;
}

export interface BrokerBridgeResult {
  readonly kind: "bridge-result";
  readonly id: string;
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: RpcError;
}

export type ParentBrokerMessage =
  | { readonly kind: "authenticate"; readonly version: number; readonly token: string }
  | BrokerCommand
  | BrokerBridgeResult
  | { readonly kind: "bridge-cancel"; readonly id: string };

export type BrokerParentMessage =
  | { readonly kind: "authenticated"; readonly version: number }
  | { readonly kind: "response"; readonly id: string; readonly ok: boolean; readonly value?: unknown; readonly error?: RpcError }
  | {
      readonly kind: "bridge";
      readonly id: string;
      readonly runtimeId: string;
      readonly authorityId: string;
      readonly operation: PluginBridgeOperation | PluginSyncOperation;
      readonly args: readonly unknown[];
    }
  | { readonly kind: "bridge-cancel"; readonly id: string }
  | { readonly kind: "log"; readonly runtimeId: string; readonly label: string; readonly level: "info" | "warn" | "error"; readonly message: string }
  | { readonly kind: "runtime-crashed"; readonly runtimeId: string; readonly error: RpcError };

interface WorkerCommand {
  readonly kind: "command";
  readonly id: string;
  readonly operation: "create" | "invoke" | "snippet" | "dispose";
  readonly authorityId: string;
  readonly value?: unknown;
}

export type BrokerWorkerMessage =
  | WorkerCommand
  | { readonly kind: "bridge-result"; readonly id: string; readonly ok: boolean; readonly value?: unknown; readonly error?: RpcError }
  | { readonly kind: "bridge-cancel"; readonly id: string };

export type WorkerBrokerMessage =
  | { readonly kind: "ready" }
  | { readonly kind: "response"; readonly id: string; readonly ok: boolean; readonly value?: unknown; readonly error?: RpcError }
  | { readonly kind: "bridge"; readonly id: string; readonly authorityId: string; readonly operation: PluginBridgeOperation; readonly args: readonly unknown[] }
  | { readonly kind: "bridge-cancel"; readonly id: string }
  | {
      readonly kind: "sync-bridge";
      readonly authorityId: string;
      readonly operation: PluginSyncOperation;
      readonly args: readonly unknown[];
      readonly control: SharedArrayBuffer;
      readonly result: SharedArrayBuffer;
    }
  | { readonly kind: "log"; readonly label: string; readonly level: "info" | "warn" | "error"; readonly message: string };

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
  return typeof value["label"] === "string" &&
    (value["level"] === "info" || value["level"] === "warn" || value["level"] === "error") &&
    typeof value["message"] === "string"
    ? { kind: "log", label: value["label"], level: value["level"], message: value["message"] }
    : null;
}

/** Validate the untyped worker_threads message before the broker trusts its routing fields. */
export function parseWorkerBrokerMessage(value: unknown): WorkerBrokerMessage | null {
  if (!isRecord(value) || typeof value["kind"] !== "string") {
    return null;
  }
  if (value["kind"] === "ready") {
    return { kind: "ready" };
  }
  if (value["kind"] === "bridge-cancel") {
    return typeof value["id"] === "string" ? { kind: "bridge-cancel", id: value["id"] } : null;
  }
  if (value["kind"] === "bridge") {
    return parseWorkerBridge(value);
  }
  if (value["kind"] === "sync-bridge") {
    return parseWorkerSyncBridge(value);
  }
  if (value["kind"] === "log") {
    return parseWorkerLog(value);
  }
  return value["kind"] === "response" ? parseWorkerResponse(value) : null;
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
  return BRIDGE_OPERATION_SET.has(value);
}

export function isSyncOperation(value: string): value is PluginSyncOperation {
  return SYNC_OPERATION_SET.has(value);
}

export function tokenMatches(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(received, "utf8");
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
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
  if (!["create", "invoke", "snippet", "dispose"].includes(value["operation"])) {
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
    operation: value["operation"] as BrokerCommand["operation"],
    runtimeId: value["runtimeId"],
    authorityId: value["authorityId"],
    value: value["value"],
  };
}

export function parseParentBrokerMessage(value: unknown): ParentBrokerMessage | null {
  if (!isRecord(value) || typeof value["kind"] !== "string") {
    return null;
  }
  if (value["kind"] === "authenticate") {
    return typeof value["version"] === "number" && typeof value["token"] === "string"
      ? { kind: "authenticate", version: value["version"], token: value["token"] }
      : null;
  }
  if (value["kind"] === "bridge-cancel") {
    return typeof value["id"] === "string" ? { kind: "bridge-cancel", id: value["id"] } : null;
  }
  if (value["kind"] === "bridge-result") {
    return parseParentBridgeResult(value);
  }
  return value["kind"] === "command" ? parseParentCommand(value) : null;
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
    !["info", "warn", "error"].includes(String(value["level"])) ||
    typeof value["message"] !== "string"
  ) {
    return null;
  }
  return {
    kind: "log",
    runtimeId: value["runtimeId"],
    label: value["label"],
    level: value["level"] as "info" | "warn" | "error",
    message: value["message"],
  };
}

export function parseBrokerParentMessage(value: unknown): BrokerParentMessage | null {
  if (!isRecord(value) || typeof value["kind"] !== "string") {
    return null;
  }
  if (value["kind"] === "authenticated") {
    return typeof value["version"] === "number" ? { kind: "authenticated", version: value["version"] } : null;
  }
  if (value["kind"] === "response") {
    return parseBrokerResponse(value);
  }
  if (value["kind"] === "bridge") {
    return parseBrokerBridge(value);
  }
  if (value["kind"] === "bridge-cancel") {
    return typeof value["id"] === "string" ? { kind: "bridge-cancel", id: value["id"] } : null;
  }
  if (value["kind"] === "runtime-crashed") {
    const error = parseRpcError(value["error"]);
    return typeof value["runtimeId"] === "string" && error !== undefined ? { kind: "runtime-crashed", runtimeId: value["runtimeId"], error } : null;
  }
  if (value["kind"] === "log") {
    return parseBrokerLog(value);
  }
  return null;
}

function parseRpcError(value: unknown): RpcError | undefined {
  if (!isRecord(value) || typeof value["name"] !== "string" || typeof value["message"] !== "string") {
    return;
  }
  return { name: value["name"], message: value["message"] };
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

function decodeAtDepth(value: unknown, depth: number): unknown {
  if (depth > PROCESS_VALUE_MAX_DEPTH) {
    throw new RangeError(`plugin broker: process value exceeds depth ${PROCESS_VALUE_MAX_DEPTH}`);
  }
  if (Array.isArray(value)) {
    return value.map((child) => decodeAtDepth(child, depth + 1));
  }
  if (!isRecord(value)) {
    return value;
  }
  if (value[UNDEFINED_TAG] === true && Object.keys(value).length === 1) {
    return;
  }
  if (typeof value[BYTE_TAG] === "string" && Object.keys(value).length === 1) {
    return Uint8Array.from(Buffer.from(value[BYTE_TAG], "base64"));
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decodeAtDepth(child, depth + 1)]));
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
