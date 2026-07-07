// domain/chat/persistence/roster-avatars — the CHAT ROSTER PERSONA-AVATAR producer loader, the avatar-
// chrome SIBLING to `macro-names.ts`'s NAME producer (same file-pair split as the wire types —
// `@orb/contracts/chat`'s `PersonaAvatarEntry` next to `PersonaNameEntry`). Kept in its OWN file/type,
// never folded into `ChatMacroNameProducer`, because that producer is explicitly NAMES ONLY (Chat-Macro-
// Resolution.md §1: "never the full character/persona entity") — avatar chrome is a display concern, not
// a macro-resolution input, and `RowPersonaName`/`RowCharacterName` (`@orb/kit/macro`) must never carry it.
//
// COVERAGE: identical algorithm to `loadChatMacroNameProducer` (every participant's active persona UNION
// every stored message row's `personaId` stamp, so a since-switched persona's avatar still resolves on
// older rows) — reuses `collectMacroIds` so the two loaders can never drift on WHICH ids are covered, only
// WHAT they fetch for each id.
//
// CHARACTER avatars are NOT covered here: they already flow through `ParticipantView.avatarHash`
// (`service.ts` `loadParticipantViews`), which — unlike the persona case — has no separate "producer" to
// merge because chat/service.ts resolves it inline per roster row. A since-left character's avatar on an
// old message row is a known gap (mirrors the existing `participants`-only assistant-avatar chrome limit
// in `features/chat/lib/attribution.ts`), out of this phase's scope.

import type { PersonaAvatarEntry } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { assets, personas } from "@orb/db";
import { eq, inArray } from "drizzle-orm";
import type { MessageMacroIdSource, ParticipantMacroIdSource } from "../contract/macro-ids";
import { collectMacroIds } from "./macro-names";

/**
 * Load the persona-avatar producer for a chat: `assets.hash` joined off `personas.avatarAssetId` for
 * every persona id `args.participants`/`args.messages` cover (see the file header). Returned as the wire
 * array (no re-mapping) — `verbs/read.ts` hands this straight to the client, which rebuilds the
 * `ReadonlyMap` via `@orb/contracts/chat`'s `buildPersonaAvatarMap`.
 */
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
