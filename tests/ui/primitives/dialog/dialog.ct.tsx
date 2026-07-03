import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@orb/ui/dialog";
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
test("focus is trapped inside the popup and returns to the trigger on close", async ({
  mount,
  page,
}) => {
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

// createHandle: open the dialog imperatively (no trigger) with a payload via handle.openWithPayload;
// the payload reaches the Root render-function children (harness in ./dialog-handle.harness).
test("opens imperatively via a handle and routes the payload to content", async ({
  mount,
  page,
}) => {
  await mount(<DialogHandleHarness />);

  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("button", { name: "Open remotely" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Reached content");
});
