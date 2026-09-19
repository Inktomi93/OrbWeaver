// CT: the "Sizing & motion" appearance SECTION (SET-SEAMS stage 1) — an app-shell-owned section of the
// decomposed appearance pane, and the one that ABSORBED the pane's old `motion` sub plus the
// density/elevation knobs (app-shell reads all five, and §6 makes the reader the owner).
//
// P1 (SET-SEAMS §9): the `appearance` section-patch carries EXACTLY the five owned keys. Slider bounds are
// asserted against the section's OWN exported MIN/MAX constants, never hardcoded numbers.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { CHAT_WIDTH_MAX, CHAT_WIDTH_MIN, FONT_SCALE_MAX, FONT_SCALE_MIN } from "../../../../../packages/client/src/features/app-shell/lib/appearance-bounds.ts";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AppearanceSizingSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_sizing", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";
const OWNED_KEYS = ["chatWidthPct", "density", "elevation", "fontScale", "reducedMotion"];

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => ({}) });
}

function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "appearance" ? input.patch : undefined;
}

test("renders the sizing sliders AND the absorbed density/elevation/motion controls under one heading", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceSizingSectionStory />);
  await expect(page.getByRole("heading", { name: "Sizing & motion" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Chat width (%)" })).toHaveAttribute("aria-valuenow", String(DEFAULT_USER_SETTINGS.appearance.chatWidthPct));
  await expect(page.getByRole("slider", { name: "Text size", exact: true })).toHaveAttribute(
    "aria-valuenow",
    String(DEFAULT_USER_SETTINGS.appearance.fontScale),
  );
  // The absorbed controls survived the merge — and density/elevation are ILLUSTRATED PICKERS now
  // (#866 §7.8 seen-not-read, rebuilt on the shared picker cell for #929 E6): every option visible at
  // rest WITH its own picture, the persisted value checked. They are RADIOGROUPS, not N loose buttons
  // (#981 F20) — resolving them by that role IS the semantic pin.
  const density = page.getByRole("radiogroup", { name: "Density" });
  await expect(density.getByRole("radio", { name: "Comfortable" })).toHaveAttribute("aria-checked", "true");
  await expect(density.getByRole("radio", { name: "Compact" })).toHaveAttribute("aria-checked", "false");
  const elevation = page.getByRole("radiogroup", { name: "Surface elevation" });
  await expect(elevation.getByRole("radio", { name: "Flat" })).toHaveAttribute("aria-checked", "true");
  await expect(elevation.getByRole("radio")).toHaveCount(3);
  await expect(page.getByRole("switch", { name: "Reduce motion" })).toBeVisible();
});

test("chatWidthPct clamps at its own MIN/MAX and patches key-minimally", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSizingSectionStory />);
  const slider = page.getByRole("slider", { name: "Chat width (%)" });

  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", String(CHAT_WIDTH_MIN));
  await expect.poll(() => lastPatch(trpc)?.["chatWidthPct"], { intervals: [20, 50, 100] }).toBe(CHAT_WIDTH_MIN);

  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuenow", String(CHAT_WIDTH_MAX));
  await expect.poll(() => lastPatch(trpc)?.["chatWidthPct"], { intervals: [20, 50, 100] }).toBe(CHAT_WIDTH_MAX);
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});

test("fontScale clamps at its own MIN/MAX and patches fontScale", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSizingSectionStory />);
  const slider = page.getByRole("slider", { name: "Text size", exact: true });

  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", String(FONT_SCALE_MIN));
  await expect.poll(() => lastPatch(trpc)?.["fontScale"], { intervals: [20, 50, 100] }).toBe(FONT_SCALE_MIN);

  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuenow", String(FONT_SCALE_MAX));
  await expect.poll(() => lastPatch(trpc)?.["fontScale"], { intervals: [20, 50, 100] }).toBe(FONT_SCALE_MAX);
});

