// <Icon> CT smoke (ui-package-design §6.1 icons seal) — the lucide glyph renders at the named
// type-scale px const, decorative by default, accessible when labelled. Mounted via the support
// story: CT cannot serialize a component-as-prop (`icon={X}`) across the mount boundary.
import { expect, test } from "@playwright/experimental-ct-react";
import { CloseIconStory } from "../../../support/ct/icon-story";

// = ICON_SM / ICON_MD (packages/ui/src/primitives/icons/icon.tsx — the type-scale table).
const ICON_SM_PX = "16";
const ICON_MD_PX = "20";

test("renders the glyph at the token size, decorative by default", async ({ mount }) => {
  const component = await mount(<CloseIconStory size="sm" />);
  const tag = await component.evaluate((el) => el.tagName.toLowerCase());
  expect(tag).toBe("svg");
  await expect(component).toHaveAttribute("width", ICON_SM_PX);
  await expect(component).toHaveAttribute("height", ICON_SM_PX);
  await expect(component).toHaveAttribute("aria-hidden", "true");
});

test("md is the default size and label makes the icon accessible", async ({ mount }) => {
  const component = await mount(<CloseIconStory label="Close" />);
  await expect(component).toHaveAttribute("width", ICON_MD_PX);
  await expect(component).toHaveAttribute("aria-label", "Close");
  await expect(component).toHaveAttribute("aria-hidden", "false");
});
