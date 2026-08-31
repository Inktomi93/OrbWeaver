// CT: the chart chrome must paint the ACTIVE theme's tokens, and REPAINT when anything moves them — a
// browser test because the whole mechanism (a MutationObserver over the root's attributes, its ancestors'
// inline styles and `<head>`; a `getComputedStyle` read; the real `html[data-theme-colorization]` rule)
// only exists in a live cascade. The harness page loads the client's real stylesheet stack in production
// order (playwright-ct.config.ts), so the colorization rule under test is the SHIPPED one
// (`packages/client/src/styles/globals.css`), not a fixture.
//
// Measured defect this pins (#503, side-eye colorization pass 2026-08-22 side effect 5): with the store
// watching only `data-theme`, flipping the exact attribute the app writes
// (`use-appearance-root-effects.ts:82`) moved the DOM card border instantly while the histogram canvas
// stayed BYTE-IDENTICAL — chart chrome was stale until the chart remounted. Hence the second assertion:
// the mount id must be UNCHANGED, or a green here would only prove React threw the subtree away.

import { TOKEN_POLARITY_ARMS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { ChartThemeAxisLineReadoutStory, CustomLightChartRampStory, CustomThemeChartAxisLineStory } from "../_ct-stories.tsx";

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

/** The story's two custom arms — `borderColor` reaches `--color-border` byte-identically, so the readout
 *  must carry each arm's token value verbatim while that arm is in force (`_ct-stories.tsx`). */
const CUSTOM_ARM_ONE = TOKEN_POLARITY_ARMS["color.chart-3"].dark;
const CUSTOM_ARM_TWO = TOKEN_POLARITY_ARMS["color.chart-4"].dark;

/** The two arms of the seam's OTHER read: a computed `color` is some colour FUNCTION, and specifically NOT
 *  the `light-dark(<light>, <dark>)` token stream a raw custom-property read hands back (which no canvas
 *  can paint — resolving it through the cascade is that path's whole job). */
const A_COLOR_FUNCTION = /^[a-z-]+\(/;
const UNRESOLVED_INTENT_TOKEN = /^light-dark\(/;

test("resolves the polarity-aware chart ramp to five concrete Canvas colors on Light", async ({ mount, page }) => {
  await page.evaluate((): void => {
    document.documentElement.dataset["theme"] = "light";
  });
  const readout = await mount(<ChartThemeAxisLineReadoutStory />);
  await expect(readout).toHaveAttribute("data-series", TOKEN_POLARITY_ARMS["color.chart-1"].light);
  await expect
    .poll(async () => (await readout.getAttribute("data-palette"))?.split("|") ?? [])
    .toEqual([
      TOKEN_POLARITY_ARMS["color.chart-1"].light,
      TOKEN_POLARITY_ARMS["color.chart-2"].light,
      TOKEN_POLARITY_ARMS["color.chart-3"].light,
      TOKEN_POLARITY_ARMS["color.chart-4"].light,
      TOKEN_POLARITY_ARMS["color.chart-5"].light,
    ]);
  const serialized = `${await readout.getAttribute("data-series")} ${await readout.getAttribute("data-palette")}`;
  expect(serialized).not.toContain("light-dark(");
  expect(serialized).not.toContain("var(");
});

test("a custom light ThemeScope selects the concrete light chart arms", async ({ mount }) => {
  const scope = await mount(<CustomLightChartRampStory />);
  const readout = scope.locator("p[data-series]");
  await expect(readout).toHaveAttribute("data-series", TOKEN_POLARITY_ARMS["color.chart-1"].light);
  await expect
    .poll(async () => (await readout.getAttribute("data-palette"))?.split("|") ?? [])
    .toEqual([
      TOKEN_POLARITY_ARMS["color.chart-1"].light,
      TOKEN_POLARITY_ARMS["color.chart-2"].light,
      TOKEN_POLARITY_ARMS["color.chart-3"].light,
      TOKEN_POLARITY_ARMS["color.chart-4"].light,
      TOKEN_POLARITY_ARMS["color.chart-5"].light,
    ]);
});

/** #504 — the marked-resolution-root contract. */
test("resolves chart chrome from the marked token root, so a custom theme paints its own tokens", async ({ mount, page }) => {
  // The measured defect: a CUSTOM theme sets NO `[data-theme]` — its palette is inline on <ThemeScope> over
  // the shell grid — so a store resolving from `documentElement` painted every canvas in the BASE palette
  // while the DOM around it painted the custom one. Read out as DOM for the same reason as the test above.
  const scope = await mount(<CustomThemeChartAxisLineStory />);
  const readout = scope.locator("p[data-axis-line]");
  await expect(readout).toHaveAttribute("data-axis-line", CUSTOM_ARM_ONE);
  await expect(readout).toHaveAttribute("data-mount-id", FIRST_MOUNT_ID);
  // The seam's OTHER read — the attached probe, whose host moved into the marked root with this fix. Read
  // once here rather than polled: the auto-retrying assertion above already settled this readout.
  await expect.poll(async () => await readout.getAttribute("data-series-positive")).toMatch(A_COLOR_FUNCTION);
  await expect.poll(async () => await readout.getAttribute("data-series-positive")).not.toMatch(UNRESOLVED_INTENT_TOKEN);

  // Custom → a DIFFERENT custom: the flip that moves NO attribute anywhere but ThemeScope's inline `style`.
  await scope.getByRole("button", { name: "Next theme" }).click();
  await expect(readout).toHaveAttribute("data-axis-line", CUSTOM_ARM_TWO);
  await expect(readout).toHaveAttribute("data-mount-id", FIRST_MOUNT_ID);

  // Custom → seed/no-override: the scope stops declaring the token and the base cascade takes it back.
  let baseBorder = await page.evaluate((): string => getComputedStyle(document.documentElement).getPropertyValue("--color-border").trim());
  await expect
    .poll(async () => {
      baseBorder = await page.evaluate((): string => getComputedStyle(document.documentElement).getPropertyValue("--color-border").trim());
      return baseBorder;
    })
    .not.toBe("");
  await scope.getByRole("button", { name: "Next theme" }).click();
  await expect(readout).toHaveAttribute("data-axis-line", baseBorder);
  await expect(readout).toHaveAttribute("data-mount-id", FIRST_MOUNT_ID);
});
