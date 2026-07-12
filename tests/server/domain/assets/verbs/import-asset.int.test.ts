// verb: importAsset — the portability IMPORT half, against a real db + real CAS. Two lanes:
//   1. FULL RE-LINK round-trip (the audit-G-1 promise): seed an owner with an FK avatar + a chat-inline
//      image, EXPORT the assets bundle, IMPORT it into a FRESH owner on a FRESH box, and assert both refs
//      re-link with NO id remap and NO message rewrite — the blob restores UNDER ITS ORIGINAL id, so the
//      character FK resolves and the `asset:<id>` text resolves. Re-import is idempotent.
//   2. SECURITY BELTS: a hash-mismatched (tampered) blob is rejected before it can poison CAS; an id already
//      owned by another user is rejected; an id re-used for different content is rejected.

import type { AssetKind } from "@orb/contracts/assets";
import type { PortableFile } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import { assets, messages, messageVariants } from "@orb/db";
import type { AssetId, ChatId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import {
  createAssetsService,
  createExportAssets,
  createImportAsset,
} from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { loadAssetCasRefById } from "../../../../../packages/server/src/domain/assets/persistence/queries.ts";
import {
  buildPortableAssetFilename,
  hashAssetBytes,
} from "../../../../../packages/server/src/domain/assets/substrate/portable-asset-file.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import type { AssetsHarness } from "../_support.ts";
import {
  makeHarness,
  pngBytes,
  principal,
  seedCharacter,
  seedChatRow,
  seedParticipant,
  seedUser,
  setCharacterAvatar,
} from "../_support.ts";

const PNG = "image/png";

function seedingService(h: AssetsHarness): ReturnType<typeof createAssetsService> {
  return createAssetsService({ ...h.ctx, newAssetId: () => mintTypeId(ID_PREFIX.asset) });
}

// A VALID portable file: the filename's hash is the real sha-256 of the bytes.
function fileFor(id: AssetId, kind: AssetKind, mime: string, bytes: Uint8Array): PortableFile {
  return {
    filename: buildPortableAssetFilename({ hash: hashAssetBytes(bytes), id, kind, mime }),
    bytes,
  };
}

async function seedInlineRef(db: Db, chatId: ChatId, refId: string): Promise<void> {
  const messageId = castId<MessageId>(`message_${chatId}`);
  await db.insert(messages).values({ id: messageId, chatId, seq: 0, role: "assistant" });
  await db.insert(messageVariants).values({
    id: castId<MessageVariantId>(`message_variant_${chatId}`),
    messageId,
    idx: 0,
    content: `![img](asset:${refId})`,
  });
}

async function ownedAssetCount(h: AssetsHarness, ownerId: UserId): Promise<number> {
  const rows = await h.ctx.db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.ownerId, ownerId));
  return rows.length;
}

