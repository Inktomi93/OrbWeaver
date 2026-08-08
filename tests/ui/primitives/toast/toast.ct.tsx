import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { ToastOverComposerPlayground, ToastPlayground } from "./toast.fixtures.tsx";

const ROOT = '[data-slot="toast-root"]';

/** Resolve a token through the LIVE document rather than TOKENS' static string: the colour tokens are
 *  `light-dark()` pairs and the control sizes are pointer-conditional, so only the browser knows the
 *  value this run actually renders (the number-field CT precedent). */
function resolvedToken(page: Page, property: "color" | "width", cssVar: string): Promise<string> {
  return page.evaluate(
    ([prop, name]: readonly [string, string]) => {
      const probe = document.createElement("span");
      probe.style.setProperty("position", "absolute");
      probe.style.setProperty(prop, `var(${name})`);
      document.body.append(probe);
      const resolved = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return resolved;
    },
    [property, cssVar] as const,
  );
}

async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("toast CT: element has no bounding box");
  }
  return box;
}

/** WCAG contrast between two CSS colours, computed on real sRGB bytes. `getComputedStyle` hands these
 *  back in the authored colour space, not sRGB, so they are painted into a 1×1 canvas and sampled
 *  rather than string-parsed — the browser is the only honest converter, and a regex over a colour
 *  notation is how a contrast probe starts lying. */
function contrastRatio(page: Page, foreground: string, background: string): Promise<number> {
  return page.evaluate(
    ([front, back]: readonly [string, string]) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      if (context === null) {
        throw new Error("toast CT: no 2d context for the contrast probe");
      }
      const luminance = (color: string): number => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        // Defaults are syntax, not a branch: a 1×1 RGBA read always yields four entries — they exist
        // only because `noUncheckedIndexedAccess` types the buffer read as possibly-undefined.
        const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
        const channel = (value: number): number => {
          const srgb = value / 255;
          return srgb <= 0.039_28 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const a = luminance(front);
      const b = luminance(back);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    },
    [foreground, background] as const,
  );
}

/** A toast SLIDES in. Geometry read on the same tick as the mount is the enter transition's first frame,
 *  not the resting layout (measured: y=4 mid-slide against a settled y=72) — so wait for the element's own
 *  animations to finish before believing a box. A cancelled animation is a settle too, hence the catch. */
async function settled(locator: Locator): Promise<void> {
  await locator.evaluate(async (element: Element) => {
    await Promise.all(element.getAnimations().map((animation: Animation) => animation.finished.catch(() => undefined)));
  });
}

test("a toast appears via the imperative add API", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(0);

  await page.getByRole("button", { name: "add toast", exact: true }).click();
  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("Saved");
  await expect(toast).toContainText("All changes stored.");
});

test("a loading toast carries data-type=loading and the distinct primary border", async ({ mount, page }) => {
  await mount(<ToastPlayground />);
  await page.getByRole("button", { name: "add loading toast", exact: true }).click();
  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toHaveCount(1);
  // Base UI sets data-type from the toast type; the seal tints the loading border with the primary
  // accent so it reads distinctly from a plain toast (bg-popover border).
  await expect(toast).toHaveAttribute("data-type", "loading");
  await expect(toast).toHaveCSS("border-top-color", TOKENS["color.primary"].value);
});

test("toasts stack and can be dismissed via the close button", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  const addButton = page.getByRole("button", { name: "add toast", exact: true });
  await addButton.click();
  await addButton.click();
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(2);

  const closeButtons = page.locator('[data-slot="toast-root"] button[aria-label="Close notification"]');
  await expect(closeButtons).toHaveCount(2);
  await expect(closeButtons.first()).toBeVisible();
  await closeButtons.first().click();
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(1);
});

test("a toast carries a native action button that is clickable", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  await page.getByRole("button", { name: "add toast with action", exact: true }).click();
  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toHaveCount(1);

  // The native Toast.Action renders the label from actionProps.children (not a hand-rolled button).
  const action = toast.locator('[data-slot="toast-action"]');
  await expect(action).toHaveText("Open character");

  // Clicking the action fires its onClick — here it enqueues a second toast, proving the handler ran.
  await action.click();
  await expect(page.locator('[data-slot="toast-root"]')).toContainText(["Opened", "Character created"]);
});

test("a toast auto-dismisses after its timeout", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  await page.getByRole("button", { name: "add quick toast", exact: true }).click();
  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toHaveCount(1);
  // 500ms timeout — expect polling (never manual sleeps) sees it removed.
  await expect(toast).toHaveCount(0);
});

