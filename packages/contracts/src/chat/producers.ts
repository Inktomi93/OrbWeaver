// @orb/contracts/chat/producers — the chat-read member-gated CHAT IDENTITY producer (D137): ONE kind-discriminated
// entry per identity a chat references, so a client can DERIVE per-row `{{char}}`/`{{user}}`/`{{persona}}`
// names (`resolveRowMacros` via `buildIdentityNameContext`) + row attribution avatars (`resolveRowAttribution`
// via `buildIdentityAvatarMaps`). Rows stay id-only — this is the PRODUCER, never per-row denormalized names.
// Wire-serializable as an ARRAY (raw JSON, no superjson transformer here — a `Map` doesn't survive JSON).
//
// The D129 message-kind shape transposed: a closed kind tuple + a total policy record + total
// `Record`/`assertNever` dispatches at every consumer. Chat-identity kind is STRUCTURAL — the row's stamp columns
// (`characterId` vs `personaId`) ARE the declaration — so there is deliberately NO stored column
// (derive-don't-stamp; contrast D129, where purpose was un-derivable from degradable stamps).
//
// The names-only law's MECHANISM is the projection types, not the wire envelope: `buildIdentityNameContext`'s
// outputs are the KIT's avatar-free entry types (`RowCharacterName`/`RowPersonaName`), so the macro engine
// remains structurally unable to see chrome; `buildIdentityAvatarMaps` is the ONLY chrome carrier.

import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { z } from "zod";

/** The closed chat-identity-kind axis. `agent` is the D60 one-arm add: adding it REDS the policy record, both
 *  projections' `assertNever` tails, the loader's per-kind source table and `identityKey` — the five decision
 *  sites, found by the compiler (§3.7 of the design; the planted-control receipt lives in the build report). */
export const CHAT_IDENTITY_KINDS = ["character", "persona"] as const;
export type ChatIdentityKind = (typeof CHAT_IDENTITY_KINDS)[number];

/** One character the chat references — name + portrait floor. NO description: a card's description is not
 *  member-consented; the member-visible card surface is `ParticipantView`, and it agrees (design §3.6 —
 *  fail-closed; an additive field behind its own D-entry if a surface ever earns it). The portrait floor
 *  exists because a message's speaker CAN leave the room while its historical rows stay in the transcript:
 *  once removed there is no `ParticipantView` to carry `avatarHash`, so the assistant-row avatar would
 *  degrade to bare initials without this participant-independent entry. */
export interface ChatCharacterIdentity {
  readonly kind: "character";
  readonly id: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
}

/** One persona the chat references — D122's consented presentation surface (name, description) + the
 *  avatar hash the transcript already renders. `description` backs the row `{{persona}}` macro (distinct
 *  from `{{user}}`, which resolves to `name`). */
export interface ChatPersonaIdentity {
  readonly kind: "persona";
  readonly id: PersonaId;
  readonly name: string;
  readonly description: string;
  readonly avatarHash: string | null;
}

/** The per-arm payload difference (persona carries `description`, character does not) is the policy
 *  difference DECLARED IN THE TYPE, exactly as `MESSAGE_KIND_POLICY` rows differ per kind. */
export type ChatIdentity = ChatCharacterIdentity | ChatPersonaIdentity;

/** The strict runtime twin of {@link ChatIdentity}, a nested member of the `ChatDetail` output parser. Each arm
 *  is strict, so the per-arm policy difference is enforced at runtime too: a character entry carrying a
 *  `description` (a card's text is not member-consented) fails the parse. */
export const chatIdentitySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("character"),
    id: typeIdSchema(ID_PREFIX.character),
    name: z.string(),
    avatarHash: z.string().nullable(),
  }) satisfies z.ZodType<ChatCharacterIdentity>,
  z.strictObject({
    kind: z.literal("persona"),
    id: typeIdSchema(ID_PREFIX.persona),
    name: z.string(),
    description: z.string(),
    avatarHash: z.string().nullable(),
  }) satisfies z.ZodType<ChatPersonaIdentity>,
]) satisfies z.ZodType<ChatIdentity>;

