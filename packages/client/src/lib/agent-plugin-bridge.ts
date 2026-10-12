// Dev bridge contracts; the operator HTTP read lives in the data tier.
import type { AutomationRuleId, ChatId, PluginId } from "@orb/kit/ids";

// @orb-waive contract-structural-copy(OrbPluginListEntry): baselined when the gate widened; burn-down item 904.
/** One installed plugin as `__orb.pluginLog()` lists it — the `plugin.list` row's identity + lifecycle columns. */
export interface OrbPluginListEntry {
  readonly id: PluginId;
  readonly slug: string;
  readonly name: string;
  readonly version: string;
  readonly status: string;
}

/** One line of a plugin's runtime host.log ring, as `plugin.getLog` serves it. */
interface OrbPluginLogLine {
  readonly level: string;
  readonly message: string;
  readonly at: number;
}

/** `__orb.pluginLog(ref?)`'s answer: the installed-plugin list (no ref), one plugin's log (ref = slug or id), or a
 *  LOUD refusal (no match / ambiguous) — never a silent empty. */
export type OrbPluginLogResult =
  | { readonly ok: true; readonly plugins: readonly OrbPluginListEntry[] }
  | { readonly ok: true; readonly plugin: OrbPluginListEntry; readonly log: readonly OrbPluginLogLine[] }
  | { readonly ok: false; readonly reason: string };

/** Dev-only plugin-log reader: the owner's installed-plugin list and, per plugin, the RUNTIME host.log ring
 *  `plugin.getLog` serves — which (#806) now includes what a floated guest continuation logged between
 *  invocations. Built at the composition tier (`client/src/agent-plugin/`) over the production tRPC reads. */
export type OrbPluginLogReader = (ref?: string) => Promise<OrbPluginLogResult>;

/** `__orb.automationFires(filter?)`'s query — the `/api/_debug/automation/fires` params, branded like the
 *  route brands them at its own seam. */
export interface OrbAutomationFiresFilter {
  readonly chatId?: ChatId;
  readonly ruleId?: AutomationRuleId;
  readonly limit?: number;
}
