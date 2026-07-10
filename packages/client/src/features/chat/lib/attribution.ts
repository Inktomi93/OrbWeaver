// Per-row attribution resolution (#21, §12.4 attribution rules) — a PURE function so it's unit
// testable without mounting `<MessageRow>`. NEVER parses attribution from body text:
//
//  - ASSISTANT rows resolve the server-stamped `characterId` against the roster: the NAME comes from
//    the per-chat macro-name PRODUCER (`characterNamesById`, Chat-Macro-Resolution.md §1 — the SAME
//    map `resolveRowMacros`'s `{{char}}` reads for this row, so badge and macro agree by construction);
//    avatar + the per-speaker color token are separate roster CHROME (`participants`, multi-character
//    rooms only — the producer carries names only, never avatars). A null `characterId` in a
//    multi-character room is a neutral "Narrator" — never `participants[0]` (that would silently
//    misattribute a merged/narrator turn to whichever character happens to be first in the map).
//  - USER rows resolve `message.personaId` (the correct historical author across a mid-chat persona
//    switch) against the SAME producer's `personaNamesById`, falling back to `activePersonaId` (the
//    viewing participant's CURRENT persona, §4) for legacy rows with a null `personaId`. When NO persona
//    resolves (none selected — the DB may hold none, personas are user-authored + never seeded) the row
//    still labels as "You" (the viewer's own message is always self-attributable — `DEFAULT_USER_ATTRIBUTION`),
//    never bare. This chrome is DISTINCT from the `{{user}}` MACRO, which floors to "User" generically
//    through the kit engine. The avatar IMAGE comes from `personaAvatarsById` — a SEPARATE producer from
//    `personaNamesById` (Chat-Macro-Resolution.md §1: names-only, never denormalized with display fields;
//    `@orb/contracts/chat` `PersonaAvatarEntry`/`buildPersonaAvatarMap`, #67) — the initials fallback
//    stands in only when that producer has no hash for the resolved persona.
//  - SYSTEM rows and an ASSISTANT id that doesn't resolve in the supplied roster render NO attribution
//    chrome (the solo-chat default when no character producer is threaded — `participants`/
//    `characterNamesById` degrade gracefully to "nothing resolves"). USER rows never go bare (above).

