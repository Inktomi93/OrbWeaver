// persistence/background-write — proves the two SQLite predicates that arbitrate JSON asset references
// at the write door. Carried fork/import backgrounds need only EXIST because their source operation has
// already been authorized; direct room customization must additionally preserve owner authority.

import type { ChatMetadata } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import type { AssetId, ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  carriedBackgroundAvailable,
  guardedChatId,
  ownedBackgroundAvailable,
} from "../../../../../packages/server/src/domain/chat/persistence/background-write.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedAsset, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

function metadata(assetId: AssetId): ChatMetadata {
  return {
    background: {
      kind: "asset",
      externalUrl: "",
      assetId,
      assetHash: "hash",
      mime: "image/png",
      provenanceUrl: "",
    },
  };
}

describe("persistence/background-write", () => {
  test("a carried background admits only while its asset row exists", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const assetId = await seedAsset(db, owner, "carried");
    const chatId = castId<ChatId>("chat_carried");

    expect(await db.all(sql`SELECT ${guardedChatId(db, chatId, metadata(assetId))} AS id`)).toEqual([{ id: chatId }]);
    expect(await db.all(sql`SELECT ${guardedChatId(db, chatId, metadata(castId<AssetId>("asset_missing")))} AS id`)).toEqual([{ id: null }]);
    expect(await db.all(sql`SELECT ${carriedBackgroundAvailable(db, metadata(assetId))} AS available`)).toEqual([{ available: 1 }]);
    expect(await db.all(sql`SELECT ${carriedBackgroundAvailable(db, metadata(castId<AssetId>("asset_missing")))} AS available`)).toEqual([{ available: 0 }]);
  });

  test("direct room customization admits only an asset owned by the caller", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const other = await seedUser(db, castId<Handle>("other"));
    const assetId = await seedAsset(db, owner, "owned");

    expect(await db.all(sql`SELECT ${ownedBackgroundAvailable(db, owner, metadata(assetId))} AS available`)).toEqual([{ available: 1 }]);
    expect(await db.all(sql`SELECT ${ownedBackgroundAvailable(db, other, metadata(assetId))} AS available`)).toEqual([{ available: 0 }]);
  });
});
