// verb: exportAssets — the portability EXPORT half, against a real db + real CAS. Pins the self-contained
// bundle promise (audit G-1): EVERY blob the owner references travels — the FK-registry avatar AND the
// chat-inline `asset:<id>` image (which no FK column holds) — while an unreferenced blob and another owner's
// blob stay home. Source assets are minted with REAL TypeIDs (the id survives the codec's boundary
// validation); the exact id value is captured, never asserted against a literal (deterministic in outcome).

import type { AssetKind, StoredAsset } from "@orb/contracts/assets";
import type { PortableFile } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import { messages, messageVariants } from "@orb/db";
import type { ChatId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createAssetsService, createExportAssets } from "@orb/server/domain/assets";
import { describe, onTestFinished } from "vitest";
import { parsePortableAssetFilename } from "../../../../../packages/server/src/domain/assets/substrate/portable-asset-file.ts";
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

type SeedingService = ReturnType<typeof createAssetsService>;

// The seeding service: the harness's newAssetId is a padded counter (not a valid TypeID); override it so
// stored assets carry real ids that survive the portable-filename codec's validation.
function seedingService(h: AssetsHarness): SeedingService {
  return createAssetsService({ ...h.ctx, newAssetId: () => mintTypeId(ID_PREFIX.asset) });
}

function store(
  svc: SeedingService,
  owner: UserId,
  bytes: Uint8Array,
  kind: AssetKind,
): Promise<StoredAsset> {
  return svc.store({ principal: principal(owner), bytes, kind, mime: PNG });
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

describe("exportAssets", () => {
  test("streams FK-referenced + chat-inline blobs; excludes unreferenced and foreign", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = seedingService(h);

    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });

    // (a) FK side: an avatar blob referenced by a character.
    const avatarBytes = pngBytes(1, 2, 3);
    const avatar = await store(svc, owner, avatarBytes, "avatar");
    const hero = await seedCharacter(db, owner, { handle: "hero" });
    await setCharacterAvatar(db, hero, avatar.assetId);

    // (b) TEXT side: a blob referenced ONLY by a chat-inline `asset:<id>` (no FK row at all).
    const inlineBytes = pngBytes(9, 8, 7);
    const inline = await store(svc, owner, inlineBytes, "generated");
    const chat = await seedChatRow(db, "chat_owner");
    await seedParticipant(db, chat, "human", { userId: owner });
    await seedInlineRef(db, chat, inline.assetId);

    // Excluded: an unreferenced owned blob…
    await store(svc, owner, pngBytes(5, 5), "gallery");
    // …and a foreign owner's referenced blob.
    const fAvatar = await store(svc, other, pngBytes(4, 4), "avatar");
    const villain = await seedCharacter(db, other, { handle: "villain" });
    await setCharacterAvatar(db, villain, fAvatar.assetId);

    const files: PortableFile[] = [];
    for await (const file of createExportAssets(h.ctx)(owner)) {
      files.push(file);
    }

    const byId = new Map(
      files.map((f) => {
        const parsed = parsePortableAssetFilename(f.filename);
        expect(parsed).toBeDefined();
        return [parsed?.id, f.bytes] as const;
      }),
    );
    expect(new Set(byId.keys())).toEqual(new Set([avatar.assetId, inline.assetId]));
    expect(Array.from(byId.get(avatar.assetId) ?? [])).toEqual(Array.from(avatarBytes));
    expect(Array.from(byId.get(inline.assetId) ?? [])).toEqual(Array.from(inlineBytes));
  });
});
