// The canon-EDIT verbs (chat.md Part III per-verb specs + §11 the auth matrix; D26). Proves against a real
// libSQL db: an edit mutates the VARIANT (content/reasoning) or the SLOT (selection/hidden/seq/attribution)
// and NEVER doubles content (the slot stays one row, variantCount unchanged); the author-or-host gate; the FK
// cascade on delete; and the emitted bus event. The verbs are reached through the BUNDLE `createEdit(ctx, {emit})`.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { messages, messageVariants } from "@orb/db";
import type { CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  ChatNotFoundError,
  ChatOperationError,
} from "../../../../../packages/server/src/domain/chat/contract/errors";
import { createEdit } from "../../../../../packages/server/src/domain/chat/verbs/edit";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import {
  addVariant,
  makeChatContext,
  seedCharacter,
  seedChat,
  seedMessage,
  seedParticipant,
  seedUser,
} from "../_support";

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

/** Seed a solo room: host + member humans, a character, and return their ids. */
async function seedRoom(): Promise<{
  host: UserId;
  member: UserId;
  chatId: Awaited<ReturnType<typeof seedChat>>;
  charA: CharacterId;
}> {
  const host = await seedUser(db, "host");
  const member = await seedUser(db, "member");
  const charA = await seedCharacter(db, host, "aria");
  const chatId = await seedChat(db, "a");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
  await seedParticipant(db, { chatId, key: "c", characterId: charA });
  return { host, member, chatId, charA };
}

describe("editMessage — mutate the selected variant (D26, no doubling)", () => {
  test("the author edits their own message: content changes, the slot stays one row", async () => {
    const { member, chatId } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: member,
      content: "orig",
    });
    const edit = createEdit(makeChatContext(db), { emit });

    const view = await edit.editMessage({
      principal: principal(member),
      chatId,
      messageId,
      content: "fixed",
    });

    expect(view.content).toBe("fixed");
    expect(view.variantCount).toBe(1); // D26: edit mutated the variant, never appended one
    expect(view.editedAt).toBe(view.createdAt); // editedAt stamped (FROZEN clock)
    const variants = await db
      .select()
      .from(messageVariants)
      .where(eq(messageVariants.messageId, messageId));
    expect(variants).toHaveLength(1);
    expect(variants[0]?.content).toBe("fixed");
    expect(emitted).toEqual([{ type: "messageEdited", chatId, messageId, view }]);
  });

  test("a non-author member is refused with not_author; the host may edit any slot", async () => {
    const { host, member, chatId, charA } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
    });
    const edit = createEdit(makeChatContext(db), { emit });

    const err = await edit
      .editMessage({ principal: principal(member), chatId, messageId, content: "x" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_author");

    const view = await edit.editMessage({
      principal: principal(host),
      chatId,
      messageId,
      content: "hostfix",
    });
    expect(view.content).toBe("hostfix");
  });

  test("the canon-purity strip drops a leaked self speaker-label on a character row", async () => {
    const { host, chatId, charA } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
    });
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve({ name: "Aria", avatarAssetId: null } as never),
    });
    const edit = createEdit(ctx, { emit });

    const view = await edit.editMessage({
      principal: principal(host),
      chatId,
      messageId,
      content: "Aria: hello there",
    });
    expect(view.content).toBe("hello there");
  });
});

describe("selectVariant — flip the pointer to a sibling swipe (D26 zero-copy)", () => {
  test("selecting an appended swipe moves the pointer; a foreign variant is NOT_FOUND", async () => {
    const { host, chatId, charA } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
      content: "swipe0",
    });
    const swipe1 = await addVariant(db, messageId, 1, "swipe1");
    const other = await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA });
    const edit = createEdit(makeChatContext(db), { emit });

    const view = await edit.selectVariant({
      principal: principal(host),
      chatId,
      messageId,
      variantId: swipe1,
    });
    expect(view.selectedVariantIdx).toBe(1);
    expect(view.content).toBe("swipe1");
    expect(view.variantCount).toBe(2);
    expect(emitted.at(-1)).toEqual({ type: "variantSelected", chatId, messageId, view });

    const err = await edit
      .selectVariant({ principal: principal(host), chatId, messageId, variantId: other.variantId })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatNotFoundError);
  });
});

