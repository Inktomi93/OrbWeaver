import type { ConnectionAttributionProvenance } from "@orb/contracts/chat";
import type { ProviderId } from "@orb/contracts/inference";
import type { messages, messageVariants } from "@orb/db";
import type { ModelId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

type VariantInsert = typeof messageVariants.$inferInsert;
type SlotRow = typeof messages.$inferSelect;

test("message_variants preserves model and provider identity at its producer contract", () => {
  expectTypeOf<NonNullable<VariantInsert["model"]>>().toEqualTypeOf<ModelId>();
  expectTypeOf<string>().not.toExtend<NonNullable<VariantInsert["model"]>>();
  expectTypeOf<NonNullable<VariantInsert["provider"]>>().toEqualTypeOf<ProviderId>();
  expectTypeOf<string>().not.toExtend<NonNullable<VariantInsert["provider"]>>();
  expectTypeOf<NonNullable<VariantInsert["connectionAttributionProvenance"]>>().toEqualTypeOf<ConnectionAttributionProvenance>();
});

// D26: the slot row carries identity + attribution + selection only; content and economics live on the variant.
test("the messages slot row has no content, reasoning or economics column (D26)", () => {
  expectTypeOf<"content" extends keyof SlotRow ? true : false>().toEqualTypeOf<false>();
  expectTypeOf<"reasoning" extends keyof SlotRow ? true : false>().toEqualTypeOf<false>();
  expectTypeOf<"tokensOut" extends keyof SlotRow ? true : false>().toEqualTypeOf<false>();
});
