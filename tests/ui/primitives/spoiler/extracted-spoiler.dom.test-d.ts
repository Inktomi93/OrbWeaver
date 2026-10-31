// D336: the spoiler skin left Card and Stack for Spoiler, so both refuse the `spoiler` axis.
import { Card } from "@orb/ui/card";
import { Stack } from "@orb/ui/layout";
import { Spoiler } from "@orb/ui/spoiler";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("Card and Stack refuse the spoiler axis", () => {
  // @ts-expect-error a concealed box is a Spoiler
  createElement(Card, { spoiler: true }, "x");
  // @ts-expect-error a concealed box is a Spoiler
  createElement(Stack, { spoiler: true }, "x");
  expectTypeOf<Parameters<typeof Stack>[0]>().not.toHaveProperty("spoiler");
});

test("Spoiler takes the Stack's layout props and names whether it is concealed", () => {
  createElement(Spoiler, { concealed: true, gap: "field" }, "x");
  // @ts-expect-error the reader's state is required
  createElement(Spoiler, { gap: "field" }, "x");
  expectTypeOf<Parameters<typeof Spoiler>[0]["concealed"]>().toEqualTypeOf<boolean>();
  expectTypeOf<Parameters<typeof Spoiler>[0]["gap"]>().toEqualTypeOf<Parameters<typeof Stack>[0]["gap"]>();
});
