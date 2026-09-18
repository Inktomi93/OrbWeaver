// verb: exportAssets — the portability EXPORT half, against a real db + real CAS. Pins the self-contained
// bundle promise (audit G-1): EVERY blob the owner references travels — the FK-registry avatar AND the
// chat-inline `asset:<id>` image (which no FK column holds) — while an unreferenced blob and another owner's
// blob stay home. Source assets are minted with REAL TypeIDs (the id survives the codec's boundary
// validation); the exact id value is captured, never asserted against a literal (deterministic in outcome).
// The bundle's reference floor is the GC LIVE SET, not the FK registry: a background pinned only inside a
// JSON producer (settings pick, settings library, a character's carried card background) survives GC, so it
// must travel too — else a restore rebuilds the referencing JSON without its bytes.

import type { AssetKind, StoredAsset } from "@orb/contracts/assets";
import type { PortableFile } from "@orb/contracts/portability";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { characters, messages, messageVariants, userSettings } from "@orb/db";
import type { AssetId, CharacterHandle, CharacterId, ChatId, Handle, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createAssetsService, createExportAssets } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { parsePortableAssetFilename } from "../../../../../packages/server/src/domain/assets/substrate/portable-asset-file.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import type { AssetsHarness } from "../_support.ts";
import { makeHarness, pngBytes, principal, seedCharacter, seedChatRow, seedParticipant, seedUser, setCharacterAvatar } from "../_support.ts";

const PNG = "image/png";

type SeedingService = ReturnType<typeof createAssetsService>;

// The seeding service: the harness's newAssetId is a padded counter (not a valid TypeID); override it so
// stored assets carry real ids that survive the portable-filename codec's validation.
function seedingService(h: AssetsHarness): SeedingService {
  return createAssetsService({ ...h.ctx, newAssetId: () => mintTypeId(ID_PREFIX.asset) });
}

function store(svc: SeedingService, owner: UserId, bytes: Uint8Array, kind: AssetKind): Promise<StoredAsset> {
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

/** The owner's `user_settings` row with BOTH JSON background pins: the current pick (`backgroundAssetId`)
 *  and one library entry (an uploaded-but-unpicked background). Neither is an FK column. */
async function seedBackgroundSettings(db: Db, owner: UserId, pickedId: AssetId, libraryId: AssetId): Promise<void> {
  const appearance = {
    ...DEFAULT_USER_SETTINGS.appearance,
    backgroundImageKind: "asset" as const,
    backgroundAssetId: pickedId,
    backgroundAssetHash: "",
    backgroundLibrary: [{ entryId: `entry_${libraryId}`, assetId: libraryId, assetHash: "", mime: PNG, name: "bg" }],
  };
  await db.insert(userSettings).values({ userId: owner, config: { ...DEFAULT_USER_SETTINGS, appearance } });
}

/** Pin a character's carried card background (`characters.background_override` JSON — BG-C). */
async function setCharacterBackground(db: Db, characterId: CharacterId, assetId: AssetId): Promise<void> {
  await db
    .update(characters)
    .set({ backgroundOverride: { kind: "asset", externalUrl: "", assetId, assetHash: "", mime: PNG, provenanceUrl: "" } })
    .where(eq(characters.id, characterId));
}

describe("exportAssets", () => {
  test("streams FK-referenced + chat-inline blobs; excludes unreferenced and foreign", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = seedingService(h);

    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });

    // (a) FK side: an avatar blob referenced by a character.
    const avatarBytes = pngBytes(1, 2, 3);
    const avatar = await store(svc, owner, avatarBytes, "avatar");
    const hero = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
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
    const villain = await seedCharacter(db, other, { handle: castId<CharacterHandle>("villain") });
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

  test("a background pinned ONLY through a JSON producer travels (the GC live-set is the floor)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = seedingService(h);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    // (a) the settings pin: `appearance.backgroundAssetId` — no FK column holds it.
    const settingsBg = await store(svc, owner, pngBytes(1, 1, 1), "background");
    // (b) the settings LIBRARY pin: an uploaded-but-unpicked background.
    const libraryBg = await store(svc, owner, pngBytes(2, 2, 2), "background");
    await seedBackgroundSettings(db, owner, settingsBg.assetId, libraryBg.assetId);
    // (c) the carried card background: `characters.background_override` JSON.
    const cardBg = await store(svc, owner, pngBytes(3, 3, 3), "background");
    const hero = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    await setCharacterBackground(db, hero, cardBg.assetId);

    const ids = new Set<string | undefined>();
    for await (const file of createExportAssets(h.ctx)(owner)) {
      ids.add(parsePortableAssetFilename(file.filename)?.id);
    }

    // GC keeps all three alive; a bundle that omits them restores the referencing JSON without its blobs.
    expect(ids).toEqual(new Set([settingsBg.assetId, libraryBg.assetId, cardBg.assetId]));
  });
});
