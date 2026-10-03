// Integration: insights (pure-semantics half) — themeDrift (story-time theme prevalence over msgMidAt
// calendar buckets the client folds into the viewer's months) + unusedCharacters (collected-but-never-played).
// Both owner-scoped.

import type { Db } from "@orb/db";
import { chatParticipants, digestThemeAssignments, themeClusters } from "@orb/db";
import type { ChatId, ThemeClusterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CALENDAR_BUCKET_MS } from "@orb/kit/time";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeDiscoveryHarness, seedCharacter, seedChatDigest, seedHostedChat, seedUser, vec } from "../_support.ts";

// 2024-01-15 and 2024-03-20 (epoch-ms) — each on a calendar-bucket boundary.
const JAN_2024 = Date.UTC(2024, 0, 15);
const MAR_2024 = Date.UTC(2024, 2, 20);
// 2024-02-01 02:00 UTC — still January 31 in New York, so only the client's fold may name its month.
const FEB_1_UTC_JAN_31_NEW_YORK = Date.UTC(2024, 1, 1, 2, 0);

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
  test("buckets theme prevalence by UTC calendar bucket, never by a UTC month, owner-scoped", async () => {
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

    await assignDigest(db, {
      digestId: "d_month_edge",
      chatId: chat,
      clusterId: adventure,
      msgMidAt: FEB_1_UTC_JAN_31_NEW_YORK + 1,
    });

    // The foreign owner's assignment at JAN_2024 never adds to the owner's bucket there.
    expect(await svcFor(db).themeDrift(owner)).toEqual([
      { bucketStart: JAN_2024, themes: [{ clusterIdx: 0, themeName: "Adventure", count: 1 }] },
      { bucketStart: FEB_1_UTC_JAN_31_NEW_YORK, themes: [{ clusterIdx: 0, themeName: "Adventure", count: 1 }] },
      { bucketStart: MAR_2024, themes: [{ clusterIdx: 0, themeName: "Adventure", count: 1 }] },
    ]);
  });

  test("ships every theme of a bucket, count-descending, and merges only instants inside one bucket", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    for (let clusterIdx = 0; clusterIdx < 6; clusterIdx += 1) {
      const clusterId = await seedCluster(db, { ownerId: owner, clusterIdx, name: `Theme ${clusterIdx}` });
      await assignDigest(db, { digestId: `d_spread_${clusterIdx}`, chatId: chat, clusterId, msgMidAt: JAN_2024 + clusterIdx });
    }
    // Past the six a month lists: the server ships it anyway, because only the client's fold knows the month.
    const lead = await seedCluster(db, { ownerId: owner, clusterIdx: 6, name: "Theme 6" });
    await assignDigest(db, { digestId: "d_lead", chatId: chat, clusterId: lead, msgMidAt: JAN_2024 });
    // Same bucket as JAN_2024 (its last millisecond), so it adds to theme 6; the next bucket starts a new row.
    await assignDigest(db, { digestId: "d_same_bucket", chatId: chat, clusterId: lead, msgMidAt: JAN_2024 + CALENDAR_BUCKET_MS - 1 });
    await assignDigest(db, { digestId: "d_next_bucket", chatId: chat, clusterId: lead, msgMidAt: JAN_2024 + CALENDAR_BUCKET_MS });

    const drift = await svcFor(db).themeDrift(owner);
    expect(drift.map((bucket) => bucket.bucketStart)).toEqual([JAN_2024, JAN_2024 + CALENDAR_BUCKET_MS]);
    expect(drift[0]?.themes.map((theme) => [theme.clusterIdx, theme.count])).toEqual([
      [6, 2],
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [5, 1],
    ]);
    expect(drift[1]?.themes).toEqual([{ clusterIdx: 6, themeName: "Theme 6", count: 1 }]);
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
