// CT: the import half's OUTCOME-HONEST chrome (features/workloads/components/import-library-section +
// its use-library-import driver). Regression guard for the "fabricated success" P1: a bare-card import
// that the server rejected (200 with a `failed[]`, per-card isolation) used to still paint the dropzone's
// green ✓ and fire a success toast, contradicting the honest per-file summary right below. Drives the REAL
// `POST /api/import` route (raw multipart, page.route-d) and asserts the chrome tracks the true tally:
// a total failure keeps the idle glyph (no `data-success`) + a NON-success (console.error) toast; a clean
// import wears the ✓ + a success toast. `notify` is unbound in CT, so it falls through to the console
// seam (success→console.info, error→console.error) — the channel is the toast-variant signal.
//
// Both FEEDERS are driven: `setInputFiles` (the picker) and a real drag-and-drop (`dropFiles`). The drop
// arm is the P1 guard — a dropped card used to be swallowed inside the dropzone with ZERO requests made.

import { expect, test } from "@playwright/experimental-ct-react";
import { dropFiles } from "../../../../support/ct/drop-files.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { BackupSettingsStory, LibraryImportEpochStory } from "../_ct-stories.tsx";

const DROPZONE_ROOT = '[data-slot="file-dropzone"]';
const A_CARD = { name: "villain.png", mimeType: "image/png", buffer: Buffer.from("PNG") };
const A_DROPPED_CARD = { name: "villain.png", mimeType: "image/png", content: "PNG" };

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

test("DRAGGING a card onto the dropzone fires the same POST /api/import the picker does", async ({ mount, page }) => {
  await routeTrpc(page, {});
  // The P1 this guards: the drop was swallowed by the dropzone and NO request was ever made (the owner
  // saw a clean server log). Count the real uploads — a passing render proves nothing here.
  const uploads: string[] = [];
  await page.route("**/api/import", async (route) => {
    uploads.push(route.request().method());
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imported: [{ filename: "villain.png", created: true }], failed: [] }),
    });
  });

  await mount(<BackupSettingsStory />);
  await dropFiles(page.locator(DROPZONE_ROOT), [A_DROPPED_CARD]);

  await expect.poll(() => uploads, { intervals: [20, 50, 100] }).toEqual(["POST"]);
  await expect(page.getByTestId("import-report")).toBeVisible();
  await expect(page.getByText("1 imported")).toBeVisible();
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

test("an older import completion cannot replace the newer batch outcome", async ({ mount, page }) => {
  await routeTrpc(page, {});
  const held: import("@playwright/test").Route[] = [];
  await page.route("**/api/import", (route) => {
    held.push(route);
  });

  const story = await mount(<LibraryImportEpochStory />);
  await story.getByRole("button", { name: "Import old batch" }).click();
  await expect.poll(() => held.length).toBe(1);
  await story.getByRole("button", { name: "Import new batch" }).click();
  await expect.poll(() => held.length).toBe(2);

  await held[1]?.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imported: [{ filename: "new.png", created: true }], failed: [] }),
  });
  await expect(story.getByTestId("import-outcome")).toHaveText("new.png");

  await held[0]?.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imported: [{ filename: "old.png", created: true }], failed: [] }),
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

  await expect(story.getByTestId("import-outcome")).toHaveText("new.png");
});

test("reset revokes an in-flight import instead of letting its completion resurrect the report", async ({ mount, page }) => {
  await routeTrpc(page, {});
  let held: import("@playwright/test").Route | undefined;
  await page.route("**/api/import", (route) => {
    held = route;
  });

  const story = await mount(<LibraryImportEpochStory />);
  await story.getByRole("button", { name: "Import old batch" }).click();
  await expect.poll(() => held !== undefined).toBe(true);
  await story.getByRole("button", { name: "Reset import" }).click();
  await expect(story.getByTestId("import-outcome")).toHaveText("idle");

  if (held === undefined) {
    throw new Error("the import request never reached the held route");
  }
  await held.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imported: [{ filename: "old.png", created: true }], failed: [] }),
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

  await expect(story.getByTestId("import-outcome")).toHaveText("idle");
});

test("a stale workload terminal callback cannot replace a later card-import result", async ({ mount, page }) => {
  await routeTrpc(page, {});
  await page.route("**/api/import/bundle", (route) =>
    route.fulfill({
      status: 202,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workloadId: "workload_old" }),
    }),
  );
  let cardRoute: import("@playwright/test").Route | undefined;
  await page.route("**/api/import", (route) => {
    cardRoute = route;
  });

  const story = await mount(<LibraryImportEpochStory />);
  await story.getByRole("button", { name: "Start old workload" }).click();
  await expect(story.getByTestId("import-outcome")).toHaveText("running");
  await story.getByRole("button", { name: "Capture current workload" }).click();
  await expect(story.getByRole("button", { name: "Complete captured workload" })).toBeEnabled();

  await story.getByRole("button", { name: "Import new batch" }).click();
  await expect.poll(() => cardRoute !== undefined).toBe(true);
  if (cardRoute === undefined) {
    throw new Error("the card import never reached the held route");
  }
  await cardRoute.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imported: [{ filename: "new.png", created: true }], failed: [] }),
  });
  await expect(story.getByTestId("import-outcome")).toHaveText("new.png");

  await story.getByRole("button", { name: "Complete captured workload" }).click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

  await expect(story.getByTestId("import-outcome")).toHaveText("new.png");
});
