import { PLUGIN_NOTIFICATION_RECIPIENTS } from "@orb/contracts/notifications";
import type { HostFunctionRef, InvocationChat, PluginBridge, PluginCapability, PluginInvocationLiveness, PluginWorldEntryUpsert } from "@orb/contracts/plugin";
import { HOST_FUNCTION_CAPABILITY, PLUGIN_TOAST_LEVELS } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { ENTRY_POSITIONS } from "@orb/kit/world-info";
import type { PluginHostSeamDeps } from "./contract/port.ts";
import type { PluginBridgeOperation, PluginSyncOperation } from "./contract/process-protocol.ts";

type AsyncCall = (operation: PluginBridgeOperation, args: readonly unknown[], liveness?: PluginInvocationLiveness) => Promise<unknown>;
type SyncCall = (operation: PluginSyncOperation, args: readonly unknown[]) => unknown;

const ARG_FIRST = 0;
const ARG_SECOND = 1;
const ARG_THIRD = 2;
const THREE_ARGUMENTS = 3;

export interface BridgeAuthority {
  readonly grants: ReadonlySet<PluginCapability>;
  readonly chat: InvocationChat | null;
  /** Rehydration may rediscover registrations, but may not repeat an effect from the original activation. */
  readonly phase: "activation" | "rehydration" | "invocation" | "snippet" | "lifecycle";
}

const REHYDRATION_READ_OPERATIONS = new Set<PluginBridgeOperation>(["variables.get", "assets.read", "storage.get", "storage.list", "character.getCardData"]);

const BRIDGE_HOST_FUNCTION = {
  "chat.listMessages": "chat.listMessages",
  "chat.getVariables": "chat.getVariables",
  "chat.listCharacters": "chat.listCharacters",
  "chat.applyVariableOps": "chat.applyVariableOps",
  "chat.requestTurn": "chat.requestTurn",
  "worldInfo.listBooks": "worldInfo.listBooks",
  "worldInfo.listEntries": "worldInfo.listEntries",
  "worldInfo.upsertEntry": "worldInfo.upsertEntry",
  "imagery.generatePicture": "imagery.generatePicture",
  "variables.get": "variables.get",
  "variables.set": "variables.set",
  "variables.delete": "variables.delete",
  "assets.read": "assets.read",
  "assets.storeFetched": "net.fetchAsset",
  "search.documents": "search.documents",
  "storage.get": "storage.get",
  "storage.set": "storage.set",
  "storage.delete": "storage.delete",
  "storage.list": "storage.list",
  "storage.compareAndSet": "storage.compareAndSet",
  "notifications.post": "notifications.post",
  "llm.quiet": "llm.quiet",
  surfaceQuickReply: "chat.surfaceQuickReply",
  "ui.setState": "ui.setState",
  "ui.toast": "ui.toast",
  "ui.openDialog": "ui.openDialog",
  "databank.ingest": "databank.ingest",
  "character.ingest": "character.ingest",
  "character.ingestAsset": "character.ingestAsset",
  "character.setCardData": "character.setCardData",
  "character.getCardData": "character.getCardData",
  "pubsub.emit": "pubsub.emit",
} as const satisfies Record<Exclude<PluginBridgeOperation, "suggest">, HostFunctionRef>;

const CHAT_SCOPED = new Set<PluginBridgeOperation>([
  "chat.listMessages",
  "chat.getVariables",
  "chat.listCharacters",
  "chat.applyVariableOps",
  "chat.requestTurn",
  "worldInfo.listBooks",
  "worldInfo.listEntries",
  "worldInfo.upsertEntry",
  "imagery.generatePicture",
  "notifications.post",
  "surfaceQuickReply",
  "suggest",
]);

const DIRECT_CHAT_WRITES = new Set<PluginBridgeOperation>([
  "chat.applyVariableOps",
  "chat.requestTurn",
  "worldInfo.upsertEntry",
  "imagery.generatePicture",
  "surfaceQuickReply",
]);

