// The PLUGIN + AUTOMATION slice of the dev bridge (`__orb.pluginLog` / `__orb.automationFires`) — the handle
// TYPES `agent-bridge.ts` declares for the composition-tier impl (`client/src/agent-plugin/`), plus the ONE
// same-origin debug-route read the bridge performs itself. Split out of `agent-bridge.ts` at the component-size
// cap (the `state/section-ids.ts` extraction precedent); `agent-bridge.ts` re-imports what it installs.
//
// `readAutomationFires` reads `/api/_debug/automation/fires`, an OPERATOR surface behind its own gate (admin
// session or `x-debug-token`) with no tRPC twin by design — the debug probes are principal-blind
// whole-deployment reads. A same-origin fetch from the dev-only bridge is the honest spelling: a `data/` fetch
// fn would advertise the route to features, which must never read it (the `fetch-fn-in-features` wall is about
// features; `lib/` is where the bridge already lives). A refused read answers `{ok:false, reason}` with the
// status — never a throw into a devtools eval.

import type { AutomationRuleId, ChatId, PluginId } from "@orb/kit/ids";

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

/** The one debug-route path this slice reads (see the header).
 *
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export const AUTOMATION_FIRES_ROUTE = "/api/_debug/automation/fires";

/** The durable automation fire log through the debug route — `{count, fires}` on success, `{ok:false, reason}`
 *  carrying the HTTP status when the gate refuses. */
export async function readAutomationFires(filter: OrbAutomationFiresFilter = {}): Promise<unknown> {
  const params = new URLSearchParams();
  if (filter.chatId !== undefined) {
    params.set("chatId", filter.chatId);
  }
  if (filter.ruleId !== undefined) {
    params.set("ruleId", filter.ruleId);
  }
  if (filter.limit !== undefined) {
    params.set("limit", String(filter.limit));
  }
  const query = params.size === 0 ? "" : `?${params.toString()}`;
  const res = await fetch(`${AUTOMATION_FIRES_ROUTE}${query}`, { credentials: "same-origin" });
  if (!res.ok) {
    return { ok: false, reason: `HTTP ${res.status} from ${AUTOMATION_FIRES_ROUTE} — the debug gate admits an admin session or x-debug-token` };
  }
  return await res.json();
}
