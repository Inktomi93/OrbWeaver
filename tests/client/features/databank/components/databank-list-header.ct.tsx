// CT: the Databank LIST chrome band — the D-6 maintenance arm. The owner-wide sweeps are the band KEBAB's
// (never a primary: A2's one primary here is Add), and `re-extract` — the arm that re-runs extraction over
// every stored source file — waits for an explicit confirm before a single call leaves the client.

import { DATABANK_LIST_DEFAULT_LIMIT } from "@orb/contracts/databank";
import { expect, test } from "@playwright/experimental-ct-react";
import { DatabankListHeaderStory } from "../_ct-stories.tsx";
import { READY_DOC, stubDatabank } from "../fixtures.ts";

test("the maintenance kebab fires the owner-wide sweep, and re-extract waits for a confirm (D-6)", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const band = await mount(<DatabankListHeaderStory />);

  await band.getByRole("button", { name: "Databank maintenance" }).click();
  await page.getByRole("menuitem", { name: "Reindex everything" }).click();
  await expect.poll(() => trpc.lastInput("databank.reindex"), { intervals: [20, 50, 100] }).toEqual({ scope: { kind: "owner" }, mode: "chunk-embed" });

  await band.getByRole("button", { name: "Databank maintenance" }).click();
  await page.getByRole("menuitem", { name: "Re-extract everything" }).click();
  // The expensive arm is dialog-gated — at the settled open-confirm state, still ONE call: the one above.
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect.poll(() => trpc.count("databank.reindex"), { intervals: [20, 50, 100] }).toBe(1);

  await page.getByRole("alertdialog").getByRole("button", { name: "Re-extract" }).click();
  await expect.poll(() => trpc.lastInput("databank.reindex"), { intervals: [20, 50, 100] }).toEqual({ scope: { kind: "owner" }, mode: "re-extract" });
});

// THE BAND PRINTS THE CENSUS (2026-08-14). It used to print the length of `databank.list`'s first page,
// which is why a bank past that page read "100+" — the honest thing to say about a number that was really a
// page length (side-eye P2-d). `databank.bankHealth` counts the bank, so the band states it: no cap, no `+`,
// and no hundred-document read taken to measure a list.
test("the band prints the SERVER's census — a bank deeper than one page states its real size", async ({ mount, page }) => {
  const deeperThanAPage = Array.from({ length: DATABANK_LIST_DEFAULT_LIMIT + 46 }, (_, i) => ({
    ...READY_DOC,
    id: `document_${String(i + 1).padStart(20, "0")}`,
    updatedAt: READY_DOC.updatedAt - i * 1000,
  }));
  const trpc = await stubDatabank(page, {}, deeperThanAPage);
  const band = await mount(<DatabankListHeaderStory />);

  await expect(band.getByText(`${DATABANK_LIST_DEFAULT_LIMIT + 46}`, { exact: true })).toBeVisible();
  await expect(band.getByText(`${DATABANK_LIST_DEFAULT_LIMIT}+`, { exact: true })).toHaveCount(0);
  // A COUNT read for a count: the band fetches no document rows at all.
  await expect.poll(() => trpc.count("databank.bankHealth"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.count("databank.list"), { intervals: [20, 50, 100] }).toBe(0);
});

// EVERY ARM OWES A WAY OUT (side-eye sweep 2026-08-03). Each ingest arm draws its own footer because each
// has its own submit verb, and the UPLOAD arm — where picking the file IS the submit — shipped with no
// footer at all: the dialog held ZERO buttons besides its three mode toggles, so its only exit was Esc or
// the backdrop, while both sibling arms offered a labelled one. A dismiss is not part of a submit.
test("every arm of the Add dialog offers a labelled way out — including the one with no submit", async ({ mount, page }) => {
  await stubDatabank(page);
  const band = await mount(<DatabankListHeaderStory />);

  await band.getByRole("button", { name: "Add" }).click();
  const dialog = page.getByRole("dialog");
  // The dialog opens ON the upload arm.
  await expect(dialog.getByRole("button", { name: "Upload a file" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();

  await dialog.getByRole("button", { name: "Paste text" }).click();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();

  await dialog.getByRole("button", { name: "From a link" }).click();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();

  // …and it works: the upload arm's Cancel closes the dialog, not just decorates it.
  await dialog.getByRole("button", { name: "Upload a file" }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
