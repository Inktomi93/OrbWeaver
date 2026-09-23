// Integration: messages-economics — the stats-OWNED economics projection (the seam's Tier 2). Asserts
// the D26-correct aggregation (economics from the SELECTED variant only — a non-selected swipe never
// counts), owner scoping (a foreign owner's turns never leak), and the per-(character, model) split.

import type { Db } from "@orb/db";
import { describe } from "vitest";
import { readCharacterEconomics, readCharacterModelEconomics } from "../../../../../packages/server/src/domain/stats/persistence/messages-economics.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedMessage, seedUser } from "../_support.ts";

let db: Db;

describe("readCharacterEconomics", () => {
  test("sums the SELECTED assistant variant's economics per character, owner-scoped", async () => {
    db = await freshDb();
    const owner = await seedUser(db);
    const character = await seedCharacter(db, owner, { id: "character_a", name: "Aria" });
    const chat = await seedChat(db, character, { id: "chat_a" });

    // Two assistant turns; the second has a SWIPE (idx 1) selected — its economics must be the ones counted,
    // the non-selected original (idx 0) must NOT.
    await seedMessage(db, {
      chatId: chat,
      seq: 1,
      role: "assistant",
      characterId: character,
      variants: [{ model: "gpt", tokensIn: 100, tokensOut: 50, costUsd: 0.01, cacheReadTokens: 5 }],
    });
    await seedMessage(db, {
      chatId: chat,
      seq: 2,
      role: "assistant",
      characterId: character,
      selectedIdx: 1,
      variants: [
        { model: "gpt", tokensOut: 999, costUsd: 9.99 }, // NOT selected — must be ignored
        { model: "gpt", tokensIn: 200, tokensOut: 70, costUsd: 0.02, cacheWriteTokens: 3 },
      ],
    });

    const rows = await readCharacterEconomics(db, owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      characterId: character,
      generations: 2,
      tokensIn: 300,
      tokensOut: 120,
      cacheReadTokens: 5,
      cacheWriteTokens: 3,
    });
    expect(rows[0]?.costUsd).toBeCloseTo(0.03);
  });

  // B2 (side-eye corpus re-pass, owner-observed): the corpus shelf printed "0 tokens returned" beside
  // "1,187 exchanges" for five imported characters. The turns are real; nothing ever wrote a token count for
  // them, and `COALESCE(SUM(tokens_out), 0)` made "never measured" indistinguishable from "measured zero".
  test("a character whose turns recorded NO token count reads null, not 0 — absent accounting is not a zero", async () => {
    db = await freshDb();
    const owner = await seedUser(db);
    const imported = await seedCharacter(db, owner, { id: "character_imported", name: "Hikari" });
    const chat = await seedChat(db, imported, { id: "chat_imported" });
    // An imported transcript: assistant turns with a selected variant carrying no economics at all.
    await seedMessage(db, { chatId: chat, seq: 1, role: "assistant", characterId: imported, variants: [{ model: "gpt" }] });
    await seedMessage(db, { chatId: chat, seq: 2, role: "assistant", characterId: imported, variants: [{ model: "gpt" }] });

    const rows = await readCharacterEconomics(db, owner);
    expect(rows).toHaveLength(1);
    // The generations are REAL — this is a character with history, which is exactly why a zero read as a bug.
    expect(rows[0]?.generations).toBe(2);
    expect(rows[0]?.tokensOut, "no variant recorded a count, so there is no total to report").toBeNull();
    // Token presence cannot manufacture a dollar observation.
    expect(rows[0]?.costUsd).toBeNull();
  });

  test("a genuine zero still reads as zero — the null is 'never recorded', not 'nothing came back'", async () => {
    db = await freshDb();
    const owner = await seedUser(db);
    const character = await seedCharacter(db, owner, { id: "character_zero" });
    const chat = await seedChat(db, character, { id: "chat_zero" });
    await seedMessage(db, { chatId: chat, seq: 1, role: "assistant", characterId: character, variants: [{ model: "gpt", tokensOut: 0 }] });

    const rows = await readCharacterEconomics(db, owner);
    expect(rows[0]?.tokensOut).toBe(0);
  });

  test("never counts another owner's turns", async () => {
    db = await freshDb();
    const owner = await seedUser(db);
    const other = await seedUser(db, "user_other", "user");
    const mine = await seedCharacter(db, owner, { id: "character_mine" });
    const theirs = await seedCharacter(db, other, { id: "character_theirs" });
    const myChat = await seedChat(db, mine, { id: "chat_mine" });
    const theirChat = await seedChat(db, theirs, { id: "chat_theirs" });
    await seedMessage(db, {
      chatId: myChat,
      seq: 1,
      role: "assistant",
      characterId: mine,
      variants: [{ model: "gpt", tokensOut: 10 }],
    });
    await seedMessage(db, {
      chatId: theirChat,
      seq: 1,
      role: "assistant",
      characterId: theirs,
      variants: [{ model: "gpt", tokensOut: 999 }],
    });

    const rows = await readCharacterEconomics(db, owner);
    expect(rows.map((r) => r.characterId)).toEqual([mine]);
    expect(rows[0]?.tokensOut).toBe(10);
  });

  // #1791: a husk chat (`started_at IS NULL`, e.g. a seeded greeting never claimed) is not one of the
  // owner's chats per `ownerChatIds` (#1477) — its assistant generations must not appear in the economics
  // total.
  test("a husk chat's assistant generations are excluded — economics spans the same chats as ownerChatIds", async () => {
    db = await freshDb();
    const owner = await seedUser(db);
    const character = await seedCharacter(db, owner, { id: "character_husk_econ" });
    const husk = await seedChat(db, character, { id: "chat_husk_econ", startedAt: null });
    await seedMessage(db, {
      chatId: husk,
      seq: 1,
      role: "assistant",
      characterId: character,
      variants: [{ model: "gpt", tokensOut: 999, costUsd: 9.99 }],
    });

    const rows = await readCharacterEconomics(db, owner);
    expect(rows).toHaveLength(0);
  });
});

