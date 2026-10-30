// D336: the brand mark spells colour by meaning as `tone` and a named ink as `ink`.
import { WeaveGlyph } from "@orb/ui/web-weave";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("the old tone values do not compile, and an ink excludes a colour tone", () => {
  // @ts-expect-error the brand's own ink is the primary tone
  createElement(WeaveGlyph, { tone: "accent" });
  // @ts-expect-error a named ink is `ink`, never a tone
  createElement(WeaveGlyph, { tone: "muted" });
  // @ts-expect-error an ink would repaint the tone's meaning away
  createElement(WeaveGlyph, { tone: "primary", ink: "muted" });
  createElement(WeaveGlyph, { tone: "primary" });
  createElement(WeaveGlyph, { ink: "muted" });
  expectTypeOf<{ tone: "accent" }>().not.toExtend<Parameters<typeof WeaveGlyph>[0]>();
});
