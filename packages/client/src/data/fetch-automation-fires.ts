import type { OrbAutomationFiresFilter } from "../lib/agent-plugin-bridge.ts";

// The fetch and refusal message share the debug route.
const AUTOMATION_FIRES_ROUTE = "/api/_debug/automation/fires";

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
    return { ok: false, reason: `HTTP ${res.status} from ${AUTOMATION_FIRES_ROUTE} — the debug gate admits the owner session or x-debug-token` };
  }
  return await res.json();
}
