// CT: the real Backup & Restore pane (Settings → Backup & Restore — the per-user export/import portability
// surface). Drives the PRODUCTION paths: the EXPORT half builds the `/api/export/library` download href
// from the kind checkboxes (a full pick omits `kinds`; unchecking one narrows it + always appends
// `assets`); the IMPORT half POSTs a dropped `.zip` to `/api/import/bundle` (→ `{ workloadId }`), tails the
// `workloads.subscribe` SSE for progress + the terminal `succeeded`, and renders the count summary. The
// download + upload are RAW `/api` routes (not tRPC), so they're page.route-d directly.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { BackupSettingsStory } from "../_ct-stories";

/** SSE frames in the tRPC tracked wire shape (the workloads-settings-surface.ct.tsx pattern, local here). */
function sseBody(events: readonly Record<string, unknown>[]): string {
  const frames = ["event: connected\ndata: {}\n\n"];
  for (const [i, event] of events.entries()) {
    frames.push(`data: ${JSON.stringify(event)}\nid: ${String(i + 1)}\n\n`);
  }
  return frames.join("");
}

/** Serve `workloads.subscribe` a scripted stream; everything else falls through. Register AFTER routeTrpc. */
async function routeWorkloadStream(
  page: Page,
  events: readonly Record<string, unknown>[],
): Promise<void> {
  let served = false;
  await page.route("**/api/trpc/**", async (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    if (!accept.includes("text/event-stream")) {
      await route.fallback();
      return;
    }
    const body = served ? sseBody([]) : sseBody(events);
    served = true;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body,
    });
  });
}

test("export: a full selection downloads the whole library (no kinds param); unchecking one narrows it + keeps assets", async ({
  mount,
  page,
}) => {
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
  await expect.poll(() => exportUrl).toBeTruthy();
  expect(new URL(exportUrl ?? "").search).toBe("");

  // Uncheck Chats → the href now lists the remaining kinds + always appends assets (blobs travel).
  exportUrl = undefined;
  await page.getByRole("checkbox", { name: "Chats" }).click();
  await page.getByTestId("backup-export-button").click();
  await expect.poll(() => exportUrl).toBeTruthy();
  const kinds = new URL(exportUrl ?? "").searchParams.get("kinds") ?? "";
  expect(kinds).not.toContain("chat");
  expect(kinds.split(",")).toContain("character");
  expect(kinds.split(",")).toContain("assets");
});

test("import: dropping a .zip POSTs the bundle, tails the workload, and shows the count summary", async ({
  mount,
  page,
}) => {
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
  await routeWorkloadStream(page, [
    {
      type: "succeeded",
      workloadId: "workload_ct_import",
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
  await expect.poll(() => bundlePost?.method).toBe("POST");
  await expect(page.getByTestId("import-report")).toBeVisible();
  await expect(page.getByText("12 imported · 1 skipped")).toBeVisible();
});
