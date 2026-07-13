// domain/chat/substrate/regex-tier — the effective host-tier regex resolver (D53). Produces a chat's shared,
// server-side regex set = host-global ∪ chat-preset ∪ the present cast cards' scripts, all resolved under the
// frozen `runAsUserId` (D19 — the host, never the calling member). A non-host member has no parameter on this
// surface, so it contributes nothing to the shared prompt — the exclusion is structural, not a runtime check.
//
// The resolver resolves — it does not filter. It returns the full union; `executeRegexScripts` (kit/regex)
// drops by `enabled`/`placement`/the markdownOnly-vs-prompt leg. Source order is fixed (global → preset →
// cast in roster order); duplicates (by id) collapse to their first (earliest-tier) occurrence — this order
// is load-bearing since `executeRegexScripts` applies the result in it.

import type { RegexScript } from "@orb/contracts/regex";
import type { HostTierRegexSources } from "../contract/regex";

/** Resolve a chat's effective host-tier regex set: host-global ∪ chat-preset ∪ cast, deduped by `id`
 *  (first/earliest-tier wins), deterministically ordered. Returns the full set — `executeRegexScripts` does
 *  the enabled/placement/flag filtering. */
export function resolveHostTierRegexScripts(sources: HostTierRegexSources): RegexScript[] {
  const ordered: readonly RegexScript[] = [
    ...sources.hostGlobal,
    ...sources.preset,
    ...sources.cast.flatMap((card) => card.regexScripts),
  ];
  const seen = new Set<string>();
  const effective: RegexScript[] = [];
  for (const candidate of ordered) {
    if (seen.has(candidate.id)) {
      continue;
    }
    seen.add(candidate.id);
    effective.push(candidate);
  }
  return effective;
}
