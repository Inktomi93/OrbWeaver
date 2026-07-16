// CT: the alert-dialog seal — opens on trigger, closes on Escape (focus trap + Esc are Base UI's),
// and the backdrop wears the theme-aware scrim token (D43 §11.4 — never bg-black/50).
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@orb/ui/alert-dialog";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { AlertDialogHandleHarness } from "./alert-dialog-handle.fixtures";

test("opens on trigger click and closes on Escape", async ({ mount, page }) => {
  await mount(
    <AlertDialog>
      <AlertDialogTrigger>Delete</AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogTitle>Delete character?</AlertDialogTitle>
        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        <AlertDialogActions>
          <AlertDialogClose>Cancel</AlertDialogClose>
        </AlertDialogActions>
      </AlertDialogPopup>
    </AlertDialog>,
  );

  await expect(page.getByRole("alertdialog")).toBeHidden();

  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Delete character?");
  await expect(dialog).toContainText("This cannot be undone.");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toBeHidden();
});

test("backdrop renders with the scrim token color", async ({ mount, page }) => {
  await mount(
    <AlertDialog defaultOpen={true}>
      <AlertDialogPopup>
        <AlertDialogTitle>Scrim check</AlertDialogTitle>
      </AlertDialogPopup>
    </AlertDialog>,
  );

  const backdrop = page.locator('[data-slot="alert-dialog-backdrop"]');
  await expect(backdrop).toBeVisible();
  await expect(backdrop).toHaveCSS("background-color", TOKENS["color.scrim"].value);
});

// Base UI AlertDialog defaults `modal={true}` — focus trap + document scroll lock come free. This CT
// asserts the CONTRACT, not just trusts it: Tab never escapes the popup to the outside siblings, and
// closing returns focus to the trigger that opened it (menu/select already model this Tab-containment
// shape; dialog/alert-dialog/drawer previously leaned on "Base UI is free" with no assertion).
test("focus is trapped inside the popup and returns to the trigger on close", async ({ mount, page }) => {
  await mount(
    <>
      <button type="button">Outside before</button>
      <AlertDialog>
        <AlertDialogTrigger>Delete</AlertDialogTrigger>
        <AlertDialogPopup>
          <AlertDialogTitle>Delete character?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          <AlertDialogActions>
            <AlertDialogClose>Cancel</AlertDialogClose>
            <AlertDialogClose>Confirm</AlertDialogClose>
          </AlertDialogActions>
        </AlertDialogPopup>
      </AlertDialog>
      <button type="button">Outside after</button>
    </>,
  );

  const trigger = page.getByRole("button", { name: "Delete", exact: true });
  await trigger.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();

  // Tab through more presses than there are focusable items (Cancel/Confirm = 2) so the cycle wraps
  // at least once — focus must stay inside the popup at every step. Unrolled (not a loop) — each Tab
  // depends on the prior one's settled focus, so this is a biome noAwaitInLoops false-positive to
  // sidestep.
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

// createHandle: open the alert dialog imperatively (no trigger) with a payload via
// handle.openWithPayload; the payload reaches the Root render-function children (harness in
// ./alert-dialog-handle.fixtures).
test("opens imperatively via a handle and routes the payload to content", async ({ mount, page }) => {
  await mount(<AlertDialogHandleHarness />);

  await expect(page.getByRole("alertdialog")).toBeHidden();

  await page.getByRole("button", { name: "Delete remotely" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Reached content");
});
