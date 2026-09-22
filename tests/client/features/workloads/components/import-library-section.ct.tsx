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
//
// EVERY FEEDER NOW STAGES (#1099 F36): a pick lands in the PREFLIGHT and the request is the confirm's. The
// two ends of that seam are pinned below (zero requests before the answer; the same requests after it), and
// the flows above press `Import` where they used to rely on the drop being the send.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { driveFileDrop, driveFileUpload } from "@orb/tooling/_shared/upload";
import { expect, test } from "@playwright/experimental-ct-react";
import { dropFiles } from "../../../../support/browser/drop-files.ts";
import type { TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { BackupSettingsStory, LibraryImportEpochStory } from "../_ct-stories.tsx";

/** The host's viewer projection (`useSettingsViewerView`) — the group body resolves each section's `when` off it. */
const HOST_VIEWER_ROUTE: TrpcRoutes<"sessions.me"> = { "sessions.me": { userId: "user_ct_import", handle: "ct_import", globalRole: "user" } };

const DROPZONE_ROOT = '[data-slot="file-dropzone"]';
const A_CARD = { name: "villain.png", mimeType: "image/png", buffer: Buffer.from("PNG") };
const A_DROPPED_CARD = { name: "villain.png", mimeType: "image/png", content: "PNG" };
const FILE_ACTION_ROOT = mkdtempSync(join(tmpdir(), "orb-file-actions-"));

test.afterAll(() => {
  rmSync(FILE_ACTION_ROOT, { recursive: true, force: true });
});

test("a REJECTED card import shows NO success ✓ and a non-success toast (0 imported · 1 failed)", async ({ mount, page }) => {
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE });
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
  await page.getByRole("button", { name: "Import", exact: true }).click();

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
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE });
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
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await expect.poll(() => uploads, { intervals: [20, 50, 100] }).toEqual(["POST"]);
  await expect(page.getByTestId("import-report")).toBeVisible();
  await expect(page.getByText("1 imported")).toBeVisible();
});

test("a CLEAN card import shows the success ✓ and a success toast", async ({ mount, page }) => {
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE });
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
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await expect(page.getByTestId("import-report")).toBeVisible();
  await expect(page.getByText("1 imported")).toBeVisible();
  // A clean result earns the green ✓ and no error-channel toast.
  await expect(page.locator(DROPZONE_ROOT)).toHaveAttribute("data-success", "");
  await expect(page.getByRole("img", { name: "Uploaded" })).toBeVisible();
  expect(errors.some((line) => line.includes("Import failed"))).toBe(false);
});

// #1598/#1709 — a card's own `notes` (the server's `skippedOverlays`; today's one member is an embedded
// lorebook a re-upload KEPT rather than replaced) render beside ITS row, never a batch-wide flatten — the
// foreground path has real per-file detail already, unlike the bundle arm's flattened list.
test("a card import's per-card notes render beside its own row", async ({ mount, page }) => {
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE });
  await page.route("**/api/import", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imported: [{ filename: "hero.png", created: false, notes: ["book kept: primary already exists"] }],
        failed: [],
      }),
    });
  });

  await mount(<BackupSettingsStory />);
  await page.getByTestId("backup-import-dropzone").setInputFiles(A_CARD);
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await expect(page.getByTestId("import-report")).toBeVisible();
  await expect(page.getByText("hero.png")).toBeVisible();
  await expect(page.getByText("book kept: primary already exists")).toBeVisible();
});

test("an older import completion cannot replace the newer batch outcome", async ({ mount, page }) => {
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE });
  const held: import("@playwright/test").Route[] = [];
  await page.route("**/api/import", (route) => {
    held.push(route);
  });

  const story = await mount(<LibraryImportEpochStory />);
  await story.getByRole("button", { name: "Import old batch" }).click();
  await story.getByRole("button", { name: "Confirm import" }).click();
  await expect.poll(() => held.length).toBe(1);
  await story.getByRole("button", { name: "Import new batch" }).click();
  await story.getByRole("button", { name: "Confirm import" }).click();
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
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE });
  let held: import("@playwright/test").Route | undefined;
  await page.route("**/api/import", (route) => {
    held = route;
  });

  const story = await mount(<LibraryImportEpochStory />);
  await story.getByRole("button", { name: "Import old batch" }).click();
  await story.getByRole("button", { name: "Confirm import" }).click();
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
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE });
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
  await story.getByRole("button", { name: "Confirm import" }).click();
  await expect(story.getByTestId("import-outcome")).toHaveText("running");
  await story.getByRole("button", { name: "Capture current workload" }).click();
  await expect(story.getByRole("button", { name: "Complete captured workload" })).toBeEnabled();

  await story.getByRole("button", { name: "Import new batch" }).click();
  await story.getByRole("button", { name: "Confirm import" }).click();
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

