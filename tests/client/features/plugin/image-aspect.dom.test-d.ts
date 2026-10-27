import type { PluginImageNode } from "@orb/contracts/plugin";
import type { AspectFrameProps, MediaAspect } from "@orb/ui/aspect-frame";
import { expectTypeOf, test } from "vitest";

test("the plugin's declared image aspect matches the UI-owned ratio vocabulary", () => {
  expectTypeOf<NonNullable<PluginImageNode["aspect"]>>().toEqualTypeOf<MediaAspect>();
  expectTypeOf<AspectFrameProps["aspect"]>().toEqualTypeOf<MediaAspect>();
  expectTypeOf<Omit<AspectFrameProps, "aspect">>().not.toExtend<AspectFrameProps>();
});