export function createRemoteBridge(call: AsyncCall, callSync: SyncCall): PluginBridge {
  return {
    chat: {
      listMessages: (chatId, limit) => call("chat.listMessages", [chatId, limit]) as ReturnType<PluginBridge["chat"]["listMessages"]>,
      getVariables: (chatId) => call("chat.getVariables", [chatId]) as ReturnType<PluginBridge["chat"]["getVariables"]>,
      listCharacters: (chatId) => call("chat.listCharacters", [chatId]) as ReturnType<PluginBridge["chat"]["listCharacters"]>,
      applyVariableOps: (chatId, ops, expect) => call("chat.applyVariableOps", [chatId, ops, expect]) as ReturnType<PluginBridge["chat"]["applyVariableOps"]>,
      requestTurn: (chatId, depth, params) => call("chat.requestTurn", [chatId, depth, params]) as ReturnType<PluginBridge["chat"]["requestTurn"]>,
    },
    worldInfo: {
      listBooks: (chatId) => call("worldInfo.listBooks", [chatId]) as ReturnType<PluginBridge["worldInfo"]["listBooks"]>,
      listEntries: (chatId, bookId) => call("worldInfo.listEntries", [chatId, bookId]) as ReturnType<PluginBridge["worldInfo"]["listEntries"]>,
      upsertEntry: (chatId, entry) => call("worldInfo.upsertEntry", [chatId, entry]) as ReturnType<PluginBridge["worldInfo"]["upsertEntry"]>,
    },
    imagery: {
      generatePicture: (chatId, args) => call("imagery.generatePicture", [chatId, args]) as ReturnType<PluginBridge["imagery"]["generatePicture"]>,
    },
    variables: {
      get: (key) => call("variables.get", [key]) as ReturnType<PluginBridge["variables"]["get"]>,
      set: (key, value) => call("variables.set", [key, value]) as ReturnType<PluginBridge["variables"]["set"]>,
      delete: (key) => call("variables.delete", [key]) as ReturnType<PluginBridge["variables"]["delete"]>,
    },
    assets: {
      read: (assetId) => call("assets.read", [assetId]) as ReturnType<PluginBridge["assets"]["read"]>,
      storeFetched: (bytes, mime) => call("assets.storeFetched", [bytes, mime]) as ReturnType<PluginBridge["assets"]["storeFetched"]>,
    },
    search: { documents: (query, limit) => call("search.documents", [query, limit]) as ReturnType<PluginBridge["search"]["documents"]> },
    storage: {
      get: (key) => call("storage.get", [key]) as ReturnType<PluginBridge["storage"]["get"]>,
      set: (key, value) => call("storage.set", [key, value]) as ReturnType<PluginBridge["storage"]["set"]>,
      delete: (key) => call("storage.delete", [key]) as ReturnType<PluginBridge["storage"]["delete"]>,
      list: (prefix) => call("storage.list", [prefix]) as ReturnType<PluginBridge["storage"]["list"]>,
      compareAndSet: (key, expected, next) => call("storage.compareAndSet", [key, expected, next]) as ReturnType<PluginBridge["storage"]["compareAndSet"]>,
    },
    notifications: { post: (chatId, recipient, message) => call("notifications.post", [chatId, recipient, message]) as Promise<void> },
    llm: { quiet: (prompt, opts, liveness) => call("llm.quiet", [prompt, opts], liveness) as ReturnType<PluginBridge["llm"]["quiet"]> },
    suggest: (chatId, act) => call("suggest", [chatId, act]) as Promise<void>,
    admitEgress: (): void => {
      callSync("admitEgress", []);
    },
    admitAssetEgress: (): void => {
      callSync("admitAssetEgress", []);
    },
    surfaceQuickReply: (chatId, choices) => call("surfaceQuickReply", [chatId, choices]) as Promise<void>,
    ui: {
      setState: (surfaceId, state, chatId) => call("ui.setState", [surfaceId, state, chatId]) as Promise<void>,
      toast: (level, message) => call("ui.toast", [level, message]) as Promise<void>,
      openDialog: (surfaceId) => call("ui.openDialog", [surfaceId]) as Promise<void>,
    },
    databank: { ingest: (doc) => call("databank.ingest", [doc]) as ReturnType<PluginBridge["databank"]["ingest"]> },
    character: {
      ingest: (card) => call("character.ingest", [card]) as ReturnType<PluginBridge["character"]["ingest"]>,
      ingestAsset: (assetId) => call("character.ingestAsset", [assetId]) as ReturnType<PluginBridge["character"]["ingestAsset"]>,
      setCardData: (characterId, data) => call("character.setCardData", [characterId, data]) as Promise<void>,
      getCardData: (characterId) => call("character.getCardData", [characterId]) as ReturnType<PluginBridge["character"]["getCardData"]>,
    },
    pubsub: { emit: (name, data) => call("pubsub.emit", [name, data]) as Promise<void> },
  };
}

