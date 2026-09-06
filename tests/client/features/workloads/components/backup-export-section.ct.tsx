// CT: the real Backup & Restore pane (Settings → Backup & Restore — the per-user export/import portability
// surface). Drives the PRODUCTION paths: the EXPORT half builds the `/api/export/library` download href
// from the kind checkboxes (a full pick omits `kinds`; unchecking one narrows it + always appends
// `assets`); the IMPORT half POSTs a dropped `.zip` to `/api/import/bundle` (→ `{ workloadId }`), tails the
// import workload's ROOM on the tab's ONE socket (SSE-1 S5 — `workloads.subscribe` is gone) for progress +
// the terminal `succeeded`, and renders the count summary. The download + upload are RAW `/api` routes (not
// tRPC), so they're page.route-d directly. The import half is a TWO-STEP flow since #1099 F36 — a pick
// stages, a confirm sends — and this file drives both steps.

import type { WorkloadEvent } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { OrbSocketRecorder } from "../../../../support/ct/route-orb-socket.ts";
import { routeOrbSocket } from "../../../../support/ct/route-orb-socket.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
// The bus's OWN transport mutations (#649). `stream.attach`/`detach` ride the BATCHED HTTP link, not the
// SSE leg (`use-orb-socket.ts:7,139` — only `stream.connect` is the subscription), so `routeOrbSocket`
// never answers them and they rode `routeTrpc`'s lenient null in every mount here. Imported from the bus's
// own fixture module rather than re-spelled, so the two directions of this feed cannot drift apart.
import { STREAM_MUTATION_ROUTES } from "../../../data/bus/fixtures.ts";
import { BackupSettingsStory } from "../_ct-stories.tsx";

/** The host's viewer projection (`useSettingsViewerView`) — the group body resolves each section's `when` off it. */
const HOST_VIEWER_ROUTE: Readonly<Record<string, unknown>> = { "sessions.me": { userId: "user_ct_backup", handle: "ct_backup", globalRole: "user" } };

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
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE, ...STREAM_MUTATION_ROUTES });
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

// #1110 (owner ruling 2026-09-02): the "Include" fieldset is a BULK DEFAULT — every offered kind starts
// checked, so the accent skin painted eleven saturated squares to mark the state the user has not chosen
// yet. The group picks `tone="quiet"` ONCE for all of its rows. This is the surface the finding was filed
// against, so the pin lives here and not only on the primitive; the counter-pin (a deliberate-choice group
// still carries the ember) is in tests/client/features/chat/components/macro-picks-section.ct.tsx.
test("export: the all-on Include group spends no accent — every row renders the quiet checked skin (#1110)", async ({ mount, page }) => {
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE, ...STREAM_MUTATION_ROUTES });
  await mount(<BackupSettingsStory />);

  const characters = page.getByRole("checkbox", { name: "Characters" });
  await expect(characters).toBeChecked();
  const boxes = await page.getByRole("checkbox").all();
  // The whole group, not a sampled row: a per-row tone would be exactly the defect (one group-level
  // decision is the ruling's own words), and a single-row assertion could not tell the two apart.
  expect(boxes.length).toBeGreaterThan(1);
  for (const box of boxes) {
    await expect(box).toHaveAttribute("data-tone", "quiet");
  }
  // RENDERED, not the class list: the checked fill must not be `--color-primary`. The accent count in this
  // pane drops from one-per-kind to zero, which is the receipt the ruling asked for.
  await expect(characters).not.toHaveCSS("background-color", TOKENS["color.primary"].value);
  // …and the polarity survives: the ON state still carries its OWN ink, so unchecking a row VISIBLY
  // changes its fill. A quiet arm that merely dropped the accent without replacing it would pass every
  // assertion above and leave a checkbox whose two states paint identically.
  const checkedFill = await characters.evaluate((element) => getComputedStyle(element).backgroundColor);
  await characters.click();
  await expect(characters).not.toBeChecked();
  await expect(characters).not.toHaveCSS("background-color", checkedFill);
});

// IT ASKS BEFORE IT SENDS (#1099 F36, landed in bf7dd6d29). This test used to expect the DROP itself to
// POST, and #979 moved that: a pick lands in `staged` — pure client state, zero requests — the surface names
// the file and states the consequence, and `confirm()` is the only caller of either upload seam
// (`use-library-import.ts`'s own header: "SELECTION IS STAGED, NEVER FIRED"). That commit swept the sibling
// `import-library-section.ct.tsx` and missed this file, which drives the same dropzone through the zip arm —
// so the pin has described a flow the product does not have since 2026-09-02 (#1197).
// The re-pin is STRICTLY STRONGER, not adapted: it now also asserts the ruling's own content — that picking
// a file touches the network NOT AT ALL — which the old shape structurally could not see.
test("import: a dropped .zip is STAGED first; confirming POSTs the bundle, tails the workload, and shows the count summary", async ({ mount, page }) => {
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE, ...STREAM_MUTATION_ROUTES });
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
      result: { imported: 12, skipped: 1, failed: 0, notes: [] },
    },
  ]);

  await mount(<BackupSettingsStory />);

  await page.getByTestId("backup-import-dropzone").setInputFiles({
    name: "backup.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("PK"),
  });

  // NOTHING IS SENT BY PICKING. Barrier on the settled preflight — a named group carrying the file it is
  // about to send — and only then read the negative: no request has been made.
  await expect(page.getByRole("group", { name: "Import “backup.zip”?" })).toBeVisible();
  expect(bundlePost, "staging a file must not touch the network — confirm() is the only upload caller").toBeUndefined();

  await page.getByRole("button", { name: "Import", exact: true }).click();

  // The upload fired, and the terminal succeeded event drives the count summary.
  await expect.poll(() => bundlePost?.method, { intervals: [20, 50, 100] }).toBe("POST");
  await expect(page.getByTestId("import-report")).toBeVisible();
  await expect(page.getByText("12 imported · 1 skipped")).toBeVisible();
  // The tail cost ZERO extra connections: it is a room on the socket this pane already had (SSE-1 S5).
  expect(socket.attachedChannels()).toEqual(["workloads:workload_ct_import"]);
  expect(socket.connects()).toBe(1);
});
