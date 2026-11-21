// The SillyTavern export's preflight over the real composed server: the preview is the export door's own dry run, laid
// out as the import preview is, naming the SillyTavern door each kind goes through and every row that stays here; the
// download appears only beside a preview that read, and fetches the zip the preview described.

import { RETRY_NAME } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { ST_EXPORT_PROFILE_DIR, ST_SETTINGS_FILE, stExportReportSchema, stProfileExportPath } from "@orb/contracts/import";
import { createPersonaSchema } from "@orb/contracts/persona";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import type { SettingsCompositionStory } from "@orb/testkit/browser";
import { resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { present } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import { IMPORT_PREVIEW_NAMES_REGION, IMPORT_PREVIEW_SHOW_NAMES } from "#client/features/workloads/lib/import-library-names.ts";
import {
  ST_EXPORT_DOWNLOAD_NAME,
  ST_EXPORT_GOES_HEADING,
  ST_EXPORT_LEFT_REASON_NAMES,
  ST_EXPORT_OPEN_NAME,
  ST_EXPORT_PREVIEW_FAILED,
  ST_EXPORT_REPORT_NAME,
  ST_EXPORT_RUNNING,
  ST_EXPORT_TITLE,
  ST_IMPORT_DOOR_NAMES,
  stExportLeftHeading,
} from "#client/features/workloads/lib/st-export-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";

const STORY = "tests/support/browser/ct-settings-composition-stories/SettingsCompositionStory";
const FACELESS = "Faceless";
const SERVER_ERROR = 500;
// The export door serves the signed-in owner; single-user mode signs every request in as the owner.
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;

/** The export door through the composed server, the first `refuse` reads answered as a server fault. Returns the
 *  addresses the page asked for. */
async function routeExport(page: Page, root: ServerTestHarness, refuse = 0): Promise<string[]> {
  const asked: string[] = [];
  await page.route(
    (url) => url.pathname === PORTABILITY_ROUTES.exportLibrary,
    async (route) => {
      const url = new URL(route.request().url());
      asked.push(`${url.pathname}${url.search}`);
      if (asked.length <= refuse) {
        await route.fulfill({ status: SERVER_ERROR, body: '{"error":"the library could not be read"}' });
        return;
      }
      const response = await root.http.request(`${url.pathname}${url.search}`);
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    },
  );
  return asked;
}

async function openSection(page: Page, root: ServerTestHarness): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]));
}

