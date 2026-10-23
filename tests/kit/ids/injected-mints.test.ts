import { brandedId, createIdSource, ID_PREFIX, mintTypeId, mintUserId, typeIdSchema } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

test("canonical mints preserve the injected business identity sequence", () => {
  const ids = createSeededIds();
  const expected = createSeededIds();
  const userId = mintUserId(ids.next);
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
  expect(() => mintUserId(() => wrong)).toThrow();
});

test("canonical mints refuse malformed generated identity bytes", () => {
  expect(() => mintTypeId(ID_PREFIX.chat, () => "chat_invalid")).toThrow();
  expect(() => mintUserId(() => "invalid")).toThrow();
});

test("bound prefixless families and plain blob identities share the injected byte sequence", () => {
  const expected = createSeededIds();
  const source = createIdSource(createSeededIds().next);
  const minted = [source.userId(), source.rpgQuestId(), source.socketId(), source.unprefixed()];
  expect(minted).toEqual([expected.next(""), expected.next(""), expected.next(""), expected.next("")]);
});

test("the bound uuid mint yields a bare UUID that replays under the same injected sequence", () => {
  const first = createIdSource(createSeededIds().nextUuidBacked);
  const replay = createIdSource(createSeededIds().nextUuidBacked);
  const minted = [first.uuid(), first.uuid()];
  expect(minted[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(minted[0]).not.toBe(minted[1]);
  expect([replay.uuid(), replay.uuid()]).toEqual(minted);
  expect(createIdSource().uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test("label-derived text schemas retain opaque upstream values and refuse empty or non-string input", () => {
  const schema = brandedId("ProviderGenerationId");
  const opaque = "upstream:run/opaque-value";
  expect(schema.parse(opaque)).toBe(opaque);
  expect(schema.safeParse("").success).toBe(false);
  expect(schema.safeParse(12).success).toBe(false);
});