describe("readCharacterModelEconomics", () => {
  test("splits economics per (character, model) with gen-time samples; excludes model-less turns", async () => {
    db = await freshDb();
    const owner = await seedUser(db);
    const character = await seedCharacter(db, owner, { id: "character_a" });
    const chat = await seedChat(db, character, { id: "chat_a" });

    await seedMessage(db, {
      chatId: chat,
      seq: 1,
      role: "assistant",
      characterId: character,
      variants: [
        { model: "gpt", tokensOut: 40, genStartedAt: 1000, genFinishedAt: 1600 }, // 600ms
      ],
    });
    await seedMessage(db, {
      chatId: chat,
      seq: 2,
      role: "assistant",
      characterId: character,
      variants: [{ model: "gpt", tokensOut: 60 }], // no gen timestamps → not a gen sample
    });
    // A model-less generation is excluded entirely (a route needs a model).
    await seedMessage(db, {
      chatId: chat,
      seq: 3,
      role: "assistant",
      characterId: character,
      variants: [{ model: null, tokensOut: 500 }],
    });

    const rows = await readCharacterModelEconomics(db, owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      characterId: character,
      model: "gpt",
      generations: 2,
      tokensOut: 100,
      genTimeMs: 600,
      genSamples: 1,
    });
  });

  // #1791: same husk-exclusion contract as readCharacterEconomics above.
  test("a husk chat's assistant generations are excluded from the per-model split", async () => {
    db = await freshDb();
    const owner = await seedUser(db);
    const character = await seedCharacter(db, owner, { id: "character_husk_model_econ" });
    const husk = await seedChat(db, character, { id: "chat_husk_model_econ", startedAt: null });
    await seedMessage(db, {
      chatId: husk,
      seq: 1,
      role: "assistant",
      characterId: character,
      variants: [{ model: "gpt", tokensOut: 999 }],
    });

    const rows = await readCharacterModelEconomics(db, owner);
    expect(rows).toHaveLength(0);
  });
});
