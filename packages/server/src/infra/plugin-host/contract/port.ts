import type { spawn } from "node:child_process";
import type { InvocationChat, PluginBridge, PluginCapability, PluginHandlerRef, PluginInstance, PluginInvokeArgs, PluginLogLevel } from "@orb/contracts/plugin";
import type { TimerScheduler } from "@orb/kit/time";
import type { ScopedEgress } from "#infra/network";
import type { PluginNetEgress } from "../net-egress.ts";
import type { SandboxLimits } from "../sandbox.ts";

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

// @orb-waive contract-structural-copy(CreateInstanceInputIn): baselined when the gate widened; burn-down item 904.
/** The serializable half of a Worker create command plus its app-owned bridge. */
export interface CreateInstanceInputIn {
  readonly mainJs: string;
  readonly grants: readonly PluginCapability[];
  readonly bridge: PluginBridge;
  readonly chat: InvocationChat | null;
  readonly netHosts?: readonly string[];
  readonly budgets?: SandboxLimits;
  readonly label?: string;
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

// @orb-waive contract-structural-copy(SnippetRunOut): baselined when the gate widened; burn-down item 904.
/** The inline-snippet run's outcome. */
export interface SnippetRunOut {
  readonly logLines: readonly string[];
  readonly error?: string;
  readonly errorKind?: "parse" | "runtime";
  readonly errorLine?: number;
}
