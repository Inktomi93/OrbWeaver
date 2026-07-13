// domain/chat/persistence/roster-avatars — the chat roster persona-avatar producer loader, the avatar-
// chrome sibling to macro-names.ts's name producer. Kept in its own file/type, never folded into
// ChatMacroNameProducer, because that producer is explicitly names-only — avatar chrome is a display
// concern, not a macro-resolution input.
//
// Coverage: identical algorithm to loadChatMacroNameProducer (every participant's active persona union
// every stored message row's personaId stamp) — reuses collectMacroIds so the two loaders can never drift
// on which ids are covered.
//
// Character avatars are NOT covered here — they already flow through ParticipantView.avatarHash.

import type { PersonaAvatarEntry } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { assets, personas } from "@orb/db";
import { eq, inArray } from "drizzle-orm";
import type { MessageMacroIdSource, ParticipantMacroIdSource } from "../contract/macro-ids";
import { collectMacroIds } from "./macro-names";

/** Load the persona-avatar producer for a chat: `assets.hash` joined off `personas.avatarAssetId` for every
 *  persona id `args.participants`/`args.messages` cover. */
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
