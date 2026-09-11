// domain/chat/persistence/identity — the ONE kind-polymorphic CHAT IDENTITY producer loader (D137): resolve
// every identity a chat references into `ChatIdentity[]` — the member-gated, history-inclusive display/name
// vocabulary both consumers derive from (server ASSEMBLE via `buildIdentityNameContext`, the client render
// chrome via both projections). Replaces the per-kind loader pair (`macro-names.ts` + `roster-avatars.ts`).
//
// Names + the persona description + the CAS avatar hash, never the full character/persona entity: a member
// already sees who authored each line, so a co-participant's persona/character name is not a further secret
// to gate, and a seated card's avatar is room-visible by construction (D18/D64). The names-only macro law
// is NOT this envelope — it is the projection types (`buildIdentityNameContext` outputs the kit's avatar-free
// entry types), so chrome can never ride the macro path regardless of what this loader returns.
//
// Coverage: every id the chat references — participants' seat/active-persona ids UNION any character/
// persona id a loaded set of message rows stamps (incl. since-switched personas and a REMOVED character
// whose historical rows remain: the transcript-integrity portrait floor). Both args optional. The per-kind
// id sources are a `satisfies Record<ChatIdentityKind, …>` table, so a third kind (agent, D60) is a compile
// error here until it declares its coverage — never a forgotten set.
//
// THE TWO NEIGHBOURS THIS IS NOT — and why this paragraph is no longer the enforcer (D137(F), #903).
//   • NOT the pin layer: `resolvePersonasForParticipants` (D122) answers "who is {{user}} NOW"; this producer
//     answers "what is id X called/shown as". Two layers, two questions — still a prose boundary, because
//     the two shapes never meet in one assignment.
//   • NOT the D60 DRIVE axis — `AssembleContext.characters`/`speakerRefs` (`assembly/context.ts`), the
//     present AI-driven speakers. That neighbour is the one this header used to fence BY HAND: until #903
//     both axes were spelled `cast`, and they are near-antonyms on the persona plane — a persona IS a chat
//     identity here, and is NEVER a speaker there. The rename made the distinction structural: the READ
//     axis is `ChatIdentity`/`identityKey`/`.identities`, the DRIVE axis is `characters`/`speakerRefs`, and
//     assigning one to the other is a `tsc` error rather than a comment somebody has to read. The RULE did
//     not change — `SpeakerRef` is never reused for a chat identity — only its enforcer did. Keep the
//     sentence anyway: it is what tells the next reader WHY two near-identical arrays of people are not
//     interchangeable, which the type names state but do not explain.

import type { ChatIdentity, ChatIdentityKind } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { assets, characters, personas } from "@orb/db";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { eq, inArray } from "drizzle-orm";
import type { MessageMacroIdSource, ParticipantMacroIdSource } from "../contract/macro-ids.ts";

interface ChatIdentityLoadArgs {
  readonly participants?: readonly ParticipantMacroIdSource[];
  readonly messages?: readonly MessageMacroIdSource[];
}

interface ChatIdentityIdSource<Id extends string> {
  readonly participant: (p: ParticipantMacroIdSource) => Id | null;
  readonly message: (m: MessageMacroIdSource) => Id | null;
}

// WHERE each kind's coverage comes from — the compile-forced per-kind source table: a new `ChatIdentityKind`
// member reds this `satisfies` until the kind declares its participant/message id sources (the agent
// wave's: roster `kind='agent'` seats' userId ∪ assistant rows' authorUserId).
const CHAT_IDENTITY_ID_SOURCES = {
  character: {
    participant: (p: ParticipantMacroIdSource): CharacterId | null => p.characterId,
    message: (m: MessageMacroIdSource): CharacterId | null => m.characterId,
  },
  persona: {
    participant: (p: ParticipantMacroIdSource): PersonaId | null => p.activePersonaId,
    message: (m: MessageMacroIdSource): PersonaId | null => m.personaId,
  },
} as const satisfies Record<ChatIdentityKind, ChatIdentityIdSource<string>>;

/** Collect ONE kind's DISTINCT covered ids from whichever of the two optional sources the caller has
 *  loaded. Pure — no I/O; `loadChatIdentityProducer` runs the queries. */
function collectIdentityIds<Id extends string>(args: ChatIdentityLoadArgs, source: ChatIdentityIdSource<Id>): Id[] {
  // @orb-waive persistence-no-in-memory-state(Set): query-local dedup Set for collecting covered ids. Ends if it outlives the call.
  const ids = new Set<Id>();
  for (const p of args.participants ?? []) {
    const id = source.participant(p);
    if (id !== null) {
      ids.add(id);
    }
  }
  for (const m of args.messages ?? []) {
    const id = source.message(m);
    if (id !== null) {
      ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Load the CHAT IDENTITY producer for a chat: one kind-discriminated `ChatIdentity` per covered identity —
 * character name + avatar hash, persona name + description + avatar hash (each `assets.hash` joined off
 * the entity's `avatarAssetId`; no avatar ⇒ `avatarHash: null`, never a dropped entry). Both args are
 * optional (an empty producer for a hostless/messageless probe never queries). Returned as the wire shape
 * (`ChatDetail.identities`/`MessagesPage.identities`); consumers project it via `buildIdentityNameContext` /
 * `buildIdentityAvatarMaps` (`@orb/contracts/chat`).
 */
export async function loadChatIdentityProducer(db: Db, args: ChatIdentityLoadArgs): Promise<readonly ChatIdentity[]> {
  const characterIds = collectIdentityIds(args, CHAT_IDENTITY_ID_SOURCES.character);
  const personaIds = collectIdentityIds(args, CHAT_IDENTITY_ID_SOURCES.persona);
  // @orb-waive owner-scoped-reads(characters): the id union is derived from the room's OWN canon (`CHAT_IDENTITY_ID_SOURCES` over roster seats + per-message attribution stamps), never from caller input, and the read returns only display names, the persona description the transcript already renders, and CAS hashes — the member-gated vocabulary a room's transcript already shows (D18; a seated card's avatar is room-visible by construction, D18/D64). Ends if the producer ever accepts an id set from a request.
  // @orb-waive owner-scoped-reads(personas): the id union is derived from the room's OWN canon (`CHAT_IDENTITY_ID_SOURCES` over roster seats + per-message attribution stamps), never from caller input, and the read returns only display names, the persona description the transcript already renders, and CAS hashes — the member-gated vocabulary a room's transcript already shows (D18; a seated card's avatar is room-visible by construction, D18/D64). Ends if the producer ever accepts an id set from a request.
  const [characterRows, personaRows] = await Promise.all([
    characterIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: characters.id, name: characters.name, avatarHash: assets.hash })
          .from(characters)
          .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
          .where(inArray(characters.id, characterIds)),
    personaIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: personas.id, name: personas.name, description: personas.description, avatarHash: assets.hash })
          .from(personas)
          .leftJoin(assets, eq(personas.avatarAssetId, assets.id))
          .where(inArray(personas.id, personaIds)),
  ]);
  return [
    ...characterRows.map((row): ChatIdentity => ({ kind: "character", id: row.id, name: row.name, avatarHash: row.avatarHash ?? null })),
    ...personaRows.map(
      (row): ChatIdentity => ({ kind: "persona", id: row.id, name: row.name, description: row.description, avatarHash: row.avatarHash ?? null }),
    ),
  ];
}
