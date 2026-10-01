// D20: scope excludes a closer foreign copy before ranking and content-hash collapse.
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeSearch, seedCharacter, seedChat, seedChatDigest, seedUser, vec } from "../_support.ts";

const SHARED_HASH = "shared_content_hash";

describe("corpus — D20 scope precedes rank/collapse", () => {
  test("a foreign, MORE-similar, same-contentHash digest neither collapses the in-scope block out nor leaks", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const mine = await seedCharacter(db, { id: "character_mine", ownerId: owner, name: "Mine" });
    const theirs = await seedCharacter(db, {
      id: "character_theirs",
      ownerId: other,
      name: "Theirs",
    });
    const chatMine = await seedChat(db, "chat_mine");
    const chatTheirs = await seedChat(db, "chat_theirs");

    // The FOREIGN copy: strictly best rank (exact query match) + the shared hash — it would win the
    // content-hash collapse if scope did not exclude it first.
    await seedChatDigest(db, {
      chatId: chatTheirs,
      scopedCharacterId: theirs,
      blockIdx: 0,
      embedding: vec(1),
      contentHash: SHARED_HASH,
      text: "FOREIGN",
    });
    // The IN-SCOPE copy: a hair worse (off-axis) + the same hash.
    await seedChatDigest(db, {
      chatId: chatMine,
      scopedCharacterId: mine,
      blockIdx: 0,
      embedding: vec(1, 0.05),
      contentHash: SHARED_HASH,
      text: "MINE",
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.corpus({ ownerId: owner, queryText: "q", mode: "mixB", minScore: 0 });

    // Exactly the in-scope block survives — the better-ranked foreign copy is gone BEFORE collapse.
    expect(hits).toHaveLength(1);
    expect(hits[0]?.text).toBe("MINE");
    expect(hits[0]?.blockKeys[0]?.scopedCharacterId).toBe(mine);
    // No foreign text leaks under any lens.
    expect(hits.map((h) => h.text)).not.toContain("FOREIGN");
  });

  test("a foreign, MORE-similar, DISTINCT-contentHash digest never displaces or leaks either", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const mine = await seedCharacter(db, { id: "character_mine", ownerId: owner, name: "Mine" });
    const theirs = await seedCharacter(db, {
      id: "character_theirs",
      ownerId: other,
      name: "Theirs",
    });
    const chatMine = await seedChat(db, "chat_mine");
    const chatTheirs = await seedChat(db, "chat_theirs");

    // The foreign block is the closest match, distinct hash — under scope-after-rank it would top the list.
    await seedChatDigest(db, {
      chatId: chatTheirs,
      scopedCharacterId: theirs,
      blockIdx: 0,
      embedding: vec(1),
      contentHash: "foreign_hash",
      text: "FOREIGN",
    });
    await seedChatDigest(db, {
      chatId: chatMine,
      scopedCharacterId: mine,
      blockIdx: 0,
      embedding: vec(1, 0.05),
      contentHash: "mine_hash",
      text: "MINE",
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.corpus({ ownerId: owner, queryText: "q", mode: "mixB", minScore: 0 });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.text).toBe("MINE");
    expect(hits.map((h) => h.text)).not.toContain("FOREIGN");
  });
});
