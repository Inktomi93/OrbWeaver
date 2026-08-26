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

  test("modelLatencyKey joins model + provider", () => {
    expect(modelLatencyKey("gpt", "openrouter")).toBe("gpt openrouter");
  });
});
