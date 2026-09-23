import { expectTypeOf, test } from "vitest";
import type { z } from "zod";
import type { ProviderId, providerIdSchema } from "../../../packages/contracts/src/inference/provider-schema.ts";

test("providerIdSchema accepts a string and outputs the canonical ProviderId brand", () => {
  expectTypeOf<z.input<typeof providerIdSchema>>().toEqualTypeOf<string>();
  expectTypeOf<z.output<typeof providerIdSchema>>().toEqualTypeOf<ProviderId>();
});
