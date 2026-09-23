// domain/chat/substrate/regex-tier — the effective host-tier regex resolver (D53 as amended by D121-E, and
// by #1742's per-chat allows). Produces a chat's shared, server-side regex set = host-global ∪ chat-preset ∪
// the present characters (per seat) ∪ the room's own set, all resolved under the frozen `runAsUserId` (D19 —
// the host, never the calling member). A non-host member has no parameter on this surface, so it contributes
// nothing to the shared prompt — the exclusion is structural, not a runtime check.
//
// The resolver resolves — it does not filter by script BEHAVIOR. It returns the full union;
// `executeRegexScripts` (kit/regex) drops by `enabled`/`placement`/the markdownOnly-vs-prompt leg. Source
// order is fixed (global → preset → characters in roster order → chat); duplicates collapse to their first
// (earliest-tier) occurrence — this order is load-bearing since `executeRegexScripts` applies the result in it.
//
// DEDUP KEYS ON THE ROW ID, which is an FK-real `regex_script_…` TypeID rather than a client-minted UUID: the
// SAME library row attached at two scopes runs exactly ONCE, at its earliest tier. That is the property the
// old embed-by-value shape could not have (three copies of a script were three scripts).
//
// WHAT #1742 ADDED — the ROOM'S OWN LEVERS, and the one ordering rule that makes them honest:
//   • {@link HostTierRegexSources.allow} is a REQUIRED field, not an optional one. Every caller must say what
//     this room permits; there is no "forgot to pass it" arm that silently runs a tier the host switched off.
//   • THE DROP HAPPENS BEFORE THE DEDUP. A script attached at BOTH a disallowed tier and an allowed one must
//     still run: if the disallowed tier's occurrence were deduped first and dropped after, the allowed tier's
//     copy would already have been swallowed and a script the host never touched would go silently dead.
//   • THE TIER LISTING KEEPS WHAT THE EFFECTIVE SET DROPS. A disallowed tier is still LISTED, with its rows
//     readable and their ranks null — a host cannot switch back on what the read stopped mentioning.
//   • RANK COMES ONLY FROM THE EFFECTIVE HALF (the mock design §7.1). The client never re-unions and never
//     re-ranks; a numeral on a row is that row's index in the run order the turn will actually apply.
//
// WHAT #1754 ADDED — THE NAMING. `RegexTierLabels` is a second, REQUIRED parameter: the tier that resolved
// the preset is the one that names it, because the wire key is the bare word `preset` and the only preset
// name a CLIENT can reach is the viewer's own active one, which the rpg GM redirect makes wrong. It is a
// parameter rather than a source field so the turn path (`resolveHostTierRegexScripts`, which throws the
// listing away) never has to carry a name it does not render.

import type { CharacterRegexSlice, EffectiveRegexEntry, EffectiveRegexView, RegexTierGroupView, RegexTierKey, RegexTierRowView } from "@orb/contracts/chat";
import { characterRegexTierKey, isRegexEnabledInChat, isRegexTierAllowed } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { ChatMetadata } from "../contract/metadata.ts";
import type { HostTierRegexAllow, HostTierRegexSources, RegexTierLabels } from "../contract/regex.ts";

/** The room's REGEX LEVERS (#1742), lifted off the parsed metadata blob for the pure resolver below — which
 *  must not know what a chat row looks like. Both members pass through VERBATIM: the absent-⇒-allowed rule
 *  has one home (`@orb/contracts/chat`'s `isRegexEnabledInChat` / `isRegexTierAllowed`) and is applied by the
 *  resolver, never defaulted at the lift, where it would be a second copy of the rule.
 *
 *  It lives HERE and not beside the parser it reads: a lift whose only reader is the parse file is
 *  indistinguishable from dead parse weight, and the knob-wire gate says so out loud. The consumer owns it. */
export function regexAllowOf(metadata: ChatMetadata | undefined): HostTierRegexAllow {
  return { enabled: metadata?.regexEnabled, tiers: metadata?.regexTiers };
}

/** One tier's rows, before any allow/dedup decision — the shape the walk below is uniform over. */
interface TierSlice {
  readonly scope: RegexTierKey;
  readonly scripts: readonly RegexScriptRow[];
}

/** The four tiers as ONE ordered list, in RUN order. The character arm expands to one slice PER SEAT, in
 *  roster order, because each seat is its own tier (its own lever, its own allow flag, its own group). */
function tierSlices(sources: HostTierRegexSources): TierSlice[] {
  return [
    { scope: "global", scripts: sources.hostGlobal },
    { scope: "preset", scripts: sources.preset },
    ...sources.character.map((slice: CharacterRegexSlice): TierSlice => ({ scope: characterRegexTierKey(slice.characterId), scripts: slice.scripts })),
    { scope: "chat", scripts: sources.chat },
  ];
}

