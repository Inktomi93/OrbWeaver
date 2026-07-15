// CT: `<ConfirmDialog>` — the client-shared composite (rollup-audit C1). Proves both entry shapes
// (uncontrolled trigger vs controlled open/onOpenChange), that Cancel/Confirm both close the dialog,
// onConfirm fires exactly on the confirm click, and the M5 extensions (cancelLabel, optional
// description, an arbitrary `trigger` element).

import { ConfirmDialog } from "@orb/client/components";
import { Button } from "@orb/ui/button";
import { expect, test } from "@playwright/experimental-ct-react";
import { ConfirmDialogControlledHarness } from "./confirm-dialog.fixtures";

test("uncontrolled: renders the given trigger, opens on click, confirms and closes", async ({
  mount,
  page,
}) => {
  let confirmed = 0;
  await mount(
    <ConfirmDialog
      confirmLabel="Delete"
      description="This permanently deletes the thing."
      onConfirm={(): void => {
        confirmed += 1;
      }}
      title="Delete this thing?"
      trigger={<Button intent="ghost">Delete</Button>}
    />,
  );

  await expect(page.getByRole("alertdialog")).toBeHidden();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Delete this thing?");
  await expect(dialog).toContainText("This permanently deletes the thing.");

  await dialog.getByRole("button", { name: "Delete" }).click();
  expect(confirmed).toBe(1);
  await expect(page.getByRole("alertdialog")).toBeHidden();
});

test("uncontrolled: Cancel closes without firing onConfirm", async ({ mount, page }) => {
  let confirmed = 0;
  await mount(
    <ConfirmDialog
      description="This cannot be undone."
      onConfirm={(): void => {
        confirmed += 1;
      }}
      title="Delete this thing?"
      trigger={<Button intent="ghost">Delete</Button>}
    />,
  );

  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
  expect(confirmed).toBe(0);
});

test("controlled: caller owns open/onOpenChange, no default trigger renders", async ({
  mount,
  page,
}) => {
  await mount(<ConfirmDialogControlledHarness />);

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Rename this chat?");
  // No default trigger button when `trigger` is omitted.
  await expect(page.getByRole("button", { name: "Rename this chat?" })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(dialog).toBeHidden();
});

test("cancelLabel overrides the cancel button's text", async ({ mount, page }) => {
  await mount(
    <ConfirmDialog
      cancelLabel="Keep running"
      description="Stops the run."
      onConfirm={(): void => undefined}
      title="Cancel this workload?"
      trigger={<Button intent="ghost">Cancel</Button>}
    />,
  );

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("button", { name: "Keep running" })).toBeVisible();
});

test("description is optional — a title-only confirm renders no description paragraph", async ({
  mount,
  page,
}) => {
  await mount(
    <ConfirmDialog
      confirmLabel="Delete"
      onConfirm={(): void => undefined}
      title='Delete "Entry title"?'
      trigger={<Button intent="ghost">Delete</Button>}
    />,
  );

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Delete "Entry title"?');
  await expect(dialog.locator("p")).toHaveCount(0);
});
