// CT: the chart chrome must REPAINT when an appearance axis moves the token it paints from — a browser
// test because the whole mechanism (a MutationObserver on `<html>`, a `getComputedStyle` read, the real
// `html[data-theme-colorization]` rule) only exists in a live cascade. The harness page loads the client's
// real stylesheet stack in production order (playwright-ct.config.ts), so the colorization rule under test
// is the SHIPPED one (`packages/client/src/styles/globals.css`), not a fixture.
//
// Measured defect this pins (#503, side-eye colorization pass 2026-08-22 side effect 5): with the store
// watching only `data-theme`, flipping the exact attribute the app writes
// (`use-appearance-root-effects.ts:82`) moved the DOM card border instantly while the histogram canvas
// stayed BYTE-IDENTICAL — chart chrome was stale until the chart remounted. Hence the second assertion:
// the mount id must be UNCHANGED, or a green here would only prove React threw the subtree away.
import { expect, test } from "@playwright/experimental-ct-react";
import { ChartThemeAxisLineReadoutStory } from "../_ct-stories.tsx";

/** Each arm's SETTLED value, matched by the CSS function that only that arm can produce: the base
 *  `color.border` token is a bare `oklch()` (`packages/ui/src/tokens/index.ts`), while the shipped
 *  `html[data-theme-colorization]` declaration is a `color-mix()` against the accent. Both are
 *  auto-retrying assertions on a resting DOM state, never a mid-flight snapshot. */
const BASE_ARM = /^oklch\(/;
const COLORIZED_ARM = /^color-mix\(/;

/** The story mints one id per mounted instance, so the FIRST mount is `mount-1` — asserting the literal
 *  after the flip is what separates "the store re-resolved" from "React remounted the subtree". */
const FIRST_MOUNT_ID = "mount-1";

test("re-resolves chart chrome when the colorization axis flips, with no remount (#503)", async ({ mount, page }) => {
  // The story's own root element carries the readout — `mount()` returns THAT element, so a
  // `.locator()` descendant search under it finds nothing (paid once while writing this test).
  const readout = await mount(<ChartThemeAxisLineReadoutStory />);
  await expect(readout).toHaveAttribute("data-axis-line", BASE_ARM);
  await expect(readout).toHaveAttribute("data-mount-id", FIRST_MOUNT_ID);

  await page.evaluate((): void => {
    document.documentElement.toggleAttribute("data-theme-colorization", true);
  });

  await expect(readout).toHaveAttribute("data-axis-line", COLORIZED_ARM);
  await expect(readout).toHaveAttribute("data-mount-id", FIRST_MOUNT_ID);
});
