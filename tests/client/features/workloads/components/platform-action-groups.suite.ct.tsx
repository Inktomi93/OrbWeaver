import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCharacterSchema } from "@orb/contracts/character";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { personaCollisionReviewSchema, ST_SETTINGS_FILE } from "@orb/contracts/import";
import { createPersonaSchema } from "@orb/contracts/persona";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { actionGroupGeometry, resolvedLength, settledBox } from "@orb/testkit/browser/spec";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, servePhysicalPeer } from "@orb/testkit/node/composed";
import type { Locator, Page, TestInfo } from "@playwright/test";
import type { WorkloadActionGroupsStory } from "./_action-groups-stories.tsx";

const STORY = "tests/client/features/workloads/components/_action-groups-stories/WorkloadActionGroupsStory";
const ROOT_OPTIONS = {
  env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const nameMaximum = createPersonaSchema.shape.name.maxLength;
if (nameMaximum === null) {
  throw new Error("The collision case requires a bounded persona name");
}
const PERSONA_NAMES = ["A".repeat(nameMaximum), "B".repeat(nameMaximum)] as const;
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

async function measureActions(row: Locator, controls: readonly Locator[], testInfo: TestInfo, label: string): Promise<void> {
  const page = row.page();
  const geometry = await actionGroupGeometry(row, controls);
  const hostGeometry = await actionGroupGeometry(page.getByRole("group", { name: "Workload action host", exact: true }), controls);
  await testInfo.attach(label, { body: JSON.stringify({ geometry, hostGeometry }), contentType: "application/json" });
  expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
  expect(hostGeometry.inlineOverflow).toBeLessThanOrEqual(1);
  const floor = await resolvedLength(page, "var(--size-control-sm)", row);
  for (const box of geometry.controls) {
    expect(box.width).toBeGreaterThanOrEqual(floor);
    expect(box.height).toBeGreaterThanOrEqual(floor);
  }
}

async function routeImportReads(page: Page, root: ServerTestHarness): Promise<void> {
  const auth = await root.http.request("/api/auth/config");
  const authBody = await auth.text();
  expect(auth.status).toBe(200);
  await page.route("**/api/auth/config", (route) => route.fulfill({ contentType: "application/json", body: authBody }));
}

// WebKit applies CORS after URL rewriting; the adapter preserves native multipart bytes across the gallery/root origins.
async function routeNativeReview(page: Page, root: ServerTestHarness, baseURL: string | undefined): Promise<AsyncDisposable> {
  if (baseURL === undefined) {
    throw new Error("Native import review requires the configured gallery origin");
  }
  const origin = new URL(baseURL).origin;
  await using ownership = new AsyncDisposableStack();
  const reviewOrigin = ownership.use(
    await servePhysicalPeer(async (request) => {
      const cors = {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": `${CSRF_HEADER}, content-type`,
      };
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }
      const response = await root.http.request(request);
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(cors)) {
        headers.set(name, value);
      }
      return new Response(response.body, { status: response.status, headers });
    }),
  ).origin;
  await page.route("**/api/import/tree/review", (route) => route.continue({ url: `${reviewOrigin}/api/import/tree/review` }));
  return ownership.move();
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
    });

    test("card preflight actions fit and cancellation leaves the library unchanged", async ({ mount, page }, testInfo) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const card = await caller.character.create({
        input: createCharacterSchema.parse({
          handle: "import-action-card",
          name: "Import action card",
          description: "An exported card for the real preflight.",
        }),
      });
      const exported = await root.http.request(`/api/export/character/${card.id}`);
      expect(exported.status).toBe(200);
      const bytes = Buffer.from(await exported.arrayBuffer());
      await routeImportReads(page, root);
      await routeTrpc(page, serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me"]));
      await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "backup-import", width: regime.width, appearance: regime.appearance });
      const intro = page.getByText(/^Restore a backup, or bring your SillyTavern library over\./u);
      await expect(intro).toBeVisible();
      expect((await settledBox(intro)).width).toBeLessThanOrEqual((await resolvedLength(page, "var(--reading-measure-prose)", intro)) + 1);
      const picker = page.getByLabel("Import a backup or card file", { exact: true });
      await picker.focus();
      await expect(picker).toBeFocused();
      const chooserPromise = page.waitForEvent("filechooser");
      await page.keyboard.press("Enter");
      await (await chooserPromise).setFiles({ name: "import-action-card.png", mimeType: "image/png", buffer: bytes });
      await expect(picker).toBeFocused();
      const preflight = page.getByRole("group", { name: "Import “import-action-card.png”?", exact: true });
      const confirm = preflight.getByRole("button", { name: "Import", exact: true });
      const cancel = preflight.getByRole("button", { name: "Cancel", exact: true });
      await expect(confirm).toBeEnabled();
      await measureActions(confirm.locator(".."), [confirm, cancel], testInfo, "card-preflight-actions");
      await confirm.focus();
      await page.keyboard.press("Tab");
      await expect(cancel).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(preflight).toHaveCount(0);
      await expect(picker).toBeFocused();
      expect((await caller.character.get({ characterId: card.id })).name).toBe(card.name);
      expect(await caller.workloads.list({})).toEqual([]);
    });

    test("real folder collision bulk choices fit and cancellation preserves both personas", async ({ mount, page, baseURL }, testInfo) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const personas = await Promise.all(
        PERSONA_NAMES.map((name) =>
          caller.persona.create({ input: createPersonaSchema.parse({ name, description: "The owned description stays unchanged." }) }),
        ),
      );
      const folder = testInfo.outputPath("persona-profile");
      const cards = join(folder, "characters");
      await mkdir(cards, { recursive: true });
      const card = await caller.character.create({
        input: createCharacterSchema.parse({
          handle: "collision-profile-card",
          name: "Collision profile card",
          description: "A real profile card accompanying its persona settings.",
        }),
      });
      const exported = await root.http.request(`/api/export/character/${card.id}`);
      expect(exported.status).toBe(200);
      await writeFile(join(cards, "collision-profile-card.png"), Buffer.from(await exported.arrayBuffer()));
      await writeFile(
        join(folder, ST_SETTINGS_FILE),
        JSON.stringify({
          ["power_user"]: {
            personas: { "one.png": PERSONA_NAMES[0], "two.png": PERSONA_NAMES[1] },
            ["persona_descriptions"]: {
              "one.png": { description: "The incoming first description." },
              "two.png": { description: "The incoming second description." },
            },
          },
        }),
      );
      await routeImportReads(page, root);
      await using _review = await routeNativeReview(page, root, baseURL);
      await routeTrpc(page, serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me"]));
      await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "backup-import", width: regime.width, appearance: regime.appearance });
      const chooserPromise = page.waitForEvent("filechooser");
      const picker = page.getByRole("button", { name: "Import a folder…", exact: true });
      await picker.focus();
      await expect(picker).toBeFocused();
      await picker.click();
      const reviewResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/import/tree/review");
      await (await chooserPromise).setFiles(folder);
      await expect(picker).toBeFocused();
      const reviewResponse = await reviewResponsePromise;
      expect(reviewResponse.status()).toBe(200);
      const reviewed = personaCollisionReviewSchema.parse(await reviewResponse.json());
      expect(reviewed.collisions).toHaveLength(2);
      await testInfo.attach("actual-persona-review", { body: JSON.stringify(reviewed), contentType: "application/json" });
      const review = page.locator('[data-slot="persona-collision-review"]');
      await expect(review.getByRole("radiogroup")).toHaveCount(2);
      const merge = review.getByRole("button", { name: "Merge all", exact: true });
      const keep = review.getByRole("button", { name: "Keep all", exact: true });
      await measureActions(merge.locator(".."), [merge, keep], testInfo, "collision-bulk-actions");
      await merge.focus();
      await page.keyboard.press("Tab");
      await expect(keep).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(review.getByRole("radio", { name: /^Keep both/u })).toHaveCount(2);
      for (const radio of await review.getByRole("radio", { name: /^Keep both/u }).all()) {
        await expect(radio).toBeChecked();
      }
      await merge.click();
      for (const radio of await review.getByRole("radio", { name: /^Merge into your existing persona/u }).all()) {
        await expect(radio).toBeChecked();
      }
      const preflight = page.getByRole("group", { name: "Import 2 files from the folder you picked?", exact: true });
      await preflight.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(preflight).toHaveCount(0);
      await expect(picker).toBeFocused();
      for (const persona of personas) {
        expect((await caller.persona.get({ personaId: persona.id })).description).toBe(persona.description);
      }
      expect(await caller.workloads.list({})).toEqual([]);
    });

    test("bulk and singular schedule row controls fit and remain keyboard reachable", async ({ mount, page }, testInfo) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      for (const mode of ["singular", "bulk"] as const) {
        await caller.workloads.createSchedule({ input: { kind: "import-token-usage-backfill", params: {} }, mode, cadence: "daily", enabled: false });
      }
      const before = await caller.workloads.listSchedules({});
      await routeTrpc(
        page,
        serveCorpusProcedures(caller, [
          "settings.getUserSettings",
          "sessions.me",
          "workloads.listSchedules",
          "admin.listUsers",
          "connection.listBindings",
          "connection.list",
        ]),
      );
      await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "workloads-schedules", width: regime.width, appearance: regime.appearance });
      expect((await settledBox(page.getByRole("group", { name: "Workload action host", exact: true }))).width).toBe(regime.width);
      const rows = page.locator('[data-slot="list-row-root"]');
      await expect(rows).toHaveCount(2);
      for (const row of await rows.all()) {
        const toggle = row.getByRole("switch");
        const edit = row.getByRole("button", { name: /^Edit .+ schedule$/u });
        const remove = row.getByRole("button", { name: /^Delete .+ schedule$/u });
        await measureActions(edit.locator(".."), [edit, remove], testInfo, "schedule-row-actions");
        expect(
          (await actionGroupGeometry(page.getByRole("group", { name: "Workload action host", exact: true }), [toggle])).inlineOverflow,
        ).toBeLessThanOrEqual(1);
        await toggle.focus();
        await page.keyboard.press("Tab");
        await expect(edit).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(remove).toBeFocused();
      }
      expect(await caller.workloads.listSchedules({})).toEqual(before);
    });

    test("deferred bulk Cancel and terminal Retry stay separate and cancellation is nondestructive", async ({ mount, page }, testInfo) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const cancelled = await caller.workloads.start({ input: { kind: "import-token-usage-backfill", params: {} } });
      await caller.workloads.cancel({ id: cancelled.id });
      const dependency = await caller.workloads.start({ input: { kind: "assets-backfill", params: {} }, mode: "bulk" });
      const active = await caller.workloads.start({
        input: { kind: "import-token-usage-backfill", params: {} },
        mode: "bulk",
        dependsOn: [dependency.id],
        scheduledAt: root.clock.now() + CADENCE_INTERVAL_MS.daily,
      });
      await routeTrpc(
        page,
        serveCorpusProcedures(caller, [
          "settings.getUserSettings",
          "sessions.me",
          "workloads.list",
          "workloads.get",
          "admin.listUsers",
          "connection.listBindings",
          "connection.list",
          "stream.attach",
          "stream.detach",
        ]),
      );
      await routeOrbSocket(page, { awaitAttaches: 2 });
      await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "workloads-jobs", width: regime.width, appearance: regime.appearance });
      const deferred = page.locator('[data-slot="workload-row"]').filter({ has: page.getByText("Scheduled", { exact: true }) });
      const terminal = page.locator('[data-slot="workload-row"]').filter({ has: page.getByRole("button", { name: /^Retry — /u }) });
      const cancel = deferred.getByRole("button", { name: /^Cancel — /u });
      const retry = terminal.getByRole("button", { name: /^Retry — /u });
      await expect(cancel).toBeEnabled();
      await expect(deferred.getByText("Bulk", { exact: true })).toBeVisible();
      await expect(deferred.getByText("Waiting", { exact: true })).toBeVisible();
      await expect(deferred.getByRole("button", { name: /^Retry — /u })).toHaveCount(0);
      await expect(terminal.getByRole("button", { name: /^Cancel — /u })).toHaveCount(0);
      await measureActions(cancel.locator(".."), [cancel], testInfo, "deferred-job-actions");
      await measureActions(retry.locator(".."), [retry], testInfo, "terminal-job-actions");
      await retry.focus();
      await expect(retry).toBeFocused();
      await cancel.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("alertdialog", { name: "Cancel this job?", exact: true });
      const keep = dialog.getByRole("button", { name: "Keep running", exact: true });
      await keep.focus();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeHidden();
      await expect(cancel).toBeFocused();
      expect((await caller.workloads.get({ id: active.id })).status).toBe("queued");
      expect((await caller.workloads.get({ id: cancelled.id })).status).toBe("cancelled");
    });
  });
}
