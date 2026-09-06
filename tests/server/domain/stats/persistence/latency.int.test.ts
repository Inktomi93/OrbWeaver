// persistence/latency — on-read TTFT/gen percentiles from the SELECTED variant (D26) of owned assistant
// messages, scoped owner / character / model. Plus the model-bucket key + the one-scan bucketed latencies.

import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { modelLatencyKey, readLatency, readModelLatencies } from "../../../../../packages/server/src/domain/stats/persistence/latency.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedMessage, seedUser, T0 } from "../_support.ts";

let db: Db;
let ownerId: UserId;
let characterId: CharacterId;

beforeEach(async () => {
  db = await freshDb();
  ownerId = await seedUser(db);
  characterId = await seedCharacter(db, ownerId);
  const chatId = await seedChat(db, characterId);
  await seedMessage(db, {
    chatId,
    seq: 1,
    role: "assistant",
    characterId,
    variants: [
      {
        content: "a",
        model: "gpt",
        provider: "openrouter",
        ttftMs: 100,
        genStartedAt: T0,
        genFinishedAt: T0 + 100,
      },
    ],
  });
  await seedMessage(db, {
    chatId,
    seq: 2,
    role: "assistant",
    characterId,
    variants: [
      {
        content: "b",
        model: "gpt",
        provider: "openrouter",
        ttftMs: 300,
        genStartedAt: T0,
        genFinishedAt: T0 + 300,
      },
    ],
  });
});

describe("readLatency", () => {
  test("computes owner-scope TTFT + gen percentiles from selected variants", async () => {
    const l = await readLatency(db, ownerId, { kind: "owner" });
    expect(l.avgTtftMs).toBe(200); // (100 + 300) / 2
    expect(l.p50TtftMs).toBe(100); // nearest-rank ceil(0.5*2)-1 = index 0
    expect(l.avgGenMs).toBe(200); // (100 + 300) / 2
  });

  test("character scope narrows to one character; an empty scope yields nulls", async () => {
    const l = await readLatency(db, ownerId, { kind: "character", characterId });
    expect(l.avgTtftMs).toBe(200);
    const empty = await seedCharacter(db, ownerId, { id: "character_empty" });
    const none = await readLatency(db, ownerId, { kind: "character", characterId: empty });
    expect(none.avgTtftMs).toBeNull();
  });

  test("owner latency is bounded to the newest 100 selected assistant samples", async () => {
    const boundedDb = await freshDb();
    const boundedOwner = await seedUser(boundedDb, "user_bounded", "user");
    const boundedCharacter = await seedCharacter(boundedDb, boundedOwner, { id: "character_bounded" });
    const boundedChat = await seedChat(boundedDb, boundedCharacter, { id: "chat_bounded" });
    for (let seq = 1; seq <= 101; seq += 1) {
      const value = seq === 1 ? 0 : 1000;
      await seedMessage(boundedDb, {
        chatId: boundedChat,
        seq,
        role: "assistant",
        characterId: boundedCharacter,
        createdAt: T0 + seq,
        variants: [{ content: String(seq), ttftMs: value, genStartedAt: T0, genFinishedAt: T0 + value }],
      });
    }

    const latency = await readLatency(boundedDb, boundedOwner, { kind: "owner" });

    expect(latency.avgTtftMs).toBe(1000);
    expect(latency.avgGenMs).toBe(1000);
  });

  test("model scope applies its newest-100 bound inside the requested model/provider bucket", async () => {
    const bucketDb = await freshDb();
    const bucketOwner = await seedUser(bucketDb, "user_bucket", "user");
    const bucketCharacter = await seedCharacter(bucketDb, bucketOwner, { id: "character_bucket" });
    const bucketChat = await seedChat(bucketDb, bucketCharacter, { id: "chat_bucket" });
    await seedMessage(bucketDb, {
      chatId: bucketChat,
      seq: 1,
      role: "assistant",
      characterId: bucketCharacter,
      createdAt: T0 + 1,
      variants: [{ content: "model-a", model: "model-a", provider: "provider-a", ttftMs: 111, genStartedAt: T0, genFinishedAt: T0 + 222 }],
    });
    for (let seq = 2; seq <= 101; seq += 1) {
      await seedMessage(bucketDb, {
        chatId: bucketChat,
        seq,
        role: "assistant",
        characterId: bucketCharacter,
        createdAt: T0 + seq,
        variants: [{ content: "model-b", model: "model-b", provider: "provider-b", ttftMs: 999, genStartedAt: T0, genFinishedAt: T0 + 999 }],
      });
    }

    const latency = await readLatency(bucketDb, bucketOwner, { kind: "model", model: "model-a", provider: "provider-a" });

    expect(latency.avgTtftMs).toBe(111);
    expect(latency.avgGenMs).toBe(222);
  });

  // The #1477 husk arm added an owner-chat-membership subquery to this read. The plan pin is extended to
  // the POST-fix shape on purpose: the subquery must not cost the owner-indexed entry point (a `SCAN c`
  // here would mean the dashboard's per-model read degraded to a full character sweep). Measured after the
  // change — every step is an indexed SEARCH, zero SCAN:
  //   SEARCH c USING INDEX characters_owner_idx (owner_id=?) / SEARCH m USING INDEX messages_character_idx
  //   (character_id=?) / LIST SUBQUERY 1 → SEARCH c2 characters_owner_idx, SEARCH cp
  //   chat_participants_character_idx, SEARCH ch sqlite_autoindex_chats_1 / SEARCH v
  //   sqlite_autoindex_message_variants_1.
  // `not.toContain("SCAN c")` covers the subquery's `c2` alias too (substring), which is deliberate.
  test("the model/provider latency plan starts from the owner's indexed character set", async () => {
    const planDb = await freshDb();
    const plan = await planDb.all<{ detail: string }>(
      sql.raw(`
      EXPLAIN QUERY PLAN
      SELECT v.ttft_ms
      FROM message_variants v
      JOIN messages m ON m.selected_variant_id = v.id
      JOIN characters c ON c.id = m.character_id
      WHERE c.owner_id = 'user_plan'
        AND m.role = 'assistant'
        AND m.chat_id IN (
          SELECT DISTINCT cp.chat_id FROM chat_participants cp
          JOIN characters c2 ON c2.id = cp.character_id
          JOIN chats ch ON ch.id = cp.chat_id
          WHERE c2.owner_id = 'user_plan' AND cp.kind = 'character' AND ch.started_at IS NOT NULL
        )
        AND v.model = 'model-a'
        AND v.provider = 'provider-a'
      ORDER BY m.rowid DESC
      LIMIT 100
    `),
    );
    const details = plan.map((row) => row.detail).join("\n");

    expect(details).toContain("characters_owner_idx");
    expect(details).toContain("messages_character_idx");
    expect(details).not.toContain("SCAN c");
  });
});

