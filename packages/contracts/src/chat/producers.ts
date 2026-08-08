// @orb/contracts/chat/producers — the chat-read member-gated CAST producer (D137): ONE kind-discriminated
// entry per identity a chat references, so a client can DERIVE per-row `{{char}}`/`{{user}}`/`{{persona}}`
// names (`resolveRowMacros` via `buildCastNameContext`) + row attribution avatars (`resolveRowAttribution`
// via `buildCastAvatarMaps`). Rows stay id-only — this is the PRODUCER, never per-row denormalized names.
// Wire-serializable as an ARRAY (raw JSON, no superjson transformer here — a `Map` doesn't survive JSON).
//
// The D129 message-kind shape transposed: a closed kind tuple + a total policy record + total
// `Record`/`assertNever` dispatches at every consumer. Cast kind is STRUCTURAL — the row's stamp columns
// (`characterId` vs `personaId`) ARE the declaration — so there is deliberately NO stored column
// (derive-don't-stamp; contrast D129, where purpose was un-derivable from degradable stamps).
//
// The names-only law's MECHANISM is the projection types, not the wire envelope: `buildCastNameContext`'s
// outputs are the KIT's avatar-free entry types (`RowCharacterName`/`RowPersonaName`), so the macro engine
// remains structurally unable to see chrome; `buildCastAvatarMaps` is the ONLY chrome carrier.

import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";

/** The closed cast-kind axis. `agent` is the D60 one-arm add: adding it REDS the policy record, both
 *  projections' `assertNever` tails, the loader's per-kind source table and `castKey` — the five decision
 *  sites, found by the compiler (§3.7 of the design; the planted-control receipt lives in the build report). */
export const CAST_KINDS = ["character", "persona"] as const;
export type CastKind = (typeof CAST_KINDS)[number];

/** One character the chat references — name + portrait floor. NO description: a card's description is not
 *  member-consented; the member-visible card surface is `ParticipantView`, and it agrees (design §3.6 —
 *  fail-closed; an additive field behind its own D-entry if a surface ever earns it). The portrait floor
 *  exists because a message's speaker CAN leave the room while its historical rows stay in the transcript:
 *  once removed there is no `ParticipantView` to carry `avatarHash`, so the assistant-row avatar would
 *  degrade to bare initials without this participant-independent entry. */
export interface CastCharacterEntry {
  readonly kind: "character";
  readonly id: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
}

/** One persona the chat references — D122's consented presentation surface (name, description) + the
 *  avatar hash the transcript already renders. `description` backs the row `{{persona}}` macro (distinct
 *  from `{{user}}`, which resolves to `name`). */
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
