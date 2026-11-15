// @subject packages/client/src/features/credentials/components/add-model-on-key-dialog.tsx
// Adding another model on a saved key asks for the real limits when the model's window is a guess, through the same step
// the new-connection dialog shows, and stores what is typed as that new connection's own declaration. A model whose
// provider states its window asks no limit, only the image guess, and closing at the step never leaves the next open on it.

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { moreActionsName } from "@orb/ui/lib";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import { ADD_CONNECTION_NAME } from "#client/features/credentials/lib/connections-copy.ts";
import {
  ADD_MODEL_ACTION_LABELS,
  CONNECTION_LIMIT_FIELD_NAMES,
  CONNECTION_LIMITS_KEEP_NAME,
  CONNECTION_LIMITS_SAVE_NAME,
  CONNECTION_LIMITS_TITLE,
  IMAGE_SWITCH_NAME,
} from "#client/features/credentials/lib/credentials-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ConnectionLimitsStory } from "./_connection-limits-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connection-limits-stories/ConnectionLimitsStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "connection.list",
  "connection.listBindings",
  "connection.setBinding",
  "credentials.list",
  "credentials.storageStatus",
  "connection.providersAvailable",
  "connection.catalogModels",
  "connection.create",
  "connection.update",
  "connection.capabilities",
  "connection.get",
  "connection.embedSpaceChangePreview",
  "search.spaceStatus",
] as const;
// A hosted proxy reached through Custom OpenAI-compatible with a saved key. Its model list carries ids, and one row also
// states its window.
const PROXY_HOST = "llm.example.com";
const PROXY_URL = `https://${PROXY_HOST}/v1`;
const PROXY_PROVIDER = "custom-openai";
const PROXY_KEY = "synthetic-add-model-key-never-returned";
const SEED_MODEL = "vendor/seed-model";
const SEED_LABEL = "Seed proxy";
const ID_ONLY_MODEL = "vendor/id-only-model";
const STATED_MODEL = "vendor/states-its-window";
const STATED_WINDOW = 131_072;
const REAL = { window: 1_000_000 } as const;
const TYPED = { window: "1,000,000" } as const;
const PUBLIC_ADDRESS = "93.184.215.14";
const HTTP_NOT_FOUND = 404;
const WIDE = { width: 960, viewport: { width: 1440, height: 1000 } } as const;
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

/** The external server the root reaches. */
const scriptedServer: typeof fetch = (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (request.method === "GET" && url.hostname === PROXY_HOST && url.pathname === "/v1/models") {
    return Promise.resolve(
      Response.json({
        object: "list",
        data: [
          { id: SEED_MODEL, object: "model" },
          { id: ID_ONLY_MODEL, object: "model" },
          { id: STATED_MODEL, object: "model", ["context_length"]: STATED_WINDOW },
        ],
      }),
    );
  }
  // Every other read (a server-identity probe, a native model-info route) answers as a server without that route.
  return Promise.resolve(new Response("{}", { status: HTTP_NOT_FOUND }));
};

async function freshRoot(): Promise<ServerTestHarness> {
  return await createServerHarness({
    startJobs: false,
    providerFetch: scriptedServer,
    networkExecution: {
      fetch: scriptedServer,
      resolver: (hostname: string): Promise<string[]> =>
        hostname === PROXY_HOST ? Promise.resolve([PUBLIC_ADDRESS]) : Promise.reject(new Error(`Unscripted address: ${hostname}`)),
    },
    secretBoxKey: Buffer.alloc(32, 23),
  });
}

/** A saved key with one connection on it, and the Connections list mounted over the root. */
async function mountSavedKey({ page, mount }: { readonly page: Page; readonly mount: PlaywrightTestArgs["mount"] }, caller: Caller): Promise<TrpcRecorder> {
  const credential = await caller.credentials.add({ provider: PROXY_PROVIDER, key: PROXY_KEY });
  await caller.connection.create({ providerId: PROXY_PROVIDER, credentialId: credential.id, baseUrl: PROXY_URL, model: SEED_MODEL, label: SEED_LABEL });
  const calls = await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...READS]));
  await mount<typeof ConnectionLimitsStory>(STORY, { width: WIDE.width, appearance: appearanceSettingsSchema.parse({}) });
  return calls;
}