// Base UI's default swipeDirection is ['down', 'right'] with a 40px dismiss threshold. This drags
// PAST that threshold and asserts BOTH halves of the fix: `data-swiping` is present mid-drag (so
// `data-swiping:transition-none` can suspend the enter/exit transition and the gesture tracks 1:1 —
// the defect this fix closes, mirroring drawer's popup) and the toast is actually dismissed on release.
test("a toast can be swiped away past the dismiss threshold", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  await page.getByRole("button", { name: "add toast", exact: true }).click();
  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toHaveCount(1);

  const box = await toast.boundingBox();
  if (box === null) {
    throw new Error("toast CT: missing bounding box for swipe geometry");
  }
  // Start the drag over the title/description area (avoids the close button and action, which are
  // in the swipe-gesture ignore-selector) and drag DOWN well past the 40px threshold.
  const startX = box.x + box.width / 2;
  const startY = box.y + (box.height * 2) / 3;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY - 30, { steps: 5 });
  await expect(toast).toHaveAttribute("data-swiping");
  await page.mouse.move(startX, startY - 80, { steps: 5 });
  await page.mouse.up();

  await expect(toast).toHaveCount(0);
});

// ── The INFRA-WARN-DEAF side-eye findings (2026-08-07) ───────────────────────────────────────────────

// P1-2. The close ✕ is `position: absolute` in the root's top-right corner; the content slot is in flow
// and spanned the FULL root width, so the button painted ON TOP of the copy (measured: 26×26px of
// overlap, `contentPaddingRight: 0`). The reservation is token-expressed on the content slot, so this
// holds for EVERY toast in the app — the geometry is what's asserted, never the class string.
test("the content reserves the close button's box so the ✕ never paints over the copy", async ({ mount, page }) => {
  await mount(<ToastPlayground />);
  await page.getByRole("button", { name: "add long toast", exact: true }).click();

  const toast = page.locator(ROOT);
  await expect(toast).toHaveCount(1);
  await settled(toast);
  const close = toast.locator('button[aria-label="Close notification"]');

  const closeBox = await boxOf(close);
  const titleBox = await boxOf(toast.getByRole("heading"));
  const descriptionBox = await boxOf(toast.locator("p"));

  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(closeBox.x);
  expect(descriptionBox.x + descriptionBox.width).toBeLessThanOrEqual(closeBox.x);
});

// P2-3. Base UI's own ToastClose sets `aria-hidden: !expanded && !hasFocus` on a natively focusable
// <button> (ToastClose.mjs:44) — an axe `aria-hidden-focus` serious violation, and it means the ONLY
// dismiss affordance is invisible to a screen reader until it is already focused. `getByRole` obeys the
// accessibility tree, so this test is the assertion: if the button is hidden from AT, it is not found.
test("the close button is in the accessibility tree by role + name, not only in the DOM", async ({ mount, page }) => {
  await mount(<ToastPlayground />);
  await page.getByRole("button", { name: "add toast", exact: true }).click();

  const toast = page.locator(ROOT);
  await expect(toast).toHaveCount(1);
  await expect(toast.getByRole("button", { name: "Close notification" })).toBeVisible();
});

// P2-1. A warning had no identity at all — it arrived as a plain info toast. Meaning is never carried by
// colour alone (WCAG 1.4.1), so the tint comes WITH a glyph: a warning root holds two SVGs (its type icon
// + the close ✕) where a plain toast holds one.
test("a warning toast carries data-type=warning, the warning tint AND a glyph (never colour alone)", async ({ mount, page }) => {
  await mount(<ToastPlayground />);
  await page.getByRole("button", { name: "add warning toast", exact: true }).click();

  const toast = page.locator(ROOT);
  await expect(toast).toHaveAttribute("data-type", "warning");
  await expect(toast).toHaveCSS("border-top-color", await resolvedToken(page, "color", TOKENS["color.warning"].cssVar));
  await expect(toast.locator("svg")).toHaveCount(2);

  await page.getByRole("button", { name: "add toast", exact: true }).click();
  await expect(page.locator(`${ROOT}:not([data-type])`).locator("svg")).toHaveCount(1);
});

// P2-3 / description. The split title/description is the whole point of the widened notice: the title
// must scan in under a second, the detail rides below it. Base UI names the toast BY its title, so the
// two must be distinct elements — a heading plus a paragraph — not one concatenated string.
test("title and description render as distinct elements, the title naming the toast", async ({ mount, page }) => {
  await mount(<ToastPlayground />);
  await page.getByRole("button", { name: "add toast", exact: true }).click();

  const toast = page.locator(ROOT);
  await expect(toast.getByRole("heading")).toHaveText("Saved");
  await expect(toast.locator("p")).toHaveText("All changes stored.");
});

