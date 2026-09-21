import type { ProviderId } from "@orb/contracts/inference";
import type { imageryGenerations, messageVariants, modelStats, userConnections } from "@orb/db";
import type { ModelId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

type ConnectionInsert = typeof userConnections.$inferInsert;
type VariantInsert = typeof messageVariants.$inferInsert;
type ModelStatInsert = typeof modelStats.$inferInsert;
type ImageryInsert = typeof imageryGenerations.$inferInsert;

test("user_connections.model rejects a bare string at its producer contract", () => {
  expectTypeOf<ConnectionInsert["model"]>().toEqualTypeOf<ModelId>();
  expectTypeOf<string>().not.toExtend<ConnectionInsert["model"]>();
});

test("message_variants.model rejects a bare string at its producer contract", () => {
  expectTypeOf<NonNullable<VariantInsert["model"]>>().toEqualTypeOf<ModelId>();
  expectTypeOf<string>().not.toExtend<NonNullable<VariantInsert["model"]>>();
});

test("message_variants.provider rejects a bare string at its producer contract", () => {
  expectTypeOf<NonNullable<VariantInsert["provider"]>>().toEqualTypeOf<ProviderId>();
  expectTypeOf<string>().not.toExtend<NonNullable<VariantInsert["provider"]>>();
});

test("model_stats.model rejects a bare string at its producer contract", () => {
  expectTypeOf<ModelStatInsert["model"]>().toEqualTypeOf<ModelId>();
  expectTypeOf<string>().not.toExtend<ModelStatInsert["model"]>();
});

test("model_stats.provider rejects arbitrary strings but admits the ruled unknown sentinel", () => {
  expectTypeOf<ModelStatInsert["provider"]>().toEqualTypeOf<ProviderId | "(unknown)" | undefined>();
  expectTypeOf<string>().not.toExtend<NonNullable<ModelStatInsert["provider"]>>();
  expectTypeOf<"(unknown)">().toExtend<NonNullable<ModelStatInsert["provider"]>>();
});

test("imagery_generations.model rejects a bare string at its producer contract", () => {
  expectTypeOf<ImageryInsert["model"]>().toEqualTypeOf<ModelId>();
  expectTypeOf<string>().not.toExtend<ImageryInsert["model"]>();
});

test("imagery_generations.provider rejects a bare string at its producer contract", () => {
  expectTypeOf<NonNullable<ImageryInsert["provider"]>>().toEqualTypeOf<ProviderId>();
  expectTypeOf<string>().not.toExtend<NonNullable<ImageryInsert["provider"]>>();
});
