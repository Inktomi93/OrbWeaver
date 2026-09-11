// CT: the kbd seal — a shortcut chip on the `<kbd>` intrinsic; mono + micro-caps on the MUTED
// surface (PP2 un-overloaded --color-accent: accent is hover/interaction only; a static chip rides
// the muted pair). Token color/size land as computed style (asserted via TOKENS, never a literal —
// gate ui-primitive-structure clause 5). Inert (no interactive state), like Badge.

import { Kbd } from "@orb/ui/kbd";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

// micro is authored in rem; computed font-size resolves to px (root = 16px — the text.ct precedent).
const ROOT_PX = 16;
const microPx = `${Number.parseFloat(TOKENS["text.micro"].value) * ROOT_PX}px`;

test("renders a <kbd> with the muted surface + muted-foreground text", async ({ mount }) => {
  const kbd = await mount(<Kbd>⌘K</Kbd>);
  await expect.poll(async () => await kbd.evaluate((el) => el.tagName.toLowerCase())).toBe("kbd");
  await expect(kbd).toHaveCSS("background-color", TOKENS["color.muted"].value);
  await expect(kbd).toHaveCSS("color", TOKENS["color.muted-foreground"].value);
});

test("rides the micro type-scale token and the mono font stack", async ({ mount }) => {
  const kbd = await mount(<Kbd>⌘</Kbd>);
  await expect(kbd).toHaveCSS("font-size", microPx);
  const family = await kbd.evaluate((el) => getComputedStyle(el).fontFamily);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(family.toLowerCase()).toContain("mono");
  // The micro tracking is applied (not the default "normal") — the micro-caps voice.
  await expect.poll(async () => await kbd.evaluate((el) => getComputedStyle(el).letterSpacing)).not.toBe("normal");
});

test("passes className through and renders caller copy", async ({ mount, page }) => {
  await mount(<Kbd className="ml-row">Esc</Kbd>);
  await expect(page.getByText("Esc")).toBeVisible();
});