function invalid(operation: string): never {
  throw new TypeError(`plugin broker: malformed arguments for ${operation}`);
}

function exact(args: readonly unknown[], count: number, operation: string): void {
  if (args.length !== count) {
    invalid(operation);
  }
}

function stringAt(args: readonly unknown[], index: number, operation: string): string {
  const value = args[index];
  return typeof value === "string" ? value : invalid(operation);
}

function chatAt(args: readonly unknown[], index: number, operation: string): ChatId {
  return stringAt(args, index, operation) as ChatId;
}

function numberAt(args: readonly unknown[], index: number, operation: string): number {
  const value = args[index];
  return typeof value === "number" && Number.isFinite(value) ? value : invalid(operation);
}

function recordAt(args: readonly unknown[], index: number, operation: string): Record<string, unknown> {
  const value = args[index];
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : invalid(operation);
}

function arrayAt(args: readonly unknown[], index: number, operation: string): readonly unknown[] {
  const value = args[index];
  return Array.isArray(value) ? value : invalid(operation);
}

function optionalStringAt(args: readonly unknown[], index: number, operation: string): string | undefined {
  const value = args[index];
  return value === undefined || typeof value === "string" ? value : invalid(operation);
}

function nullableStringAt(args: readonly unknown[], index: number, operation: string): string | null {
  const value = args[index];
  return value === null || typeof value === "string" ? value : invalid(operation);
}

function worldEntryAt(args: readonly unknown[], index: number, operation: string): PluginWorldEntryUpsert {
  const entry = recordAt(args, index, operation);
  const keys = entry["keys"];
  const position = ENTRY_POSITIONS.find((candidate) => candidate === entry["position"]);
  if (!(Array.isArray(keys) && keys.every((item) => typeof item === "string")) || position === undefined) {
    return invalid(operation);
  }
  return {
    bookId: typeof entry["bookId"] === "string" ? entry["bookId"] : invalid(operation),
    entryKey: typeof entry["entryKey"] === "string" ? entry["entryKey"] : invalid(operation),
    keys,
    contentTemplate: typeof entry["contentTemplate"] === "string" ? entry["contentTemplate"] : invalid(operation),
    position,
  };
}

function suggestionCapability(args: readonly unknown[]): PluginCapability {
  exact(args, 2, "suggest");
  const act = recordAt(args, 1, "suggest");
  switch (act["kind"]) {
    case "requestTurn": {
      validateSuggestedTurn(act);
      return HOST_FUNCTION_CAPABILITY["chat.requestTurn"];
    }
    case "worldInfoUpsert":
      if (typeof act["entry"] !== "object" || act["entry"] === null || Array.isArray(act["entry"])) {
        invalid("suggest");
      }
      return HOST_FUNCTION_CAPABILITY["worldInfo.upsertEntry"];
    case "generatePicture":
      if (typeof act["args"] !== "object" || act["args"] === null || Array.isArray(act["args"])) {
        invalid("suggest");
      }
      return HOST_FUNCTION_CAPABILITY["imagery.generatePicture"];
    default:
      return invalid("suggest");
  }
}

function validateSuggestedTurn(act: Readonly<Record<string, unknown>>): void {
  const depth = act["automationDepth"];
  if (typeof depth !== "number" || !Number.isInteger(depth) || depth < 0) {
    invalid("suggest");
  }
  if (act["speakerCharacterId"] !== undefined && typeof act["speakerCharacterId"] !== "string") {
    invalid("suggest");
  }
  if (act["guided"] !== undefined && typeof act["guided"] !== "string") {
    invalid("suggest");
  }
}

