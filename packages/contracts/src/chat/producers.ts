// @orb/contracts/chat/producers — the chat-read member-gated id→name / id→avatar producer maps, so a client
// can DERIVE per-row `{{char}}`/`{{user}}`/`{{persona}}` names (`resolveRowMacros`) + row attribution avatars
// (`resolveRowAttribution`). Rows stay id-only — these are the PRODUCERS, never per-row denormalized names.
// Wire-serializable as ARRAYS (raw JSON, no superjson transformer here — a `Map` doesn't survive JSON).

import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CHAT MACRO NAME PRODUCER — a chat read's member-gated id→name maps, so a client can DERIVE per-row
// `{{char}}`/`{{user}}`/`{{persona}}` names via `resolveRowMacros`. Rows stay id-only — this is the
// PRODUCER, never a per-row denormalized name. Wire-serializable as ARRAYS (raw JSON, no superjson
// transformer here — a `Map` doesn't survive a JSON round-trip).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** One character name entry (§1) — the array form of a `characterNamesById` producer map. */
export interface CharacterNameEntry {
  readonly id: CharacterId;
  readonly name: string;
}

/** One persona name entry (§1) — the array form of a `personaNamesById` producer map. `description`
 *  backs the row `{{persona}}` macro (distinct from `{{user}}`, which resolves to `name`). */
export interface PersonaNameEntry {
  readonly id: PersonaId;
  readonly name: string;
  readonly description: string;
}

/** Rebuild the `characterNamesById` lookup `resolveRowMacros` takes, from the wire array. Pure;
 *  last-write-wins on a duplicate id. */
export function buildCharacterNameMap(entries: readonly CharacterNameEntry[]): ReadonlyMap<CharacterId, RowCharacterName> {
  return new Map(entries.map((e) => [e.id, { name: e.name }]));
}

/** Rebuild the `personaNamesById` lookup `resolveRowMacros` takes, from the wire array. */
export function buildPersonaNameMap(entries: readonly PersonaNameEntry[]): ReadonlyMap<PersonaId, RowPersonaName> {
  return new Map(entries.map((e) => [e.id, { name: e.name, description: e.description }]));
}

/** The producer a chat read returns (§1) — `personaNamesById`/`characterNamesById` scoped to ONE chat,
 *  covering every id the chat references (participants' personas/characters AND any `personaId`/
 *  `characterId` a stored message carries, incl. since-switched personas). Member-gated: any chat member
 *  may read this (see the header note — names only, not a permission-spine change). */
export interface ChatMacroNameProducer {
  readonly characterNames: readonly CharacterNameEntry[];
  readonly personaNames: readonly PersonaNameEntry[];
}

/** One persona AVATAR entry — the array form of a `personaAvatarsById` producer map, SAME coverage
 *  algorithm as {@link ChatMacroNameProducer}'s `personaNames` (every participant's active persona UNION
 *  every stored message row's `personaId` stamp) but a DELIBERATELY SEPARATE type: the macro-name
 *  producer (`RowPersonaName`, `@orb/kit/macro`) is "names only, never the full entity" (chat-macro-
 *  resolution §1) — avatar chrome is a display concern the macro engine must never carry. Fed to
 *  `resolveRowAttribution`'s USER-row path (`features/chat/lib/attribution.ts`), never to
 *  `resolveRowMacros`. */
export interface PersonaAvatarEntry {
  readonly id: PersonaId;
  readonly avatarHash: string | null;
}

/** Rebuild the `personaAvatarsById` lookup `resolveRowAttribution` takes, from the wire array. Pure;
 *  last-write-wins on a duplicate id (mirrors {@link buildPersonaNameMap}). */
export function buildPersonaAvatarMap(entries: readonly PersonaAvatarEntry[]): ReadonlyMap<PersonaId, string | null> {
  return new Map(entries.map((e) => [e.id, e.avatarHash]));
}

/** One character AVATAR entry — the array form of a `characterAvatarsById` producer map, the assistant-
 *  row twin of {@link PersonaAvatarEntry}. SAME coverage algorithm as {@link ChatMacroNameProducer}'s
 *  `characterNames` (every participant's characterId UNION every stored message row's `characterId`
 *  stamp), and — like `personaAvatars` — a DELIBERATELY SEPARATE type from the names-only macro producer.
 *  It exists because a message's speaker CAN leave the room while its historical rows stay in the
 *  transcript: once removed there is no `ParticipantView` to carry `avatarHash`, so the assistant-row
 *  avatar would degrade to bare initials without this participant-independent portrait floor. Fed to
 *  `resolveRowAttribution`'s ASSISTANT-row path as the fallback when the live participant is absent. */
export interface CharacterAvatarEntry {
  readonly id: CharacterId;
  readonly avatarHash: string | null;
}

/** Rebuild the `characterAvatarsById` lookup `resolveRowAttribution` takes, from the wire array. Pure;
 *  last-write-wins on a duplicate id (mirrors {@link buildPersonaAvatarMap}). */
export function buildCharacterAvatarMap(entries: readonly CharacterAvatarEntry[]): ReadonlyMap<CharacterId, string | null> {
  return new Map(entries.map((e) => [e.id, e.avatarHash]));
}
