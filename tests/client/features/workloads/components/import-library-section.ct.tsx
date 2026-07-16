// CT: the import half's OUTCOME-HONEST chrome (features/workloads/components/import-library-section +
// its use-library-import driver). Regression guard for the "fabricated success" P1: a bare-card import
// that the server rejected (200 with a `failed[]`, per-card isolation) used to still paint the dropzone's
// green ✓ and fire a success toast, contradicting the honest per-file summary right below. Drives the REAL
// `POST /api/import` route (raw multipart, page.route-d) and asserts the chrome tracks the true tally:
// a total failure keeps the idle glyph (no `data-success`) + a NON-success (console.error) toast; a clean
// import wears the ✓ + a success toast. `notify` is unbound in CT, so it falls through to the console
// seam (success→console.info, error→console.error) — the channel is the toast-variant signal.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { BackupSettingsStory } from "../_ct-stories";

const DROPZONE_ROOT = '[data-slot="file-dropzone"]';
const A_CARD = { name: "villain.png", mimeType: "image/png", buffer: Buffer.from("PNG") };

test("a REJECTED card import shows NO success ✓ and a non-success toast (0 imported · 1 failed)", async ({ mount, page }) => {
  await routeTrpc(page, {});
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  // 200 with an empty `imported` + a populated `failed[]` — the per-card-isolation shape the server
  // returns for a garbage card (NOT a non-200): imported 0, failed 1.
  await page.route("**/api/import", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imported: [],
        failed: [{ filename: "villain.png", error: "Not a valid character card" }],
      }),
    });
  });

  await mount(<BackupSettingsStory />);
  await page.getByTestId("backup-import-dropzone").setInputFiles(A_CARD);

  // The honest count summary renders the failure…
  await expect(page.getByTestId("import-report")).toBeVisible();
  await expect(page.getByText("0 imported · 1 failed")).toBeVisible();
  // …and the chrome does NOT lie: the dropzone keeps the idle glyph (no success state)…
  await expect(page.locator(DROPZONE_ROOT)).not.toHaveAttribute("data-success", "");
  await expect(page.getByRole("img", { name: "Uploaded" })).toHaveCount(0);
  // …and the toast is the error channel (never a green "Import complete").
  await expect.poll(() => errors.some((line) => line.includes("Import failed")), { intervals: [20, 50, 100] }).toBe(true);
  expect(errors.some((line) => line.includes("Import complete"))).toBe(false);
});

test("a CLEAN card import shows the success ✓ and a success toast", async ({ mount, page }) => {
  await routeTrpc(page, {});
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  await page.route("**/api/import", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imported: [{ filename: "hero.png", created: true }],
        failed: [],
      }),
    });
  });

  await mount(<BackupSettingsStory />);
  await page.getByTestId("backup-import-dropzone").setInputFiles(A_CARD);

  await expect(page.getByTestId("import-report")).toBeVisible();
  await expect(page.getByText("1 imported")).toBeVisible();
  // A clean result earns the green ✓ and no error-channel toast.
  await expect(page.locator(DROPZONE_ROOT)).toHaveAttribute("data-success", "");
  await expect(page.getByRole("img", { name: "Uploaded" })).toBeVisible();
  expect(errors.some((line) => line.includes("Import failed"))).toBe(false);
});
