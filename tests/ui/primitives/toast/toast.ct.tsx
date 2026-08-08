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
// back to the UA outline — the one focusable surface in the app not wearing the app ring.
test("the focused root wears the app focus ring, not the UA outline", async ({ mount, page }) => {
  await mount(<ToastPlayground />);
  await page.getByRole("button", { name: "add toast", exact: true }).click();

  const toast = page.locator(ROOT);
  await expect(toast).toHaveCount(1);
  // KEYBOARD focus, never `locator.focus()`: `:focus-visible` does not match a script-focused div, so a
  // programmatic focus reads as "no ring" whether or not the ring exists. F6 is Base UI's own
  // focus-the-viewport hotkey; Tab then steps into the toast.
  await page.keyboard.press("F6");
  await page.keyboard.press("Tab");
  await expect(toast).toBeFocused();

  await expect(toast).toHaveCSS("outline-style", "none");
  const ring = await resolvedToken(page, "color", TOKENS["color.ring"].cssVar);
  await expect(toast).toHaveCSS("box-shadow", new RegExp(ring.replaceAll(/[.()]/g, String.raw`\$&`)));
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
