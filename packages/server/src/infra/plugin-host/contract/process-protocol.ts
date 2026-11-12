import type { PluginHostRefusalCode, PluginLogLevel } from "@orb/contracts/plugin";
import type { LogLevel } from "@orb/contracts/settings";
import type { NodeEnvironment } from "#primitives/node-environment";

export interface PluginBrokerWatchdogArguments {
  readonly directory: string;
  readonly workerMaximum: number;
  readonly memoryLimitBytes: number;
  readonly nodeEnvironment: NodeEnvironment;
  /** The app record's `LOG_LEVEL`; each guest Worker builds its own root logger at it. */
  readonly logLevel: LogLevel;
}

export interface PluginBrokerArguments extends Omit<PluginBrokerWatchdogArguments, "memoryLimitBytes"> {
  readonly generation: string;
}

/** The plugin runtime a frame belongs to, so that a full queue refuses that frame alone (D348), and the small frame
 *  that answers the refusal: sent back toward the producer for a request, or on to the consumer in place of a reply. A
 *  frame with no refusal, a log line, is dropped. */
export interface PluginFrameRoute {
  readonly runtimeId: string;
  readonly refusal?: { readonly frame: string; readonly back: boolean };
}

export type PluginIpcMessage =
  | { readonly kind: "frame"; readonly generation: string; readonly frame: string; readonly route?: PluginFrameRoute }
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
  "character.findCardData",
  "pubsub.emit",
] as const;
export type PluginBridgeOperation = (typeof PLUGIN_BRIDGE_OPERATIONS)[number];

export const PLUGIN_SYNC_OPERATIONS = ["seam.nowEpochMs", "seam.nextRandom", "seam.mintId", "invokeArgs"] as const;
export type PluginSyncOperation = (typeof PLUGIN_SYNC_OPERATIONS)[number];

export interface RpcError {
  readonly name: string;
  readonly message: string;
  /** Why a host-unavailable refusal was made, when the host can say; the guest reads it beside the name. */
  readonly code?: PluginHostRefusalCode;
}

interface BrokerCommand {
  readonly kind: "command";
  readonly id: string;
  readonly operation: PluginCommandOperation;
  readonly runtimeId: string;
  readonly authorityId: string;
  readonly value?: unknown;
}

export type RpcResult =
  | { readonly ok: true; readonly value?: unknown; readonly error?: never }
  | { readonly ok: false; readonly error: RpcError; readonly value?: never };

export type BrokerBridgeResult = { readonly kind: "bridge-result"; readonly id: string } & RpcResult;

export type ParentBrokerMessage =
  | BrokerCommand
  | BrokerBridgeResult
  | { readonly kind: "bridge-cancel"; readonly id: string }
  /** The parent's backstop for this command ran out: if the broker still holds it, it ends the runtime's Worker as stuck. */
  | { readonly kind: "end-runtime"; readonly runtimeId: string; readonly commandId: string };

export type BrokerParentMessage =
  | ({ readonly kind: "response"; readonly id: string } & RpcResult)
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
  /** The broker terminated this runtime's Worker for running guest code past its window. The logical instance is not
   *  crashed: its next call builds a fresh runtime. `error` is the ended refusal when no pending command carried it. */
  | { readonly kind: "runtime-ended"; readonly runtimeId: string; readonly error?: RpcError }
  | { readonly kind: "authority-released"; readonly runtimeId: string; readonly authorityId: string };

export type BrokerWorkerMessage =
  | { readonly kind: "command"; readonly id: string; readonly operation: PluginCommandOperation; readonly authorityId: string; readonly value?: unknown }
  | ({ readonly kind: "bridge-result"; readonly id: string } & RpcResult)
  | { readonly kind: "bridge-cancel"; readonly id: string };

export type WorkerBrokerMessage =
  | { readonly kind: "ready" }
  | ({ readonly kind: "response"; readonly id: string } & RpcResult)
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