import type { ParticipantView } from "@orb/contracts/chat";
import type { AssetId, CharacterId, PersonaId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { colorForCharacter } from "./speaker-color";

export interface RowAttribution {
  /** `null` = render no attribution chrome. */
  readonly name: string | null;
  /** §A.8 KIND-READY: which SIDE of the two-kind cast this row's identity resolved from — `null` only
   *  alongside `name === null` (no attribution at all). A per-message identity is a single kind-tagged
   *  resolved value so the coming D60 `agent` kind is a one-arm add to this union, not a rework of the
   *  row/attribution seam. Consumers stamp it as `data-*` (never branch JSX on it) — e.g. a Phase-4
   *  immersive skin selecting `[data-kind="character"]` to bleed only the CHARACTER's portrait, never
   *  the user's own (§B.2). File-local union (not `export type`, no-inline-types §7.4 — a client
   *  feature's `lib/` isn't a type home); consumers read it via `RowAttribution["kind"]`. */
  readonly kind: "character" | "persona" | null;
  readonly avatarAssetId: AssetId | null;
  /** The avatar's CAS hash (`blobUrl(avatarHash)` is the renderable `<img src>`) — `null` renders the
   *  initials fallback. Character rows: `ParticipantView.avatarHash` (roster-scoped). User/persona rows:
   *  `personaAvatarsById` (a producer separate from `avatarAssetId`'s SOURCE — see the file header). */
  readonly avatarHash: string | null;
  /** The STABLE per-entity seed for the deterministic fallback hue (`@orb/ui/avatar` `avatarFallbackHue`)
   *  — the SAME id the library card / chat header seed with (a character's `characterId`, a persona's
   *  `personaId`), so a given entity resolves to ONE color everywhere it appears: the icon-left chip, and
   *  the immersive Echo/Whisper fallback tile that IS the mode's art source when the entity has no image
   *  (owner ruling 2026-07-09, `FINAL-Persona-and-Immersive-Chat-Visuals.md` — the fallback tile is a
   *  first-class avatar). Never the name (names collide + aren't stable); a stable literal for the two
   *  id-less identities (Narrator / self-as-"You"). */
  readonly hueSeed: string;
  /** The per-speaker theme tokens for the row's bubble (`null` for user rows and unresolved rows — the
   *  per-role bubble token carries the identity there). Layer 3: the character's AUTHORED `themeOverride`
   *  when set (unset fields inherit the global scope via CSS cascade — `<ThemeScope>` only emits present
   *  fields), else the deterministic hash tint (`colorForCharacter`) so distinct speakers still read apart
   *  before anyone authors a theme. */
  readonly tokens: ThemeScopeTokens | null;
}

const NO_ATTRIBUTION: RowAttribution = {
  name: null,
  kind: null,
  avatarAssetId: null,
  avatarHash: null,
  hueSeed: "",
  tokens: null,
};
/** A null `characterId` in a multi-character room — a real, neutral identity, not "unknown". Still the
 *  CHARACTER side of the two-kind cast (an assistant-side turn, just not tied to one roster member). */
const NARRATOR_ATTRIBUTION: RowAttribution = {
  name: "Narrator",
  kind: "character",
  avatarAssetId: null,
  avatarHash: null,
  hueSeed: "narrator",
  tokens: null,
};
/** The viewer's OWN row when no persona is selected (the DB may genuinely hold none — personas are
 *  user-authored, never seeded). A user message is always self-attributable, so it labels as "You"
 *  (+ its initials-fallback avatar) rather than rendering bare — distinct from the `{{user}}` MACRO,
 *  which is a generic macro that floors to "User" through the kit engine (not this chrome). */
const DEFAULT_USER_ATTRIBUTION: RowAttribution = {
  name: "You",
  kind: "persona",
  avatarAssetId: null,
  avatarHash: null,
  hueSeed: "you",
  tokens: null,
};

export interface ResolveRowAttributionInput {
  readonly role: MessageRole;
  readonly characterId: CharacterId | null;
  readonly personaId: PersonaId | null;
  /** The roster, keyed by id — threaded from the surface. Absent/empty in a solo chat. Supplies
   *  assistant-row AVATAR/COLOR chrome + the solo/multi-character count; the NAME comes from
   *  `characterNamesById` below. */
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  /** The per-chat macro-name producer (Chat-Macro-Resolution.md §1) — the ONE source for both this
   *  badge's name and the row's `{{char}}`/`{{user}}` macro subject. */
  readonly characterNamesById?: ReadonlyMap<CharacterId, RowCharacterName> | undefined;
  readonly personaNamesById?: ReadonlyMap<PersonaId, RowPersonaName> | undefined;
  /** The persona AVATAR-chrome producer (`@orb/contracts/chat` `buildPersonaAvatarMap`) — SEPARATE from
   *  `personaNamesById` (names-only, §1). Supplies the USER-row avatar image. */
  readonly personaAvatarsById?: ReadonlyMap<PersonaId, string | null> | undefined;
  /** The viewing participant's currently active persona — the fallback for legacy rows with a null
   *  `personaId` (Chat-Macro-Resolution.md §4; never the chat's `anchorPersonaId` pin). */
  readonly activePersonaId?: PersonaId | null | undefined;
}

/** Resolve one row's name/avatar/color, never from body text — always from the server-stamped id(s). */
export function resolveRowAttribution(input: ResolveRowAttributionInput): RowAttribution {
  if (input.role === "user") {
    return resolveUserAttribution(input);
  }
  if (input.role === "assistant") {
    return resolveAssistantAttribution(input);
  }
  return NO_ATTRIBUTION;
}

function resolveUserAttribution(input: ResolveRowAttributionInput): RowAttribution {
  const personaId = input.personaId ?? input.activePersonaId ?? null;
  const persona = personaId === null ? undefined : input.personaNamesById?.get(personaId);
  if (persona === undefined) {
    return DEFAULT_USER_ATTRIBUTION; // no persona selected → the viewer's own row still labels ("You")
  }
  const avatarHash =
    (personaId === null ? undefined : input.personaAvatarsById?.get(personaId)) ?? null;
  return {
    name: persona.name,
    kind: "persona",
    avatarAssetId: null,
    avatarHash,
    // `personaId` is non-null here (a resolved persona was found for it); seed the hue off it so this
    // human's fallback color matches their persona-panel/list-row chip.
    hueSeed: personaId ?? "you",
    tokens: null,
  };
}

function resolveAssistantAttribution(input: ResolveRowAttributionInput): RowAttribution {
  if (input.characterId === null) {
    return isMultiCharacterRoom(input.participants) ? NARRATOR_ATTRIBUTION : NO_ATTRIBUTION;
  }
  const name = input.characterNamesById?.get(input.characterId)?.name;
  if (name === undefined) {
    return NO_ATTRIBUTION;
  }
  const participant = input.participants?.get(input.characterId);
  // Layer 3 — the character's authored theme override wins (its unset fields fall through to the global
  // scope by cascade); the hash tint is the fallback for a character with no override.
  const tokens = participant?.themeOverride ?? colorForCharacter(input.characterId);
  return {
    name,
    kind: "character",
    avatarAssetId: participant?.avatarAssetId ?? null,
    avatarHash: participant?.avatarHash ?? null,
    // Seed the fallback hue off the stamped `characterId` (the SAME seed the character-library card + the
    // chat header use) so a character with no avatar reads the same color in the row chip AND the
    // immersive Echo/Whisper art tile — never the pre-fix constant bucket (hashed `alt=""`, chart-2).
    hueSeed: input.characterId,
    tokens,
  };
}

function isMultiCharacterRoom(
  participants: ReadonlyMap<CharacterId, ParticipantView> | undefined,
): boolean {
  if (participants === undefined) {
    return false;
  }
  const MultiCharacterFloor = 1;
  let characterCount = 0;
  for (const participant of participants.values()) {
    if (participant.kind === "character") {
      characterCount += 1;
      if (characterCount > MultiCharacterFloor) {
        return true;
      }
    }
  }
  return false;
}

/** Layer 2 — the sole-character CHROME takeover (D44 §12.1). In a TRUE-SOLO room (exactly one human AND
 *  one character, no other seat) the character's authored `themeOverride` takes over the chat-root chrome
 *  so the palette becomes "chatting with X". Any other composition — a second human/observer (each has
 *  their OWN global theme we must not override), an agent, or a second character (a group) — returns
 *  `undefined`, and the chrome falls back to the viewer's own Layer-1 theme. Derived purely from roster
 *  COMPOSITION (count by kind), never an `isGroup` branch (D16 / gate `no-if-is-group`). NB: this gates
 *  ONLY the chrome takeover — per-speaker MESSAGE theming (Layer 3) stays on in every room. */
const SOLO_COUNT = 1;
const TRUE_SOLO_SEATS = 2; // exactly [one human, one character] — nothing else in the room
export function resolveRoomTheme(
  participants: readonly ParticipantView[] | undefined,
): ThemeScopeTokens | undefined {
  if (participants === undefined) {
    return;
  }
  let humanCount = 0;
  let characterCount = 0;
  let soleCharacterOverride: ThemeScopeTokens | undefined;
  for (const participant of participants) {
    if (participant.kind === "human") {
      humanCount += 1;
    } else if (participant.kind === "character") {
      characterCount += 1;
      soleCharacterOverride = participant.themeOverride ?? undefined;
    }
  }
  const trueSolo =
    humanCount === SOLO_COUNT &&
    characterCount === SOLO_COUNT &&
    participants.length === TRUE_SOLO_SEATS;
  return trueSolo ? soleCharacterOverride : undefined;
}

/** Layer 3 for the merged-narrator `<speaker>`-split path (§12.4): a NAME → the character's authored
 *  `themeOverride`, built from the roster. The span renderer looks a speaker's override up by the marker
 *  name (falling back to the hash tint when absent), so each character's spans inside one merged bubble
 *  carry their own authored palette. Only characters WITH an override are included (others fall through). */
export function speakerThemesByName(
  participants: ReadonlyMap<CharacterId, ParticipantView> | undefined,
): ReadonlyMap<string, ThemeScopeTokens> {
  const byName = new Map<string, ThemeScopeTokens>();
  if (participants === undefined) {
    return byName;
  }
  for (const participant of participants.values()) {
    const override = participant.themeOverride;
    if (participant.kind === "character" && override !== null && override !== undefined) {
      byName.set(participant.displayName, override);
    }
  }
  return byName;
}

const INITIALS_FALLBACK = "?";
const WHITESPACE = /\s+/u;

/** A short (≤2-char) initials fallback for the avatar's un-imaged state — derives from the first
 *  letter of up to the first two whitespace-separated words. Pure display formatting, not identity. */
export function initialsForAttribution(name: string): string {
  const words = name
    .trim()
    .split(WHITESPACE)
    .filter((word) => word.length > 0);
  const first = words[0]?.charAt(0) ?? "";
  const second = words[1]?.charAt(0) ?? "";
  const initials = `${first}${second}`.toUpperCase();
  return initials.length > 0 ? initials : INITIALS_FALLBACK;
}
