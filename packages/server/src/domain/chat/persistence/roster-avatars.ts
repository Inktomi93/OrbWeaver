// domain/chat/persistence/roster-avatars — the chat roster avatar producer loaders, the avatar-chrome
// siblings to macro-names.ts's name producer. Kept in their own file/type, never folded into
// ChatMacroNameProducer, because that producer is explicitly names-only — avatar chrome is a display
// concern, not a macro-resolution input.
//
// Coverage: identical algorithm to loadChatMacroNameProducer (every participant's active persona/
// characterId union every stored message row's personaId/characterId stamp) — reuses collectMacroIds so
// the loaders can never drift on which ids are covered.
//
// Both persona AND character avatars are loaded here (participant-independent): a speaker can be removed
// from the room while its historical rows stay in the transcript, so ParticipantView.avatarHash is NOT a
// sufficient source for the assistant-row portrait — it vanishes on removal. The character-avatar
// producer is the portrait floor that survives a removal (mirrors the persona-avatar producer, which
// already covered since-switched personas the roster no longer lists).

import type { CharacterAvatarEntry, PersonaAvatarEntry } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { assets, characters, personas } from "@orb/db";
import { eq, inArray } from "drizzle-orm";
import type { MessageMacroIdSource, ParticipantMacroIdSource } from "../contract/macro-ids";
import { collectMacroIds } from "./macro-names";

/** Load the persona-avatar producer for a chat: `assets.hash` joined off `personas.avatarAssetId` for every
 *  persona id `args.participants`/`args.messages` cover. */
// @owner-scope-ok: the ids are NOT caller-supplied — `collectMacroIds` derives them from the room's own
// already-membership-gated canon (roster seats + message attribution stamps), and the read returns only a
// CAS hash. A member seeing a co-member's persona avatar is the D18 room-is-a-shared-document posture. Ends
// if this ever takes an id set from a request.
export async function loadPersonaAvatarProducer(
  db: Db,
  args: {
    readonly participants?: readonly ParticipantMacroIdSource[];
    readonly messages?: readonly MessageMacroIdSource[];
  },
): Promise<readonly PersonaAvatarEntry[]> {
  const { personaIds } = collectMacroIds(args);
  if (personaIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ id: personas.id, avatarHash: assets.hash })
    .from(personas)
    .leftJoin(assets, eq(personas.avatarAssetId, assets.id))
    .where(inArray(personas.id, personaIds));
  return rows.map((row) => ({ id: row.id, avatarHash: row.avatarHash ?? null }));
}

/** Load the character-avatar producer for a chat: `assets.hash` joined off `characters.avatarAssetId` for
 *  every character id `args.participants`/`args.messages` cover — including a character removed from the
 *  room whose messages remain in `args.messages` (the transcript-integrity floor). */
// @owner-scope-ok: same as `loadPersonaAvatarProducer` — the character ids come from the room's roster and
// message stamps, never from a request, and a seated card's avatar is room-visible by construction (a card
// is the HOST's property but the room shows it, D18/D64). Ends if the id set becomes caller-supplied.
export async function loadCharacterAvatarProducer(
  db: Db,
  args: {
    readonly participants?: readonly ParticipantMacroIdSource[];
    readonly messages?: readonly MessageMacroIdSource[];
  },
): Promise<readonly CharacterAvatarEntry[]> {
  const { characterIds } = collectMacroIds(args);
  if (characterIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ id: characters.id, avatarHash: assets.hash })
    .from(characters)
    .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
    .where(inArray(characters.id, characterIds));
  return rows.map((row) => ({ id: row.id, avatarHash: row.avatarHash ?? null }));
}