function bridgeCapability(operation: PluginBridgeOperation, args: readonly unknown[]): PluginCapability {
  if (operation === "suggest") {
    return suggestionCapability(args);
  }
  return HOST_FUNCTION_CAPABILITY[BRIDGE_HOST_FUNCTION[operation]];
}

function requireChatAuthority(authority: BridgeAuthority, operation: PluginBridgeOperation, args: readonly unknown[]): InvocationChat {
  const chat = authority.chat;
  if (chat === null || chatAt(args, ARG_FIRST, operation) !== chat.chatId) {
    throw new Error(`plugin broker: ${operation} is outside the admitted invocation chat`);
  }
  return chat;
}

function authorizePhase(authority: BridgeAuthority, operation: PluginBridgeOperation): void {
  if (authority.phase === "lifecycle") {
    throw new Error(`plugin broker: ${operation} is unavailable during lifecycle teardown`);
  }
  if (authority.phase === "rehydration" && !REHYDRATION_READ_OPERATIONS.has(operation)) {
    throw new Error(`plugin broker: ${operation} is unavailable while rebuilding a sleeping runtime`);
  }
}

function authorizeRequestTurn(chat: InvocationChat | null, operation: PluginBridgeOperation, args: readonly unknown[]): void {
  if (chat === null) {
    throw new Error("plugin broker: requestTurn is missing invocation chat authority");
  }
  exact(args, THREE_ARGUMENTS, operation);
  if (numberAt(args, ARG_SECOND, operation) !== chat.automationDepth + 1) {
    throw new Error("plugin broker: requestTurn carried a stale automation depth");
  }
}

function authorizeSuggestion(chat: InvocationChat | null, args: readonly unknown[]): void {
  if (chat === null) {
    throw new Error("plugin broker: suggest is missing invocation chat authority");
  }
  if (chat.canWrite) {
    throw new Error("plugin broker: a suggestion cannot replace standing host authority");
  }
  const act = recordAt(args, ARG_SECOND, "suggest");
  if (act["kind"] === "requestTurn" && act["automationDepth"] !== chat.automationDepth + 1) {
    throw new Error("plugin broker: suggestion carried a stale automation depth");
  }
}

function authorizeUiState(authority: BridgeAuthority, args: readonly unknown[]): void {
  exact(args, THREE_ARGUMENTS, "ui.setState");
  const requestedChat = args[ARG_THIRD];
  if (requestedChat !== null && (typeof requestedChat !== "string" || authority.chat === null || requestedChat !== authority.chat.chatId)) {
    throw new Error("plugin broker: ui.setState is outside the admitted invocation chat");
  }
}

/** Re-check the membrane's grant and room authority in the app process before invoking a domain closure. */
export function authorizeBridgeCall(authority: BridgeAuthority, operation: PluginBridgeOperation, args: readonly unknown[]): void {
  authorizePhase(authority, operation);
  const capability = bridgeCapability(operation, args);
  if (!authority.grants.has(capability)) {
    throw new Error(`plugin broker: ${operation} lacks capability ${capability}`);
  }
  const chat = CHAT_SCOPED.has(operation) ? requireChatAuthority(authority, operation, args) : null;
  if (chat !== null && DIRECT_CHAT_WRITES.has(operation) && !chat.canWrite) {
    throw new Error(`plugin broker: ${operation} requires host authority on the admitted chat`);
  }
  if (operation === "chat.requestTurn") {
    authorizeRequestTurn(chat, operation, args);
  }
  if (operation === "suggest") {
    authorizeSuggestion(chat, args);
  }
  if (operation === "ui.setState") {
    authorizeUiState(authority, args);
  }
}

function syncCapability(operation: PluginSyncOperation): PluginCapability | null {
  switch (operation) {
    case "admitEgress":
      return "net.fetch";
    case "admitAssetEgress":
      return "net.fetch_asset";
    case "seam.nowEpochMs":
    case "seam.nextRandom":
    case "seam.mintId":
    case "invokeArgs":
      return null;
  }
}

export function authorizeSyncCall(authority: BridgeAuthority, operation: PluginSyncOperation): void {
  if (authority.phase === "lifecycle") {
    throw new Error(`plugin broker: ${operation} is unavailable during lifecycle teardown`);
  }
  if (authority.phase === "rehydration" && operation !== "seam.nowEpochMs") {
    throw new Error(`plugin broker: ${operation} is unavailable while rebuilding a sleeping runtime`);
  }
  const capability = syncCapability(operation);
  if (capability !== null && !authority.grants.has(capability)) {
    throw new Error(`plugin broker: ${operation} lacks capability ${capability}`);
  }
}

