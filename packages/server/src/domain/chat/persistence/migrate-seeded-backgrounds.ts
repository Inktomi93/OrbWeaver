// domain/chat/persistence/migrate-seeded-backgrounds — the `kind:"seeded"` retirement's ROOM half (owner ask
// 2026-09-18). The `domain/character` and `domain/settings` siblings, over `chats.metadata.background`.
//
// WHY IT READS RAW: `parseChatMetadata` heals an unknown background kind to `none`, so a parsed read of a
// room carrying the retired kind reports no background and the slug is already gone. The predicate and the
// slug come off the JSON column with `json_extract`.
//
// SCOPE IS THE HOST, NOT AN OWNER COLUMN (D18: there is NO `chats.ownerId`; the host participant is the
// authority). A room's background is a thing its HOST chose, and the plate asset the rewrite points at has
// to be an asset SOMEBODY owns — so the sweep is keyed by host: for user U, the rooms U hosts. A room whose
// host is a different user is that user's own pass to make, which is what keeps this from minting a
// cross-user reference nobody asked for.
//
// GC: `chats.metadata.background` with `kind:"asset"` is one of the two carried-background JSON live-sources
// `selectCarriedBackgroundReferencedAssetIds` roots (`domain/assets/persistence/asset-refs.ts`), so a
// migrated room background is pinned from the moment it lands. The `seeded` value it replaces rooted
// nothing, so no reference is being dropped — only created.

import type { ChatMetadata } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import { canonicalBackgroundSource } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { chatParticipants, chats } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, eq, exists, isNull, sql } from "drizzle-orm";
import { parseChatMetadata } from "../contract/metadata.ts";

/** The empty source a slug this pack no longer ships lands on — the schema's own "no image". */
const NO_BACKGROUND: ThemeBackground = canonicalBackgroundSource({
  kind: "none",
  externalUrl: "",
  provenanceUrl: "",
  assetId: "",
  assetHash: "",
  mime: "",
});

/**
 * Re-point every room THIS USER HOSTS whose stored `metadata.background` still carries the retired
 * `kind:"seeded"`. A slug the pack still ships becomes the host's own plate asset; anything else becomes
 * `none`. Idempotent by its own predicate — a rewritten room no longer matches. Returns rooms rewritten.
 */
export async function migrateSeededRoomBackgrounds(
  db: Db,
  hostUserId: UserId,
  resolve: (slug: string) => Promise<ThemeBackground | null>,
  at: number,
): Promise<number> {
  const kind = sql<string | null>`json_extract(${chats.metadata}, '$.background.kind')`;
  const slug = sql<string | null>`json_extract(${chats.metadata}, '$.background.seededId')`;
  const hostsThisRoom = exists(
    db
      .select({ one: sql`1` })
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chats.id),
          eq(chatParticipants.userId, hostUserId),
          eq(chatParticipants.role, "host"),
          isNull(chatParticipants.leftSeq),
        ),
      ),
  );
  const rows = await db
    .select({ id: chats.id, metadata: chats.metadata, slug })
    .from(chats)
    .where(and(eq(kind, "seeded"), hostsThisRoom));

  let rewritten = 0;
  for (const row of rows) {
    // @orb-waive no-await-db-in-loop(where): one UPDATE per AFFECTED room, each with a DIFFERENT resolved
    // source (its own plate), so the rewrite cannot collapse into one statement. Bounded by the rooms one
    // host carries a retired background on, once.
    const plate = row.slug === null || row.slug.length === 0 ? null : await resolve(row.slug);
    const metadata: ChatMetadata = { ...parseChatMetadata(row.metadata), background: canonicalBackgroundSource(plate ?? NO_BACKGROUND) };
    await db.update(chats).set({ metadata, updatedAt: at }).where(eq(chats.id, row.id));
    rewritten++;
  }
  return rewritten;
}