test("BOTH density options show their OWN spacing art, and picking one patches density key-minimally", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSizingSectionStory />, { hooksConfig: { theme: { density: "compact" } } });

  // #1099 F9 + #929: the art is FOLDED INTO each option, so both spacings are on screen at the moment of
  // choosing. The old anatomy — one detached preview following the DRAFT — could only ever show the
  // option you had already picked, which is not a comparison.
  const previews = page.locator('[data-slot="density-preview"]');
  await expect(previews).toHaveCount(2);
  await expect(previews.nth(0)).toHaveAttribute("data-density", "comfortable");
  await expect(previews.nth(1)).toHaveAttribute("data-density", "compact");

  const readSpacing = (index: number): Promise<readonly string[]> =>
    previews.nth(index).evaluate((element) => {
      const style = getComputedStyle(element);
      return ["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"].map((name) => style.getPropertyValue(name).trim());
    });
  // THE ART IS THE DEFINITION, not a copy: each box re-scopes the SAME tiers.css spacing intents the shell
  // grid reads (one definition, two consumers — the owner's derive-never-mirror rider), so the two cells
  // genuinely differ rather than swapping an attribute nothing styles.
  const comfortable = await readSpacing(0);
  const compact = await readSpacing(1);
  expect(comfortable).not.toEqual(compact);
  await expect.poll(() => previews.nth(1).evaluate((el: HTMLElement) => getComputedStyle(el).rowGap)).toBe("6px"); // compact row = the canonical field step

  await page.getByRole("radiogroup", { name: "Density" }).getByRole("radio", { name: "Compact" }).click();
  await expect.poll(() => lastPatch(trpc)?.["density"], { intervals: [20, 50, 100] }).toBe("compact");
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
  await expect(page.getByRole("radio", { name: "Compact" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "Comfortable" })).toHaveAttribute("aria-checked", "false");
});

// #981 F20 — the picker is ONE tab stop with roving focus, not N. The old anatomy made a keyboard user
// walk every option to pass the control.
test("the density picker is ONE tab stop: arrows move the selection, Tab leaves the group", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceSizingSectionStory />);
  const comfortable = page.getByRole("radio", { name: "Comfortable" });
  await comfortable.focus();
  await expect(comfortable).toBeFocused();
  // The unchecked sibling is OUT of the tab order while unchecked — that is what "one tab stop" means.
  await expect(page.getByRole("radio", { name: "Compact" })).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Compact" })).toHaveAttribute("aria-checked", "true");
  await expect(comfortable).toHaveAttribute("aria-checked", "false");
});

test("an elevation CELL patches elevation, key-minimally — and the three diagrams are measurably different", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSizingSectionStory />);
  const cards = page.getByRole("radiogroup", { name: "Surface elevation" });
  await cards.getByRole("radio", { name: "Layered" }).click();

  await expect.poll(() => lastPatch(trpc)?.["elevation"], { intervals: [20, 50, 100] }).toBe("ramp");
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);

  // #1099 G4 — THE PIN THAT CHANGED, AND WHY. This arm used to assert that Layered's middle cell computes
  // exactly `--color-surface-raised`, i.e. that the diagram painted the shell's REAL three ramp tones. The
  // re-drive measured what that produced: every descendant at rgba(0,0,0,0) where it did not paint, and
  // 1.03–1.12:1 between the steps where it did — the middle option of a three-option picker was a picture
  // of nothing. Two adjacent members of the derived neutral ramp cannot read apart (~1.14:1 ceiling on
  // either polarity), so the old token choice could not be tuned into a legible ladder; §7.8's exaggeration
  // licence covers exactly this. THE MECHANISM SURVIVES — every step is still DERIVED from shell tokens,
  // never a hex literal — and the CLAIM is now the one G4 asks for: three measurably different stacks with
  // per-step contrast ≥ 1.5:1.
  const RatioFloor = 1.5;
  // DECODE THROUGH A CANVAS, never a regex. Chrome reports these computed backgrounds in their AUTHORED
  // colour space (`oklch(…)`), so an `rgb()` pattern reads every plate as black and every ratio as exactly
  // 1.0 — a false verdict shaped like a real one (this arm's own first draft did exactly that; the planted
  // floor caught it). The canvas also does the ALPHA compositing for free, which is the point here: the
  // ladder is `foreground` at rising alpha over the art ground.
  const contrastLadder = async (name: string): Promise<readonly number[]> =>
    await cards.getByRole("radio", { name }).evaluate((cell): readonly number[] => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context === null) {
        return [];
      }
      const ground = getComputedStyle(cell.querySelector('[data-slot="picker-cell-art"]') ?? cell).backgroundColor;
      const luminance = (color: string): number => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = ground;
        context.fillRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
        const channel = (value: number): number => {
          const srgb = value / 255;
          return srgb <= 0.039_28 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
      };
      // The LADDER is the diagram's own three cells (art aperture → layout stack → plate → cells), named
      // structurally. A "every non-transparent descendant" sweep counts the art ground twice — the aperture
      // and the plate both paint `bg-background` — which opens the sorted list with a 1.00:1 pair.
      const steps = [...cell.querySelectorAll('[data-slot="picker-cell-art"] > * > * > *')];
      return steps.map((node) => luminance(getComputedStyle(node).backgroundColor));
    });

  const layered = await contrastLadder("Layered");
  // The positive control: an EMPTY ladder would satisfy every "all steps differ" claim vacuously, and an
  // empty ladder is literally the defect this arm exists for (`Layered` painted NOTHING for a whole era).
  expect(layered).toHaveLength(3);
  const sorted = [...layered].sort((a, b) => a - b);
  for (let index = 1; index < sorted.length; index += 1) {
    const ratio = ((sorted[index] ?? 0) + 0.05) / ((sorted[index - 1] ?? 0) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(RatioFloor);
  }

  // …and the three options do not draw the same picture: shape + shadow differ, not only the tone.
  const signature = async (name: string): Promise<string> =>
    await cards
      .getByRole("radio", { name })
      .evaluate((cell) =>
        [...cell.querySelectorAll("*")].map((node) => `${getComputedStyle(node).backgroundColor}|${getComputedStyle(node).boxShadow}`).join(";"),
      );
  const signatures = [await signature("Flat"), await signature("Layered"), await signature("Lifted (glow)")];
  expect(new Set(signatures).size).toBe(3);
});

