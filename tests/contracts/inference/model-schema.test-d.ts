import type { ModelId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";
import type { modelIdSchema } from "../../../packages/contracts/src/inference/model-schema.ts";

test("modelIdSchema accepts a string and outputs the canonical ModelId brand", () => {
  expectTypeOf<z.input<typeof modelIdSchema>>().toEqualTypeOf<string>();
  expectTypeOf<z.output<typeof modelIdSchema>>().toEqualTypeOf<ModelId>();
});
