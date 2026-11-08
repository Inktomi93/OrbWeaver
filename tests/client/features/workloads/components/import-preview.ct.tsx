import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import type { ImportPreview } from "@orb/contracts/import";
import {
  IMPORT_PREVIEW_KINDS,
  importStartedSchema,
  ST_SECRETS_FILE,
  ST_SETTINGS_FILE,
  TREE_DRY_RUN_FIELD,
  TREE_DRY_RUN_VALUE,
  TREE_FILE_FIELD,
} from "@orb/contracts/import";
import { createPersonaSchema } from "@orb/contracts/persona";

import { exportCharacterPath, PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { StreamFrame } from "@orb/contracts/stream";
import { actionGroupGeometry } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS, nonEmpty } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, servePhysicalPeer, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import type { Locator, Page, Request } from "@playwright/test";
import {
  asImportPreview,
  IMPORT_CONFIRM_NAMES,
  IMPORT_CONSEQUENCE,
  IMPORT_NOTHING_FOUND_NOTE,
  IMPORT_PREVIEW_RETRY_NAME,
  previewKindLine,
} from "#client/features/workloads/lib/portability-model.ts";
import type { ImportPreviewStory } from "./_import-preview-stories.tsx";

// The preview over the real composed server: a picked SillyTavern folder really uploads as a dry run, the workload
// really runs, and the terminal frame the page reads is the real row's result.
const STORY = "tests/client/features/workloads/components/_import-preview-stories/ImportPreviewStory";
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const OWNED_PERSONA = "Mara";
// A persona the folder carries exactly as the library holds it: the summary counts it as already there.
const HELD_PERSONA = "Held persona";
const HELD_DESCRIPTION = "Already in your library.";
const WIDTHS = [
  { name: "wide", width: 960, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow enlarged", width: 300, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

/** The whole numbers a summary line prints, in order. */
function numbersIn(text: string): readonly number[] {
  return (text.match(/\d+/gu) ?? []).map(Number);
}

/** The folder must stage both note kinds the summary adds after a count, or a dropped note could not fail a case. */
function expectNoteItemsStaged(preview: ImportPreview): void {
  const items = IMPORT_PREVIEW_KINDS.flatMap((kind) => preview.kinds[kind].items);
  expect(items.filter((item) => item.inLibrary === true).length).toBeGreaterThan(0);
  expect(items.filter((item) => item.withoutArt === true).length).toBeGreaterThan(0);
}

/** A real exported card plus settings: one persona colliding with an owned one, one the library already holds, and a card that cannot be read. */
async function stageFolder(root: ServerTestHarness, folder: string): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "preview-card", name: "Preview card", description: "A real card in the picked folder." }),
  });
  const exported = await root.http.request(exportCharacterPath(card.id));
  expect(exported.status).toBe(200);
  await caller.character.remove({ characterId: card.id });
  await caller.persona.create({ input: createPersonaSchema.parse({ name: OWNED_PERSONA, description: "Your own description." }) });
  await caller.persona.create({ input: createPersonaSchema.parse({ name: HELD_PERSONA, description: HELD_DESCRIPTION }) });
  await mkdir(join(folder, "characters"), { recursive: true });
  await writeFile(join(folder, "characters", "preview-card.png"), Buffer.from(await exported.arrayBuffer()));
  await writeFile(join(folder, "characters", "broken.png"), "not a card");
  await writeFile(
    join(folder, ST_SETTINGS_FILE),
    JSON.stringify({
      ["power_user"]: {
        personas: { "mara.png": OWNED_PERSONA, "held.png": HELD_PERSONA },
        ["persona_descriptions"]: { "mara.png": { description: "A different description." }, "held.png": { description: HELD_DESCRIPTION } },
      },
    }),
  );
}

// WebKit applies CORS after URL rewriting; the adapter preserves native multipart bytes across the gallery/root origins.
async function routeNativeImport(page: Page, root: ServerTestHarness, baseURL: string | undefined, refuseUploads = 0): Promise<AsyncDisposable> {
  let refused = 0;
  if (baseURL === undefined) {
    throw new Error("The native import needs the configured gallery origin");
  }
  const origin = new URL(baseURL).origin;
  await using ownership = new AsyncDisposableStack();
  const peer = ownership.use(
    await servePhysicalPeer(async (request) => {
      const cors = {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": `${CSRF_HEADER}, content-type`,
      };
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }
      if (request.method === "POST" && new URL(request.url).pathname === PORTABILITY_ROUTES.importTree && refused < refuseUploads) {
        refused += 1;
        return new Response('{"error":"the import queue failed"}', { status: 500, statusText: "Internal Server Error", headers: cors });
      }
      const response = await root.http.request(request);
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(cors)) {
        headers.set(name, value);
      }
      return new Response(response.body, { status: response.status, headers });
    }),
  ).origin;
  for (const path of [PORTABILITY_ROUTES.importTree, PORTABILITY_ROUTES.importTreeReview]) {
    await page.route(`**${path}`, (route) => route.continue({ url: `${peer}${path}` }));
  }
  return ownership.move();
}