// P3-1. The root is `tabIndex: 0` (ToastRoot.mjs:414) and carried NO focus style, so keyboard focus fell
// back to the UA outline. The FIRST fix regressed it: a box-shadow ring on an element that also carries
// `shadow-overlay` loses the composite to the elevation — `:focus-visible` matched, all four ring slots
// stayed `0 0 0 0` transparent, and `outline-none` had killed the UA fallback, so a real Tab painted
// NOTHING (WCAG 2.4.7). The ring is an OUTLINE now, which is a separate paint property.
//
// Read the ring off `outline-*`, and read the box-shadow WHOLE: the regression survived its first review
// because the instrument sliced the shadow string and the transparent ring slots fell outside the slice.
test("a real Tab paints a visible focus ring on the root, and the elevation shadow survives it", async ({ mount, page }) => {
  await mount(<ToastPlayground />);
  await page.getByRole("button", { name: "add toast", exact: true }).click();

  const toast = page.locator(ROOT);
  await expect(toast).toHaveCount(1);
  const restingShadow = await toast.evaluate((element: Element) => getComputedStyle(element).boxShadow);

  // KEYBOARD focus, never `locator.focus()`: `:focus-visible` does not match a script-focused div, so a
  // programmatic focus reads as "no ring" whether or not the ring exists. F6 is Base UI's own
  // focus-the-viewport hotkey; Tab then steps into the toast.
  await page.keyboard.press("F6");
  await page.keyboard.press("Tab");
  await expect(toast).toBeFocused();

  // The ring itself: a real, coloured, non-zero outline. `outline-style: none` is the regression's shape.
  const ring = await resolvedToken(page, "color", TOKENS["color.ring"].cssVar);
  await expect(toast).toHaveCSS("outline-color", ring);
  await expect(toast).toHaveCSS("outline-width", "2px");
  await expect(toast).not.toHaveCSS("outline-style", "none");

  // …and the elevation is untouched — the whole point of moving off the box-shadow slot is that the two
  // no longer compete. Compared as FULL strings, never a slice.
  await expect(toast).toHaveCSS("box-shadow", restingShadow);
});

// ── The side-eye RE-VERIFY findings (2026-08-07, leg 2) ──────────────────────────────────────────────

// NEW P2. The action carried `bg-secondary` on a `bg-popover` surface with `border: 0` — 1.03:1, one
// L-step apart, so the only actionable thing in the toast read as stray text. WCAG 1.4.11 wants ≥3:1 for
// a control's boundary. Asserted as a real ratio on sampled pixels, not as a class name, so any future
// token retune that flattens the fill fails here.
test("the action button's fill clears the 3:1 non-text contrast floor against the toast surface", async ({ mount, page }) => {
  await mount(<ToastPlayground />);
  await page.getByRole("button", { name: "add toast with action", exact: true }).click();

  const toast = page.locator(ROOT);
  await expect(toast).toHaveCount(1);
  const action = toast.locator('[data-slot="toast-action"]');
  await expect(action).toBeVisible();

  const fill = await action.evaluate((element: Element) => getComputedStyle(element).backgroundColor);
  const surface = await toast.evaluate((element: Element) => getComputedStyle(element).backgroundColor);
  expect(await contrastRatio(page, fill, surface)).toBeGreaterThanOrEqual(3);

  // …and its LABEL stays readable on that new fill (4.5:1 text floor) — a boundary fix that blinds the
  // text is not a fix.
  const label = await action.evaluate((element: Element) => getComputedStyle(element).color);
  expect(await contrastRatio(page, label, fill)).toBeGreaterThanOrEqual(4.5);
});

// NEW P3. Moving the stack top-right put it under the notifications popover: measured z-60 toast vs z-65
// popover, 272×26px of occlusion INCLUDING the ✕, so the toast could be neither read nor dismissed. The
// scale itself was re-ranked (tokens.json `z.toast` 60 → 68) rather than the viewport overriding it, so
// the assertion is on the RANK, which is the thing that was wrong.
test("the toast viewport outranks the popover tier so a popover can never bury it", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  const viewport = page.locator('[data-slot="toast-viewport"]');
  await expect(viewport).toHaveCSS("z-index", TOKENS["z.toast"].value);
  expect(Number(TOKENS["z.toast"].value)).toBeGreaterThan(Number(TOKENS["z.popover"].value));
  // …and still below the tooltip tier: a tooltip must stay readable over anything.
  expect(Number(TOKENS["z.toast"].value)).toBeLessThan(Number(TOKENS["z.tooltip"].value));
});

