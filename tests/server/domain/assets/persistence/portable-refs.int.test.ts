// persistence: portable-refs — the OWNER-SCOPED export reads, against a real db. Pins the three scopes that
// keep an export from leaking: the FK registry walk returns only the owner's REFERENCED assets (an
// unreferenced blob and a foreign owner's blob are both excluded); the inline scan is MEMBERSHIP-scoped
// (D18 — a chat the owner isn't in never contributes) and asset-mention-filtered; the row load is the owner
// gate (foreign / missing ⇒ undefined).

import type { Db } from "@orb/db";
import { assets, messages, messageVariants } from "@orb/db";
import type { AssetId, ChatId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  loadOwnedAssetForExport,
  selectInlineReferencedContents,
  selectOwnedReferencedAssetIds,
} from "../../../../../packages/server/src/domain/assets/persistence/portable-refs.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  seedCharacter,
  seedChatRow,
  seedParticipant,
  seedUser,
  setCharacterAvatar,
} from "../_support.ts";

const NOW = 1_750_000_000_000;

async function seedAsset(
  db: Db,
  ownerId: UserId,
  spec: {
    readonly id: string;
    readonly hash: string;
    readonly kind?: "avatar" | "gallery";
    readonly mime?: string;
  },
): Promise<AssetId> {
  const id = castId<AssetId>(spec.id);
  await db.insert(assets).values({
    id,
    ownerId,
    kind: spec.kind ?? "avatar",
    mime: spec.mime ?? "image/png",
    size: 4,
    hash: spec.hash,
    uploadedAt: NOW,
  });
  return id;
}

async function seedVariant(
  db: Db,
  chatId: ChatId,
  spec: { readonly seq: number; readonly content: string },
): Promise<void> {
  const messageId = castId<MessageId>(`message_${chatId}_${spec.seq}`);
  await db.insert(messages).values({ id: messageId, chatId, seq: spec.seq, role: "assistant" });
  await db.insert(messageVariants).values({
    id: castId<MessageVariantId>(`message_variant_${chatId}_${spec.seq}`),
    messageId,
    idx: 0,
    content: spec.content,
  });
}

describe("selectOwnedReferencedAssetIds", () => {
  test("returns the owner's REFERENCED assets only — not unreferenced, not another owner's", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });

    const referenced = await seedAsset(db, owner, { id: "asset_ref", hash: "a".repeat(64) });
    await seedAsset(db, owner, { id: "asset_orphan", hash: "b".repeat(64) }); // owned but UNreferenced
    const foreign = await seedAsset(db, other, { id: "asset_foreign", hash: "c".repeat(64) });

    const ownerChar = await seedCharacter(db, owner, { handle: "hero" });
    await setCharacterAvatar(db, ownerChar, referenced);
    const otherChar = await seedCharacter(db, other, { handle: "villain" });
    await setCharacterAvatar(db, otherChar, foreign);

    const ids = await selectOwnedReferencedAssetIds(db, owner);
    expect([...ids]).toEqual([referenced]);
  });
});

describe("selectInlineReferencedContents", () => {
  test("membership-scoped + asset-mention filtered", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });

    const mine = await seedChatRow(db, "chat_mine");
    await seedParticipant(db, mine, "human", { userId: owner });
    await seedVariant(db, mine, { seq: 0, content: "look ![pic](asset:asset_inline) here" });
    await seedVariant(db, mine, { seq: 1, content: "just prose, no asset" });

    const theirs = await seedChatRow(db, "chat_theirs"); // owner is NOT a participant
    await seedVariant(db, theirs, { seq: 0, content: "![x](asset:asset_secret)" });

    const contents = await selectInlineReferencedContents(db, owner);
    expect(contents).toEqual(["look ![pic](asset:asset_inline) here"]);
  });
});

describe("loadOwnedAssetForExport", () => {
  test("owner-gated: returns hash/kind/mime for own, undefined for foreign or missing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const mine = await seedAsset(db, owner, {
      id: "asset_mine",
      hash: "d".repeat(64),
      kind: "gallery",
      mime: "image/webp",
    });
    const foreign = await seedAsset(db, other, { id: "asset_theirs", hash: "e".repeat(64) });

    expect(await loadOwnedAssetForExport(db, owner, mine)).toEqual({
      hash: "d".repeat(64),
      kind: "gallery",
      mime: "image/webp",
    });
    expect(await loadOwnedAssetForExport(db, owner, foreign)).toBeUndefined();
    expect(
      await loadOwnedAssetForExport(db, owner, castId<AssetId>("asset_ghost")),
    ).toBeUndefined();
  });
});
