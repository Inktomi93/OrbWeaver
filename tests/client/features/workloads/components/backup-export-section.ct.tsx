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
// design-audit's OWN `row-void` rule — the one that filed 8 × P2 against this pane — run on the measured
// geometry instead of a re-spelled threshold pair (see the F13 block at the foot of this file).
import type { Finding } from "../../../../../tooling/src/ui-audit/contract/findings.ts";
import { checkRowVoid } from "../../../../../tooling/src/ui-audit/lib/checks-structure.ts";
import type { OrbSocketRecorder } from "../../../../support/node/route-orb-socket.ts";
import { routeOrbSocket } from "../../../../support/node/route-orb-socket.ts";
import type { TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
// The bus's OWN transport mutations (#649). `stream.attach`/`detach` ride the BATCHED HTTP link, not the
// SSE leg (`use-orb-socket.ts:7,139` — only `stream.connect` is the subscription), so `routeOrbSocket`
// never answers them and they rode `routeTrpc`'s lenient null in every mount here. Imported from the bus's
// own fixture module rather than re-spelled, so the two directions of this feed cannot drift apart.
import { STREAM_MUTATION_ROUTES } from "../../../data/bus/fixtures.ts";
import { BackupSettingsStory } from "../_ct-stories.tsx";

/** The host's viewer projection (`useSettingsViewerView`) — the group body resolves each section's `when` off it. */
const HOST_VIEWER_ROUTE: TrpcRoutes<"sessions.me"> = { "sessions.me": { userId: "user_ct_backup", handle: "ct_backup", globalRole: "user" } };

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
    buffer: Buffer.from("PK��"),
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

// #1598/#1709/#1710 — the flattened per-file `notes` a finished `import-bundle` workload carries (a plane a
// file's import deliberately did not assert, e.g. an embedded lorebook KEPT because the character already
// held a primary book). The count summary above ("12 imported · 1 skipped") is silent on WHICH plane was
// kept; the notes are the only place that says so.
test("import: a bundle workload's flattened notes render beside the count summary", async ({ mount, page }) => {
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE, ...STREAM_MUTATION_ROUTES });
  await page.route("**/api/import/bundle", async (route) => {
    await route.fulfill({
      status: 202,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workloadId: "workload_ct_import_notes" }),
    });
  });
  await routeImportWorkloadSocket(page, [
    {
      type: "succeeded",
      workloadId: castId<WorkloadId>("workload_ct_import_notes"),
      kind: "import-bundle",
      at: 1_750_000_002_000,
      result: { imported: 1, skipped: 0, failed: 0, notes: ["book kept: primary already exists"] },
    },
  ]);

  await mount(<BackupSettingsStory />);
  await page.getByTestId("backup-import-dropzone").setInputFiles({
    name: "backup.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("PK"),
  });
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await expect(page.getByTestId("import-report")).toBeVisible();
  await expect(page.getByText("1 imported")).toBeVisible();
  await expect(page.getByText("book kept: primary already exists")).toBeVisible();
});

// ── #980 F13 · THE INCLUDE CHECKBOXES ARE ATTACHED TO THEIR LABELS ───────────────────────────────────
// Measured on the live pane 2026-09-06: eleven labels ending at x=461–492 and eleven 18px checkboxes at
// x=1398 — 906–937px of bare gap, with `design-audit` filing it independently as 8 × `row-void` P2 at
// 71–76% ("724px of 990px between 'Characters' and its control"). You could not tell by eye whether
// "Themes" was checked. The cause was structural: the rows sat in a bare `w-full` Fieldset, so each
// `Field orientation="horizontal"` docked its control in a 200px column at the PANE's right edge with
// nothing capping the row — the distance from a name to its control was whatever the window happened to
// be. That is the same defect #932 answered for the Appearance pane with `SettingRowGroup`'s shared track,
// and this section simply was not using it.
//
// The pin is the SHARED TRACK's two consequences, not a remembered pixel: one control x for every row in
// the group (which is what a track buys and a per-row dock cannot give), and an ink-to-control gap inside
// the same 25% bar #1824 holds the library row to.

