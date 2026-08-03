// CT: the owner's custom-CSS injection (Layer 1, D44 §12.1) — the LOAD-BEARING overridability guarantee
// (per done-not-equal-rendered: assert the RENDERED result, not the source). Injects a `:root{--token}`
// redefine + a `.shell-rail{…}` rule through CustomThemeStyle and proves BOTH win at COMPUTED-style time:
//   • the `:root` token redefine beats the @theme base token (a `.bg-primary` utility reflows to it), and
//   • the injected `.shell-rail` rule beats shell.css's own `.shell-rail` (unlayered + mounted last).

import { expect, test } from "@playwright/experimental-ct-react";
import { CustomThemeStyleStory } from "../_ct-stories.tsx";

const OVERRIDE_CSS = ":root { --color-primary: rgb(255, 0, 255); } .shell-rail { background: rgb(1, 2, 3); }";

test("an injected :root token redefine wins over the @theme base token (computed)", async ({ mount }) => {
  const component = await mount(<CustomThemeStyleStory css={OVERRIDE_CSS} />);
  // `.bg-primary` (a @layer utilities class) reads var(--color-primary); the unlayered :root redefine wins.
  await expect(component.getByTestId("primary-probe")).toHaveCSS("background-color", "rgb(255, 0, 255)");
});

test("an injected element rule wins over shell.css (unlayered + last-in-head; computed)", async ({ mount }) => {
  const component = await mount(<CustomThemeStyleStory css={OVERRIDE_CSS} />);
  // shell.css styles `.shell-rail` (background: var(--color-sidebar)); the injected rule overrides it.
  await expect(component.getByTestId("rail-probe")).toHaveCSS("background-color", "rgb(1, 2, 3)");
});

test("no injection ⇒ the base styles stand (the rail keeps its shell.css sidebar background)", async ({ mount }) => {
  const component = await mount(<CustomThemeStyleStory css="" />);
  // Not magenta / not rgb(1,2,3) — the override only applies when CSS is injected.
  await expect(component.getByTestId("primary-probe")).not.toHaveCSS("background-color", "rgb(255, 0, 255)");
  await expect(component.getByTestId("rail-probe")).not.toHaveCSS("background-color", "rgb(1, 2, 3)");
});
