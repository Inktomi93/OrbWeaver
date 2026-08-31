// CT: theme-swatch (#866 S4, owner addendum #3) — ONE swatch anatomy for every theme-picker mount. The
// load-bearing pin: the stripe derives from the theme's REAL stored values through `<ThemeScope>` (the
// D71 clamp), so the SAME tokens paint the SAME stripe in BOTH shapes (strip vs card) — a mount-local
// re-derivation or a hand-painted approximation would break the equality. No color literal is spelled or
// asserted here (§13.7): the theme input lives in the fixtures module, and the pin is EQUALITY of the
// derived paints. Card a11y: a toggle button (`aria-pressed` carries the applied state — apply-not-mode's
// one applying act; the accessible NAME is the theme's name alone).

import { expect, test } from "@playwright/experimental-ct-react";
import { SwatchCardsStory, SwatchPairStory } from "./theme-swatch.fixtures.tsx";

test("the SAME tokens paint the SAME stripe in both mounts — the strip and the card", async ({ mount, page }) => {
  await mount(<SwatchPairStory />);

  const read = (host: string): Promise<readonly string[]> =>
    page.evaluate((selector: string) => {
      const strip = document.querySelector(`${selector} [data-slot="theme-swatch-strip"]`);
      if (strip === null) {
        return [];
      }
      return [...strip.querySelectorAll('[data-slot="theme-scope"] > span')].map((cell) => getComputedStyle(cell).backgroundColor);
    }, host);

  const stripCells = await read('[data-testid="as-strip"]');
  const cardCells = await read('[data-testid="as-card"]');
  expect(stripCells).toHaveLength(3);
  // Cross-mount equality — the whole point of the shared atom.
  expect(cardCells).toEqual(stripCells);
  // The three cells are DISTINCT paints (base · card · accent) — a stripe of one color is a broken derivation.
  expect(new Set(stripCells).size).toBe(3);
});

test("the card is a toggle: aria-pressed carries the applied state, activation fires onSelect", async ({ mount, page }) => {
  let picks = 0;
  await mount(
    <SwatchCardsStory
      onPick={(): void => {
        picks += 1;
      }}
    />,
  );
  const weft = page.getByRole("button", { name: "Weft", exact: true });
  await expect(weft).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Mocha", exact: true })).toHaveAttribute("aria-pressed", "true");
  await weft.click();
  expect(picks).toBe(1);
});
