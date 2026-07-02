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
