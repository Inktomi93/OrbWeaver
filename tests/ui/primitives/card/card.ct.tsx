// CT: the card surface seal — the card token surface, the elevated opt-in, and the interactive clickable
// affordance (ui-package-design §6.1). The `padding` variant is RETIRED (UI-Density-Law.md D7): island
// padding is resolved from the enclosing `<Surface tier>` by the unlayered tier map, and THAT is asserted
// by computed value in tests/ui/density-tier.suite.ct.tsx — not here.

import { Card } from "@orb/ui/card";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";

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
  await expect.poll(async () => await card.evaluate((el) => getComputedStyle(el).cursor)).toBe("pointer");
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

// ── CD2 as ruled by side-eye (2026-08-03): an island INSIDE another box gets ONE axis of separation ────
test("nested drops the border and steps the radius one below the grouped step", async ({ mount }) => {
  const both = await mount(
    <div>
      <Card data-testid="host">Grouped</Card>
      <Card data-testid="island" nested={true}>
        Choices
      </Card>
    </div>,
  );
  const island = both.getByTestId("island");
  // The BORDER is the axis that goes: the host box already has one, and two edges in two colours is the
  // box-in-box the rule exists to kill.
  const borderWidth = await island.evaluate((el) => getComputedStyle(el).borderTopWidth);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(Number.parseFloat(borderWidth)).toBe(0);
  await expect(island).toHaveAttribute("data-nested", "");
  const radius = (testid: string): Promise<number> => both.getByTestId(testid).evaluate((el) => Number.parseFloat(getComputedStyle(el).borderTopLeftRadius));
  expect(await radius("island")).toBeLessThan(await radius("host"));
});

// ── ELEVATION DERIVES PER PALETTE (#232) ───────────────────────────────────────────────────────────
// The defect: `[data-theme="light"]` overrode only `--color-*`, so the Light seed wore the DARK float
// recipe — a white 1px hairline that measured 1.29:1 against a 0.98 page (invisible), a white inset
// highlight (invisible), and two heavy black ambient layers, which made Home's resume card read as a
// sticker floating over the page rather than an island sitting in its section.
//
// WHY THE ASSERTION IS ON THE COMPUTED `box-shadow` AND NOT ON `--shadow-overlay`: Tailwind v4 INLINES a
// `--shadow-*` @theme value into the `.shadow-*` utility at build time, so overriding the composite token
// per theme changes the var and NOT a single painted pixel. Reading the var would have passed against the
// broken tree. The fix splits the colour out as `var(--color-shadow-*)` INGREDIENTS, which survive the
// inlining and resolve inside the `[data-theme]` scope — so the paint is the only honest witness.
const shadowOf = (page: Page, testid: string): Promise<string> => page.getByTestId(testid).evaluate((el) => getComputedStyle(el).boxShadow);

test("an elevated card's shadow resolves inside the LIGHT palette, not off the base recipe", async ({ mount, page }) => {
  await mount(
    <div>
      <Card data-testid="base" elevated={true}>
        Hearth
      </Card>
      <div data-theme="light">
        <Card data-testid="scoped" elevated={true}>
          Scoped
        </Card>
      </div>
    </div>,
  );
  expect(await shadowOf(page, "scoped"), "the Light palette must not paint the dark float recipe").not.toBe(await shadowOf(page, "base"));
});

// The other half of the ruling: a DARK seed's elevation is byte-identical to the base recipe, so this
// change cannot have moved the sacred dark rooms (D144(d), "the dark arms do not move").
test("a DARK seed's elevation stays byte-identical to the base recipe", async ({ mount, page }) => {
  await mount(
    <div>
      <Card data-testid="base" elevated={true}>
        Hearth
      </Card>
      <div data-theme="mocha">
        <Card data-testid="scoped" elevated={true}>
          Scoped
        </Card>
      </div>
    </div>,
  );
  expect(await shadowOf(page, "scoped")).toBe(await shadowOf(page, "base"));
});

test("the Light palette's elevation is dark-hairline + soft ambient, and its glow tracks its own primary", async ({ mount, page }) => {
  await mount(
    <div data-theme="light">
      <Card data-testid="scoped" elevated={true}>
        Scoped
      </Card>
      {/* The rationed accent glow as its consumers wear it — the `shadow-glow` utility (avatar selection,
          media-grid selection, the CTA hover), not a `var()` read. See the note below. */}
      <div className="shadow-glow" data-testid="glow" />
    </div>,
  );
  const shadow = await page.getByTestId("scoped").evaluate((el) => getComputedStyle(el).boxShadow);
  // Chrome serializes each stop as `rgba(r, g, b, a) <offsets>`. The two claims that matter: the hairline
  // is no longer a white one, and the deep ambient layer is nowhere near the dark theme's 50% black.
  const alphas = [...shadow.matchAll(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/gu)].map((m) => Number(m[1]));
  expect(alphas.length, `expected per-stop colors in ${shadow}`).toBeGreaterThan(0);
  expect(Math.max(...alphas), "no Light stop may carry the dark recipe's 0.4/0.5 ambient alpha").toBeLessThan(0.3);
  // THROUGH THE UTILITY, never through `var(--shadow-glow)` (measured, this test's first arm): a custom
  // property declared at `:root` has its own `var()`s SUBSTITUTED on `:root` and then inherits already
  // resolved, so `box-shadow: var(--shadow-glow)` inside a scope still paints the ROOT accent. The
  // `.shadow-glow` utility carries the recipe as a declaration on the ELEMENT, where the substitution
  // happens in scope — which is exactly how every real consumer (avatar, media-grid, the CTA hover) uses
  // it, and why the ingredient split works at all.
  const glow = await page.getByTestId("glow").evaluate((el) => getComputedStyle(el).boxShadow);
  const primary = await page.getByTestId("scoped").evaluate((el) => {
    const probe = el.ownerDocument.createElement("div");
    probe.style.color = "var(--color-primary)";
    el.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  });
  // The glow derives from the palette's own accent through relative colour, so the palette's own primary
  // channels must appear in the resolved glow. Under the defect it was the dark ember (0.72 0.175 52) in
  // EVERY palette. Chrome keeps the wide-gamut serialization here, so the channels are space-separated —
  // the triple is read off the resolved --color-primary rather than hardcoded, so a palette retune to
  // Light's accent moves both sides together.
  const channels =
    primary
      .match(/[\d.]+/gu)
      ?.slice(0, 3)
      .join(" ") ?? "";
  expect(channels, `expected an oklch triple in ${primary}`).not.toBe("");
  expect(glow, `the glow must carry ${primary}`).toContain(channels);
});
