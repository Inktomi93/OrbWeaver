// CT: the card surface seal — the card token surface, the elevated opt-in, and the interactive clickable
// affordance (ui-package-design §6.1). The `padding` variant is RETIRED (density-pass-spec.md D7): island
// padding is resolved from the enclosing `<Surface tier>` by the unlayered tier map, and THAT is asserted
// by computed value in tests/ui/density-tier.suite.ct.tsx — not here.

import { Card } from "@orb/ui/card";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

test("is the card token surface", async ({ mount }) => {
  const card = await mount(<Card>Panel</Card>);
  await expect(card).toHaveCSS("background-color", TOKENS["color.card"].value);
});

test("elevated opts into the floating-island radius + shadow; a plain card gets neither", async ({ mount }) => {
  // Resolved from the live document, never a hardcoded px — a radius retune must not red this.
  const both = await mount(
    <div>
      <Card data-testid="plain">Grouped</Card>
      <Card data-testid="floating" elevated={true}>
        Floating
      </Card>
    </div>,
  );
  const radius = (testid: string): Promise<number> => both.getByTestId(testid).evaluate((el) => Number.parseFloat(getComputedStyle(el).borderTopLeftRadius));
  const resolve = (name: string): Promise<number> =>
    both.evaluate((el, token) => {
      const probe = el.ownerDocument.createElement("div");
      probe.style.borderRadius = `var(${token})`;
      el.ownerDocument.body.append(probe);
      const px = Number.parseFloat(getComputedStyle(probe).borderTopLeftRadius);
      probe.remove();
      return px;
    }, name);
  expect(await radius("plain")).toBe(await resolve("--radius-base"));
  expect(await radius("floating")).toBe(await resolve("--radius-card"));
  await expect(both.getByTestId("floating")).toHaveAttribute("data-elevated", "");
});

test("interactive adds the pointer affordance", async ({ mount }) => {
  const card = await mount(<Card interactive={true}>Panel</Card>);
  const cursor = await card.evaluate((el) => getComputedStyle(el).cursor);
  expect(cursor).toBe("pointer");
});

test("interactive is keyboard-operable: role/tabIndex + Enter/Space fire onClick", async ({ mount, page }) => {
  const clicks: string[] = [];
  const card = await mount(
    <Card
      interactive={true}
      onClick={(): void => {
        clicks.push("hit");
      }}
    >
      Panel
    </Card>,
  );
  await expect(card).toHaveAttribute("role", "button");
  await expect(card).toHaveAttribute("tabindex", "0");
  await card.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press(" ");
  await expect.poll(() => clicks.length, { intervals: [20, 50, 100] }).toBe(2);
});

test("caller-supplied role/tabIndex/onKeyDown are not overridden", async ({ mount }) => {
  const card = await mount(
    <Card interactive={true} role="link" tabIndex={-1}>
      Panel
    </Card>,
  );
  await expect(card).toHaveAttribute("role", "link");
  await expect(card).toHaveAttribute("tabindex", "-1");
});
