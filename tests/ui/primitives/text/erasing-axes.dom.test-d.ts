// Text and Heading refuse the axis pairs where one arm erases the other in the merge: the type is the guard `tests/tooling/ui-facts/recipe-erasure.test.ts` names.
import type { Heading, TextProps } from "@orb/ui/text";
import type { ComponentProps } from "react";
import { expectTypeOf, test } from "vitest";

type HeadingProps = ComponentProps<typeof Heading>;

test("a line cap is `clamp` or `lines`, never both", () => {
  expectTypeOf<{ clamp: 1; lines: 2 }>().not.toExtend<TextProps>();
  expectTypeOf<{ level: 2; clamp: 1; lines: 2 }>().not.toExtend<HeadingProps>();
  expectTypeOf<{ clamp: 2 }>().toExtend<TextProps>();
  expectTypeOf<{ lines: 2 }>().toExtend<TextProps>();
  expectTypeOf<{ level: 2; clamp: 3 }>().toExtend<HeadingProps>();
});

test("a nudging cue takes no width, on Text and on Heading", () => {
  expectTypeOf<{ hoverCue: "nudge"; width: "full" }>().not.toExtend<TextProps>();
  expectTypeOf<{ level: 2; hoverCue: "nudge"; width: "full" }>().not.toExtend<HeadingProps>();
  expectTypeOf<{ hoverCue: "lift"; width: "full" }>().toExtend<TextProps>();
  expectTypeOf<{ level: 2; hoverCue: "lift"; width: "full" }>().toExtend<HeadingProps>();
  expectTypeOf<{ level: 2; hoverCue: "nudge" }>().toExtend<HeadingProps>();
});