/** Fires one typed toast, asserts it carries a glyph BESIDE the close ✕ (two SVGs), then dismisses it so
 *  the next type's locator stays unambiguous. */
async function expectTypeGlyph(page: Page, button: string, type: string): Promise<void> {
  await page.getByRole("button", { name: button, exact: true }).click();
  const toast = page.locator(`${ROOT}[data-type="${type}"]`);
  await expect(toast).toHaveCount(1);
  await expect(toast.locator("svg")).toHaveCount(2);
  await toast.locator('button[aria-label="Close notification"]').click();
  await expect(toast).toHaveCount(0);
}

// Filed residual. `error` and `success` were still colour-only after the warning grew its glyph — the
// same WCAG 1.4.1 defect, and `error`'s border is the WEAKEST tint of the set, so it was the worst of
// the three. Two SVGs = the type glyph + the close ✕; the plain toast's one is the control.
test("every meaning-bearing toast type carries a glyph, not just a tint", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  // Sequential by necessity (each toast is dismissed before the next so the type locators stay unique),
  // so this is three explicit awaits rather than a loop — `noAwaitInLoops` is right that a loop here
  // would be the wrong shape to reach for.
  await expectTypeGlyph(page, "add error toast", "error");
  await expectTypeGlyph(page, "add success toast", "success");
  await expectTypeGlyph(page, "add warning toast", "warning");

  // The control: a plain info toast claims no state, so it stays glyph-less (its lone SVG is the ✕).
  await page.getByRole("button", { name: "add toast", exact: true }).click();
  await expect(page.locator(`${ROOT}:not([data-type])`).locator("svg")).toHaveCount(1);
});

// ── P1-1: the toast stack may never land on the composer band ────────────────────────────────────────
// The bottom-right stack covered the chat composer's Send button by 94% and swallowed the click — at the
// TURN-TERMINAL moment, which is exactly when the user reaches for Send. The viewport is top-anchored
// below the chrome row now, so the clearance is structural: assert the geometry at both a desktop mount
// and a phone one, since the composer is bottom-anchored in both.

interface ComposerClearance {
  /** Settled distance from the toast stack's bottom edge to the composer band's top edge. */
  readonly gapToComposer: number;
  /** Settled distance from the viewport's top edge to the toast stack's top edge. */
  readonly topInset: number;
  readonly chromeRow: number;
}

async function composerClearance(page: Page): Promise<ComposerClearance> {
  await page.getByRole("button", { name: "add long toast", exact: true }).click();
  const toast = page.locator(ROOT);
  await expect(toast).toHaveCount(1);
  await settled(toast);

  const toastBox = await boxOf(toast);
  const composerBox = await boxOf(page.locator("[data-composer-standin]"));
  return {
    chromeRow: Number.parseFloat(await resolvedToken(page, "width", TOKENS["dimension.chrome-row"].cssVar)),
    gapToComposer: composerBox.y - (toastBox.y + toastBox.height),
    topInset: toastBox.y,
  };
}

test("the toast stack clears a bottom-anchored composer band at the desktop mount", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mount(<ToastOverComposerPlayground />);

  const clearance = await composerClearance(page);
  expect(clearance.gapToComposer).toBeGreaterThanOrEqual(0);
  expect(clearance.topInset).toBeGreaterThanOrEqual(clearance.chromeRow);
});

// The narrowest real host: the content column when BOTH shell panels are docked (the context-panel-
// expanded layout the review proved this is not an edge case of).
test("the toast stack clears the composer at the panels-expanded content width", async ({ mount, page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await mount(<ToastOverComposerPlayground />);

  const clearance = await composerClearance(page);
  expect(clearance.gapToComposer).toBeGreaterThanOrEqual(0);
  expect(clearance.topInset).toBeGreaterThanOrEqual(clearance.chromeRow);
});

test.describe("coarse pointer — the phone mount", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 932 } });

  test("the toast stack clears the composer band on a phone", async ({ mount, page }) => {
    await mount(<ToastOverComposerPlayground />);

    const clearance = await composerClearance(page);
    expect(clearance.gapToComposer).toBeGreaterThanOrEqual(0);
    expect(clearance.topInset).toBeGreaterThanOrEqual(clearance.chromeRow);
  });
});