/** Opens the add-another-model dialog from the seed row's menu and picks `model` from the key's list. */
async function openAndPick(page: Page, model: string): Promise<Locator> {
  const row = page.locator('[data-slot="list-row-root"]').filter({ hasText: SEED_LABEL });
  await row.getByRole("button", { name: new RegExp(`^${RegExp.escape(moreActionsName(""))}`, "u") }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${RegExp.escape(ADD_MODEL_ACTION_LABELS.key)}`, "u") }).click();
  const dialog = page.getByRole("dialog", { name: ADD_MODEL_ACTION_LABELS.key, exact: true });
  await dialog
    .getByRole("option", { name: new RegExp(RegExp.escape(model), "u") })
    .first()
    .click();
  return dialog;
}

function limitsStep(page: Page): Locator {
  return page.getByRole("dialog", { name: CONNECTION_LIMITS_TITLE, exact: true });
}

/** The connection the dialog saved for `model`; a fresh root holds only the seed row beside its built-in embedder. */
async function addedConnection(caller: Caller, model: string): Promise<Awaited<ReturnType<Caller["connection"]["list"]>>[number]> {
  const connection = (await caller.connection.list()).find((row) => row.model === model);
  if (connection === undefined) {
    throw new Error(`The dialog saved no connection on ${model}`);
  }
  return connection;
}

test.use({ viewport: WIDE.viewport });

test("a model whose window the key's list does not state asks for the real limits and stores them on the new connection", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const calls = await mountSavedKey({ page, mount }, caller);
  const dialog = await openAndPick(page, ID_ONLY_MODEL);
  await dialog.getByRole("button", { name: ADD_CONNECTION_NAME, exact: true }).click();

  const step = limitsStep(page);
  await expect(step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.window, { exact: true })).toBeVisible();
  expect(calls.inputs("connection.capabilities")).toContainEqual(expect.objectContaining({ listFacts: true }));
  await step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.window, { exact: true }).fill(TYPED.window);
  await step.getByRole("button", { name: CONNECTION_LIMITS_SAVE_NAME, exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const added = await addedConnection(caller, ID_ONLY_MODEL);
  expect(added.declared?.generation).toMatchObject({ context: { window: REAL.window } });
  // The seed row is another connection on the same key, and its declaration is untouched.
  expect((await addedConnection(caller, SEED_MODEL)).declared?.generation).toBeUndefined();
});

test("a model whose window the key's list states asks no limit, only for the image guess", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const calls = await mountSavedKey({ page, mount }, caller);
  const dialog = await openAndPick(page, STATED_MODEL);
  await dialog.getByRole("button", { name: ADD_CONNECTION_NAME, exact: true }).click();

  const step = limitsStep(page);
  await expect(step.getByRole("switch", { name: IMAGE_SWITCH_NAME, exact: true })).toBeVisible();
  await expect(step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.window, { exact: true })).toHaveCount(0);
  await step.getByRole("button", { name: CONNECTION_LIMITS_KEEP_NAME, exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The step's own read ran and found nothing to ask, and the row it read states the provider's window.
  expect(calls.inputs("connection.capabilities")).toContainEqual(expect.objectContaining({ listFacts: true }));
  const added = await addedConnection(caller, STATED_MODEL);
  expect(added.declared?.generation).toBeUndefined();
  const view = await caller.connection.capabilities({ connectionId: added.id, listFacts: true });
  expect(view.capability).toMatchObject({ generation: { context: { window: STATED_WINDOW } } });
});

test("closing at the limits step opens the next add on the model picker, not the step", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  await mountSavedKey({ page, mount }, caller);
  const dialog = await openAndPick(page, ID_ONLY_MODEL);
  await dialog.getByRole("button", { name: ADD_CONNECTION_NAME, exact: true }).click();
  // Positive control: the step is up, and the saved row exists, so a reopened dialog that shows it is the stale one.
  await expect(limitsStep(page).getByRole("button", { name: CONNECTION_LIMITS_KEEP_NAME, exact: true })).toBeVisible();
  await page.getByRole("button", { name: DIALOG_VERBS.close, exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const row = page.locator('[data-slot="list-row-root"]').filter({ hasText: SEED_LABEL });
  await row.getByRole("button", { name: new RegExp(`^${RegExp.escape(moreActionsName(""))}`, "u") }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${RegExp.escape(ADD_MODEL_ACTION_LABELS.key)}`, "u") }).click();
  await expect(page.getByRole("dialog", { name: ADD_MODEL_ACTION_LABELS.key, exact: true })).toBeVisible();
  await expect(limitsStep(page)).toHaveCount(0);
});
