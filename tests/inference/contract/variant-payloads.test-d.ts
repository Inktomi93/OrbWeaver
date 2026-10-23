import type { GeneratedImage } from "@orb/inference";
import { expectTypeOf, test } from "vitest";

test("generated images choose exactly one source without removing URL support", () => {
  expectTypeOf<{ url: string; base64: string; mediaType: string }>().not.toExtend<GeneratedImage>();
  expectTypeOf<{ url: undefined; base64: undefined; mediaType: string }>().not.toExtend<GeneratedImage>();
  expectTypeOf<{ url: string; mediaType: string }>().toExtend<GeneratedImage>();
  expectTypeOf<{ base64: string; mediaType: string }>().toExtend<GeneratedImage>();
});