describe("readModelLatencies + modelLatencyKey", () => {
  test("buckets latency per (model, provider) in one scan", async () => {
    const map = await readModelLatencies(db, ownerId);
    const stats = map.get(modelLatencyKey("gpt", "openrouter"));
    expect(stats?.avgTtftMs).toBe(200);
  });

  // Model-LESS generations are disqualified before any bound applies (`v.model IS NOT NULL`), so a backlog
  // of them cannot displace a real model bucket. (This pinned the pre-#1477 all-model bound's qualification
  // order; with the bound now per bucket it pins the NULL-model filter itself.)
  test("model-less generations never displace a qualified model bucket", async () => {
    const bucketDb = await freshDb();
    const owner = await seedUser(bucketDb, "user_model_bucket", "user");
    const character = await seedCharacter(bucketDb, owner, { id: "character_model_bucket" });
    const chat = await seedChat(bucketDb, character, { id: "chat_model_bucket" });
    await seedMessage(bucketDb, {
      chatId: chat,
      seq: 1,
      role: "assistant",
      characterId: character,
      variants: [{ content: "model-a", model: "model-a", provider: "provider-a", ttftMs: 111, genStartedAt: T0, genFinishedAt: T0 + 222 }],
    });
    for (let seq = 2; seq <= 101; seq += 1) {
      await seedMessage(bucketDb, { chatId: chat, seq, role: "assistant", characterId: character, variants: [{ content: String(seq), model: null }] });
    }

    const map = await readModelLatencies(bucketDb, owner);

    expect(map.get(modelLatencyKey("model-a", "provider-a"))?.avgTtftMs).toBe(111);
  });

  test("a husk room's generations are excluded — latency spans the same rooms as the model_stats rollup", async () => {
    const huskDb = await freshDb();
    const owner = await seedUser(huskDb, "user_husk_latency", "user");
    const character = await seedCharacter(huskDb, owner, { id: "character_husk_latency" });
    const husk = await seedChat(huskDb, character, { id: "chat_husk_latency", startedAt: null });
    await seedMessage(huskDb, {
      chatId: husk,
      seq: 1,
      role: "assistant",
      characterId: character,
      variants: [{ content: "greeting", model: "m", provider: "p", ttftMs: 9999, genStartedAt: T0, genFinishedAt: T0 + 9999 }],
    });

    // `readByModel` merges this map onto rollup rows the rebuild built husk-EXCLUSIVE — a bucket here for a
    // room that contributed no `generations` there would print a latency for a room stats denies exists.
    expect(await readModelLatencies(huskDb, owner)).toHaveProperty("size", 0);
    expect((await readLatency(huskDb, owner, { kind: "owner" })).avgTtftMs).toBeNull();
  });

  test("the sample bound is PER BUCKET — a quiet model is not crowded out by a busy one", async () => {
    const crowdDb = await freshDb();
    const owner = await seedUser(crowdDb, "user_crowd", "user");
    const character = await seedCharacter(crowdDb, owner, { id: "character_crowd" });
    const chat = await seedChat(crowdDb, character, { id: "chat_crowd" });
    const gen = async (n: number, model: string, ttftMs: number): Promise<void> => {
      await seedMessage(crowdDb, {
        chatId: chat,
        seq: n,
        role: "assistant",
        characterId: character,
        createdAt: T0 + n,
        variants: [{ content: model, model, provider: "p", ttftMs, genStartedAt: T0, genFinishedAt: T0 + ttftMs }],
      });
    };
    // The quiet model generates FIRST (oldest rowids) — under a global newest-100 bound it is evicted
    // entirely by the busy model's backlog and vanishes from a map `readByModel` still renders a latency
    // column from.
    for (let n = 1; n <= 5; n += 1) {
      await gen(n, "quiet", 500);
    }
    // The busy model's OLDEST five carry a distinct value, so the per-bucket cap is observable too.
    for (let n = 6; n <= 10; n += 1) {
      await gen(n, "busy", 1);
    }
    for (let n = 11; n <= 110; n += 1) {
      await gen(n, "busy", 1000);
    }

    const map = await readModelLatencies(crowdDb, owner);

    expect(map.get(modelLatencyKey("quiet", "p"))?.avgTtftMs).toBe(500);
    // 100 newest `busy` samples, all 1000 — the five 1ms elders fell outside ITS OWN bucket's bound.
    expect(map.get(modelLatencyKey("busy", "p"))?.avgTtftMs).toBe(1000);
  });

  test("modelLatencyKey joins model + provider", () => {
    expect(modelLatencyKey("gpt", "openrouter")).toBe("gpt openrouter");
  });
});