/** ONE chat-identity kind's cross-consumer policy. Rule for future fields (the D129 idiom): a policy field joins
 *  only WITH its reader — a verdict nobody consumes is decoration. */
export interface ChatIdentityKindPolicy {
  /** Which macro-subject family this kind's name backs — enacted by {@link buildIdentityNameContext}'s routing
   *  (its policy↔projection agreement is pinned in `tests/contracts/chat/producers.contract.test.ts`):
   *  `char-subject` → `characterNamesById` (`{{char}}`); `user-subject` → `personaNamesById`
   *  (`{{user}}`/`{{persona}}`). */
  readonly macro: "char-subject" | "user-subject";
  /** Whether a live `ParticipantView.avatarHash` outranks the identity entry's — read by
   *  `resolveRowAttribution`'s per-kind avatar precedence (`features/chat/lib/attribution.ts`): a live
   *  participant can carry a per-chat override (`participant-first`); a persona has no participant avatar
   *  plane (`identity-only`). */
  readonly avatar: "participant-first" | "identity-only";
}

/** The shipped cells. The `Record<ChatIdentityKind, …>` is the compile-force: a third kind will not build until it
 *  declares its row (the agent wave's explicit macro-subject + avatar-precedence decisions). */
export const CHAT_IDENTITY_KIND_POLICY: Readonly<Record<ChatIdentityKind, ChatIdentityKindPolicy>> = {
  character: { macro: "char-subject", avatar: "participant-first" },
  persona: { macro: "user-subject", avatar: "identity-only" },
};

/** The stable string key — deliberately EXTENDS `speakerKey`'s namespace (`participants.ts`: `c:`; `u:`
 *  reserved for agent) so the two key spaces can never collide. The detail ∪ pages last-write-wins merge
 *  key. */
export function identityKey(entry: ChatIdentity): string {
  switch (entry.kind) {
    case "character":
      return `c:${entry.id}`;
    case "persona":
      return `p:${entry.id}`;
    default:
      return assertNeverChatIdentity(entry);
  }
}

function assertNeverChatIdentity(entry: never): never {
  throw new Error(`chat-identity: unhandled ChatIdentity kind ${JSON.stringify(entry)}`);
}

/** The names(+persona description) ONLY projection — the macro-law arm. Output types are the KIT types
 *  (`RowCharacterName`/`RowPersonaName`), which have no avatar field: the macro engine remains structurally
 *  unable to see chrome. Total over `ChatIdentity["kind"]` (`assertNever` tail); the routing enacts
 *  {@link CHAT_IDENTITY_KIND_POLICY}'s `macro` column (char-subject → character map, user-subject → persona map).
 *  Pure; last-write-wins on a duplicate id (the detail ∪ pages merge contract). */
export function buildIdentityNameContext(entries: readonly ChatIdentity[]): {
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

function projectNameEntry(entry: ChatIdentity, characterNamesById: Map<CharacterId, RowCharacterName>, personaNamesById: Map<PersonaId, RowPersonaName>): void {
  switch (entry.kind) {
    case "character":
      characterNamesById.set(entry.id, { name: entry.name });
      break;
    case "persona":
      personaNamesById.set(entry.id, { name: entry.name, description: entry.description });
      break;
    default:
      assertNeverChatIdentity(entry);
  }
}

/** The chrome projection — the avatar maps `resolveRowAttribution` takes. Same totality + merge contract
 *  as {@link buildIdentityNameContext}; a `null` hash stays an ENTRY (the renderer's initials fallback keys off
 *  the null, never off absence). */
export function buildIdentityAvatarMaps(entries: readonly ChatIdentity[]): {
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

function projectAvatarEntry(
  entry: ChatIdentity,
  characterAvatarsById: Map<CharacterId, string | null>,
  personaAvatarsById: Map<PersonaId, string | null>,
): void {
  switch (entry.kind) {
    case "character":
      characterAvatarsById.set(entry.id, entry.avatarHash);
      break;
    case "persona":
      personaAvatarsById.set(entry.id, entry.avatarHash);
      break;
    default:
      assertNeverChatIdentity(entry);
  }
}
