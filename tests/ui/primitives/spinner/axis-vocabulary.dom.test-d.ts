// D336: the loader spells colour by meaning as `tone` and a named ink as `ink`.
import { WebSpinner } from "@orb/ui/spinner";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("the old tone values do not compile, and an ink excludes a colour tone", () => {
  // @ts-expect-error a brand wait is the primary tone
  createElement(WebSpinner, { label: "Loading", tone: "accent" });
  // @ts-expect-error a named ink is `ink`, never a tone
  createElement(WebSpinner, { label: "Loading", tone: "muted" });
  // @ts-expect-error an ink would repaint the tone's meaning away
  createElement(WebSpinner, { label: "Loading", tone: "primary", ink: "muted" });
  createElement(WebSpinner, { label: "Loading", tone: "primary" });
  createElement(WebSpinner, { label: "Loading", ink: "muted" });
  expectTypeOf<{ label: string; tone: "accent" }>().not.toExtend<Parameters<typeof WebSpinner>[0]>();
});
