// domain/chat/substrate/regex-tier — the effective host-tier regex resolver (D53 as amended by D121-E).
// Produces a chat's shared, server-side regex set = host-global ∪ chat-preset ∪ the present cast ∪ the
// room's own set, all resolved under the frozen `runAsUserId` (D19 — the host, never the calling member). A
// non-host member has no parameter on this surface, so it contributes nothing to the shared prompt — the
// exclusion is structural, not a runtime check.
//
// The resolver resolves — it does not filter. It returns the full union; `executeRegexScripts` (kit/regex)
// drops by `enabled`/`placement`/the markdownOnly-vs-prompt leg. Source order is fixed (global → preset →
// cast in roster order → chat); duplicates collapse to their first (earliest-tier) occurrence — this order
// is load-bearing since `executeRegexScripts` applies the result in it.
//
// DEDUP KEYS ON THE ROW ID, which is now an FK-real `regex_script_…` TypeID rather than a client-minted
// UUID: the SAME library row attached at two scopes runs exactly ONCE, at its earliest tier. That is the
// property the old embed-by-value shape could not have (three copies of a script were three scripts).

import type { RegexScriptRow } from "@orb/contracts/regex";
import type { HostTierRegexSources } from "../contract/regex.ts";

/** Resolve a chat's effective host-tier regex set: host-global ∪ chat-preset ∪ cast ∪ chat, deduped by row
 *  id (first/earliest-tier wins), deterministically ordered. Returns the full set — `executeRegexScripts`
 *  does the enabled/placement/flag filtering. */
export function resolveHostTierRegexScripts(sources: HostTierRegexSources): RegexScriptRow[] {
  const ordered: readonly RegexScriptRow[] = [...sources.hostGlobal, ...sources.preset, ...sources.cast, ...sources.chat];
  const seen = new Set<string>();
  const effective: RegexScriptRow[] = [];
  for (const candidate of ordered) {
    if (seen.has(candidate.id)) {
      continue;
    }
    seen.add(candidate.id);
    effective.push(candidate);
  }
  return effective;
}