/**
 * THE ONE RESOLUTION. Walks the tiers in run order and answers both halves at once: the LISTING (every tier,
 * every row, including the ones this room switched off) and the EFFECTIVE run order (allow-filtered, deduped,
 * ranked). The two are computed together on purpose — a second pass would be a second definition of "runs
 * here", and the ranks in the listing are read straight off the effective half.
 *
 * The master (`allow.enabled === false`, i.e. `ChatMetadata.regexEnabled === false`) empties the effective
 * half entirely: every row still lists, every rank is null. `enabled` on the returned view is what the
 * section's kicker prints `off` for.
 */
export function resolveRegexTiers(sources: HostTierRegexSources, labels: RegexTierLabels): EffectiveRegexView {
  const enabled = isRegexEnabledInChat(sources.allow.enabled);
  const slices = tierSlices(sources);
  const effective: EffectiveRegexEntry[] = [];
  /** scriptId to the rank it earned AND the tier whose occurrence earned it. The tier is stored because a
   *  deduped script must draw its numeral at exactly ONE of the tiers that hold it — the earliest allowed
   *  one — and a bare `+1` chip at the others. */
  const claim = new Map<string, { readonly runsAt: number; readonly scope: RegexTierKey }>();

  // PASS 1 — the effective order. The allow drop is here, BEFORE the dedup (see the header): a disallowed
  // tier's rows never enter the claim map, so an allowed tier's copy of the same script still claims a rank.
  for (const slice of slices) {
    if (!(enabled && isRegexTierAllowed(sources.allow.tiers, slice.scope))) {
      continue;
    }
    for (const script of slice.scripts) {
      if (claim.has(script.id)) {
        continue;
      }
      const runsAt = effective.length + 1;
      claim.set(script.id, { runsAt, scope: slice.scope });
      effective.push({ scriptId: script.id, runsAt });
    }
  }

  // How many tiers of THIS room hold each row — the `+1` chip's input, and the fact a detach needs before it
  // decides whether to warn that the flip reaches beyond this chat.
  const tierCount = new Map<string, number>();
  for (const slice of slices) {
    for (const script of slice.scripts) {
      tierCount.set(script.id, (tierCount.get(script.id) ?? 0) + 1);
    }
  }

  // PASS 2 — the listing. Nothing is dropped; a row that did not earn a rank shows `null`.
  const tiers: RegexTierGroupView[] = slices.map(
    (slice): RegexTierGroupView => ({
      scope: slice.scope,
      allowed: isRegexTierAllowed(sources.allow.tiers, slice.scope),
      // THE NAME, only where the KEY does not already carry one (#1754). `global`/`chat` ARE their words and
      // `character:<id>` carries the seat, so the preset tier is the only arm a caller can name — and an
      // unresolved preset stays UNNAMED (the key is omitted, not set to a placeholder): the section prints
      // the bare `From the preset` rather than a name that might be the wrong preset's.
      ...(slice.scope === "preset" && labels.preset !== null ? { label: labels.preset } : {}),
      rows: slice.scripts.map((script, position): RegexTierRowView => {
        // A rank belongs to the occurrence that CLAIMED it: a deduped script draws its numeral at its
        // earliest allowed tier and a bare `+1` chip at the later one, never the same numeral twice.
        const claimed = claim.get(script.id);
        return {
          script,
          position,
          runsAt: claimed !== undefined && claimed.scope === slice.scope ? claimed.runsAt : null,
          attachedElsewhere: (tierCount.get(script.id) ?? 0) > 1,
        };
      }),
    }),
  );

  return { enabled, tiers, effective };
}

/** Resolve a chat's effective host-tier regex set as the TURN consumes it: the deduped, allow-filtered rows
 *  in run order. A thin projection of {@link resolveRegexTiers}'s effective half back onto the rows, so the
 *  turn and the room's Regex section can never disagree about what runs — one resolver, two readers.
 *  `executeRegexScripts` still does the enabled/placement/flag filtering. */
export function resolveHostTierRegexScripts(sources: HostTierRegexSources): RegexScriptRow[] {
  // THE ROW COMES FROM THE OCCURRENCE THAT CLAIMED THE RANK — the tier whose `runsAt` is non-null — not from
  // the first occurrence in source order. The two differ exactly when the earliest tier holding the script is
  // switched OFF: taking the first occurrence there would run the disallowed tier's copy of the row, which is
  // the "drop before dedup" rule leaking back in through the projection (caught by that pin, 2026-09-05).
  // The TURN names nothing — it consumes the effective half only, so it hands the resolver the one honest
  // label it has (`null` ⇒ unnamed) rather than a preset name it would never render (#1754).
  return resolveRegexTiers(sources, { preset: null })
    .tiers.flatMap((tier) => tier.rows.filter((row) => row.runsAt !== null))
    .sort((a, b) => (a.runsAt ?? 0) - (b.runsAt ?? 0))
    .map((row) => row.script);
}
