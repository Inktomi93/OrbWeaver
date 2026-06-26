import type { CharacterId, ChatId, MessageId, TypeIdOf, UserId } from "@orb/kit/ids";
import { brandedId, castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { assertType, expectTypeOf, test } from "vitest";

// The brands are the 446-importer universal leaf — a collision (e.g. a `Branded`/`TypeIdOf`
// regression that makes two entity ids structurally equal) is a SILENT type hole no runtime
// test can catch. These type-level assertions pin brand distinctness at `tsc` time.

test("distinct entity brands are mutually non-assignable", () => {
  expectTypeOf<ChatId>().not.toEqualTypeOf<MessageId>();
  expectTypeOf<ChatId>().not.toEqualTypeOf<CharacterId>();
  // The non-TypeID brand (UserId) is also distinct from a TypeID brand.
  expectTypeOf<UserId>().not.toEqualTypeOf<ChatId>();
});

test("a branded id is assignable TO string, but a plain string is NOT a brand", () => {
  // Branded<B> = string & {…} → widens to string freely.
  expectTypeOf<ChatId>().toMatchTypeOf<string>();
  // …but the reverse is blocked: a raw string cannot satisfy the brand.
  expectTypeOf<string>().not.toMatchTypeOf<ChatId>();
});

test("castId produces exactly the requested brand", () => {
  const id = castId<ChatId>("chat_x");
  expectTypeOf(id).toEqualTypeOf<ChatId>();
  expectTypeOf(id).not.toEqualTypeOf<MessageId>();
});

test("mintTypeId infers TypeIdOf<prefix> from the ID_PREFIX value", () => {
  const chat = mintTypeId(ID_PREFIX.chat);
  expectTypeOf(chat).toEqualTypeOf<TypeIdOf<"chat">>();
  // ID_PREFIX.chat is the literal "chat", not a widened string.
  expectTypeOf(ID_PREFIX.chat).toEqualTypeOf<"chat">();
});

test("brandedId<T> yields a zod schema whose output is the brand", () => {
  const schema = brandedId<UserId>();
  expectTypeOf(schema.parse("u")).toEqualTypeOf<UserId>();
  assertType<UserId>(schema.parse("u"));
});