/** Every "Include" row's label-ink → checkbox-box geometry, in DOM order. */
function includeRowGeometry(
  page: Page,
): Promise<readonly { readonly label: string; readonly gap: number; readonly controlX: number; readonly rowWidth: number }[]> {
  return page.evaluate(() => {
    // SCOPED TO THE "Include" GROUP, not the pane: the Backup pane holds other checkboxes (the import
    // half's), and an unscoped sweep reports two control columns and fails for the wrong reason — measured
    // here first (`[210, 495]`).
    const include = [...document.querySelectorAll<HTMLElement>('[data-slot="fieldset-root"]')].find(
      (set) => (set.querySelector('[data-slot="fieldset-legend"]')?.textContent ?? "").trim() === "Include",
    );
    if (include === undefined) {
      throw new Error("includeRowGeometry: no fieldset legended 'Include'");
    }
    const boxes = [...include.querySelectorAll<HTMLElement>('[role="checkbox"]')];
    return boxes.map((box) => {
      const row = box.closest<HTMLElement>('[data-slot="field-root"]') ?? box.parentElement;
      const label = row?.querySelector<HTMLElement>('[data-slot="field-label"]') ?? null;
      if (row === null || label === null) {
        throw new Error("includeRowGeometry: a checkbox row has no field root or label");
      }
      // RANGE, not the label's box: `Field.Label` is a block whose box can run the whole track while its
      // glyphs stop early — a bounding-box read reports a clean row over a 900px hole (the #1824 lesson).
      const range = document.createRange();
      range.selectNodeContents(label);
      const ink = range.getBoundingClientRect();
      const control = box.getBoundingClientRect();
      return {
        label: (label.textContent ?? "").trim(),
        gap: Math.round(control.left - ink.right),
        controlX: Math.round(control.left),
        rowWidth: Math.round(row.getBoundingClientRect().width),
      };
    });
  });
}

/** The measured row, put to the rule that convicted it. */
function rowVoidVerdict(row: { readonly label: string; readonly gap: number; readonly rowWidth: number }): Finding | null {
  return checkRowVoid({
    selector: `[role=checkbox] // ${row.label}`,
    gapPx: row.gap,
    rowWidthPx: row.rowWidth,
    gapRatio: Math.round((row.gap / row.rowWidth) * 100) / 100,
    leftSelector: "[data-slot=field-label]",
    leftText: row.label,
    leftWidthPx: 0,
    rightSelector: "[role=checkbox]",
    rightWidthPx: 18,
  });
}

test("#980 F13: every Include checkbox sits at ONE shared x, and design-audit's own row-void rule acquits it", async ({ mount, page }) => {
  await routeTrpc(page, { ...HOST_VIEWER_ROUTE, ...STREAM_MUTATION_ROUTES });
  await mount(<BackupSettingsStory />);
  await expect(page.getByRole("checkbox", { name: "Characters" })).toBeVisible();

  const rows = await includeRowGeometry(page);
  expect(rows.length, "the Include group renders its kind checkboxes").toBeGreaterThanOrEqual(8);
  // ONE control column: the group's label track sets the control's start x for every row in it, so the eye
  // runs straight down the marks. A per-row dock gives one shared RIGHT edge and nothing else — and it is
  // what put these controls in TWO columns (x=210, x=495) when the group was mounted without its middle
  // link, which is a different defect the same measurement catches.
  const columns = new Set(rows.map((row) => row.controlX));
  expect([...columns], `every Include control shares one x (measured ${JSON.stringify([...columns])})`).toHaveLength(1);

  // THE BAR IS THE INSTRUMENT'S OWN, not a number invented here: `checkRowVoid` is the rule that filed
  // 8 × P2 against this pane, imported and run on the measured geometry rather than re-spelling its two
  // thresholds (a re-spelled threshold drifts from the rule the moment either moves). A track layout keeps
  // a real gap by design — a short label does not fill a shared column — so "the gap is zero" would be the
  // wrong claim; "the rule that convicted this pane acquits it" is the right one.
  for (const row of rows) {
    const verdict = rowVoidVerdict(row);
    expect(verdict?.value ?? null, `"${row.label}": ${String(row.gap)}px across a ${String(row.rowWidth)}px row`).toBeNull();
  }
  // PLANTED POSITIVE CONTROL, in the same run: the pre-fix geometry this pane actually had (876px of a
  // 960px row, measured red-first here; 906–937px on the live pane). A rule that acquits everything is not
  // a measurement.
  expect(rowVoidVerdict({ label: "Characters", gap: 876, rowWidth: 960 })?.rule ?? null, "the pre-fix geometry must still convict").toBe("row-void");
});
