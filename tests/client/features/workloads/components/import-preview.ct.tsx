import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { createPersonaSchema } from "@orb/contracts/persona";

import { exportCharacterPath, PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { StreamFrame } from "@orb/contracts/stream";
import { actionGroupGeometry } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, servePhysicalPeer, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
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
const WIDTHS = [
  { name: "wide", width: 960, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow enlarged", width: 300, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

/** A real exported card plus settings: one persona colliding with an owned one, and a card that cannot be read. */
async function stageFolder(root: ServerTestHarness, folder: string): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "preview-card", name: "Preview card", description: "A real card in the picked folder." }),
  });
  const exported = await root.http.request(exportCharacterPath(card.id));
  expect(exported.status).toBe(200);
  await caller.character.remove({ characterId: card.id });
  await caller.persona.create({ input: createPersonaSchema.parse({ name: OWNED_PERSONA, description: "Your own description." }) });
  await mkdir(join(folder, "characters"), { recursive: true });
  await writeFile(join(folder, "characters", "preview-card.png"), Buffer.from(await exported.arrayBuffer()));
  await writeFile(join(folder, "characters", "broken.png"), "not a card");
  await writeFile(
    join(folder, ST_SETTINGS_FILE),
    JSON.stringify({
      ["power_user"]: {
        personas: { "mara.png": OWNED_PERSONA },
        ["persona_descriptions"]: { "mara.png": { description: "A different description." } },
      },
    }),
  );
}

// WebKit applies CORS after URL rewriting; the adapter preserves native multipart bytes across the gallery/root origins.
async function routeNativeImport(page: Page, root: ServerTestHarness, baseURL: string | undefined): Promise<AsyncDisposable> {
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
    const confirm = preflight.getByRole("button", { name: "Import", exact: true });
    await expect(confirm).toBeDisabled();
    const report = preflight.getByRole("group", { name: "What this import would bring", exact: true });
    await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
    await expect(report.getByText("Preview card", { exact: false })).toBeHidden();
    await expect(confirm).toBeEnabled();
    await expect(preflight.getByRole("radiogroup")).toHaveCount(1);

    await report.getByRole("button", { name: "Show names" }).click();
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
