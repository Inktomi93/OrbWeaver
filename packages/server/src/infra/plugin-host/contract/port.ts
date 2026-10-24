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
// pino's own type, not the observability barrel's alias: that barrel reaches the DB, which the plugin Worker graph must not load.
import type pino from "pino";
import type { Env } from "#foundation/env/record";
import type { ScopedEgress } from "#infra/network";
import type { TraceRing } from "#src/foundation/observability/contract/tracing.ts";
import type { PluginNetEgress } from "./net-egress.ts";

/** The determinism seams every instance's realm binds. */
export interface PluginHostSeamDeps {
  /** The broker's launch configuration from the root's env record, passed to the watchdog and broker by argv. */
  readonly env: Pick<Env, "PLUGIN_BROKER_WORKER_MAX" | "PLUGIN_BROKER_MEMORY_LIMIT_BYTES" | "NODE_ENV" | "LOG_LEVEL">;
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
  /** The app root's logger a guest line and a settlement failure land in outside a request. */
  readonly log: pino.Logger;
  /** The app root's trace ring a supervised bridge settlement seals into. */
  readonly traces: TraceRing;
}

/** A Worker-local runtime schedules nothing, fetches nothing and launches no broker itself: the app process owns the
 *  timers, the broker connect clock, the broker launch config and the scoped egress, and the Worker forwards every
 *  guest fetch to it through `netEgress`. */
export type LocalPluginHostSeams = Omit<PluginHostSeamDeps, "timers" | "monotonicNow" | "safeFetch" | "env" | "log" | "traces"> & {
  /** The broker Worker's forwarding egress: the app performs every plugin fetch against its own copy of the
   *  instance's `netHosts`. */
  readonly netEgress: PluginNetEgress;
  /** The Worker's own record level; the Worker builds its root logger from it, since the app's cannot cross the process. */
  readonly logLevel: Env["LOG_LEVEL"];
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
