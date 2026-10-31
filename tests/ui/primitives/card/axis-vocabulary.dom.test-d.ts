// D336: Card spells colour as `tone` and fill style as `variant`; the per-intent tone values and the old outline and
// shadow axes are gone.
import { Card } from "@orb/ui/card";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("the old tone values and axes do not compile", () => {
  // @ts-expect-error a status tint is a tone with the soft style
  createElement(Card, { tone: "successTint" }, "x");
  // @ts-expect-error the border-only box is the outline style
  createElement(Card, { tone: "clear" }, "x");
  // @ts-expect-error the muted fill is the soft style
  createElement(Card, { tone: "muted" }, "x");
  // @ts-expect-error the held-back wash is the soft style
  createElement(Card, { tone: "mutedWash" }, "x");
  // @ts-expect-error the raised step is the soft style
  createElement(Card, { tone: "raised" }, "x");
  // @ts-expect-error the field edge is the neutral outline
  createElement(Card, { tone: "input" }, "x");
  // @ts-expect-error the primary edge is the primary tone
  createElement(Card, { tone: "primaryEdge" }, "x");
  // @ts-expect-error the primary outline is the primary tone with the outline style
  createElement(Card, { tone: "primaryOutline" }, "x");
  // @ts-expect-error the highlight is the warning tone with the outline style
  createElement(Card, { tone: "highlight" }, "x");
  // @ts-expect-error the well is the soft style
  createElement(Card, { shape: "well" }, "x");
  // @ts-expect-error `outline` is a style now; the dashed edge is `dashed`
  createElement(Card, { outline: "dashed" }, "x");
  // @ts-expect-error a card takes no shadow axis: a static card takes none and the overlay shadow is the elevated one
  createElement(Card, { shadow: "overlay" }, "x");
  expectTypeOf<Parameters<typeof Card>[0]>().not.toHaveProperty("shadow");
});

test("every tone works with every style", () => {
  createElement(Card, {}, "the neutral surface");
  createElement(Card, { tone: "warning", variant: "soft" }, "x");
  createElement(Card, { tone: "primary", variant: "outline", dashed: true }, "x");
  createElement(Card, { tone: "destructive" }, "x");
  expectTypeOf<NonNullable<Parameters<typeof Card>[0]["variant"]>>().toEqualTypeOf<"surface" | "soft" | "outline">();
});
