import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle, DialogTrigger } from "@orb/ui/dialog";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { DialogHandleHarness } from "./dialog-handle.fixtures";

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
  await expect(backdrop).toHaveCSS("background-color", TOKENS["color.scrim"].value);
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
  // never landing on "Outside before"/"Outside after". Unrolled (not a loop) — each Tab depends on
  // the prior one's settled focus, so this is a biome noAwaitInLoops false-positive to sidestep.
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
  const overflowing = await popup.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(overflowing).toBe(true);

  const submit = page.getByRole("button", { name: "Submit" });
  await submit.scrollIntoViewIfNeeded();
  const scrollTop = await popup.evaluate((el) => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
});