/** Every connection ends in EOF, so the page's room re-derives the run through `workloads.get` (the tracker's gap
 *  heal): the stub serves whole bodies, so a live terminal frame cannot follow the attach. Each connection runs
 *  whatever dry run has been admitted since the last one. */
function dryRunSocket(root: ServerTestHarness): Parameters<typeof routeOrbSocket>[1] {
  return {
    dropConnectionCount: Number.MAX_SAFE_INTEGER,
    frames: async (signal): Promise<readonly StreamFrame[]> => {
      const caller = await root.internalCallerFor(root.ownerId);
      for (const row of await caller.workloads.list({ kind: "import-st" })) {
        if (row.status === "queued") {
          await root.runAdmittedWorkload?.(row.id, signal);
        }
      }
      return [];
    },
  };
}

for (const { name, width, appearance } of WIDTHS) {
  test(`${name}: a picked folder shows its counts, skips and collision, reveals names on request, and Cancel writes nothing`, async ({
    mount,
    page,
    baseURL,
  }, testInfo) => {
    await using root = await createServerHarness(ROOT_OPTIONS);
    const caller = await root.internalCallerFor(root.ownerId);
    const folder = testInfo.outputPath("profile");
    await stageFolder(root, folder);
    // The folder's first HTTP request seeds the owner's default content in the background.
    await root.settleBackground();
    const characters = (await caller.character.list({})).items.length;
    const personas = (await caller.persona.list()).length;
    const auth = await root.http.request("/api/auth/config");
    await routeAuthConfig(page, await auth.text());
    await using _native = await routeNativeImport(page, root, baseURL);
    await routeTrpc(page, {
      ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "workloads.cancel", "workloads.get"]),
      "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
      "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    });
    await routeOrbSocket(page, dryRunSocket(root));
    await mount<typeof ImportPreviewStory>(STORY, { width, appearance });

    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Import a folder…", exact: true }).click();
    await (await chooserPromise).setFiles(folder);

    const preflight = page.getByRole("group", { name: /^Import \d+ files? from the folder you picked\?$/u });
    const confirm = preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.folder, exact: true });
    await expect(confirm).toBeDisabled();
    const report = preflight.getByRole("group", { name: "What this import would bring", exact: true });
    await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
    await expect(report.getByText("Preview card", { exact: false })).toBeHidden();
    await expect(confirm).toBeEnabled();
    await expect(preflight.getByRole("radiogroup")).toHaveCount(1);

    // The summary's lines, read against the dry run's own result: one count line per populated kind, the skip total
    // after them, the colliding persona's note, and every skip reason.
    const [preview] = nonEmpty((await caller.workloads.list({ kind: "import-st" })).flatMap((run) => asImportPreview(run.result) ?? []));
    const populated = IMPORT_PREVIEW_KINDS.filter((kind) => preview.kinds[kind].total > 0);
    expect(preview.skipped.total).toBeGreaterThan(0);
    expectNoteItemsStaged(preview);
    const lines = (await report.locator(":scope > *").allTextContents()).filter((text) => /^\d/u.test(text));
    expect(lines.slice(0, populated.length)).toEqual(populated.map((kind) => previewKindLine(kind, preview.kinds[kind])));
    expect(lines.slice(populated.length).map(numbersIn)).toEqual([[preview.skipped.total]]);
    for (const reason of new Set(preview.skipped.items.map((skip) => skip.reason))) {
      await expect(report).toContainText(reason);
    }

    await report.getByRole("button", { name: "Show names" }).click();
    await expect(report.getByRole("button", { name: "Hide names" })).toBeVisible();
    await expect(report.getByText("Preview card", { exact: false })).toBeVisible();
    expect((await actionGroupGeometry(page.getByRole("group", { name: "Import preview host", exact: true }), [confirm])).inlineOverflow).toBeLessThanOrEqual(1);

    await preflight.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(preflight).toHaveCount(0);
    expect((await caller.character.list({})).items).toHaveLength(characters);
    expect(await caller.persona.list()).toHaveLength(personas);
  });
}

