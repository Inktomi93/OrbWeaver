// @orb/contracts/chat/producers — the chat-read member-gated id→name / id→avatar producer maps, so a client
// can DERIVE per-row `{{char}}`/`{{user}}`/`{{persona}}` names (`resolveRowMacros`) + row attribution avatars
// (`resolveRowAttribution`). Rows stay id-only — these are the PRODUCERS, never per-row denormalized names.
// Wire-serializable as ARRAYS (raw JSON, no superjson transformer here — a `Map` doesn't survive JSON).

import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE KIND-POLYMORPHIC CAST (D137) — ONE kind-discriminated entry per identity a chat references, over the
// active ∪ stamped coverage (`domain/chat/persistence/cast.ts`), replacing the per-kind entry-type/builder
// matrix. The D129 message-kind shape transposed: a closed kind tuple + a total policy record + total
// `Record`/`assertNever` dispatches at every consumer. Cast kind is STRUCTURAL — the row's stamp columns
// (`characterId` vs `personaId`) ARE the declaration — so there is deliberately NO stored column
// (derive-don't-stamp; contrast D129, where purpose was un-derivable from degradable stamps).
//
// The names-only law's MECHANISM is the projection types, not the wire envelope: `buildCastNameContext`'s
// outputs are the KIT's avatar-free entry types (`RowCharacterName`/`RowPersonaName`), so the macro engine
// remains structurally unable to see chrome; `buildCastAvatarMaps` is the ONLY chrome carrier.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** The closed cast-kind axis. `agent` is the D60 one-arm add: adding it REDS the policy record, both
 *  projections' `assertNever` tails, the loader's per-kind source table and `castKey` — the five decision
 *  sites, found by the compiler (§3.7 of the design; the planted-control receipt lives in the build report). */
export const CAST_KINDS = ["character", "persona"] as const;
export type CastKind = (typeof CAST_KINDS)[number];

/** One character the chat references — name + portrait floor. NO description: a card's description is not
 *  member-consented; the member-visible card surface is `ParticipantView`, and it agrees (design §3.6 —
 *  fail-closed; an additive field behind its own D-entry if a surface ever earns it). */
export interface CastCharacterEntry {
  readonly kind: "character";
  readonly id: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
}

/** One persona the chat references — D122's consented presentation surface (name, description) + the
 *  avatar hash the transcript already renders. */
export interface CastPersonaEntry {
  readonly kind: "persona";
  readonly id: PersonaId;
  readonly name: string;
  readonly description: string;
  readonly avatarHash: string | null;
}

/** The per-arm payload difference (persona carries `description`, character does not) is the policy
 *  difference DECLARED IN THE TYPE, exactly as `MESSAGE_KIND_POLICY` rows differ per kind. */
export type CastEntry = CastCharacterEntry | CastPersonaEntry;

/** ONE cast kind's cross-consumer policy. Rule for future fields (the D129 idiom): a policy field joins
 *  only WITH its reader — a verdict nobody consumes is decoration. */
export interface CastKindPolicy {
  /** Which macro-subject family this kind's name backs — enacted by {@link buildCastNameContext}'s routing
   *  (its policy↔projection agreement is pinned in `tests/contracts/chat/producers.contract.test.ts`):
   *  `char-subject` → `characterNamesById` (`{{char}}`); `user-subject` → `personaNamesById`
   *  (`{{user}}`/`{{persona}}`). */
  readonly macro: "char-subject" | "user-subject";
  /** Whether a live `ParticipantView.avatarHash` outranks the cast entry's — read by
   *  `resolveRowAttribution`'s per-kind avatar precedence (`features/chat/lib/attribution.ts`): a live
   *  participant can carry a per-chat override (`participant-first`); a persona has no participant avatar
   *  plane (`cast-only`). */
  readonly avatar: "participant-first" | "cast-only";
}

/** The shipped cells. The `Record<CastKind, …>` is the compile-force: a third kind will not build until it
 *  declares its row (the agent wave's explicit macro-subject + avatar-precedence decisions). */
export const CAST_KIND_POLICY: Readonly<Record<CastKind, CastKindPolicy>> = {
  character: { macro: "char-subject", avatar: "participant-first" },
  persona: { macro: "user-subject", avatar: "cast-only" },
};

/** The stable string key — deliberately EXTENDS `speakerKey`'s namespace (`participants.ts`: `c:`; `u:`
 *  reserved for agent) so the two key spaces can never collide. The detail ∪ pages last-write-wins merge
 *  key. */
export function castKey(entry: CastEntry): string {
  switch (entry.kind) {
    case "character":
      return `c:${entry.id}`;
    case "persona":
      return `p:${entry.id}`;
    default:
      return assertNeverCastEntry(entry);
  }
}

function assertNeverCastEntry(entry: never): never {
  throw new Error(`cast: unhandled CastEntry kind ${JSON.stringify(entry)}`);
}

/** The names(+persona description) ONLY projection — the macro-law arm. Output types are the KIT types
 *  (`RowCharacterName`/`RowPersonaName`), which have no avatar field: the macro engine remains structurally
 *  unable to see chrome. Total over `CastEntry["kind"]` (`assertNever` tail); the routing enacts
 *  {@link CAST_KIND_POLICY}'s `macro` column (char-subject → character map, user-subject → persona map).
 *  Pure; last-write-wins on a duplicate id (the detail ∪ pages merge contract). */
export function buildCastNameContext(entries: readonly CastEntry[]): {
  characterNamesById: ReadonlyMap<CharacterId, RowCharacterName>;
  personaNamesById: ReadonlyMap<PersonaId, RowPersonaName>;
} {
  const characterNamesById = new Map<CharacterId, RowCharacterName>();
  const personaNamesById = new Map<PersonaId, RowPersonaName>();
  for (const entry of entries) {
    projectNameEntry(entry, characterNamesById, personaNamesById);
  }
  return { characterNamesById, personaNamesById };
}

function projectNameEntry(entry: CastEntry, characterNamesById: Map<CharacterId, RowCharacterName>, personaNamesById: Map<PersonaId, RowPersonaName>): void {
  switch (entry.kind) {
    case "character":
      characterNamesById.set(entry.id, { name: entry.name });
      break;
    case "persona":
      personaNamesById.set(entry.id, { name: entry.name, description: entry.description });
      break;
    default:
      assertNeverCastEntry(entry);
  }
}

/** The chrome projection — the avatar maps `resolveRowAttribution` takes. Same totality + merge contract
 *  as {@link buildCastNameContext}; a `null` hash stays an ENTRY (the renderer's initials fallback keys off
 *  the null, never off absence). */
export function buildCastAvatarMaps(entries: readonly CastEntry[]): {
  characterAvatarsById: ReadonlyMap<CharacterId, string | null>;
  personaAvatarsById: ReadonlyMap<PersonaId, string | null>;
} {
  const characterAvatarsById = new Map<CharacterId, string | null>();
  const personaAvatarsById = new Map<PersonaId, string | null>();
  for (const entry of entries) {
    projectAvatarEntry(entry, characterAvatarsById, personaAvatarsById);
  }
  return { characterAvatarsById, personaAvatarsById };
}

function projectAvatarEntry(entry: CastEntry, characterAvatarsById: Map<CharacterId, string | null>, personaAvatarsById: Map<PersonaId, string | null>): void {
  switch (entry.kind) {
    case "character":
      characterAvatarsById.set(entry.id, entry.avatarHash);
      break;
    case "persona":
      personaAvatarsById.set(entry.id, entry.avatarHash);
      break;
    default:
      assertNeverCastEntry(entry);
  }
}

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
