// Integration: PD-40 insights (pure-semantics half) — themeDrift (story-time theme prevalence over msgMidAt
// month buckets) + unusedCharacters (collected-but-never-played). Both owner-scoped (audit #1).

import type { Db } from "@orb/db";
import { chatParticipants, digestThemeAssignments, themeClusters } from "@orb/db";
import type { ChatId, ThemeClusterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeDiscoveryHarness, seedCharacter, seedChatDigest, seedHostedChat, seedUser, vec } from "../_support.ts";

// 2024-01-15 and 2024-03-20 (epoch-ms) — two distinct YYYY-MM story-time buckets.
const JAN_2024 = Date.UTC(2024, 0, 15);
const MAR_2024 = Date.UTC(2024, 2, 20);

let clusterN = 0;
let digestN = 0;

async function seedCluster(db: Db, args: { ownerId: UserId; clusterIdx: number; name: string | null; level?: string }): Promise<ThemeClusterId> {
  clusterN += 1;
  const id = castId<ThemeClusterId>(`theme_cluster_${clusterN}`);
  await db.insert(themeClusters).values({
    id,
    ownerId: args.ownerId,
    level: args.level ?? "scene",
    clusterIdx: args.clusterIdx,
    name: args.name,
    size: 1,
    model: "test-embed-model-1024",
    computedAt: FROZEN_AT,
  });
  return id;
}

async function assignDigest(db: Db, args: { digestId: string; chatId: ChatId; clusterId: ThemeClusterId; msgMidAt: number }): Promise<void> {
  digestN += 1;
  await seedChatDigest(db, {
    id: args.digestId,
    chatId: args.chatId,
    embedding: vec(1),
    tier: 0,
    blockIdx: digestN,
    contentHash: `h_${args.digestId}`,
  });
  await db.insert(digestThemeAssignments).values({
    digestId: castId(args.digestId),
    themeClusterId: args.clusterId,
    msgMidAt: args.msgMidAt,
    computedAt: FROZEN_AT,
  });
}

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

describe("themeDrift", () => {
  test("buckets theme prevalence by story-time month, owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const chat = await seedHostedChat(db, "chat_1", owner);
    const otherChat = await seedHostedChat(db, "chat_2", other);
    const adventure = await seedCluster(db, { ownerId: owner, clusterIdx: 0, name: "Adventure" });
    const foreignCluster = await seedCluster(db, {
      ownerId: other,
      clusterIdx: 0,
      name: "Foreign",
    });

    await assignDigest(db, {
      digestId: "d_jan",
      chatId: chat,
      clusterId: adventure,
      msgMidAt: JAN_2024,
    });
    await assignDigest(db, {
      digestId: "d_mar",
      chatId: chat,
      clusterId: adventure,
      msgMidAt: MAR_2024,
    });
    await assignDigest(db, {
      digestId: "d_foreign",
      chatId: otherChat,
      clusterId: foreignCluster,
      msgMidAt: JAN_2024,
    });

    const drift = await svcFor(db).themeDrift(owner);
    expect(drift.map((b) => b.bucket)).toEqual(["2024-01", "2024-03"]);
    expect(drift[0]?.themes[0]).toMatchObject({ themeName: "Adventure", count: 1 });
    // The foreign owner's bucket never appears.
  });

  test("skips assignments with a null msgMidAt", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    const cluster = await seedCluster(db, { ownerId: owner, clusterIdx: 0, name: "Untimed" });
    await seedChatDigest(db, {
      id: "d_null",
      chatId: chat,
      embedding: vec(1),
      tier: 0,
      blockIdx: 7,
      contentHash: "h_null",
    });
    await db.insert(digestThemeAssignments).values({
      digestId: castId("d_null"),
      themeClusterId: cluster,
      msgMidAt: null,
      computedAt: FROZEN_AT,
    });
    expect(await svcFor(db).themeDrift(owner)).toEqual([]);
  });
});

describe("unusedCharacters", () => {
  test("returns collected-but-never-played characters, owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const chat = await seedHostedChat(db, "chat_1", owner);
    const played = await seedCharacter(db, {
      id: "character_played",
      ownerId: owner,
      name: "Played",
    });
    const unused = await seedCharacter(db, {
      id: "character_unused",
      ownerId: owner,
      name: "Unused",
    });
    // A synthetic group char is excluded regardless of seats.
    await seedCharacter(db, { id: "character_group", ownerId: owner, synthetic: true });
    // A foreign owner's unused char must not surface for `owner`.
    await seedCharacter(db, { id: "character_foreign", ownerId: other, name: "Foreign" });
    // Give `played` a character seat (a chat participation).
    await db.insert(chatParticipants).values({
      id: castId("chat_participant_char"),
      chatId: chat,
      kind: "character",
      characterId: played,
      role: "member",
      joinSeq: 1,
      joinedAt: FROZEN_AT,
    });

    const rows = await svcFor(db).unusedCharacters(owner);
    expect(rows.map((r) => r.name)).toEqual(["Unused"]);
    expect(rows[0]?.characterId).toBe(unused);
  });
});