/** The only parent-side dispatch from untrusted broker data into the authority-bearing bridge. */
export async function dispatchBridgeCall(
  bridge: PluginBridge,
  operation: PluginBridgeOperation,
  args: readonly unknown[],
  liveness: PluginInvocationLiveness,
): Promise<unknown> {
  switch (operation) {
    case "chat.listMessages":
      exact(args, 2, operation);
      return await bridge.chat.listMessages(chatAt(args, 0, operation), args[1] === undefined ? undefined : numberAt(args, 1, operation));
    case "chat.getVariables":
      exact(args, 1, operation);
      return await bridge.chat.getVariables(chatAt(args, 0, operation));
    case "chat.listCharacters":
      exact(args, 1, operation);
      return await bridge.chat.listCharacters(chatAt(args, 0, operation));
    case "chat.applyVariableOps":
      exact(args, THREE_ARGUMENTS, operation);
      return await bridge.chat.applyVariableOps(
        chatAt(args, 0, operation),
        arrayAt(args, 1, operation) as Parameters<PluginBridge["chat"]["applyVariableOps"]>[1],
        args[2] === undefined ? undefined : (arrayAt(args, 2, operation) as Parameters<PluginBridge["chat"]["applyVariableOps"]>[2]),
      );
    case "chat.requestTurn":
      exact(args, THREE_ARGUMENTS, operation);
      return await bridge.chat.requestTurn(chatAt(args, 0, operation), numberAt(args, 1, operation), recordAt(args, 2, operation));
    case "worldInfo.listBooks":
      exact(args, 1, operation);
      return await bridge.worldInfo.listBooks(chatAt(args, 0, operation));
    case "worldInfo.listEntries":
      exact(args, 2, operation);
      return await bridge.worldInfo.listEntries(chatAt(args, 0, operation), stringAt(args, 1, operation));
    case "worldInfo.upsertEntry":
      exact(args, 2, operation);
      return await bridge.worldInfo.upsertEntry(chatAt(args, ARG_FIRST, operation), worldEntryAt(args, ARG_SECOND, operation));
    case "imagery.generatePicture":
      exact(args, 2, operation);
      return await bridge.imagery.generatePicture(
        chatAt(args, 0, operation),
        recordAt(args, 1, operation) as Parameters<PluginBridge["imagery"]["generatePicture"]>[1],
      );
    case "variables.get":
      exact(args, 1, operation);
      return await bridge.variables.get(stringAt(args, 0, operation));
    case "variables.set":
      exact(args, 2, operation);
      return await bridge.variables.set(stringAt(args, 0, operation), stringAt(args, 1, operation));
    case "variables.delete":
      exact(args, 1, operation);
      return await bridge.variables.delete(stringAt(args, 0, operation));
    case "assets.read":
      exact(args, 1, operation);
      return await bridge.assets.read(stringAt(args, 0, operation));
    case "assets.storeFetched": {
      exact(args, 2, operation);
      const bytes = args[0];
      if (!(bytes instanceof Uint8Array)) {
        invalid(operation);
      }
      return await bridge.assets.storeFetched(bytes, stringAt(args, 1, operation));
    }
    case "search.documents":
      exact(args, 2, operation);
      return await bridge.search.documents(stringAt(args, 0, operation), args[1] === undefined ? undefined : numberAt(args, 1, operation));
    case "storage.get":
      exact(args, 1, operation);
      return await bridge.storage.get(stringAt(args, 0, operation));
    case "storage.set":
      exact(args, 2, operation);
      return await bridge.storage.set(stringAt(args, 0, operation), stringAt(args, 1, operation));
    case "storage.delete":
      exact(args, 1, operation);
      return await bridge.storage.delete(stringAt(args, 0, operation));
    case "storage.list":
      exact(args, 1, operation);
      return await bridge.storage.list(optionalStringAt(args, 0, operation));
    case "storage.compareAndSet":
      exact(args, THREE_ARGUMENTS, operation);
      return await bridge.storage.compareAndSet(stringAt(args, 0, operation), nullableStringAt(args, 1, operation), stringAt(args, 2, operation));
    case "notifications.post":
      exact(args, THREE_ARGUMENTS, operation);
      return await bridge.notifications.post(
        chatAt(args, 0, operation),
        PLUGIN_NOTIFICATION_RECIPIENTS.find((candidate) => candidate === stringAt(args, 1, operation)) ?? invalid(operation),
        stringAt(args, 2, operation),
      );
    case "llm.quiet":
      exact(args, 2, operation);
      return await bridge.llm.quiet(
        stringAt(args, 0, operation),
        args[1] === undefined ? undefined : (recordAt(args, 1, operation) as Parameters<PluginBridge["llm"]["quiet"]>[1]),
        liveness,
      );
    case "suggest":
      exact(args, 2, operation);
      return await bridge.suggest(chatAt(args, 0, operation), recordAt(args, 1, operation) as Parameters<PluginBridge["suggest"]>[1]);
    case "surfaceQuickReply":
      exact(args, 2, operation);
      return await bridge.surfaceQuickReply(chatAt(args, 0, operation), arrayAt(args, 1, operation) as Parameters<PluginBridge["surfaceQuickReply"]>[1]);
    case "ui.setState":
      exact(args, THREE_ARGUMENTS, operation);
      return await bridge.ui.setState(stringAt(args, 0, operation), recordAt(args, 1, operation), args[2] === null ? null : chatAt(args, 2, operation));
    case "ui.toast":
      exact(args, 2, operation);
      return await bridge.ui.toast(
        PLUGIN_TOAST_LEVELS.find((candidate) => candidate === stringAt(args, 0, operation)) ?? invalid(operation),
        stringAt(args, 1, operation),
      );
    case "ui.openDialog":
      exact(args, 1, operation);
      return await bridge.ui.openDialog(stringAt(args, 0, operation));
    case "databank.ingest":
      exact(args, 1, operation);
      return await bridge.databank.ingest(recordAt(args, 0, operation) as Parameters<PluginBridge["databank"]["ingest"]>[0]);
    case "character.ingest":
      exact(args, 1, operation);
      return await bridge.character.ingest(recordAt(args, 0, operation));
    case "character.ingestAsset":
      exact(args, 1, operation);
      return await bridge.character.ingestAsset(stringAt(args, 0, operation));
    case "character.setCardData":
      exact(args, 2, operation);
      return await bridge.character.setCardData(stringAt(args, 0, operation), recordAt(args, 1, operation));
    case "character.getCardData":
      exact(args, 1, operation);
      return await bridge.character.getCardData(stringAt(args, 0, operation));
    case "pubsub.emit":
      exact(args, 2, operation);
      return await bridge.pubsub.emit(stringAt(args, 0, operation), recordAt(args, 1, operation));
  }
}

