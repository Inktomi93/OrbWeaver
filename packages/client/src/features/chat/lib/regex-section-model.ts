// The room's Regex section — its PURE projection of `chat.listEffectiveRegex`
// (`docs/design/mocks/regex-section/DESIGN.md` §3, owner-approved 2026-09-05, #1742).
//
// THE CLIENT NEVER RE-UNIONS AND NEVER RE-RANKS (`DESIGN.md` §7.1). The read already answers both halves —
// the per-tier LISTING (including the tiers this room switched off) and the EFFECTIVE run order — so
// everything here is a question about WHERE TO DRAW a row the server already decided, never about whether
// it runs. `runsAt` is copied, never computed.
//
// WHAT THE READ DOES NOT DECIDE, and why it lands here: the wire LISTS a script in EVERY tier that holds
// it (`domain/chat/substrate/regex-tier.ts` pass 2), while the section draws it ONCE — "a script attached in
// two tiers appears once, at its earliest tier, with a `+1` chip naming the other" (§3, the dedup row). That
// is a rendering rule over the wire's own listing, so it is a pure function over `tiers[]` and it is tested
// as one.
//
// THE HOME IS THE CLAIMING TIER, NOT THE FIRST ONE, and the difference is exactly the drop-before-dedup case
// the resolver exists for: with the earliest tier switched OFF, the row still RUNS from a later allowed tier
// (that tier's occurrence carries the rank). Drawing it at the earliest listing tier there would print `—`
// on a script that is running — the numeral would be a lie in the one state the section is built to debug.
// So: the occurrence that earned the rank wins, and only when NOTHING claimed a rank (the master is off, or
// every holding tier is off, or the library row is disabled) does the earliest listing tier draw it.

import type { RegexTierGroupView, RegexTierKey, RegexTierRowView } from "@orb/contracts/chat";
import { parseCharacterRegexTierKey } from "@orb/contracts/chat";
import type { CharacterId, RegexScriptId } from "@orb/kit/ids";

/** WHERE each script draws — scriptId → the tier key whose group renders its row. The map is built once per
 *  read and consulted by every group, so the dedup decision is made in ONE pass over the whole listing
 *  rather than per group (a per-group "is there an earlier one" scan would be the same rule spelled N times,
 *  and the claiming-tier arm would be unrepresentable). */
export function regexRowHomes(tiers: readonly RegexTierGroupView[]): ReadonlyMap<RegexScriptId, RegexTierKey> {
  const homes = new Map<RegexScriptId, RegexTierKey>();
  // A script claims a rank at most ONCE (the resolver's dedup), so a claiming occurrence may overwrite an
  // earlier unclaimed home and can never be overwritten itself: every later occurrence of that id is
  // rankless and finds the map already holding it.
  const claimed = new Set<RegexScriptId>();
  for (const tier of tiers) {
    for (const row of tier.rows) {
      if (row.runsAt !== null) {
        homes.set(row.script.id, tier.scope);
        claimed.add(row.script.id);
      } else if (!(claimed.has(row.script.id) || homes.has(row.script.id))) {
        homes.set(row.script.id, tier.scope);
      }
    }
  }
  return homes;
}

/** The rows ONE tier group draws — its own rows minus the ones another tier is home to. */
export function regexTierRows(tier: RegexTierGroupView, homes: ReadonlyMap<RegexScriptId, RegexTierKey>): readonly RegexTierRowView[] {
  return tier.rows.filter((row) => homes.get(row.script.id) === tier.scope);
}

/** The OTHER tiers of this room that hold the same script — the `+N` chip's count and its naming. Derived
 *  from `tiers[]` rather than from the row's `attachedElsewhere` boolean because the chip has to SAY which
 *  tiers ("+1 · From Bo", and `+2` when three tiers hold it — §7.5); the boolean stays what it is for:
 *  deciding whether a library flip reaches beyond this chat and therefore owes a toast. */
export function regexRowAlsoAt(tiers: readonly RegexTierGroupView[], scriptId: RegexScriptId, home: RegexTierKey): readonly RegexTierKey[] {
  return tiers.filter((tier) => tier.scope !== home && tier.rows.some((row) => row.script.id === scriptId)).map((tier) => tier.scope);
}

/** How many of a tier's drawn rows are RUNNING here — the group kicker's post-dedup count. Zero for a tier
 *  the room switched off, which is why the group also says `off here` (a bare `0` would read as empty). */
export function regexTierInForceCount(rows: readonly RegexTierRowView[]): number {
  return rows.filter((row) => row.runsAt !== null).length;
}

/** How many of a tier's drawn rows are ENABLED IN THE LIBRARY — the LEVER's count, which deliberately
 *  ignores the lever's own state: a switch labelled "Preset · 0" would tell a host that turning it back on
 *  buys nothing, when the tier holds three live scripts. The canvas draws it exactly this way
 *  (`build.mjs`: `S.filter((s) => s.tier === t.id && s.on).length`, computed outside `tierOn`). */
export function regexTierLeverCount(rows: readonly RegexTierRowView[]): number {
  return rows.filter((row) => row.script.enabled).length;
}

/** ONE seat's name, for the three tier labels below. Absent only if a seat left the room between the two
 *  reads; naming it honestly beats printing a raw id (R10 — no surface ever shows one). */
function characterLabel(scope: RegexTierKey, names: ReadonlyMap<CharacterId, string>): string {
  const characterId = parseCharacterRegexTierKey(scope);
  return (characterId === null ? undefined : names.get(characterId)) ?? "a character";
}

/**
 * The LEVER's label — the switch in the strip (`DESIGN.md` §3: `Everywhere` · `Preset · <name>` ·
 * `<character name>` · `This chat`).
 *
 * THE PRESET LEVER CARRIES NO NAME on this build, and that is a refusal rather than an omission: the wire
 * says `preset` and nothing else, and the only client-side way to a name is the viewer's own active preset
 * (`chat-context-band.tsx`'s chip) — which is NOT necessarily the preset this room's turn assembles (the rpg
 * GM redirect resolves a different one, `verbs/read.ts::resolvePreviewInputs`). A section whose whole job is
 * telling a host what runs here must not name the wrong preset; it says `Preset` until the read carries the
 * label. `Everywhere` / `This chat` are the Documents rack's own scope words in the same pane (§4).
 */
export function regexTierLever(scope: RegexTierKey, names: ReadonlyMap<CharacterId, string>): string {
  switch (scope) {
    case "global":
      return "Everywhere";
    case "preset":
      return "Preset";
    case "chat":
      return "This chat";
    default:
      return characterLabel(scope, names);
  }
}

/** The GROUP kicker — the same tier said as a provenance heading (§3's run-order groups). */
export function regexTierKicker(scope: RegexTierKey, names: ReadonlyMap<CharacterId, string>): string {
  switch (scope) {
    case "global":
      return "Everywhere";
    case "preset":
      return "From the preset";
    case "chat":
      return "This chat";
    default:
      return `From ${characterLabel(scope, names)}`;
  }
}

/** The group's one-line provenance — where these rows CAME FROM, which is what tells a host why a script
 *  they never attached here is running (§3). */
export function regexTierProvenance(scope: RegexTierKey, names: ReadonlyMap<CharacterId, string>): string {
  switch (scope) {
    case "global":
      return "Your global scripts.";
    case "preset":
      return "Came with the preset.";
    case "chat":
      return "Attached here. Drag to reorder.";
    default:
      return `Came with ${characterLabel(scope, names)}’s card.`;
  }
}
