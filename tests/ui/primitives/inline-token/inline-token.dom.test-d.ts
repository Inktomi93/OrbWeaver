// InlineToken: a chip that behaves like a word in running text. It carries a tone and nothing of a pill's box.
import type { InlineTokenProps } from "@orb/ui/inline-token";
import { InlineToken } from "@orb/ui/inline-token";
import type { Tone } from "@orb/ui/tokens";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("an inline token takes a tone and no pill box", () => {
  // @ts-expect-error a word has no box step
  createElement(InlineToken, { size: "sm" }, "x");
  // @ts-expect-error a word has no fill style of its own
  createElement(InlineToken, { variant: "outline" }, "x");
  // @ts-expect-error the old intent axis is gone
  createElement(InlineToken, { intent: "info" }, "x");
  createElement(InlineToken, { tone: "info" }, "{{user}}");
  createElement(InlineToken, {}, "the neutral tint");
  expectTypeOf<NonNullable<InlineTokenProps["tone"]>>().toEqualTypeOf<Tone>();
});