describe("importAsset — full re-link round-trip", () => {
  test("export → import to a fresh owner: FK avatar + inline chat image both re-link", async () => {
    // ── SOURCE box ──
    const srcDb = await freshDb();
    const src = await makeHarness(srcDb);
    onTestFinished(src.cleanup);
    const srcSvc = seedingService(src);
    const owner = await seedUser(srcDb, { handle: "owner" });

    const avatarBytes = pngBytes(1, 2, 3);
    const avatar = await srcSvc.store({
      principal: principal(owner),
      bytes: avatarBytes,
      kind: "avatar",
      mime: PNG,
    });
    const hero = await seedCharacter(srcDb, owner, { handle: "hero" });
    await setCharacterAvatar(srcDb, hero, avatar.assetId);

    const inlineBytes = pngBytes(9, 8, 7);
    const inline = await srcSvc.store({
      principal: principal(owner),
      bytes: inlineBytes,
      kind: "generated",
      mime: PNG,
    });
    const chat = await seedChatRow(srcDb, "chat_owner");
    await seedParticipant(srcDb, chat, "human", { userId: owner });
    // The message text carrying `asset:${inline.assetId}` is what must resolve post-import (no rewrite): its
    // blob restores under the SAME id, so the same text token resolves on the target box.
    await seedInlineRef(srcDb, chat, inline.assetId);

    const files: PortableFile[] = [];
    for await (const file of createExportAssets(src.ctx)(owner)) {
      files.push(file);
    }
    expect(files.length).toBe(2);

    // ── TARGET box (fresh db + fresh CAS + fresh owner) ──
    const dstDb = await freshDb();
    const dst = await makeHarness(dstDb);
    onTestFinished(dst.cleanup);
    const importAsset = createImportAsset(dst.ctx);
    const dstSvc = createAssetsService(dst.ctx);
    const freshOwner = await seedUser(dstDb, { handle: "migrated" });

    for (const file of files) {
      // biome-ignore lint/performance/noAwaitInLoops: the delivery core imports one file at a time (per-file isolation); the test mirrors that sequential contract.
      const outcome = await importAsset(freshOwner, file);
      expect(outcome).toEqual({ ok: true, created: true });
    }

    // (1) the avatar row exists UNDER ITS ORIGINAL ID, owned by the fresh owner, addressing the same blob.
    const avatarRow = await loadAssetCasRefById(dstDb, avatar.assetId);
    expect(avatarRow?.ownerId).toBe(freshOwner);
    expect(avatarRow?.hash).toBe(hashAssetBytes(avatarBytes));

    // (2) the inline `asset:<id>` resolves — the same id the message text holds now has a live row.
    expect(await dstSvc.assetCasRefById(inline.assetId)).toBeDefined();

    // (3) the blob bytes round-trip byte-identically through the fresh CAS.
    const restored = await dstSvc.loadAssetBytes(avatar.assetId);
    expect(restored && Array.from(restored)).toEqual(Array.from(avatarBytes));

    // (4) idempotent re-import: no new rows.
    for (const file of files) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential per-file re-import (idempotency check).
      expect(await importAsset(freshOwner, file)).toEqual({ ok: true, created: false });
    }
    expect(await ownedAssetCount(dst, freshOwner)).toBe(2);
  });
});

describe("importAsset — security belts", () => {
  test("a tampered blob (hash ≠ bytes) is rejected before it can poison CAS", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const importAsset = createImportAsset(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const id = mintTypeId(ID_PREFIX.asset);
    const good = pngBytes(1, 1);
    const bad = pngBytes(2, 2);
    // filename claims the hash of `good`, but the bytes are `bad`.
    const tampered: PortableFile = {
      filename: buildPortableAssetFilename({
        hash: hashAssetBytes(good),
        id,
        kind: "avatar",
        mime: PNG,
      }),
      bytes: bad,
    };

    const outcome = await importAsset(owner, tampered);
    expect(outcome.ok).toBe(false);
    expect(await loadAssetCasRefById(db, id)).toBeUndefined(); // nothing written
    expect(await ownedAssetCount(h, owner)).toBe(0);
  });

  test("an id already owned by another user is rejected", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const importAsset = createImportAsset(h.ctx);
    const first = await seedUser(db, { handle: "first" });
    const second = await seedUser(db, { handle: "second" });

    const id = mintTypeId(ID_PREFIX.asset);
    const file = fileFor(id, "avatar", PNG, pngBytes(3, 3));

    expect(await importAsset(first, file)).toEqual({ ok: true, created: true });
    const outcome = await importAsset(second, file);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("another user");
  });

  test("an id re-used for DIFFERENT content is rejected", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const importAsset = createImportAsset(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const id = mintTypeId(ID_PREFIX.asset);
    expect(await importAsset(owner, fileFor(id, "avatar", PNG, pngBytes(4, 4)))).toEqual({
      ok: true,
      created: true,
    });
    const outcome = await importAsset(owner, fileFor(id, "avatar", PNG, pngBytes(5, 5)));
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("different content");
  });
});