test("cancelling while the folder is being read stops the dry run", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const caller = await root.internalCallerFor(root.ownerId);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  const auth = await root.http.request("/api/auth/config");
  await routeAuthConfig(page, await auth.text());
  await using _native = await routeNativeImport(page, root, baseURL);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "workloads.cancel", "workloads.get", "workloads.list"]),
    "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await routeOrbSocket(page);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import a folder…", exact: true }).click();
  await (await chooserPromise).setFiles(folder);
  await expect.poll(async () => (await caller.workloads.list({ kind: "import-st" })).map((row) => row.status)).toEqual(["queued"]);

  const preflight = page.getByRole("group", { name: /^Import \d+ files? from the folder you picked\?$/u });
  await preflight.getByRole("button", { name: "Cancel", exact: true }).click();

  await expect(preflight).toHaveCount(0);
  await expect.poll(async () => (await caller.workloads.list({ kind: "import-st" })).map((row) => row.status)).toEqual(["cancelled"]);
});

const PREFLIGHT = /^Import \d+ files? from the folder you picked\?$/u;

/** The page's side of a pick: the dry run goes through the real tree route into the composed server. */
async function openImport(page: Page, root: ServerTestHarness): Promise<Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>> {
  const caller = await root.internalCallerFor(root.ownerId);
  const auth = await root.http.request("/api/auth/config");
  await routeAuthConfig(page, await auth.text());
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "workloads.cancel", "workloads.get", "workloads.list"]),
    "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await routeOrbSocket(page, dryRunSocket(root));
  return caller;
}

async function pickFolder(page: Page, folder: string): Promise<void> {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import a folder…", exact: true }).click();
  await (await chooserPromise).setFiles(folder);
}

test("a re-pick while the last dry run still holds the account's import slot waits for it and shows the preview", async ({
  mount,
  page,
  baseURL,
}, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  const caller = await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  // An earlier dry run still occupies the slot, as a cancelled run does until it settles.
  const held = new FormData();
  held.append(TREE_FILE_FIELD, new File(["{}"], `profile/${ST_SETTINGS_FILE}`), `profile/${ST_SETTINGS_FILE}`);
  held.append(TREE_DRY_RUN_FIELD, TREE_DRY_RUN_VALUE);
  const heldStart = await root.http.request(PORTABILITY_ROUTES.importTree, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: held });
  expect(heldStart.status).toBe(202);
  const { workloadId } = importStartedSchema.parse(await heldStart.json());

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  await expect(preflight).toBeVisible();
  await expect(preflight.getByRole("status")).toHaveCount(0);
  await expect(page.getByText("409")).toHaveCount(0);

  await caller.workloads.cancel({ id: workloadId });
  const report = preflight.getByRole("group", { name: "What this import would bring", exact: true });
  await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
  await expect(page.getByText("409")).toHaveCount(0);
});

test("a failed dry run says so in plain words and tone, and Try again reads the folder", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL, 1);
  await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  const failure = preflight.getByRole("status");
  await expect(failure).toBeVisible();
  await expect(failure).not.toContainText(/\d{3}|importTree|\{|Failed to fetch/u);
  await expect(failure).toHaveAttribute("data-tone", "destructive");
  await expect(preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.folder, exact: true })).toBeEnabled();

  await preflight.getByRole("button", { name: IMPORT_PREVIEW_RETRY_NAME, exact: true }).click();
  await expect(preflight.getByRole("group", { name: "What this import would bring", exact: true })).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
});

test("a pick brings the preflight, with its progress bar, into view and focuses it", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  await page.setViewportSize({ width: 1280, height: 360 });
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  await expect(preflight).toBeFocused();
  await expect(preflight.getByRole("progressbar")).toBeInViewport();
});

test("a refused persona review says so in plain words, not the raw request error", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST", "access-control-allow-headers": `${CSRF_HEADER}, content-type` };
  await page.route(`**${PORTABILITY_ROUTES.importTreeReview}`, (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"planted failure"}', headers: cors }),
  );
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  await expect(page.getByText("The server could not read this folder.", { exact: true })).toBeVisible();
  await expect(page.getByText(/reviewTreePersonas|planted failure/u)).toHaveCount(0);
});

test("Import and Cancel stay in reach at the foot of a review taller than the viewport", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  await page.setViewportSize({ width: 1280, height: 360 });
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  await expect(preflight.getByRole("group", { name: "What this import would bring", exact: true })).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
  await expect(preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.folder, exact: true })).toBeInViewport();
  await expect(preflight.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport();
});

