// brandedId validates only nonempty text, so a canonical TypeID brand must not cross a trust boundary through it.
// The brand label is the refusal key: spelling, aliasing and re-importing the door cannot change it.
import type { Branded, ChatId, ChatId as RoomId, TypeIdOf, UserId } from "@orb/kit/ids";
import { brandedId as brand, brandedId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

type Prefixless = Branded<"PrefixlessProbe">;

test("a prefixless brand stays on brandedId", () => {
  expectTypeOf(brandedId<UserId>()).toEqualTypeOf<z.ZodType<UserId, string>>();
  expectTypeOf(brandedId<Prefixless>()).toEqualTypeOf<z.ZodType<Prefixless, string>>();
  expectTypeOf(brandedId<Branded<string>>()).toEqualTypeOf<z.ZodType<Branded<string>, string>>();
});

test("a canonical TypeID brand is refused, however it is spelled or imported", () => {
  // @ts-expect-error a TypeID brand needs typeIdSchema
  brandedId<ChatId>();
  // @ts-expect-error a renamed alias of the same brand
  brandedId<RoomId>();
  // @ts-expect-error the TypeIdOf spelling of the same brand
  brandedId<TypeIdOf<"chat">>();
  // @ts-expect-error a renamed import of the door
  brand<ChatId>();
  // @ts-expect-error a union carrying one TypeID member
  brandedId<ChatId | UserId>();
  // @ts-expect-error no argument, whatever its text, satisfies the refusal
  brandedId<ChatId>("brandedId validates only nonempty text; use typeIdSchema(ID_PREFIX.<prefix>) for a TypeID");
  // @ts-expect-error an arbitrary string does not either
  brandedId<TypeIdOf<"chat"> | UserId>("x");
  const forwarded = brandedId;
  // @ts-expect-error a forwarded reference keeps the constraint
  forwarded<ChatId>();
  expectTypeOf<ChatId>().toEqualTypeOf<TypeIdOf<"chat">>();
});
