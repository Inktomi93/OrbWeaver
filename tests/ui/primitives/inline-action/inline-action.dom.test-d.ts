// InlineAction: a text-height action at a type step, in the fill-less styles only.
import type { InlineActionProps, InlineStep } from "@orb/ui/inline-action";
import { InlineAction } from "@orb/ui/inline-action";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("an inline action takes a type step and the fill-less styles", () => {
  // @ts-expect-error the type step is required
  createElement(InlineAction, {}, "x");
  // @ts-expect-error a filled style is a control box, never text-height
  createElement(InlineAction, { step: "label", variant: "solid" }, "x");
  // @ts-expect-error an edge is a control box too
  createElement(InlineAction, { step: "label", variant: "outline" }, "x");
  // @ts-expect-error a fill-less action has no focal lift
  createElement(InlineAction, { step: "label", focal: true }, "x");
  // @ts-expect-error an inline action has no control-scale box
  createElement(InlineAction, { step: "label", size: "sm" }, "x");
  // @ts-expect-error an ink excludes a colour tone
  createElement(InlineAction, { step: "label", tone: "destructive", ink: "muted" }, "x");
  createElement(InlineAction, { step: "body", variant: "link" }, "Try again");
  createElement(InlineAction, { step: "label", tone: "primary", reserveEdge: true }, "x");
  expectTypeOf<InlineStep>().toEqualTypeOf<"label" | "body">();
  expectTypeOf<NonNullable<InlineActionProps["variant"]>>().toEqualTypeOf<"ghost" | "link">();
});
