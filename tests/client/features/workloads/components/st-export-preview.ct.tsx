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
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { IMPORT_PREVIEW_SHOW_NAMES } from "#client/features/workloads/lib/import-library-names.ts";
import {
  ST_EXPORT_DOWNLOAD_NAME,
  ST_EXPORT_LEFT_REASON_NAMES,
  ST_EXPORT_OPEN_NAME,
  ST_EXPORT_PREVIEW_FAILED,
  ST_EXPORT_REPORT_NAME,
  ST_EXPORT_TITLE,
  ST_IMPORT_DOOR_NAMES,
} from "#client/features/workloads/lib/st-export-names.ts";

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
