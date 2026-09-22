import type { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import type { ModelId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";
import type { ProviderId } from "../../../packages/contracts/src/inference/provider-schema.ts";

test("inference identity schemas accept strings and output their canonical brands", () => {
  expectTypeOf<z.input<typeof modelIdSchema>>().toEqualTypeOf<string>();
  expectTypeOf<z.output<typeof modelIdSchema>>().toEqualTypeOf<ModelId>();
  expectTypeOf<z.input<typeof providerIdSchema>>().toEqualTypeOf<string>();
  expectTypeOf<z.output<typeof providerIdSchema>>().toEqualTypeOf<ProviderId>();
});
