import type { spawn } from "node:child_process";
import type {
  InvocationChat,
  PluginBridge,
  PluginCapability,
  PluginHandlerRef,
  PluginInstance,
  PluginInstanceCreateData,
  PluginInvokeArgs,
  PluginLogLevel,
  SnippetResult,
} from "@orb/contracts/plugin";
import type { TimerScheduler } from "@orb/kit/time";
import type { ScopedEgress } from "#infra/network";
import type { PluginNetEgress } from "./net-egress.ts";

/** The determinism seams every instance's realm binds. */
export interface PluginHostSeamDeps {
  readonly spawn?: (...args: Parameters<typeof spawn>) => ReturnType<typeof spawn>;
  readonly timers?: TimerScheduler;
  readonly monotonicNow?: () => number;
  readonly safeFetch?: ScopedEgress["safeFetch"];
  readonly nowEpochMs: () => number;
  readonly nextRandom: () => number;
  readonly mintId: () => string;
  readonly mirrorLog?: (label: string, level: PluginLogLevel, message: string) => void;
  /** The broker Worker's forwarding egress: the broker has no network, so the app performs every plugin fetch
   *  against its own copy of the instance's `netHosts`. Absent in-process, where each instance fetches locally. */
  readonly netEgress?: PluginNetEgress;
}

/** Instance data plus the app-owned operation bridge; no domain import crosses the infra boundary. */
export interface CreateInstanceInputIn extends PluginInstanceCreateData {
  readonly bridge: PluginBridge;
}

export interface CreateLogicalInstanceInputIn extends CreateInstanceInputIn {
  /** Installed plugins supply their durable re-reader; transient low-level callers need no cold wake. */
  readonly reloadMainJs?: () => Promise<string>;
}

/** The process host owns physical runtimes while consumers retain only the invocation operations. */
export interface ProcessPluginHost extends AsyncDisposable {
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

/** One retained guest log line. */
export interface PluginLogLineOut {
  readonly level: PluginLogLevel;
  readonly message: string;
  readonly at: number;
}

export type CreateInstanceOutcomeOut =
  | { readonly ok: true; readonly instance: PluginInstance }
  | { readonly ok: false; readonly error: string; readonly log: readonly PluginLogLineOut[] };

export type SnippetRunOut = SnippetResult;
