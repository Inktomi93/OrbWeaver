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
  PluginLogView,
  SnippetResult,
} from "@orb/contracts/plugin";
import type { TimerScheduler } from "@orb/kit/time";
import type { ScopedEgress } from "#infra/network";
import type { PluginNetEgress } from "./net-egress.ts";

/** The determinism seams every instance's realm binds. */
export interface PluginHostSeamDeps {
  readonly spawn?: (...args: Parameters<typeof spawn>) => ReturnType<typeof spawn>;
  readonly timers: TimerScheduler;
  /** The broker connect deadline's monotonic clock; the root supplies `performance.now` from `createProcessSeams`. */
  readonly monotonicNow: () => number;
  /** The graph's scoped egress; every guest `net.fetch` the app performs runs through it. */
  readonly safeFetch: ScopedEgress["safeFetch"];
  readonly nowEpochMs: () => number;
  readonly nextRandom: () => number;
  readonly mintId: () => string;
  readonly mirrorLog?: (label: string, level: PluginLogLevel, message: string) => void;
}

/** A Worker-local runtime schedules nothing and fetches nothing itself: the app process owns the timers, the
 *  broker connect clock and the scoped egress, and the Worker forwards every guest fetch to it through `netEgress`. */
export type LocalPluginHostSeams = Omit<PluginHostSeamDeps, "timers" | "monotonicNow" | "safeFetch"> & {
  /** The broker Worker's forwarding egress: the app performs every plugin fetch against its own copy of the
   *  instance's `netHosts`. */
  readonly netEgress: PluginNetEgress;
};

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
  readonly readLog: (instance: PluginInstance) => readonly PluginLogView[];
  readonly dispose: (instance: PluginInstance) => void;
}

export type CreateInstanceOutcomeOut =
  | { readonly ok: true; readonly instance: PluginInstance }
  | { readonly ok: false; readonly error: string; readonly log: readonly PluginLogView[] };

export type SnippetRunOut = SnippetResult;
