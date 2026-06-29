// domain/chat/substrate/regex-tier — the EFFECTIVE HOST-TIER regex resolver (D53). Produces a chat's SHARED,
// server-side regex set = host-global ∪ chat-preset ∪ the present cast cards' scripts, ALL resolved under the
// FROZEN `runAsUserId` (D19 — the host, NEVER the calling member). This is the canon-/shared-prompt-affecting
// tier; the SEND (`USER_INPUT`) + RECEIVE (`AI_OUTPUT`/`REASONING`) wiring (next chunk) calls this, then runs
// `executeRegexScripts` with the per-seam placement. Homed in `substrate/` because BOTH the turn-running
// `verbs/` (SEND) and the `engine/` (RECEIVE) consume it — the cross-subsystem-legal seam (the `auth/`
// decider precedent), not `assembly/` (whose WORLD_INFO pass already runs the preset source, D53).
//
// THE RESOLVER RESOLVES — IT DOES NOT FILTER. It returns the FULL union; `executeRegexScripts` (kit/regex) is
// the one that drops by `enabled`, by `placement`, and by the `markdownOnly`/`promptOnly` prompt-vs-display
// leg at the SEND/RECEIVE seam. The per-USER `markdownOnly` display tier is the EPHEMERAL client half (the D44
// render-tier, Phase 6) — it is NOT in this host-tier set.
//
// D19 SCOPING (host-tier, BY CONSTRUCTION). The three inputs are ALL the host's, resolved under the frozen
// `runAsUserId` by the caller:
//   • `hostGlobal` = the host's `UserSettings.regexScripts` (the owner's single-owned `fetchOwned` set).
//   • `preset`     = the chat's active `PromptConfig.regexScripts` (the host owns the chat's preset selection).
//   • `cast`       = the present roster cards, each loaded via `getCard({ ownerId: runAsUserId, … })` (D28/D16).
// A non-host MEMBER has NO parameter on this surface, so it contributes NOTHING to the shared prompt (D53) —
// the member-exclusion is STRUCTURAL, not a runtime check. A pure union cannot verify identity, so honoring
// the D19 contract when RESOLVING the three sources is the caller's job (`CharacterCard` is identity-free —
// it carries no `ownerId` to assert against here).
//
// DETERMINISM. Source order is fixed (host-global → chat-preset → cast in roster order); within each source the
// stored array order is preserved; duplicates (by `id`) collapse to their FIRST (earliest-tier) occurrence.
// `executeRegexScripts` applies the result IN THIS ORDER, so the order is load-bearing — it must be stable.

import type { RegexScript } from "@orb/contracts/regex";
import type { HostTierRegexSources } from "../contract/regex";

/**
 * Resolve a chat's EFFECTIVE HOST-TIER regex set (D53): host-global ∪ chat-preset ∪ cast, deduped by `id`
 * (first/earliest-tier wins) and deterministically ordered (global → preset → cast roster order; stored order
 * within each source). Returns the FULL set — `executeRegexScripts` does the enabled/placement/flag filtering
 * at the SEND/RECEIVE seam. Pure: no I/O, no clock, no mutation of the inputs.
 */
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
