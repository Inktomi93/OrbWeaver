// verb: corpus — the D20 §2 ORDERING invariant: owner-scope is applied BEFORE cosine rank AND before the
// content-hash collapse, so a same-content block from ANOTHER owner can never (a) collapse the caller's
// in-scope block out of the result, nor (b) leak its text in as the surviving representative.
//
// The existing corpus.int.test.ts proves owner-scope exclusion AND content-hash collapse INDEPENDENTLY.
// This proves their INTERACTION, which is the actual security claim (D20: "a same-content block from
// another user can never collapse into the caller's result set"). The discriminator: the foreign row is
// made STRICTLY MORE similar than the in-scope row AND shares its contentHash — so if scope ran AFTER
// collapse, the better-ranked foreign copy would be the surviving representative and the in-scope block
// would be dropped (a leak + a displacement). Because scope is a SQL belt on the pool (nearestDigests
// ownerId → producer-card JOIN), the foreign row never enters the pool, so the in-scope block survives.
//
// Similarity control: the query embeds to vec(1). The foreign digest is vec(1) (cosine distance 0 — the
// BEST possible rank); the in-scope digest is vec(1, 0.05) (a hair off-axis → cosine sim < 1 → a strictly
// worse rank). mixB (no rerank) so the cosine order is the whole story. Deterministic embed via the
// scripted role-clients; real :memory: db.

import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeSearch, seedCharacter, seedChat, seedChatDigest, seedUser, vec } from "../_support.ts";

const SHARED_HASH = "shared_content_hash";

describe("corpus — D20 scope precedes rank/collapse", () => {
  test("a foreign, MORE-similar, same-contentHash digest neither collapses the in-scope block out nor leaks", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
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
    expect(hits[0]?.blockKey.scopedCharacterId).toBe(mine);
    // No foreign text leaks under any lens.
    expect(hits.map((h) => h.text)).not.toContain("FOREIGN");
  });

  test("a foreign, MORE-similar, DISTINCT-contentHash digest never displaces or leaks either", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
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