test("the preview names each kind's SillyTavern door and the persona that stays, then downloads the zip it described", async ({ mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.character.create({ input: createCharacterSchema.parse({ handle: "lantern", name: "Lantern", description: "Keeps the light." }) });
  // A persona with no image is the row SillyTavern cannot list, so the preview must name it.
  await caller.persona.create({ input: createPersonaSchema.parse({ name: FACELESS, description: "No picture." }) });
  await openSection(page, root);
  const asked = await routeExport(page, root);
  await mount<typeof SettingsCompositionStory>(STORY, { sectionId: "backup-export", width: 960, paneInset: true });

  await expect(page.getByRole("button", { name: ST_EXPORT_DOWNLOAD_NAME, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: ST_EXPORT_OPEN_NAME, exact: true }).click();
  const preflight = page.getByRole("group", { name: ST_EXPORT_TITLE, exact: true });
  const report = preflight.getByRole("group", { name: ST_EXPORT_REPORT_NAME, exact: true });

  await expect(report.getByText("Characters: ").and(report.getByText(`, for ${ST_IMPORT_DOOR_NAMES["character-import"]}`))).toBeVisible();
  const dryRun = stExportReportSchema.parse(await (await root.http.request(stProfileExportPath(true))).json());
  const kinds = new Set(dryRun.files.filter(({ path }) => path !== `${ST_EXPORT_PROFILE_DIR}${ST_SETTINGS_FILE}`).map(({ kind }) => kind));
  // A line per kind, and one for the settings file.
  await expect(report.getByText(", for SillyTavern's ")).toHaveCount(kinds.size + 1);
  await expect(report.getByText("Personas: ")).toHaveCount(0);
  const reason = ST_EXPORT_LEFT_REASON_NAMES["persona-without-art"];
  await expect(report.getByText(reason)).toBeVisible();
  await report.getByRole("button", { name: IMPORT_PREVIEW_SHOW_NAMES, exact: true }).click();
  await expect(report.getByText(`Stays here, ${reason}: `).and(report.getByText(`Personas: ${FACELESS}`))).toBeVisible();
  expect(asked).toEqual([stProfileExportPath(true)]);

  const zip = page.waitForRequest((request) => request.url().endsWith(stProfileExportPath(false)));
  await preflight.getByRole("button", { name: ST_EXPORT_DOWNLOAD_NAME, exact: true }).click();
  await zip;
  await expect(preflight).toHaveCount(0);
});

test("a preview that does not read offers a retry and no download", async ({ mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  await openSection(page, root);
  await routeExport(page, root, 1);
  await mount<typeof SettingsCompositionStory>(STORY, { sectionId: "backup-export", width: 342, paneInset: true });

  await page.getByRole("button", { name: ST_EXPORT_OPEN_NAME, exact: true }).click();
  const preflight = page.getByRole("group", { name: ST_EXPORT_TITLE, exact: true });

  await expect(preflight.getByText(ST_EXPORT_PREVIEW_FAILED, { exact: true })).toBeVisible();
  await expect(preflight.getByRole("button", { name: ST_EXPORT_DOWNLOAD_NAME, exact: true })).toHaveCount(0);
  // Positive control: the retry reads the preview, and the download appears beside it.
  await preflight.getByRole("button", { name: RETRY_NAME, exact: true }).click();
  await expect(preflight.getByRole("group", { name: ST_EXPORT_REPORT_NAME, exact: true })).toBeVisible();
  await expect(preflight.getByRole("button", { name: ST_EXPORT_DOWNLOAD_NAME, exact: true })).toBeVisible();
});

test("a preview asked while another export runs says so and reads once that export ends", async ({ mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  await openSection(page, root);
  await routeExport(page, root);
  // An export of this library already streaming, held open by its reader.
  const running = present((await root.http.request(stProfileExportPath(false))).body).getReader();
  await running.read();
  await mount<typeof SettingsCompositionStory>(STORY, { sectionId: "backup-export", width: 342, paneInset: true });

  await page.getByRole("button", { name: ST_EXPORT_OPEN_NAME, exact: true }).click();
  const preflight = page.getByRole("group", { name: ST_EXPORT_TITLE, exact: true });

  await expect(preflight.getByText(ST_EXPORT_RUNNING, { exact: true })).toBeVisible();
  await expect(preflight.getByRole("button", { name: ST_EXPORT_DOWNLOAD_NAME, exact: true })).toHaveCount(0);
  // Positive control: once the running export is read through, the retry reads the preview.
  for (let chunk = await running.read(); !chunk.done; chunk = await running.read()) {
    expect(chunk.value.byteLength).toBeGreaterThan(0);
  }
  await preflight.getByRole("button", { name: RETRY_NAME, exact: true }).click();
  await expect(preflight.getByRole("group", { name: ST_EXPORT_REPORT_NAME, exact: true })).toBeVisible();
});
test("keyboard focus enters the preflight on open and returns to the open button on Cancel", async ({ mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  await openSection(page, root);
  await routeExport(page, root);
  await mount<typeof SettingsCompositionStory>(STORY, { sectionId: "backup-export", width: 342, paneInset: true });

  const opener = page.getByRole("button", { name: ST_EXPORT_OPEN_NAME, exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const preflight = page.getByRole("group", { name: ST_EXPORT_TITLE, exact: true });
  await expect(preflight.getByRole("group", { name: ST_EXPORT_REPORT_NAME, exact: true })).toBeVisible();
  // The opener unmounted under the key press, so focus is the preflight's or it is on the body.
  await expect(preflight).toBeFocused();

  await preflight.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(preflight).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("Try again keeps focus in the preflight while it reads again", async ({ mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  await openSection(page, root);
  await routeExport(page, root, 1);
  await mount<typeof SettingsCompositionStory>(STORY, { sectionId: "backup-export", width: 342, paneInset: true });

  await page.getByRole("button", { name: ST_EXPORT_OPEN_NAME, exact: true }).click();
  const preflight = page.getByRole("group", { name: ST_EXPORT_TITLE, exact: true });
  const retry = preflight.getByRole("button", { name: RETRY_NAME, exact: true });
  await expect(retry).toBeVisible();
  await retry.focus();
  await page.keyboard.press("Enter");

  // The retry button is gone once the read starts, and the read ends in the report; focus is the preflight's throughout.
  await expect(preflight.getByRole("group", { name: ST_EXPORT_REPORT_NAME, exact: true })).toBeVisible();
  await expect(retry).toHaveCount(0);
  await expect(preflight).toBeFocused();
});

const MANY_CHARACTERS = 40;

test("at phone width the preview sets what goes apart from what stays, and its names scroll in a bounded region", async ({ mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const caller = await root.internalCallerFor(root.ownerId);
  for (let index = 0; index < MANY_CHARACTERS; index += 1) {
    const handle = `traveller-${String(index).padStart(2, "0")}`;
    await caller.character.create({
      input: createCharacterSchema.parse({ handle, name: `Traveller number ${String(index)}`, description: "Walks the long road." }),
    });
  }
  await caller.persona.create({ input: createPersonaSchema.parse({ name: FACELESS, description: "No picture." }) });
  await openSection(page, root);
  await routeExport(page, root);
  await mount<typeof SettingsCompositionStory>(STORY, { sectionId: "backup-export", width: 342, paneInset: true });

  await page.getByRole("button", { name: ST_EXPORT_OPEN_NAME, exact: true }).click();
  const preflight = page.getByRole("group", { name: ST_EXPORT_TITLE, exact: true });
  const report = preflight.getByRole("group", { name: ST_EXPORT_REPORT_NAME, exact: true });
  const dryRun = stExportReportSchema.parse(await (await root.http.request(stProfileExportPath(true))).json());

  const goes = report.getByRole("group", { name: ST_EXPORT_GOES_HEADING, exact: true });
  const stays = report.getByRole("group", { name: stExportLeftHeading(dryRun.left.length), exact: true });
  await expect(goes.getByRole("heading", { name: ST_EXPORT_GOES_HEADING, exact: true })).toBeVisible();
  await expect(goes.getByText("Characters: ").and(goes.getByText(`, for ${ST_IMPORT_DOOR_NAMES["character-import"]}`))).toBeVisible();
  await expect(stays.getByRole("heading")).toBeVisible();
  const reason = ST_EXPORT_LEFT_REASON_NAMES["persona-without-art"];
  // What stays is under its own heading and never among what goes.
  await expect(stays.getByText(reason)).toBeVisible();
  await expect(goes.getByText(reason)).toHaveCount(0);

  await report.getByRole("button", { name: IMPORT_PREVIEW_SHOW_NAMES, exact: true }).click();
  const names = report.getByRole("region", { name: IMPORT_PREVIEW_NAMES_REGION, exact: true });
  await expect(names.getByText("Characters: ")).toBeVisible();
  const cap = await resolvedLength(page, `var(${TOKENS["height.scroll-md"].cssVar})`, names);
  const { client, scroll } = await names.evaluate((region) => ({ client: region.clientHeight, scroll: region.scrollHeight }));
  // The control: the names run past the cap, so the region is bounded and scrolls rather than fitting by luck.
  expect(scroll).toBeGreaterThan(cap);
  expect(client).toBeLessThanOrEqual(cap);
});
