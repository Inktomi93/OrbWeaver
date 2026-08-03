// CT: the real Backup & Restore pane (Settings → Backup & Restore — the per-user export/import portability
// surface). Drives the PRODUCTION paths: the EXPORT half builds the `/api/export/library` download href
// from the kind checkboxes (a full pick omits `kinds`; unchecking one narrows it + always appends
// `assets`); the IMPORT half POSTs a dropped `.zip` to `/api/import/bundle` (→ `{ workloadId }`), tails the
// import workload's ROOM on the tab's ONE socket (SSE-1 S5 — `workloads.subscribe` is gone) for progress +
// the terminal `succeeded`, and renders the count summary. The download + upload are RAW `/api` routes (not
// tRPC), so they're page.route-d directly.

import type { WorkloadEvent } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { OrbSocketRecorder } from "../../../../support/ct/route-orb-socket.ts";
import { routeOrbSocket } from "../../../../support/ct/route-orb-socket.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { BackupSettingsStory } from "../_ct-stories.tsx";

/** The tab's ONE socket, scripted with the import run's frames. The tracker mounts only AFTER the upload
 *  returns a workloadId, so the stub holds the stream open until that room attaches (a frame for an unjoined
 *  room is dropped by the registry, exactly as the real server never sends one). */
function routeImportWorkloadSocket(page: Page, events: readonly WorkloadEvent[]): Promise<OrbSocketRecorder> {
  return routeOrbSocket(page, {
    frames: events.map((event) => ({ channel: "workloads", workloadId: event.workloadId, event })),
    awaitAttaches: 1,
  });
}

test("export: a full selection downloads the whole library (no kinds param); unchecking one narrows it + keeps assets", async ({ mount, page }) => {
  await routeTrpc(page, {});
  let exportUrl: string | undefined;
  await page.route("**/api/export/library**", async (route) => {
    exportUrl = route.request().url();
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="orbweaver-library.zip"',
      },
      body: "PK",
    });
  });

  await mount(<BackupSettingsStory />);

  // Every offered kind starts checked → the download omits `kinds` entirely (everything, media included).
  await expect(page.getByRole("checkbox", { name: "Characters" })).toBeChecked();
  await page.getByTestId("backup-export-button").click();
  await expect.poll(() => exportUrl, { intervals: [20, 50, 100] }).toBeTruthy();
  expect(new URL(exportUrl ?? "").search).toBe("");

  // Uncheck Chats → the href now lists the remaining kinds + always appends assets (blobs travel).
  exportUrl = undefined;
  await page.getByRole("checkbox", { name: "Chats" }).click();
  await page.getByTestId("backup-export-button").click();
  await expect.poll(() => exportUrl, { intervals: [20, 50, 100] }).toBeTruthy();
  const kinds = new URL(exportUrl ?? "").searchParams.get("kinds") ?? "";
  expect(kinds).not.toContain("chat");
  expect(kinds.split(",")).toContain("character");
  expect(kinds.split(",")).toContain("assets");
});

test("import: dropping a .zip POSTs the bundle, tails the workload, and shows the count summary", async ({ mount, page }) => {
  await routeTrpc(page, {});
  let bundlePost: { method: string } | undefined;
  await page.route("**/api/import/bundle", async (route) => {
    bundlePost = { method: route.request().method() };
    await route.fulfill({
      status: 202,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workloadId: "workload_ct_import" }),
    });
  });
  const socket = await routeImportWorkloadSocket(page, [
    {
      type: "succeeded",
      workloadId: castId<WorkloadId>("workload_ct_import"),
      kind: "import-bundle",
      at: 1_750_000_002_000,
      result: { imported: 12, skipped: 1, failed: 0 },
    },
  ]);

  await mount(<BackupSettingsStory />);

  await page.getByTestId("backup-import-dropzone").setInputFiles({
    name: "backup.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("PK"),
  });

  // The upload fired, and the terminal succeeded event drives the count summary.
  await expect.poll(() => bundlePost?.method, { intervals: [20, 50, 100] }).toBe("POST");
  await expect(page.getByTestId("import-report")).toBeVisible();
  await expect(page.getByText("12 imported · 1 skipped")).toBeVisible();
  // The tail cost ZERO extra connections: it is a room on the socket this pane already had (SSE-1 S5).
  expect(socket.attachedChannels()).toEqual(["workloads:workload_ct_import"]);
  expect(socket.connects()).toBe(1);
});
