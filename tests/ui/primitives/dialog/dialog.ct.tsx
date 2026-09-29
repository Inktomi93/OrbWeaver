import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle, DialogTrigger } from "@orb/ui/dialog";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { DialogHandleHarness } from "./dialog-handle.fixtures.tsx";

test("opens on trigger click and closes on Escape", async ({ mount, page }) => {
  await mount(
    <Dialog>
      <DialogTrigger>Open settings</DialogTrigger>
      <DialogPopup>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>Adjust your preferences.</DialogDescription>
        <DialogClose>Cancel</DialogClose>
      </DialogPopup>
    </Dialog>,
  );

  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("button", { name: "Open settings" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Settings");
  await expect(dialog).toContainText("Adjust your preferences.");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("close button dismisses the dialog", async ({ mount, page }) => {
  await mount(
    <Dialog defaultOpen={true}>
      <DialogPopup>
        <DialogTitle>Confirm</DialogTitle>
        <DialogClose>Cancel</DialogClose>
      </DialogPopup>
    </Dialog>,
  );

  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("backdrop renders with the scrim token color", async ({ mount, page }) => {
  await mount(
    <Dialog defaultOpen={true}>
      <DialogPopup>
        <DialogTitle>Scrim check</DialogTitle>
      </DialogPopup>
    </Dialog>,
  );

  const backdrop = page.locator('[data-slot="dialog-backdrop"]');
  await expect(backdrop).toBeVisible();
  // The theme-aware overlay token (D43 §11.4) — never bg-black/50.
  await expect(backdrop).toHaveCSS("background-color", TOKENS["color.backdrop"].value);
});

// Base UI Dialog defaults `modal={true}` — focus trap + document scroll lock come free. This CT
// asserts the CONTRACT, not just trusts it: Tab never escapes the popup to the outside siblings, and
// closing returns focus to the trigger that opened it (menu/select already model this Tab-containment
// shape; dialog/alert-dialog/drawer previously leaned on "Base UI is free" with no assertion).
test("focus is trapped inside the popup and returns to the trigger on close", async ({ mount, page }) => {
  await mount(
    <>
      <button type="button">Outside before</button>
      <Dialog>
        <DialogTrigger>Open settings</DialogTrigger>
        <DialogPopup>
          <DialogTitle>Settings</DialogTitle>
          <button type="button">First field</button>
          <button type="button">Second field</button>
          <DialogClose>Cancel</DialogClose>
        </DialogPopup>
      </Dialog>
      <button type="button">Outside after</button>
    </>,
  );

  const trigger = page.getByRole("button", { name: "Open settings" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Tab through more presses than there are focusable items (First/Second/Cancel = 3 interactive
  // elements) so the cycle wraps at least once — focus must stay inside the popup at every step,
  // never landing on "Outside before"/"Outside after". Each Tab depends on the prior one's settled focus.
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

// TRANSITION-SWEEP (2026-08-08) — the toast root's `transition-all` finding, swept repo-wide. This popup
// is a FOCUS STOP: Base UI's focus manager stamps a managed `tabindex` on any `role="dialog"` floating
// element and moves focus into it on open (asserted below, because that premise is the whole reason the
// fence exists). `outline-*` is interpolable, so `transition: all` faded the focus ring in over
// --motion-base and a keyboard user moving at speed saw a desaturated half-ring at every stop.
// `OVERLAY_MOTION.modalPopup` names its two properties now.
//
// Read UNPOLLED and ONCE — a retrying matcher would happily wait out a fade and call an interpolating
// ring a pass. This is the DETERMINISTIC pin for the mechanism; no per-site ring-fade CT can be.
test("the modal popup is a focus stop whose transition names its properties — never `all`", async ({ mount, page }) => {
  await mount(
    <Dialog>
      <DialogTrigger>Open settings</DialogTrigger>
      {/* No focusable content: the focus manager then makes the popup ITSELF the tab stop, which is the
          exact element carrying the shared motion fragment. */}
      <DialogPopup>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>Adjust your preferences.</DialogDescription>
      </DialogPopup>
    </Dialog>,
  );

  await page.getByRole("button", { name: "Open settings" }).click();
  const popup = page.locator('[data-slot="dialog-popup"]');
  await expect(popup).toBeVisible();
  await expect(popup).toBeFocused();
  await expect.poll(async () => await popup.evaluate((element: Element) => getComputedStyle(element).transitionProperty)).not.toBe("all");
  await expect.poll(async () => await popup.evaluate((element: Element) => getComputedStyle(element).transitionProperty)).not.toContain("outline");
  // …while the enter/exit fade+scale keeps both of its halves. Dropping either silently kills that half.
  await expect.poll(async () => await popup.evaluate((element: Element) => getComputedStyle(element).transitionProperty)).toContain("opacity");
  await expect.poll(async () => await popup.evaluate((element: Element) => getComputedStyle(element).transitionProperty)).toContain("scale");
});

const ROOT_PX = 16;
const widthPx = (path: "width.dialog-sm" | "width.dialog-md" | "width.dialog-lg"): string => `${Number.parseFloat(TOKENS[path].value) * ROOT_PX}px`;

test("the size variants clamp the popup to the dialog-width tokens (default = md)", async ({ mount, page }) => {
  await mount(
    <Dialog defaultOpen={true}>
      <DialogPopup size="sm">
        <DialogTitle>Small</DialogTitle>
      </DialogPopup>
    </Dialog>,
  );
  await expect(page.locator('[data-slot="dialog-popup"]')).toHaveCSS("max-width", widthPx("width.dialog-sm"));
});

test("the default popup (no size prop) is the md width token", async ({ mount, page }) => {
  await mount(
    <Dialog defaultOpen={true}>
      <DialogPopup>
        <DialogTitle>Default</DialogTitle>
      </DialogPopup>
    </Dialog>,
  );
  await expect(page.locator('[data-slot="dialog-popup"]')).toHaveCSS("max-width", widthPx("width.dialog-md"));
});

test("size=full is a full-bleed presentation — no width cap, no radius, no border", async ({ mount, page }) => {
  await mount(
    <Dialog defaultOpen={true}>
      <DialogPopup size="full">
        <DialogTitle>Full bleed</DialogTitle>
      </DialogPopup>
    </Dialog>,
  );
  const popup = page.locator('[data-slot="dialog-popup"]');
  await expect(popup).toHaveCSS("max-width", "none");
  await expect(popup).toHaveCSS("border-top-left-radius", "0px");
  await expect(popup).toHaveCSS("border-top-width", "0px");
  // The viewport drops its gutter padding so the popup truly fills the screen.
  await expect(page.locator('[data-slot="dialog-viewport"]')).toHaveCSS("padding-top", "0px");
});

// The anchor axis: a centred popup moves by half of any change in its own height; a `top` popup pins its top
// edge at the viewport gutter, so its heading stays put while the body changes.
/** How far a short popup's top edge sits below the viewport's top gutter, once its open motion has settled. */
async function topBelowGutter(page: Page): Promise<number> {
  const popup = page.locator('[data-slot="dialog-popup"]');
  await expect.poll(() => popup.evaluate((el) => el.getAnimations().length)).toBe(0);
  const readGutter = (): Promise<number> => page.locator('[data-slot="dialog-viewport"]').evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingTop));
  await expect.poll(readGutter).toBeGreaterThan(0);
  const gutter = await readGutter();
  return ((await popup.boundingBox())?.y ?? Number.NaN) - gutter;
}

test("anchor=top pins the popup's top edge at the viewport gutter", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mount(
    <Dialog defaultOpen={true}>
      <DialogPopup anchor="top" size="lg">
        <DialogTitle>Anchored</DialogTitle>
      </DialogPopup>
    </Dialog>,
  );
  expect(Math.abs(await topBelowGutter(page))).toBeLessThanOrEqual(1);
});

test("the default anchor centres a short popup, well below the gutter", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mount(
    <Dialog defaultOpen={true}>
      <DialogPopup size="lg">
        <DialogTitle>Centred</DialogTitle>
      </DialogPopup>
    </Dialog>,
  );
  expect(await topBelowGutter(page)).toBeGreaterThan(1);
});

// createHandle: open the dialog imperatively (no trigger) with a payload via handle.openWithPayload;
// the payload reaches the Root render-function children (harness in ./dialog-handle.fixtures).
test("opens imperatively via a handle and routes the payload to content", async ({ mount, page }) => {
  await mount(<DialogHandleHarness />);

  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("button", { name: "Open remotely" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Reached content");
});

// Popup content taller than the viewport (a FormDialog with many fields) must SCROLL, not clip off
// screen — the popup owns both layout and scroll (overflow-y-auto), never the backdrop/viewport.
test("popup content taller than the viewport scrolls instead of clipping", async ({ mount, page }) => {
  await mount(
    <Dialog defaultOpen={true}>
      <DialogPopup size="sm">
        <DialogTitle>Tall form</DialogTitle>
        {/* flex-shrink: 0 — a plain height on a flex child inside the popup's flex column would
            otherwise be compressed by flexbox's default min-content shrink, masking the overflow
            this test exists to prove. */}
        <div style={{ height: "3000px", flexShrink: 0 }}>Tall content</div>
        <DialogClose>Submit</DialogClose>
      </DialogPopup>
    </Dialog>,
  );

  const popup = page.locator('[data-slot="dialog-popup"]');
  await expect(popup).toHaveCSS("overflow-y", "auto");

  // The popup's own scrollHeight exceeds its clientHeight (content genuinely overflows the clamped
  // popup, not just the page) — and scrolling the popup element itself reaches the submit button
  // pinned below the tall content, proving the overflow is functional, not just declared.
  await expect.poll(async () => await popup.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

  const submit = page.getByRole("button", { name: "Submit" });
  await submit.scrollIntoViewIfNeeded();
  await expect.poll(async () => await popup.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});
