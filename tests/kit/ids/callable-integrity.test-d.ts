import type { Branded, ChatId, RpgQuestId, SocketId, UserId } from "@orb/kit/ids";
import { brandedId, createIdSource, ID_PREFIX, mintRpgQuestId, mintSocketId, mintTypeId, mintUserId, newId, typeIdSchema } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

test("generic callable rebinding cannot promise caller-selected identity evidence", () => {
  // @ts-expect-error a generator cannot promise every stronger subtype of UserId
  const mint: <T extends UserId>() => T = newId;
  // @ts-expect-error binding the generator cannot change its concrete output families
  const boundMint: <T extends UserId>() => T = createIdSource().unprefixed;
  // @ts-expect-error the concrete user mint cannot promise extra evidence either
  const userMint: <T extends UserId>() => T = mintUserId;
  // @ts-expect-error binding the concrete user mint retains its fixed output
  const boundUserMint: <T extends UserId>() => T = createIdSource().userId;
  // @ts-expect-error quest identity cannot promise additional evidence
  const questMint: <T extends RpgQuestId>() => T = mintRpgQuestId;
  // @ts-expect-error socket identity cannot promise additional evidence
  const socketMint: <T extends SocketId>() => T = mintSocketId;
  // @ts-expect-error parsing text cannot promise every stronger subtype of UserId
  const parser: <T extends UserId>() => { readonly parse: (input: string) => T } = brandedId;
  expectTypeOf(mint).toBeFunction();
  expectTypeOf(boundMint).toBeFunction();
  expectTypeOf(userMint).toBeFunction();
  expectTypeOf(boundUserMint).toBeFunction();
  expectTypeOf(questMint).toBeFunction();
  expectTypeOf(socketMint).toBeFunction();
  expectTypeOf(parser).toBeFunction();
});

test("prefixed mint and parser callables cannot lose their required prefix", () => {
  // @ts-expect-error a prefixed mint must be called with its prefix
  const mint: () => ChatId = mintTypeId;
  // @ts-expect-error a bound prefixed mint must retain the same input
  const boundMint: () => ChatId = createIdSource().typeId;
  // @ts-expect-error the parser cannot promise a concrete brand without receiving its prefix
  const parser: () => { readonly parse: (input: string) => ChatId } = typeIdSchema;
  expectTypeOf(mint).toBeFunction();
  expectTypeOf(boundMint).toBeFunction();
  expectTypeOf(parser).toBeFunction();
});

test("callable rebinding cannot launder canonical TypeIDs or widened schema labels", () => {
  // @ts-expect-error a generic TypeID parser must validate the canonical format
  const genericParser: <T extends ChatId>() => { readonly parse: (input: string) => T } = brandedId;
  // @ts-expect-error a concrete return type must not erase the format restriction either
  const concreteParser: () => { readonly parse: (input: string) => ChatId } = brandedId;
  // @ts-expect-error the label remains required through a widened parser callable
  const widenedParser: () => { readonly parse: (input: string) => Branded<string> } = brandedId;
  // @ts-expect-error a generic callable cannot erase the label admission rule
  const anyLabelParser: <Label extends string>(label: Label) => { readonly parse: (input: string) => Branded<Label> } = brandedId;
  // @ts-expect-error a concrete callable cannot admit a canonical label
  const chatLabelParser: (label: "chat") => { readonly parse: (input: string) => ChatId } = brandedId;
  expectTypeOf(genericParser).toBeFunction();
  expectTypeOf(concreteParser).toBeFunction();
  expectTypeOf(widenedParser).toBeFunction();
  expectTypeOf(anyLabelParser).toBeFunction();
  expectTypeOf(chatLabelParser).toBeFunction();
});

test("method bivariance cannot change a text schema's output into a canonical identity", () => {
  const canonicalFactory = {
    make(_label: typeof ID_PREFIX.chat): z.ZodType<ChatId, string> {
      return typeIdSchema(ID_PREFIX.chat);
    },
  };
  // @ts-expect-error method variance may weaken input admission, but cannot grant a canonical output
  const rebound: typeof canonicalFactory = { make: brandedId };
  expectTypeOf(rebound.make).toBeFunction();
});
