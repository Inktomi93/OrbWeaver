import type { ChatId, RpgQuestId, SocketId, UserId, VerifiedUserId } from "@orb/kit/ids";
import { castId, createIdSource, ID_PREFIX, mintRpgQuestId, mintSocketId, mintTypeId, mintUserId, newId, typeIdSchema } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

test("business mints retain their canonical output types", () => {
  expectTypeOf(mintUserId()).toEqualTypeOf<UserId>();
  expectTypeOf(mintRpgQuestId()).toEqualTypeOf<RpgQuestId>();
  expectTypeOf(mintSocketId()).toEqualTypeOf<SocketId>();
  expectTypeOf(newId()).toEqualTypeOf<string>();
  expectTypeOf(createIdSource().unprefixed()).toEqualTypeOf<string>();
  expectTypeOf(createIdSource().userId()).toEqualTypeOf<UserId>();
  expectTypeOf(mintTypeId(ID_PREFIX.chat)).toEqualTypeOf<ChatId>();
  expectTypeOf(createIdSource().typeId(ID_PREFIX.chat)).toEqualTypeOf<ChatId>();
});

test("prefixless mints cannot manufacture another format or a stronger proof", () => {
  const ids = createIdSource();
  // @ts-expect-error a chat identity requires its prefix
  const chat: ChatId = mintUserId();
  // @ts-expect-error generating bytes does not verify a session
  const verified: VerifiedUserId = ids.userId();
  // @ts-expect-error a plain blob identity does not establish session verification
  const plainVerified: VerifiedUserId = newId();
  // @ts-expect-error a plain blob identity does not establish a user identity
  const plainUser: UserId = ids.unprefixed();
  // @ts-expect-error a concrete mint has no caller-selected output type
  mintUserId<VerifiedUserId>();
  // @ts-expect-error a concrete bound mint has no caller-selected output type
  ids.userId<VerifiedUserId>();
  // @ts-expect-error a plain mint has no caller-selected output type
  newId<never>();
  expectTypeOf(chat).toExtend<string>();
  expectTypeOf(verified).toExtend<UserId>();
  expectTypeOf(plainVerified).toExtend<UserId>();
  expectTypeOf(plainUser).toExtend<string>();
  expectTypeOf<UserId>().not.toExtend<VerifiedUserId>();
});

test("TypeID doors cannot widen or invent a prefix", () => {
  // @ts-expect-error a widened label would lose the connection between prefix and brand
  mintTypeId<string>(ID_PREFIX.chat);
  // @ts-expect-error IdSource must preserve the same prefix restriction
  createIdSource().typeId<string>(ID_PREFIX.chat);
  // @ts-expect-error invented prefix brands are not canonical entity identities
  mintTypeId("UserId");
  // @ts-expect-error schemas cannot invent a brand from a noncanonical prefix
  typeIdSchema("UserId");
  // @ts-expect-error a schema's label cannot be widened to bypass prefix restrictions
  typeIdSchema<string>(ID_PREFIX.chat);
  expectTypeOf(typeIdSchema(ID_PREFIX.chat).parse("")).toEqualTypeOf<ChatId>();
});

test("the unchecked boundary cast remains branded and preserves session recovery", () => {
  const userId = castId<UserId>("trusted-row-id");
  expectTypeOf(castId<VerifiedUserId>(userId)).toEqualTypeOf<VerifiedUserId>();
  // @ts-expect-error a literal is not a nominal identity
  castId<"admin">("not-admin");
  // @ts-expect-error the cast is not a general string assertion
  castId<string>("not-an-id");
});
