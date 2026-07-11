// Integration: the SEMANTIC messages projection (the discovery side of the stats↔discovery seam Tier 2) —
// readForgottenGemCandidates. Asserts assistant-message volume + recency per owned non-synthetic character,
// owner-scoped, with NO economics (those arrive through the injected stats op).

import type { Db } from "@orb/db";
import { describe } from "vitest";
import { readForgottenGemCandidates } from "../../../../../packages/server/src/domain/discovery/persistence/message-reads.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedCharacter, seedChat, seedMessage, seedUser } from "../_support.ts";

let db: Db;

describe("readForgottenGemCandidates", () => {
  test("counts assistant messages + last-active per owned, non-synthetic, played character", async () => {
    db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const chat = await seedChat(db, "chat_a");
    const veteran = await seedCharacter(db, {
      id: "character_vet",
      ownerId: owner,
      name: "Veteran",
    });
    const rookie = await seedCharacter(db, {
      id: "character_rook",
      ownerId: owner,
      name: "Rookie",
    });
    // Collected but never played — excluded (INNER JOIN messages).
    await seedCharacter(db, { id: "character_idle", ownerId: owner, name: "Idle" });
    // Synthetic group character — excluded even with messages.
    await seedCharacter(db, { id: "character_group", ownerId: owner, synthetic: true });
    // A foreign owner's played character — never surfaces for `owner`.
    const foreign = await seedCharacter(db, { id: "character_foreign", ownerId: other });

    await seedMessage(db, {
      id: "m_vet_1",
      chatId: chat,
      seq: 1,
      createdAt: 1000,
      characterId: veteran,
    });
    await seedMessage(db, {
      id: "m_vet_2",
      chatId: chat,
      seq: 2,
      createdAt: 3000,
      characterId: veteran,
    });
    await seedMessage(db, {
      id: "m_rook_1",
      chatId: chat,
      seq: 3,
      createdAt: 2000,
      characterId: rookie,
    });
    await seedMessage(db, {
      id: "m_foreign",
      chatId: chat,
      seq: 4,
      createdAt: 9000,
      characterId: foreign,
    });

    const rows = await readForgottenGemCandidates(db, owner);
    const byId = new Map(rows.map((r) => [r.characterId, r]));
    expect([...byId.keys()].sort()).toEqual([rookie, veteran].sort());
    expect(byId.get(veteran)).toMatchObject({
      name: "Veteran",
      messageCount: 2,
      lastActiveAt: 3000,
    });
    expect(byId.get(rookie)).toMatchObject({ messageCount: 1, lastActiveAt: 2000 });
  });
});
