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
import type { IdSource, UserId } from "@orb/kit/ids";
import type { RandomSource } from "@orb/kit/macro";
import type { Clock, TimerScheduler } from "@orb/kit/time";
import type { Env } from "#foundation/env/record";
import type { ScopedEgress } from "#infra/network";
import type { Logger } from "#src/foundation/observability/contract/logging.ts";
import type { TraceRing } from "#src/foundation/observability/contract/tracing.ts";
import type { PluginNetEgress } from "./net-egress.ts";

/** The authority a resident call runs under: a write path's `invocation`, or a query's read-only `display`. */
export type PluginInvokePhase = "invocation" | "display";

/** A plugin command whose host call is running: whose installer, and how many cascade levels deep the command runs. */
export interface PluginCascadeCause {
  readonly installer: UserId;
  readonly cascadeDepth: number;
}

/** The cause of the host work a plugin's host call starts, held across every await that work makes, so a domain event
 *  it raises reaches a plugin handler as one level deeper than the command that raised it, whichever plane delivers it. */
export interface PluginCascadeScope {
  /** Run `work` as caused by `cause`. */
  readonly run: <T>(cause: PluginCascadeCause, work: () => Promise<T>) => Promise<T>;
  /** The cause of the work running now, or `undefined` when no plugin host call started it. */
  readonly current: () => PluginCascadeCause | undefined;
}

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
  readonly nowEpochMs: Clock;
  readonly nextRandom: RandomSource;
  readonly mintId: IdSource["uuid"];
  readonly mirrorLog?: (label: string, level: PluginLogLevel, message: string) => void;
  /** The app root's logger a guest line and a settlement failure land in outside a request. */
  readonly log: Logger;
  /** The app root's trace ring a supervised bridge settlement seals into. */
  readonly traces: TraceRing;
  /** The host stopped restarting its broker after repeated losses (D347): for each owner of a resident plugin or of a
   *  runtime lost with a broker, why, naming only that owner's plugins that were running at each loss. */
  readonly onHalted: (records: ReadonlyMap<UserId, string>) => void;
  /** Where each plugin host call runs its domain work, so what that work raises carries the command's depth. */
  readonly cascadeScope: Pick<PluginCascadeScope, "run">;
}

/** A Worker-local runtime schedules nothing, fetches nothing and launches no broker itself (so it takes no `spawn`): the app process owns the
 *  timers, the broker connect clock, the broker launch config and the scoped egress, and the Worker forwards every
 *  guest fetch to it through `netEgress`. */
export type LocalPluginHostSeams = Omit<
  PluginHostSeamDeps,
  "timers" | "monotonicNow" | "safeFetch" | "env" | "log" | "traces" | "spawn" | "onHalted" | "cascadeScope"
> & {
  /** The broker Worker's forwarding egress: the app performs every plugin fetch against its own copy of the
   *  instance's `netHosts`. */
  readonly netEgress: PluginNetEgress;
  /** The Worker's own record level; the Worker builds its root logger from it, since the app's cannot cross the process. */
  readonly logLevel: Env["LOG_LEVEL"];
  /** Where this Worker reports each span of guest work to its broker (D347); absent outside a broker's Worker. */
  readonly spanReport?: CpuSpanReport;
  /** How many cascade levels deep the command whose host call is running runs, read from that command's authority. */
  readonly currentCascadeDepth: () => number;
};

/** Where a thread reports each outermost span of guest work, for a watcher the span cannot block: one native call or one
 *  interrupt poll period has a length the guest picks, and nothing in that thread runs until it returns (D347). */
export interface CpuSpanReport {
  /** A span opened with `windowMs` left on its account (0 when the account is spent). */
  readonly opened: (windowMs: number) => void;
  /** The open span closed after running `spentMs`. */
  readonly closed: (spentMs: number) => void;
}

/** Instance data plus the app-owned operation bridge; no domain import crosses the infra boundary. */
export interface CreateInstanceInputIn extends PluginInstanceCreateData {
  readonly bridge: PluginBridge;
}

export interface CreateLogicalInstanceInputIn extends CreateInstanceInputIn {
  /** Installed plugins supply their durable re-reader; transient low-level callers need no cold wake. */
  readonly reloadMainJs?: () => Promise<string>;
  /** The installer, whose share of the broker's Workers this plugin's runtime draws on. */
  readonly owner: UserId;
}

/** The process host owns physical runtimes while consumers retain only the invocation operations. */
export interface ProcessPluginHost extends AsyncDisposable {
  readonly createInstance: (input: CreateLogicalInstanceInputIn) => Promise<CreateInstanceOutcomeOut>;
  /** `phase` `display` runs a query's call: its bridge admits reads only, and it leaves an owed strike for the next
   *  write-path call to pay. `cascadeDepth` is how many cascade levels deep the call runs; only a delivery a plugin's
   *  own command caused passes one, and every other call runs at 0. */
  readonly invoke: (
    instance: PluginInstance,
    handler: PluginHandlerRef,
    argsJson: PluginInvokeArgs,
    chat: InvocationChat | null,
    signal: AbortSignal,
    phase?: PluginInvokePhase,
    cascadeDepth?: number,
  ) => Promise<string>;
  readonly runSnippet: (input: {
    readonly code: string;
    readonly grants: readonly PluginCapability[];
    readonly bridge: PluginBridge;
    readonly chat: InvocationChat;
    /** The member running it, whose share of the broker's Workers the snippet draws on. */
    readonly owner: UserId;
  }) => Promise<SnippetResult>;
  readonly readLog: (instance: PluginInstance) => readonly PluginLogView[];
  /** Write a line the instance's own failure caused to the server log, on the window its guest log lines draw on. */
  readonly logFailure: (instance: PluginInstance, line: PluginFailureLine) => void;
  readonly dispose: (instance: PluginInstance) => void;
}

/** One server-log line for a plugin's failure. Every string field counts against the instance's server-log window. */
export interface PluginFailureLine {
  readonly level: PluginLogLevel;
  readonly fields: Readonly<Record<string, string>>;
  readonly message: string;
}

export type CreateInstanceOutcomeOut =
  | { readonly ok: true; readonly instance: PluginInstance }
  /** `ended`: the host ended main.js at its settlement wall or its CPU window, which a recorded refusal never excuses (D347). */
  | { readonly ok: false; readonly error: string; readonly log: readonly PluginLogView[]; readonly ended?: true };
