// CT: `<ConfirmDialog>` — the client-shared composite (rollup-audit C1). Proves both entry shapes
// (uncontrolled trigger vs controlled open/onOpenChange), that Cancel/Confirm both close the dialog,
// onConfirm fires exactly on the confirm click, and the M5 extensions (cancelLabel, optional
// description, an arbitrary `trigger` element).

import { ConfirmDialog } from "@orb/client/components";
import { Button } from "@orb/ui/button";
import { expect, test } from "@playwright/experimental-ct-react";
import { ConfirmDialogControlledHarness, ConfirmDialogNonThenableHarness, ConfirmDialogRejectingHarness } from "./confirm-dialog.fixtures.tsx";

test("uncontrolled: renders the given trigger, opens on click, confirms and closes", async ({ mount, page }) => {
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

test("controlled: caller owns open/onOpenChange, no default trigger renders", async ({ mount, page }) => {
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

test("description is optional — a title-only confirm renders no description paragraph", async ({ mount, page }) => {
  await mount(
    <ConfirmDialog confirmLabel="Delete" onConfirm={(): void => undefined} title='Delete "Entry title"?' trigger={<Button intent="ghost">Delete</Button>} />,
  );

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Delete "Entry title"?');
  await expect(dialog.locator("p")).toHaveCount(0);
});

// ── THE CONFIRM IS THE RETRY SURFACE FOR ITS OWN VERB (#1563) ────────────────────────────────────────
// It closed via `AlertDialogClose` REGARDLESS of outcome, so the close was not the caller's to gate and a
// destructive confirm could never report — let alone retry — the mutation it fired. Where the caller had a
// second surface the failure landed there; where it had none (most of the sixteen call sites), a rejected
// destructive write left a vanished dialog and nothing to press. Returning the verb's settle is the
// contract; returning nothing keeps the old close-on-click behaviour, which every state-only confirm uses
// and which the tests above still pin.

test("a REJECTED confirm stays open, says why, and its own button is the retry (#1563)", async ({ mount, page }) => {
  const component = await mount(<ConfirmDialogRejectingHarness />);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Delete" }).click();

  // STILL OPEN — the assertion that was unreachable by construction — carrying the server's own reason.
  // The FAILURE LINE is the barrier, and the open-ness is asserted after it: `toBeVisible` on a dialog that
  // is mid-close still passes on its first poll, so on its own it proves nothing about the settled state.
  await expect(dialog.locator('[data-slot="confirm-dialog-failure"]')).toContainText("the row is locked by another seat");
  await expect(dialog).toBeVisible();
  await expect(component.getByTestId("confirm-removed")).toHaveText("intact");

  // …and the SAME button is the retry: a second press runs the verb again, and the settled success is what
  // closes the dialog.
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(component.getByTestId("confirm-removed")).toHaveText("removed");
  await expect(page.getByRole("alertdialog")).toBeHidden();
});

test("Cancel still abandons a failed confirm, and reopening starts clean (#1563)", async ({ mount, page }) => {
  const component = await mount(<ConfirmDialogRejectingHarness />);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog").locator('[data-slot="confirm-dialog-failure"]')).toBeVisible();

  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(component.getByTestId("confirm-removed")).toHaveText("intact");

  // The next opening is a NEW decision, not a resumed one — a stale failure line over an untouched
  // confirm would be its own lie.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByRole("alertdialog").locator('[data-slot="confirm-dialog-failure"]')).toHaveCount(0);
});

// A `(): void` HANDLER MAY STILL RETURN A VALUE (#1632 item 6). `void` erases the return TYPE, never the
// runtime value, so TypeScript assigns `() => number` to `() => void` without a murmur — and the composite's
// old `settle === undefined` gate then handed that value to `settle.then(…)`. The throw lands INSIDE the
// click handler, so the reader gets the worst arm of all: a confirm that neither closes nor says anything,
// with its own retry button doing the same nothing. The guard asks the only honest question at a seam that
// takes `void` from callers it cannot see the bodies of — "can I await this" — so a non-thenable takes the
// done-on-click arm, exactly like `undefined`.
//
// RED-FIRST RECEIPT: run against the unmodified `confirm-dialog.tsx`, this test fails at the final
// `toBeHidden` (the dialog is still up, the state DID flip since the handler ran before the throw).
test("a state-only confirm whose handler returns a NON-THENABLE still closes (#1632)", async ({ mount, page }) => {
  const component = await mount(<ConfirmDialogNonThenableHarness />);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Apply" }).click();

  // The act ran on click, which is what a state-only confirm means…
  await expect(component.getByTestId("confirm-nonthenable-state")).toHaveText("applied");
  // …and nothing was left in flight, so the dialog is DONE — no failure line, no held-open confirm.
  await expect(page.getByRole("alertdialog")).toBeHidden();
});
