import type { PluginBridge, PluginInstance, PluginInstanceCreateData, PluginLogLevel, SnippetResult } from "@orb/contracts/plugin";

import type { PluginNetEgress } from "../net-egress.ts";

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

/** Instance data plus the app-owned operation bridge; no domain import crosses the infra boundary. */
export interface CreateInstanceInputIn extends PluginInstanceCreateData {
  readonly bridge: PluginBridge;
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
