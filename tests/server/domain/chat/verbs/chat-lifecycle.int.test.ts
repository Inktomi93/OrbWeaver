// The chat-ROW lifecycle + variables + persisted injections (chat.md Part III §11). Proves against a real
// libSQL db: the host-authority gate, the row writes, the variables round-trip (config plane), the injections
// CRUD, and the emitted bus events. Reached through the BUNDLE `createChatLifecycle(ctx, { emit })`.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { chatInjections, chats } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import { createChatLifecycle } from "../../../../../packages/server/src/domain/chat/verbs/chat-lifecycle";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedChat, seedParticipant, seedUser } from "../_support";

let db: Db;
let emitted: ChatBusEvent[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
});

const emit = (event: ChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

function principal(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>("h"), externalId: null, via: "cookie" };
}

/** Seed a room with a host + a plain member; returns their ids + the chat id. */
async function seedRoom(): Promise<{
  host: UserId;
  member: UserId;
  chatId: Awaited<ReturnType<typeof seedChat>>;
}> {
  const host = await seedUser(db, "host");
  const member = await seedUser(db, "member");
  const chatId = await seedChat(db, "a");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
  return { host, member, chatId };
}

describe("chat-row flags (host-only)", () => {
  test("updateTitle writes the row + emits chatUpdated; a member is refused", async () => {
    const { host, member, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), { emit });

    await life.updateTitle({ principal: principal(host), chatId, title: "Renamed" });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.title).toBe("Renamed");
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);

    const err = await life
      .updateTitle({ principal: principal(member), chatId, title: "no" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });

  test("archive + star toggle the row flags", async () => {
    const { host, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), { emit });

    await life.archive({ principal: principal(host), chatId, archived: true });
    await life.star({ principal: principal(host), chatId, star: true });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.archived).toBe(true);
    expect(row?.star).toBe(true);
  });

  test("delete drops the chat + emits chatDeleted", async () => {
    const { host, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), { emit });

    await life.delete({ principal: principal(host), chatId });
    const rows = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(rows).toHaveLength(0);
    expect(emitted).toEqual([{ type: "chatDeleted", chatId }]);
  });
});

describe("variables — the config-plane round-trip (member)", () => {
  test("setVariables persists; get/getStored read them back; clearVariables empties", async () => {
    const { member, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), { emit });

    await life.setVariables({ principal: principal(member), chatId, values: { mood: "tense" } });
    expect(await life.getStoredVariables({ principal: principal(member), chatId })).toEqual({
      mood: "tense",
    });
    expect(await life.getVariables({ principal: principal(member), chatId })).toEqual({
      mood: "tense",
    });

    await life.clearVariables({ principal: principal(member), chatId });
    expect(await life.getStoredVariables({ principal: principal(member), chatId })).toEqual({});
  });
});

describe("injections — CRUD (write host, list member)", () => {
  test("create → list → update → delete", async () => {
    const { host, member, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), { emit });

    const created = await life.setChatInjection({
      principal: principal(host),
      chatId,
      position: "in_prompt",
      depth: 2,
      role: "system",
      content: "be terse",
    });
    expect(created.content).toBe("be terse");
    const listed = await life.listChatInjections({ principal: principal(member), chatId });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);

    const updated = await life.setChatInjection({
      principal: principal(host),
      chatId,
      id: created.id,
      position: "in_prompt",
      depth: 2,
      role: "system",
      content: "be verbose",
    });
    expect(updated.id).toBe(created.id);
    const [row] = await db.select().from(chatInjections).where(eq(chatInjections.id, created.id));
    expect(row?.content).toBe("be verbose");

    await life.deleteChatInjection({ principal: principal(host), chatId, injectionId: created.id });
    expect(await life.listChatInjections({ principal: principal(member), chatId })).toHaveLength(0);
  });

  test("a member cannot write an injection (host-only)", async () => {
    const { member, chatId } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), { emit });
    const err = await life
      .setChatInjection({
        principal: principal(member),
        chatId,
        position: "in_prompt",
        depth: 0,
        role: "system",
        content: "x",
      })
      .catch((e: unknown) => e);
    expect((err as ChatOperationError).code).toBe("not_host");
  });
});

describe("reapTemporaryChats — honest no-op (FLAG[reap-no-schema])", () => {
  test("returns { reaped: 0 } (no temporary-chat concept in the schema)", async () => {
    const { host } = await seedRoom();
    const life = createChatLifecycle(makeChatContext(db), { emit });
    expect(await life.reapTemporaryChats({ principal: principal(host) })).toEqual({ reaped: 0 });
  });
});
