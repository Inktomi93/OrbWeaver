import type {
  GenerationUsage,
  GenerationUsageLeg,
  generationUsageLegSchema,
  generationUsageSchema,
  storedGenerationUsageLegSchema,
  storedGenerationUsageSchema,
} from "@orb/contracts/inference";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

test("stored row projection and strict wire parsing expose exactly the same normalized output types", () => {
  expectTypeOf<z.output<typeof storedGenerationUsageSchema>>().toEqualTypeOf<GenerationUsage>();
  expectTypeOf<z.output<typeof storedGenerationUsageLegSchema>>().toEqualTypeOf<GenerationUsageLeg>();
  expectTypeOf<z.output<typeof storedGenerationUsageSchema>>().toEqualTypeOf<z.output<typeof generationUsageSchema>>();
  expectTypeOf<z.output<typeof storedGenerationUsageLegSchema>>().toEqualTypeOf<z.output<typeof generationUsageLegSchema>>();
});