test("Import hands focus to the progress region", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  await expect(preflight.getByRole("group", { name: "What this import would bring", exact: true })).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });

  await preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.folder, exact: true }).click();
  await expect(page.getByRole("group", { name: "Import progress", exact: true })).toBeFocused();
});

test("a folder the dry run finds nothing in says so and leaves Import off", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await mkdir(join(folder, "characters"), { recursive: true });
  await writeFile(join(folder, "characters", "broken.png"), "not a card");
  await writeFile(join(folder, ST_SETTINGS_FILE), JSON.stringify({ ["power_user"]: {} }));
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  await expect(preflight.getByText(IMPORT_NOTHING_FOUND_NOTE, { exact: true })).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
  const confirm = preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.folder, exact: true });
  await expect(confirm).toBeDisabled();
  await expect(confirm).toHaveAccessibleDescription(IMPORT_NOTHING_FOUND_NOTE);
});

test("Cancel while the folder's bytes are still going up ends the upload request", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  const isUpload = (request: Request): boolean => request.method() === "POST" && new URL(request.url()).pathname === PORTABILITY_ROUTES.importTree;
  // Registered after the native route, so it answers first: the upload is held as a slow link holds it, and everything else falls through.
  await page.route(`**${PORTABILITY_ROUTES.importTree}`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
    }
  });
  const sent = page.waitForRequest(isUpload);
  const ended = page.waitForEvent("requestfailed", isUpload);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  await sent;
  await page.getByRole("group", { name: PREFLIGHT }).getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await ended).failure()?.errorText).toMatch(/abort/iu);
});

test("a folder's persona the library already holds is counted as already there, beside a persona it lacks", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const caller = await root.internalCallerFor(root.ownerId);
  const folder = testInfo.outputPath("profile");
  // A preset is a unit the planner sends on its own, so the folder has something to read beside the settings.
  await mkdir(join(folder, "OpenAI Settings"), { recursive: true });
  await writeFile(
    join(folder, "OpenAI Settings", "Plain.json"),
    JSON.stringify({
      prompts: [{ identifier: "main", name: "Main", content: "You are plain.", role: "system" }],
      ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
    }),
  );
  await writeFile(
    join(folder, ST_SETTINGS_FILE),
    JSON.stringify({
      ["power_user"]: {
        personas: { "held.png": HELD_PERSONA, "new.png": "New persona" },
        ["persona_descriptions"]: { "held.png": { description: HELD_DESCRIPTION } },
      },
    }),
  );
  await root.settleBackground();
  await caller.persona.create({ input: createPersonaSchema.parse({ name: HELD_PERSONA, description: HELD_DESCRIPTION }) });
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const report = page.getByRole("group", { name: PREFLIGHT }).getByRole("group", { name: "What this import would bring", exact: true });
  await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });

  // The control: the wire carries the ownership the line reads, for a kind that is not a character.
  const [preview] = nonEmpty((await caller.workloads.list({ kind: "import-st" })).flatMap((run) => asImportPreview(run.result) ?? []));
  expect(preview.kinds.personas.items.filter((item) => item.inLibrary === true)).toHaveLength(1);
  expectNoteItemsStaged(preview);
  const lines = (await report.locator(":scope > *").allTextContents()).filter((text) => /^\d/u.test(text));
  const populated = IMPORT_PREVIEW_KINDS.filter((kind) => preview.kinds[kind].total > 0);
  expect(lines).toEqual(populated.map((kind) => previewKindLine(kind, preview.kinds[kind])));
});

test("the folder's skip reasons and left-out files read at least as large as the standing policy text", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await writeFile(join(folder, ST_SECRETS_FILE), "{}");
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  const caller = await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  const report = preflight.getByRole("group", { name: "What this import would bring", exact: true });
  await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
  const [preview] = nonEmpty((await caller.workloads.list({ kind: "import-st" })).flatMap((run) => asImportPreview(run.result) ?? []));
  const [skip] = nonEmpty(preview.skipped.items);

  const fontSize = (text: Locator): Promise<number> => text.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  const policy = await fontSize(preflight.getByText(IMPORT_CONSEQUENCE[0], { exact: true }));
  const reason = await fontSize(report.getByText(skip.reason, { exact: false }));
  const leftOnDisk = await fontSize(preflight.getByText(/will stay on your disk/u));
  const question = await fontSize(preflight.getByText(PREFLIGHT));
  expect(reason).toBeGreaterThanOrEqual(policy);
  expect(leftOnDisk).toBeGreaterThanOrEqual(policy);
  expect(question).toBeGreaterThanOrEqual(policy);
});
