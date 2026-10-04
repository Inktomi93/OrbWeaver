import type { PluginLogLevel } from "@orb/contracts/plugin";
import type { NodeEnvironment } from "../../../kit/node-environment.ts";

export interface PluginBrokerWatchdogArguments {
  readonly directory: string;
  readonly workerMaximum: number;
  readonly memoryLimitBytes: number;
  readonly nodeEnvironment: NodeEnvironment;
}

export interface PluginBrokerArguments extends Omit<PluginBrokerWatchdogArguments, "memoryLimitBytes"> {
  readonly generation: string;
}

export type PluginIpcMessage =
  | { readonly kind: "frame"; readonly generation: string; readonly frame: string }
  | { readonly kind: "ready"; readonly generation: string }
  | { readonly kind: "stopped"; readonly generation: string; readonly error: RpcError };

export type PluginIpcSend = (message: PluginIpcMessage, callback: (error: Error | null) => void) => void;

export const PLUGIN_COMMAND_OPERATIONS = ["create", "invoke", "snippet", "dispose"] as const;
export type PluginCommandOperation = (typeof PLUGIN_COMMAND_OPERATIONS)[number];

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
  "net.fetch",
  "net.fetchAsset",
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

export const PLUGIN_SYNC_OPERATIONS = ["seam.nowEpochMs", "seam.nextRandom", "seam.mintId", "invokeArgs"] as const;
export type PluginSyncOperation = (typeof PLUGIN_SYNC_OPERATIONS)[number];

export interface RpcError {
  readonly name: string;
  readonly message: string;
}

interface BrokerCommand {
  readonly kind: "command";
  readonly id: string;
  readonly operation: PluginCommandOperation;
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

export type ParentBrokerMessage = BrokerCommand | BrokerBridgeResult | { readonly kind: "bridge-cancel"; readonly id: string };

export type BrokerParentMessage =
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
  | { readonly kind: "log"; readonly runtimeId: string; readonly label: string; readonly level: PluginLogLevel; readonly message: string }
  | { readonly kind: "runtime-crashed"; readonly runtimeId: string; readonly error: RpcError }
  | { readonly kind: "authority-released"; readonly runtimeId: string; readonly authorityId: string };

export type BrokerWorkerMessage =
  | { readonly kind: "command"; readonly id: string; readonly operation: PluginCommandOperation; readonly authorityId: string; readonly value?: unknown }
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
  | { readonly kind: "log"; readonly label: string; readonly level: PluginLogLevel; readonly message: string }
  | { readonly kind: "authority-released"; readonly authorityId: string };