// ── THE PREFLIGHT (#1099 F36) ─────────────────────────────────────────────────────────────────────────
// The finding: "Import offers no warning about what it does to existing data… no confirm and no
// merge/overwrite statement." Both halves are pinned by REQUEST COUNT, which is the only honest measure of
// "nothing has happened yet" — a rendered panel proves nothing about the network.

test("a picked file makes ZERO requests: the preflight states the consequence and waits", async ({ mount, page }) => {
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE });
  const uploads: string[] = [];
  await page.route("**/api/import", (route) => {
    uploads.push(route.request().url());
    return route.abort();
  });
  await page.route("**/api/import/bundle", (route) => {
    uploads.push(route.request().url());
    return route.abort();
  });

  await mount(<BackupSettingsStory />);
  await page.getByTestId("backup-import-dropzone").setInputFiles(A_CARD);

  const preflight = page.locator('[data-slot="import-preflight"]');
  await expect(preflight).toBeVisible();
  // It names the FILE it is about to send, and says what an import does to what you already own.
  await expect(preflight).toContainText("villain.png");
  await expect(preflight).toContainText("nothing you already have is deleted");
  await expect(preflight).toContainText("updated in place");
  // …and nothing has been sent.
  expect(uploads).toEqual([]);
});

test("CANCEL sends nothing and returns to the resting dropzone", async ({ mount, page }) => {
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE });
  const uploads: string[] = [];
  await page.route("**/api/import", (route) => {
    uploads.push(route.request().url());
    return route.abort();
  });

  await mount(<BackupSettingsStory />);
  await page.getByTestId("backup-import-dropzone").setInputFiles(A_CARD);
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.locator('[data-slot="import-preflight"]')).toHaveCount(0);
  await expect(page.locator(DROPZONE_ROOT)).toBeVisible();
  expect(uploads).toEqual([]);
});

test("a DROPPED file stages too — the drop is a pick, never a send", async ({ mount, page }) => {
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE });
  const uploads: string[] = [];
  await page.route("**/api/import", (route) => {
    uploads.push(route.request().url());
    return route.abort();
  });

  await mount(<BackupSettingsStory />);
  await dropFiles(page.locator(DROPZONE_ROOT), [A_DROPPED_CARD]);

  await expect(page.locator('[data-slot="import-preflight"]')).toBeVisible();
  expect(uploads).toEqual([]);
});

test("the shared browser file actions drive the production dropzone and sibling FolderPicker with honest identity/tree receipts", async ({ mount, page }) => {
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE });
  const card = join(FILE_ACTION_ROOT, "agent-card.png");
  const tree = join(FILE_ACTION_ROOT, "library-tree");
  mkdirSync(join(tree, "characters"), { recursive: true });
  writeFileSync(card, "PNG");
  writeFileSync(join(tree, "settings.json"), "{}");
  writeFileSync(join(tree, "characters", "hero.png"), "PNG");

  await mount(<BackupSettingsStory />);
  const dropped = await driveFileDrop(page.locator(DROPZONE_ROOT), DROPZONE_ROOT, [card], 10_000);
  await expect(page.locator('[data-slot="import-preflight"]')).toContainText("agent-card.png");
  expect(dropped).toMatchObject({ kind: "drop-files", feeder: "datatransfer", files: 1, directory: false });
  expect(dropped.identities.map((file) => file.relativePath)).toEqual(["agent-card.png"]);
  await page.getByRole("button", { name: "Cancel" }).click();

  const folder = await driveFileUpload(page.getByRole("button", { name: "Import a folder…" }), "role=button[name='Import a folder…']", [tree], 10_000);
  await expect(page.locator('[data-slot="import-preflight"]')).toContainText("Import 2 files from the folder you picked?");
  expect(folder).toMatchObject({ kind: "upload", feeder: "filechooser", files: 2, directory: true });
  expect(folder.identities.map((file) => file.relativePath)).toEqual(["library-tree/characters/hero.png", "library-tree/settings.json"]);
});
