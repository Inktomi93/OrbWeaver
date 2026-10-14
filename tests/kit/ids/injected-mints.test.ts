import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId, newId, typeIdSchema } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso/ids.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("canonical mints preserve the injected business identity sequence", () => {
  const ids = createSeededIds();
  const expected = createSeededIds();
  const userId = newId<UserId>(ids.next);
  const chatId = mintTypeId(ID_PREFIX.chat, ids.next);
  const sessionId = mintTypeId(ID_PREFIX.session, ids.next);

  expect(userId).toBe(expected.next(""));
  expect(chatId).toBe(expected.next(ID_PREFIX.chat));
  expect(sessionId).toBe(expected.next(ID_PREFIX.session));
  expect(typeIdSchema(ID_PREFIX.chat).parse(chatId)).toBe(chatId);
  expect(typeIdSchema(ID_PREFIX.session).parse(sessionId)).toBe(sessionId);
});

test("canonical mints refuse a generator that returns another entity's prefix", () => {
  const ids = createSeededIds();
  const wrong = ids.next(ID_PREFIX.character);
  expect(() => mintTypeId(ID_PREFIX.chat, () => wrong)).toThrow();
  expect(() => newId<UserId>(() => wrong)).toThrow();
});

test("canonical mints refuse malformed generated identity bytes", () => {
  expect(() => mintTypeId(ID_PREFIX.chat, () => "chat_invalid")).toThrow();
  expect(() => newId<UserId>(() => "invalid")).toThrow();
});