// #1871 item 4 (owner ruling 2026-09-19) — A DEAD DIAL IS NOT OFFERED. `--width-shell-content` is
// `clamp(var(--dimension-shell-content-floor), <chatWidthPct>dvw, 100dvw)`, so at or below that floor the
// clamp's MIN wins at every position of the slider: the control is inert. The section hides it there and
// says why. Both arms assert the RELATION between the mounted viewport and the LIVE floor before asserting
// the rendering, so a token change moves the pin rather than silently retiring it — and the two arms
// together are each other's positive control (one mount, one story, opposite verdicts).
const FLOOR_REM = Number.parseFloat(TOKENS["dimension.shell-content-floor"].value);
const DIAL_NAME = "Chat width (%)";
const DEAD_DIAL_NOTE = "The chat column already fills this screen — this setting takes effect on a wider one.";

/** The floor in LIVE px: `rem` rides `--font-scale` (`:root { font-size: calc(100% * var(--font-scale)) }`),
 *  so the threshold is only knowable in the page. The rem magnitude crosses as an ARGUMENT — a node-side
 *  binding closed over inside `evaluate` is not in scope there. */
function liveFloorPx(page: Page): Promise<number> {
  return page.evaluate((rem: number) => rem * Number.parseFloat(getComputedStyle(document.documentElement).fontSize), FLOOR_REM);
}

test.describe("below the shell content floor", () => {
  test.use({ viewport: { width: 640, height: 900 } });

  test("the chat-width dial is withheld and the row explains why", async ({ mount, page }) => {
    await stub(page);
    await mount(<AppearanceSizingSectionStory />);
    // The premise, measured rather than assumed: this viewport really is at/below the live floor.
    expect(await page.evaluate(() => globalThis.innerWidth)).toBeLessThanOrEqual(await liveFloorPx(page));

    await expect(page.getByRole("slider", { name: DIAL_NAME })).toHaveCount(0);
    await expect(page.getByText(DEAD_DIAL_NOTE)).toBeVisible();
    // The SIBLING dial is untouched — this hides one inert control, not the section.
    await expect(page.getByRole("slider", { name: "Text size", exact: true })).toBeVisible();
  });
});

test.describe("above the shell content floor", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the chat-width dial is offered and the note is absent", async ({ mount, page }) => {
    await stub(page);
    await mount(<AppearanceSizingSectionStory />);
    expect(await page.evaluate(() => globalThis.innerWidth)).toBeGreaterThan(await liveFloorPx(page));

    await expect(page.getByRole("slider", { name: DIAL_NAME })).toBeVisible();
    await expect(page.getByText(DEAD_DIAL_NOTE)).toHaveCount(0);
  });
});
