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
