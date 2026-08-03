// CT: the Databank LIST chrome band — the D-6 maintenance arm. The owner-wide sweeps are the band KEBAB's
// (never a primary: A2's one primary here is Add), and `re-extract` — the arm that re-runs extraction over
// every stored source file — waits for an explicit confirm before a single call leaves the client.

import { expect, test } from "@playwright/experimental-ct-react";
import { DatabankListHeaderStory } from "../_ct-stories";
import { stubDatabank } from "../fixtures";

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