export interface SyncDispatchContext {
  readonly seams: PluginHostSeamDeps;
  readonly bridge: PluginBridge;
  readonly invokeArgs: ReadonlyMap<string, (chatHandle: string | null) => string>;
}

export function dispatchSyncCall(operation: PluginSyncOperation, args: readonly unknown[], context: SyncDispatchContext): unknown {
  const { seams, bridge, invokeArgs } = context;
  switch (operation) {
    case "seam.nowEpochMs":
      exact(args, 0, operation);
      return seams.nowEpochMs();
    case "seam.nextRandom":
      exact(args, 0, operation);
      return seams.nextRandom();
    case "seam.mintId":
      exact(args, 0, operation);
      return seams.mintId();
    case "admitEgress":
      exact(args, 0, operation);
      return bridge.admitEgress();
    case "admitAssetEgress":
      exact(args, 0, operation);
      return bridge.admitAssetEgress();
    case "invokeArgs": {
      exact(args, 2, operation);
      const builder = invokeArgs.get(stringAt(args, 0, operation));
      if (builder === undefined) {
        throw new Error("plugin broker: stale invocation-args capability");
      }
      const handle = args[1];
      if (handle !== null && typeof handle !== "string") {
        invalid(operation);
      }
      return builder(handle);
    }
  }
}
