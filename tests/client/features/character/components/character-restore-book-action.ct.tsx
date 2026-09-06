// CT: CharacterRestoreBookAction (#1709) — the #1598 explicit restore door. Drives the REAL file-picker
// input + ConfirmDialog + `restoreCardLorebook` POST against a routed fake server, asserting: the confirm
// names the picked file and the consequence, a real success POSTs + toasts + closes, and the server's own
// refusal (never thrown as a network error — read as data by `restoreCardLorebook`) renders IN the confirm
// dialog as its own failure/retry surface (#1563's contract), never a silent close.
//
// TWO SCOPES, DELIBERATELY: the file input is queried through `component` (it lives inside the mounted
// tree), the dialog through `page` (Base UI's AlertDialog PORTALS to `document.body`, outside `component`'s
// root — `confirm-dialog.ct.tsx`'s own precedent). `setInputFiles` targets `FileTrigger`'s
// `[data-slot="file-trigger-input"]` DIRECTLY, never the trigger BUTTON — clicking a real
// `<input type="file">` opens the OS file chooser and hangs a headless CT (`character-editor-surface.ct.tsx`
// `pickAPortrait`'s precedent for this exact primitive).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { CharacterRestoreBookActionStory } from "../_ct-stories.tsx";

const RESTORE_ROUTE = "**/api/import/restore-card-lorebook";
const FILE_INPUT = '[data-slot="file-trigger-input"]';

async function pickACard(component: Locator, filename: string, mimeType: string): Promise<void> {
  await component.locator(FILE_INPUT).setInputFiles({ name: filename, mimeType, buffer: Buffer.from("bytes") });
}

function confirmDialog(page: Page): Locator {
  return page.getByRole("alertdialog");
}

test("picking a card file opens a confirm naming the file and the consequence — nothing sent yet", async ({ mount, page }) => {
  let posted = false;
  await page.route(RESTORE_ROUTE, async (route) => {
    posted = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  const component = await mount(<CharacterRestoreBookActionStory />);

  await pickACard(component, "Aria.png", "image/png");

  const dialog = confirmDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Restore the embedded book from this card file?");
  await expect(dialog).toContainText('"Aria.png"');
  expect(posted, "picking a file must not touch the network — Restore is the only POST trigger").toBe(false);
});

test("confirming POSTs the exact picked file and closes on a real success", async ({ mount, page }) => {
  let uploadedName: string | undefined;
  await page.route(RESTORE_ROUTE, async (route) => {
    const body = await route.request().postData();
    uploadedName = body?.includes("Aria.png") ? "Aria.png" : undefined;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, characterId: "chr_1", worldBookId: "wb_1", entryCount: 2, replaced: true }),
    });
  });
  const component = await mount(<CharacterRestoreBookActionStory />);

  await pickACard(component, "Aria.png", "image/png");
  const dialog = confirmDialog(page);
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();

  await expect(dialog).toBeHidden();
  expect(uploadedName).toBe("Aria.png");
  await expect(page.getByText("The card's world book replaced your edited one.")).toBeVisible();
});

test("the server's OWN refusal renders in the confirm dialog as data — never a silent close", async ({ mount, page }) => {
  await page.route(RESTORE_ROUTE, async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "No character of yours was imported from this exact card file." }),
    });
  });
  const component = await mount(<CharacterRestoreBookActionStory />);

  await pickACard(component, "unmatched.json", "application/json");
  const dialog = confirmDialog(page);
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();

  // The dialog STAYS OPEN with the server's own reason — the retry surface #1563's contract promises.
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("No character of yours was imported from this exact card file.");
});
