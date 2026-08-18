import { chatListCursorSchema } from "@orb/contracts/chat";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

// ═══ chatListCursorSchema — the `listChats` keyset boundary ═════════════════════
//
// The cursor is the ONE thing a client hands back that decides which rows it gets NEXT. A cursor that
// parses when it should not is a page that silently skips or repeats a run of chats, which reads as data
// loss rather than as a bad request — so these arms are about what the schema REFUSES.

test("a well-formed cursor round-trips both keyset fields", () => {
  const cursor = { recencyAt: 1_750_000_000_000, id: mintTypeId(ID_PREFIX.chat) };
  expect(chatListCursorSchema.parse(cursor)).toEqual(cursor);
});

test("the id must be a CHAT TypeID — a foreign-prefix id is refused, not silently keyed on", () => {
  const recencyAt = 1_750_000_000_000;
  // A character id is the realistic confusion: the same read takes `characterId` as its projection filter.
  expect(chatListCursorSchema.safeParse({ recencyAt, id: mintTypeId(ID_PREFIX.character) }).success).toBe(false);
  expect(chatListCursorSchema.safeParse({ recencyAt, id: "chat_not-a-typeid" }).success).toBe(false);
  expect(chatListCursorSchema.safeParse({ recencyAt, id: "" }).success).toBe(false);
});

test("`recencyAt` is an integer millisecond stamp — a float or a string is refused", () => {
  const id = mintTypeId(ID_PREFIX.chat);
  expect(chatListCursorSchema.safeParse({ recencyAt: 1.5, id }).success).toBe(false);
  expect(chatListCursorSchema.safeParse({ recencyAt: "1750000000000", id }).success).toBe(false);
});

test("BOTH keyset fields are required — a `recencyAt`-only cursor cannot parse", () => {
  // The tie-break half is not optional: a bulk import stamps the recency clock identically across hundreds
  // of rows, so a cursor without `id` would page across a tied run by skipping or repeating it.
  expect(chatListCursorSchema.safeParse({ recencyAt: 1_750_000_000_000 }).success).toBe(false);
  expect(chatListCursorSchema.safeParse({ id: mintTypeId(ID_PREFIX.chat) }).success).toBe(false);
});
