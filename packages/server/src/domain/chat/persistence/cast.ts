// domain/chat/persistence/cast — the ONE kind-polymorphic CAST producer loader (D137): resolve every
// identity a chat references into `CastEntry[]` — the member-gated, history-inclusive display/name
// vocabulary both consumers derive from (server ASSEMBLE via `buildCastNameContext`, the client render
// chrome via both projections). Replaces the per-kind loader pair (`macro-names.ts` + `roster-avatars.ts`).
//
// Names + the persona description + the CAS avatar hash, never the full character/persona entity: a member
// already sees who authored each line, so a co-participant's persona/character name is not a further secret
// to gate, and a seated card's avatar is room-visible by construction (D18/D64). The names-only macro law
// is NOT this envelope — it is the projection types (`buildCastNameContext` outputs the kit's avatar-free
// entry types), so chrome can never ride the macro path regardless of what this loader returns.
//
// Coverage: every id the chat references — participants' seat/active-persona ids UNION any character/
// persona id a loaded set of message rows stamps (incl. since-switched personas and a REMOVED character
// whose historical rows remain: the transcript-integrity portrait floor). Both args optional. The per-kind
// id sources are a `satisfies Record<CastKind, …>` table, so a third kind (agent, D60) is a compile error
// here until it declares its coverage — never a forgotten set.
//
// NOT the pin layer: `resolvePersonasForRoster` (D122) answers "who is {{user}} NOW"; this producer answers
// "what is id X called/shown as". And NOT `AssembleContext.cast`/`castMembers` (the D60 DRIVE axis —
// present AI-driven speakers): personas are cast members here but never speakers.

import type { CastEntry, CastKind } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { assets, characters, personas } from "@orb/db";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { eq, inArray } from "drizzle-orm";
import type { MessageMacroIdSource, ParticipantMacroIdSource } from "../contract/macro-ids.ts";

interface CastLoadArgs {
  readonly participants?: readonly ParticipantMacroIdSource[];
  readonly messages?: readonly MessageMacroIdSource[];
}

interface CastIdSource<Id extends string> {
  readonly participant: (p: ParticipantMacroIdSource) => Id | null;
  readonly message: (m: MessageMacroIdSource) => Id | null;
}

// WHERE each kind's coverage comes from — the compile-forced per-kind source table: a new `CastKind`
// member reds this `satisfies` until the kind declares its participant/message id sources (the agent
// wave's: roster `kind='agent'` seats' userId ∪ assistant rows' authorUserId).
const CAST_ID_SOURCES = {
  character: {
    participant: (p: ParticipantMacroIdSource): CharacterId | null => p.characterId,
    message: (m: MessageMacroIdSource): CharacterId | null => m.characterId,
  },
  persona: {
    participant: (p: ParticipantMacroIdSource): PersonaId | null => p.activePersonaId,
    message: (m: MessageMacroIdSource): PersonaId | null => m.personaId,
  },
} as const satisfies Record<CastKind, CastIdSource<string>>;

/** Collect ONE kind's DISTINCT covered ids from whichever of the two optional sources the caller has
 *  loaded. Pure — no I/O; `loadChatCastProducer` runs the queries. */
function collectCastIds<Id extends string>(args: CastLoadArgs, source: CastIdSource<Id>): Id[] {
  // @orb-gate-ignore persistence-no-in-memory-state: query-local dedup Set for collecting covered ids
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
 * Load the CAST producer for a chat: one kind-discriminated `CastEntry` per covered identity —
 * character name + avatar hash, persona name + description + avatar hash (each `assets.hash` joined off
 * the entity's `avatarAssetId`; no avatar ⇒ `avatarHash: null`, never a dropped entry). Both args are
 * optional (an empty producer for a hostless/messageless probe never queries). Returned as the wire shape
 * (`ChatDetail.cast`/`MessagesPage.cast`); consumers project it via `buildCastNameContext` /
 * `buildCastAvatarMaps` (`@orb/contracts/chat`).
 */
// @owner-scope-ok: the id union is derived from the room's OWN canon (`CAST_ID_SOURCES` over roster seats +
// per-message attribution stamps), never from caller input, and the read returns only display names, the
// persona description the transcript already renders, and CAS hashes — the member-gated vocabulary a room's
// transcript already shows (D18; a seated card's avatar is room-visible by construction, D18/D64). Ends if
// the producer ever accepts an id set from a request.
export async function loadChatCastProducer(db: Db, args: CastLoadArgs): Promise<readonly CastEntry[]> {
  const characterIds = collectCastIds(args, CAST_ID_SOURCES.character);
  const personaIds = collectCastIds(args, CAST_ID_SOURCES.persona);
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
    ...characterRows.map((row): CastEntry => ({ kind: "character", id: row.id, name: row.name, avatarHash: row.avatarHash ?? null })),
    ...personaRows.map((row): CastEntry => ({ kind: "persona", id: row.id, name: row.name, description: row.description, avatarHash: row.avatarHash ?? null })),
  ];
}