describe("setMessageHidden / editReasoning / clearReasoning", () => {
  test("setMessageHidden toggles excludedFromPrompt (the row survives)", async () => {
    const { host, chatId, charA } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
    });
    const edit = createEdit(makeChatContext(db), { emit });

    const view = await edit.setMessageHidden({
      principal: principal(host),
      chatId,
      messageId,
      hidden: true,
    });
    expect(view.excludedFromPrompt).toBe(true);
    const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
    expect(row?.excludedFromPrompt).toBe(true);
  });

  test("editReasoning sets, clearReasoning nulls, the variant's reasoning", async () => {
    const { host, chatId, charA } = await seedRoom();
    const { messageId, variantId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
    });
    const edit = createEdit(makeChatContext(db), { emit });

    const edited = await edit.editReasoning({
      principal: principal(host),
      chatId,
      messageId,
      reasoning: "because",
    });
    expect(edited.reasoning).toBe("because");
    expect(emitted.at(-1)?.type).toBe("reasoningEdited");

    const cleared = await edit.clearReasoning({ principal: principal(host), chatId, messageId });
    expect(cleared.reasoning).toBeNull();
    expect(emitted.at(-1)?.type).toBe("reasoningCleared");
    const [v] = await db.select().from(messageVariants).where(eq(messageVariants.id, variantId));
    expect(v?.reasoning).toBeNull();
  });
});

describe("deleteMessages — bulk, author-or-host, FK cascade", () => {
  test("the host deletes a set; variants cascade; emits messagesDeleted", async () => {
    const { host, chatId, charA } = await seedRoom();
    const a = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA });
    const b = await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA });
    const edit = createEdit(makeChatContext(db), { emit });

    await edit.deleteMessages({
      principal: principal(host),
      chatId,
      messageIds: [a.messageId, b.messageId],
    });

    const rows = await db.select().from(messages).where(eq(messages.chatId, chatId));
    expect(rows).toHaveLength(0);
    const variants = await db
      .select()
      .from(messageVariants)
      .where(eq(messageVariants.id, a.variantId));
    expect(variants).toHaveLength(0); // FK CASCADE
    expect(emitted).toEqual([
      { type: "messagesDeleted", chatId, messageIds: [a.messageId, b.messageId] },
    ]);
  });

  test("a member cannot delete another member's slot (not_author)", async () => {
    const { member, chatId, charA } = await seedRoom();
    const a = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA });
    const edit = createEdit(makeChatContext(db), { emit });

    const err = await edit
      .deleteMessages({ principal: principal(member), chatId, messageIds: [a.messageId] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_author");
  });
});

describe("moveMessage — host-only re-sequence", () => {
  test("moving the head to the tail re-stamps the affected block", async () => {
    const { host, member, chatId, charA } = await seedRoom();
    const m1 = await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: member,
      content: "one",
    });
    await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA, content: "two" });
    await seedMessage(db, chatId, 3, { role: "assistant", characterId: charA, content: "three" });
    const edit = createEdit(makeChatContext(db), { emit });

    await edit.moveMessage({
      principal: principal(host),
      chatId,
      messageId: m1.messageId,
      toSeq: 3,
    });

    const ordered = await db
      .select({ id: messages.id, seq: messages.seq, content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.seq));
    expect(ordered.map((r) => r.content)).toEqual(["two", "three", "one"]);
    expect(emitted.at(-1)).toEqual({ type: "messagesReordered", chatId });
  });

  test("a member is refused (not_host)", async () => {
    const { member, chatId } = await seedRoom();
    const m1 = await seedMessage(db, chatId, 1, { role: "user", authorUserId: member });
    const edit = createEdit(makeChatContext(db), { emit });
    const err = await edit
      .moveMessage({ principal: principal(member), chatId, messageId: m1.messageId, toSeq: 2 })
      .catch((e: unknown) => e);
    expect((err as ChatOperationError).code).toBe("not_host");
  });
});

describe("duplicateMessage / reattributeMessages", () => {
  test("duplicateMessage copies the slot + selected variant to a new tail; the original is intact", async () => {
    const { host, chatId, charA } = await seedRoom();
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
      content: "echo",
    });
    const edit = createEdit(makeChatContext(db), { emit });

    const dup = await edit.duplicateMessage({ principal: principal(host), chatId, messageId });
    expect(dup.content).toBe("echo");
    expect(dup.seq).toBe(2);
    expect(dup.id).not.toBe(messageId);
    const rows = await db.select().from(messages).where(eq(messages.chatId, chatId));
    expect(rows).toHaveLength(2);
    expect(emitted.at(-1)?.type).toBe("messageCommitted");
  });

  test("reattributeMessages (host) re-stamps the characterId", async () => {
    const { host, chatId, charA } = await seedRoom();
    const charB = await seedCharacter(db, host, "borg");
    const a = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA });
    const edit = createEdit(makeChatContext(db), { emit });

    await edit.reattributeMessages({
      principal: principal(host),
      chatId,
      messageIds: [a.messageId],
      characterId: charB,
    });

    const [row] = await db.select().from(messages).where(eq(messages.id, a.messageId));
    expect(row?.characterId).toBe(charB);
    expect(emitted.at(-1)?.type).toBe("messageEdited");
  });
});
