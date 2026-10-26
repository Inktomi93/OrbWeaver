// Dev bridge contracts; the operator HTTP read lives in the data tier.
import type { PluginCommandView, PluginSurfaceView, PluginView } from "@orb/contracts/plugin";
import type { AutomationRuleId, ChatId } from "@orb/kit/ids";
import type { FetchStatus, QueryStatus } from "@tanstack/react-query";
import type { PluginUiCommandLocation } from "./plugin-ui-audit-attributes.ts";

export type OrbPluginListEntry = Pick<PluginView, "id" | "slug" | "name" | "version" | "status">;

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

/** Cache evidence is not an eligibility verdict; an unread scope has no publication evidence. */
export interface OrbPluginPublication {
  readonly chatId: ChatId | null;
  readonly status: QueryStatus | null;
  readonly fetchStatus: FetchStatus | null;
  readonly published: boolean | null;
  readonly updatedAt: number | null;
}

/** Current host DOM observations, not a claim that plugin content has finished loading. */
export interface OrbPluginUiHost {
  readonly visible: boolean;
  readonly inert: boolean;
  readonly ariaHidden: boolean;
  readonly selector: string;
  readonly index: number;
}

export interface OrbPluginUiSurface extends Pick<PluginSurfaceView, "id" | "anchor" | "tier" | "title" | "toolName" | "toolWireName"> {
  readonly publication: readonly OrbPluginPublication[];
  readonly hosts: readonly OrbPluginUiHost[];
}

export interface OrbPluginUiCommand extends Pick<PluginCommandView, "name" | "describe" | "group" | "placements" | "composerDraft"> {
  readonly hosts: readonly (OrbPluginUiHost & {
    readonly target: PluginCommandView["placements"][number]["target"];
    readonly location: PluginUiCommandLocation;
  })[];
  readonly overflowHosts: readonly OrbPluginUiHost[];
}

export interface OrbPluginUiEntry extends OrbPluginListEntry {
  readonly surfaces: readonly OrbPluginUiSurface[];
  readonly commands: readonly OrbPluginUiCommand[];
}

/** Runtime-listed registrations and current observations; inactive contexts are not evaluated for eligibility. */
export interface OrbPluginUiSnapshot {
  readonly chatId: ChatId | null;
  readonly plugins: readonly OrbPluginUiEntry[];
}

export type OrbPluginUiReader = () => Promise<OrbPluginUiSnapshot>;

/** `__orb.automationFires(filter?)`'s query — the `/api/_debug/automation/fires` params, branded like the
 *  route brands them at its own seam. */
export interface OrbAutomationFiresFilter {
  readonly chatId?: ChatId;
  readonly ruleId?: AutomationRuleId;
  readonly limit?: number;
}
