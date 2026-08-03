// Integration: the SEMANTIC messages projection (the discovery side of the stats↔discovery seam Tier 2) —
// readForgottenGemCandidates. Asserts assistant-message volume + recency per owned non-synthetic character,
// owner-scoped, with NO economics (those arrive through the injected stats op).

import type { Db } from "@orb/db";
import { messages } from "@orb/db";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { readForgottenGemCandidates } from "../../../../../packages/server/src/domain/discovery/persistence/message-reads.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
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

    // Each slot carries its SELECTED variant, as every committed slot does in production (the pointer is
    // column-nullable only to break the circular FK at insert; every canon read inner-joins it).
    await seedMessage(db, {
      id: "m_vet_1",
      chatId: chat,
      seq: 1,
      createdAt: 1000,
      characterId: veteran,
      variant: { content: "the veteran speaks" },
    });
    await seedMessage(db, {
      id: "m_vet_2",
      chatId: chat,
      seq: 2,
      createdAt: 3000,
      characterId: veteran,
      variant: { content: "and again" },
    });
    await seedMessage(db, {
      id: "m_rook_1",
      chatId: chat,
      seq: 3,
      createdAt: 2000,
      characterId: rookie,
      variant: { content: "the rookie speaks" },
    });
    await seedMessage(db, {
      id: "m_foreign",
      chatId: chat,
      seq: 4,
      createdAt: 9000,
      characterId: foreign,
      variant: { content: "another owner's character" },
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

  // The gem's "N messages" / "last active" once counted rpg state-anchor slots — assistant rows stamped with
  // the voiced `characterId` that a host resync appended. D124 made those unrepresentable; the surviving
  // predicate is the SELECTED-variant join, so a slot whose variant was deleted still cannot inflate a gem.
  test("a slot whose SELECTED variant is gone inflates neither the gem's message count nor its last-active", async () => {
    db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedChat(db, "chat_a");
    const played = await seedCharacter(db, { id: "character_vet", ownerId: owner, name: "Veteran" });

    await seedMessage(db, { id: "m_1", chatId: chat, seq: 1, createdAt: 1000, characterId: played, variant: { content: "a real beat" } });
    // A later beat whose selected variant was deleted — stamped LATER, so a raw MAX would move "last active".
    await seedMessage(db, { id: "m_orphan", chatId: chat, seq: 2, createdAt: 9000, characterId: played, variant: { content: "orphaned" } });
    await db
      .update(messages)
      .set({ selectedVariantId: null })
      .where(eq(messages.id, castId<MessageId>("m_orphan")));

    const rows = await readForgottenGemCandidates(db, owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ messageCount: 1, lastActiveAt: 1000 });
  });
});
