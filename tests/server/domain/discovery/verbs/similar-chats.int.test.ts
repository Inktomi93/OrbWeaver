// Integration: PD-40 similarChats — DISCOVERY-NATIVE "more like THIS chat" by segment-centroid cosine, IN-RAM
// (centroid derived at request time, NOT stored — ledger line 78); zero search. Owner-scoped via present-host
// (audit #1 / D18); TITLE-only hits (D28); self excluded; similarity-descending.

import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  makeDiscoveryHarness,
  seedChatSegment,
  seedDepartedHost,
  seedHostedChat,
  seedUser,
  vec,
} from "../_support.ts";

// Seed a hosted chat with a title + one segment vector (one block = one centroid input).
async function seedChatWith(
  db: Db,
  args: {
    id: string;
    ownerId: UserId;
    title: string;
    embeddings: readonly Float32Array[];
  },
): Promise<ChatId> {
  const chatId = await seedHostedChat(db, args.id, args.ownerId);
  await db.update(chats).set({ title: args.title }).where(eq(chats.id, chatId));
  await Promise.all(
    args.embeddings.map((embedding, i) =>
      seedChatSegment(db, { id: `${args.id}_seg_${i}`, chatId, blockIdx: i, embedding }),
    ),
  );
  return chatId;
}

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

describe("similarChats", () => {
  test("ranks other chats by centroid cosine, self excluded, title-only", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const target = await seedChatWith(db, {
      id: "chat_target",
      ownerId: owner,
      title: "Target",
      embeddings: [vec(1, 0), vec(1, 0.1)],
    });
    const near = await seedChatWith(db, {
      id: "chat_near",
      ownerId: owner,
      title: "Near",
      embeddings: [vec(1, 0.05)],
    });
    const far = await seedChatWith(db, {
      id: "chat_far",
      ownerId: owner,
      title: "Far",
      embeddings: [vec(0, 1)],
    });

    const hits = await svcFor(db).similarChats(owner, target);
    expect(hits.map((h) => h.chatId)).toEqual([near, far]);
    expect(hits.map((h) => h.title)).toEqual(["Near", "Far"]);
    // Self is never a hit.
    expect(hits.some((h) => h.chatId === target)).toBe(false);
    expect(hits[0]?.similarity).toBeGreaterThan(hits[1]?.similarity ?? 1);
  });

  test("limit caps the returned hits", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const target = await seedChatWith(db, {
      id: "chat_target",
      ownerId: owner,
      title: "Target",
      embeddings: [vec(1, 0)],
    });
    await seedChatWith(db, { id: "c1", ownerId: owner, title: "One", embeddings: [vec(1, 0.1)] });
    await seedChatWith(db, { id: "c2", ownerId: owner, title: "Two", embeddings: [vec(1, 0.2)] });
    await seedChatWith(db, { id: "c3", ownerId: owner, title: "Three", embeddings: [vec(1, 0.3)] });

    const hits = await svcFor(db).similarChats(owner, target, 2);
    expect(hits).toHaveLength(2);
  });

  test("a foreign owner cannot compare another owner's chat (audit #1 / present-host belt)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const stranger = await seedUser(db, "user_b");
    const target = await seedChatWith(db, {
      id: "chat_target",
      ownerId: owner,
      title: "Target",
      embeddings: [vec(1, 0)],
    });
    await seedChatWith(db, {
      id: "chat_near",
      ownerId: owner,
      title: "Near",
      embeddings: [vec(1, 0.05)],
    });
    // The stranger hosts none of these chats → the target has no segments in scope → an empty list.
    expect(await svcFor(db).similarChats(stranger, target)).toEqual([]);
  });

  test("a departed ex-host does not re-attribute the chat (D18)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const exHost = await seedUser(db, "user_ex");
    const target = await seedChatWith(db, {
      id: "chat_target",
      ownerId: owner,
      title: "Target",
      embeddings: [vec(1, 0)],
    });
    await seedChatWith(db, {
      id: "chat_near",
      ownerId: owner,
      title: "Near",
      embeddings: [vec(1, 0.05)],
    });
    // A stale departed `role='host'` row on the target must NOT let the ex-host see it as theirs.
    await seedDepartedHost(db, target, exHost);
    expect(await svcFor(db).similarChats(exHost, target)).toEqual([]);
  });
});
