// D336: Text and Heading spell colour by meaning as `tone` and a named ink as `ink`; the two are exclusive.
import type { TextProps } from "@orb/ui/text";
import { Heading, Text } from "@orb/ui/text";
import type { Tone } from "@orb/ui/tokens";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("the old tone values do not compile", () => {
  // @ts-expect-error a named ink is `ink`, never a tone
  createElement(Text, { tone: "muted" }, "x");
  // @ts-expect-error the accent ink is the primary tone
  createElement(Text, { tone: "accent" }, "x");
  // @ts-expect-error the mark on a fill is `ink="toneForeground"`
  createElement(Text, { tone: "onPrimary" }, "x");
  // @ts-expect-error `default` is the unset tone
  createElement(Text, { tone: "default" }, "x");
  // @ts-expect-error the voice's own ink is the unset ink
  createElement(Text, { ink: "voice" }, "x");
  // @ts-expect-error a transcript ink is `ink`
  createElement(Heading, { level: 2, tone: "speaker" }, "x");
  expectTypeOf<NonNullable<TextProps["tone"]>>().toEqualTypeOf<Tone>();
});

test("the prose size states its measure", () => {
  // @ts-expect-error a paragraph with no cap runs the whole row
  createElement(Text, { prose: true }, "x");
  // @ts-expect-error a heading takes the same pair
  createElement(Heading, { level: 2, prose: true }, "x");
  createElement(Text, { prose: true, cap: "prose" }, "a paragraph at its measure");
  createElement(Text, { prose: true, cap: "fit" }, "a run its owner already bounds");
  createElement(Text, { cap: "prose" }, "a cap without the size");
  createElement(Text, { prose: false }, "x");
  expectTypeOf<{ prose: true }>().not.toExtend<TextProps>();
});

test("an ink excludes a colour tone", () => {
  // @ts-expect-error an ink would repaint the tone's meaning away
  createElement(Text, { tone: "destructive", ink: "muted" }, "x");
  createElement(Text, { tone: "neutral", ink: "toneForeground" }, "x");
  createElement(Text, { tone: "primary", ink: "toneForeground" }, "the primary's ink on its fill");
  createElement(Text, { tone: "info" }, "x");
  createElement(Text, { ink: "accolade" }, "x");
  createElement(Heading, { level: 2, ink: "inherit" }, "x");
  expectTypeOf<{ tone: "warning"; ink: "muted" }>().not.toExtend<TextProps>();
});
