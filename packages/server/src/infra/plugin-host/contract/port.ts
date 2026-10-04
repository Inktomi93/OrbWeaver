import type { InvocationChat, PluginBridge, PluginCapability, PluginInstance, PluginLogLevel } from "@orb/contracts/plugin";

import type { PluginNetEgress } from "../net-egress.ts";
import type { SandboxLimits } from "../sandbox.ts";

/** The determinism seams every instance's realm binds. */
export interface PluginHostSeamDeps {
  readonly nowEpochMs: () => number;
  readonly nextRandom: () => number;
  readonly mintId: () => string;
  readonly mirrorLog?: (label: string, level: PluginLogLevel, message: string) => void;
  /** The broker Worker's forwarding egress: the broker has no network, so the app performs every plugin fetch
   *  against its own copy of the instance's `netHosts`. Absent in-process, where each instance fetches locally. */
  readonly netEgress?: PluginNetEgress;
}

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

/** One retained guest log line. */
export interface PluginLogLineOut {
  readonly level: PluginLogLevel;
  readonly message: string;
  readonly at: number;
}

export type CreateInstanceOutcomeOut =
  | { readonly ok: true; readonly instance: PluginInstance }
  | { readonly ok: false; readonly error: string; readonly log: readonly PluginLogLineOut[] };

/** The inline-snippet run's outcome. */
export interface SnippetRunOut {
  readonly logLines: readonly string[];
  readonly error?: string;
  readonly errorKind?: "parse" | "runtime";
  readonly errorLine?: number;
}
