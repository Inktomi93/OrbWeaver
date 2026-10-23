import type { Branded, ChatId, UserId, VerifiedUserId } from "@orb/kit/ids";
import { brandedId as brand, brandedId, ID_PREFIX } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

test("a prefixless schema derives its plain brand from the required label", () => {
  expectTypeOf(brandedId("UserId")).toEqualTypeOf<z.ZodType<UserId, string>>();
  expectTypeOf(brandedId("PrefixlessProbe")).toEqualTypeOf<z.ZodType<Branded<"PrefixlessProbe">, string>>();
});

test("forbidden, widened and uninhabited labels cannot promise a branded output", () => {
  type CanonicalOutput = ReturnType<ReturnType<typeof brandedId<"chat">>["parse"]>;
  type WidenedOutput = ReturnType<ReturnType<typeof brandedId<string>>["parse"]>;
  type NeverOutput = ReturnType<ReturnType<typeof brandedId<never>>["parse"]>;
  const canonical: CanonicalOutput = "plain";
  const widened: WidenedOutput = "plain";
  const uninhabited: NeverOutput = "plain";
  const outputs: readonly string[] = [canonical, widened, uninhabited];
  expectTypeOf(outputs).items.toEqualTypeOf<string>();
});

test("a text parser cannot establish evidence beyond its label", () => {
  // @ts-expect-error nonempty text is not a session verification
  const verified: VerifiedUserId = brandedId("UserId").parse("raw");
  // @ts-expect-error nonempty text cannot establish additional evidence
  const proven: UserId & { readonly proven: true } = brandedId("UserId").parse("raw");
  // @ts-expect-error widening the label would hide canonical TypeID brands
  brandedId<string>("UserId");
  expectTypeOf(verified).toExtend<UserId>();
  expectTypeOf(proven).toExtend<UserId>();
});

test("a canonical TypeID label is refused, however the door is imported", () => {
  // @ts-expect-error a TypeID label needs typeIdSchema
  brandedId("chat");
  // @ts-expect-error the canonical registry value carries the same restriction
  brandedId(ID_PREFIX.chat);
  // @ts-expect-error a renamed import cannot change the restriction
  brand("chat");
  // @ts-expect-error a union cannot hide one canonical TypeID member
  brandedId<"chat" | "UserId">("UserId");
  const forwarded = brandedId;
  // @ts-expect-error a forwarded reference keeps the constraint
  forwarded("chat");
  // @ts-expect-error a schema label cannot promise an arbitrary output type
  const chat: ChatId = brandedId("UserId").parse("raw");
  expectTypeOf(chat).toExtend<string>();
});
