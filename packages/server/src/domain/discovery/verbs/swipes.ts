// domain/discovery/verbs/swipes — regeneration hotspots: the assistant message slots in ONE chat that carry
// the most alternate takes (the spots the owner re-rolled hardest). Owner-belted via `characters.ownerId`
// (a foreign chat reads zero rows — no leak). CONTENT-only: the snippet is the SELECTED variant's text; the
// COUNT never touches an economics column (tokens/cost live on message_variants, stats-private).

import type { Db } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { DiscoveryContext } from "../context";
import type { SwipeHotspot } from "../contract/results";
import type { DiscoveryService } from "../contract/service";
import { readSwipeHotspots } from "../persistence/message-reads";

const DEFAULT_LIMIT = 20;
// The selected-take preview is a browsing snippet, not the full scene — trimmed for the hotspot list.
const SNIPPET_MAX_CHARS = 280;

export function createSwipes(ctx: DiscoveryContext): Pick<DiscoveryService, "swipeHotspots"> {
  return {
    swipeHotspots: (userId, chatId, limit) => swipeHotspots(ctx.db, userId, chatId, limit),
  };
}

async function swipeHotspots(db: Db, ownerId: UserId, chatId: ChatId, limit: number = DEFAULT_LIMIT): Promise<SwipeHotspot[]> {
  const rows = await readSwipeHotspots(db, ownerId, chatId, limit);
  return rows.map((r) => ({
    messageId: r.messageId,
    seq: r.seq,
    characterId: r.characterId,
    characterName: r.characterName,
    variantCount: r.variantCount,
    snippet: (r.snippet ?? "").slice(0, SNIPPET_MAX_CHARS),
  }));
}
