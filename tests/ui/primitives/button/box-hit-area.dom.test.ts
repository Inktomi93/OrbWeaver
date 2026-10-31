import { expect, test } from "@orb/testkit/node";
import { Button } from "@orb/ui/button";
import { BUTTON_BOX_OVERFLOW } from "@orb/ui/button/box-hit-area";
import { GlyphButton } from "@orb/ui/glyph-button";
import { InlineAction } from "@orb/ui/inline-action";
import { Stack } from "@orb/ui/layout";
import { PictureButton } from "@orb/ui/picture-button";
import type { ReactElement } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Box = typeof BUTTON_BOX_OVERFLOW;

/** Each component's every box step, rendered through its own door. */
const RENDER: { readonly [Component in keyof Box]: (step: keyof Box[Component]) => ReactElement } = {
  button: (size) => createElement(Button, { size, "aria-label": "box contract" }, "control"),
  glyphButton: (glyph) => createElement(GlyphButton, { glyph, "aria-label": "box contract" }),
  inlineAction: (step) => createElement(InlineAction, { step }, "control"),
  pictureButton: () => createElement(PictureButton, {}, "picture"),
};

function classTokens(element: ReactElement): ReadonlySet<string> {
  const markup = renderToStaticMarkup(element);
  expect(markup).toContain("<button");
  return new Set((/class="([^"]*)"/u.exec(markup)?.[1] ?? "").split(/\s+/u));
}

function expectBoxes<Component extends keyof Box>(component: Component): void {
  const steps: Readonly<Record<string, boolean>> = BUTTON_BOX_OVERFLOW[component];
  const render = RENDER[component] as (step: string) => ReactElement;
  for (const [step, overflows] of Object.entries(steps)) {
    const tokens = classTokens(render(step));
    expect(tokens.has("before:block-(--size-touch-target)"), `${component} ${step}`).toBe(overflows);
    // An overflowing hit area is layout-neutral: positioned out of flow.
    expect(overflows && !tokens.has("before:absolute"), `${component} ${step}`).toBe(false);
  }
}

test.for(Object.keys(BUTTON_BOX_OVERFLOW) as (keyof Box)[])("%s hit-area metadata matches what its door renders", (component) => {
  expectBoxes(component);
});

test("a control-row stack floors its rows at the control step", () => {
  expect(renderToStaticMarkup(createElement(Stack, { rows: "control" }))).toContain("*:min-block-(--size-control-sm)");
  expect(renderToStaticMarkup(createElement(Stack))).not.toContain("*:min-block-(--size-control-sm)");
});
