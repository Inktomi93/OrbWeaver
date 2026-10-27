// The Add connection dialog through the real Connections section: the model picker takes the caret when its list lands
// and centres the row a keyboard pick lands on; a refused save puts focus on its inline failure; a saved connection
// hands focus to the Add connection button that replaces the one the empty state drew.
import { modelListingSchema, providerDisplayLabel } from "@orb/contracts/inference";
import type { trpcHold } from "@orb/testkit/ct";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { ConnectionsListStory } from "./_connections-list-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connections-list-stories/ConnectionsListStory";
const SERVED = ["sessions.me", "connection.list", "connection.listBindings", "credentials.list", "credentials.storageStatus"] as const;
const MODEL_COUNT = 80;
const PICKED_INDEX = 45;
const ADD = { name: "Add connection", exact: true } as const;

let root: Awaited<ReturnType<typeof createCorpusHarness>>;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

const catalog = modelListingSchema.parse({
  listed: true,
  models: Array.from({ length: MODEL_COUNT }, (_, index) => ({
    id: `vendor/model-${String(index).padStart(2, "0")}`,
    name: `Model ${String(index).padStart(2, "0")}`,
    contextLength: null,
    promptPrice: null,
    completionPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    inputModalities: [],
    supportedParameters: [],
  })),
});

/** The root's caller, and the one provider whose catalog is built in (so its list is read the moment it is picked). */
async function scenario(): Promise<{
  readonly caller: Awaited<ReturnType<typeof root.internalCallerFor>>;
  readonly label: string;
  readonly providerId: string;
  readonly providers: Awaited<ReturnType<Awaited<ReturnType<typeof root.internalCallerFor>>["connection"]["providersAvailable"]>>;
}> {
  const caller = await root.internalCallerFor(root.ownerId);
  const available = await caller.connection.providersAvailable();
  const device = available.find((entry) => entry.provider.catalog === "builtin");
  if (device === undefined) {
    throw new Error("The corpus root offers no provider with a built-in catalog");
  }
  const providers = available.map((entry) => (entry.provider.id === device.provider.id ? { ...entry, available: true } : entry));
  return { caller, label: providerDisplayLabel(device.provider), providerId: device.provider.id, providers };
}

async function pickDeviceProvider(page: Page, label: string): Promise<Locator> {
  await page.getByRole("button", ADD).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Provider", exact: true }).click();
  await page.getByRole("option", { name: label }).first().click();
  return dialog;
}

test("the model list takes the caret when it lands, and a keyboard pick is centred in the list", async ({ corpus, mount, page }) => {
  const { caller, label, providerId, providers } = await scenario();
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    "connection.providersAvailable": () => providers,
    "connection.draftCatalogModels": (input) => {
      if (input.providerId !== providerId) {
        throw new Error(`The model list was asked for ${input.providerId}, not the provider under test`);
      }
      return catalog;
    },
  });
  await mount<typeof ConnectionsListStory>(STORY, {});
  const dialog = await pickDeviceProvider(page, label);

  await expect(dialog.getByPlaceholder("Search models…")).toBeFocused();
  for (let step = 0; step <= PICKED_INDEX; step += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Enter");
  const list = dialog.locator('[data-slot="command-list"]');
  const row = dialog.getByRole("option", { name: new RegExp(`Model ${String(PICKED_INDEX).padStart(2, "0")}`, "u") });
  await expect
    .poll(async () => {
      const [listBox, rowBox] = await Promise.all([list.boundingBox(), row.boundingBox()]);
      return listBox === null || rowBox === null ? Number.POSITIVE_INFINITY : Math.abs(rowBox.y + rowBox.height / 2 - (listBox.y + listBox.height / 2));
    })
    .toBeLessThan(2);
});

test("a refused save puts focus on the inline failure", async ({ corpus, mount, page }) => {
  const { caller, label, providerId, providers } = await scenario();
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SERVED, "connection.create"]),
    "connection.providersAvailable": () => providers,
    "connection.draftCatalogModels": (input) => {
      if (input.providerId !== providerId) {
        throw new Error(`The model list was asked for ${input.providerId}, not the provider under test`);
      }
      return catalog;
    },
  });
  await mount<typeof ConnectionsListStory>(STORY, {});
  const dialog = await pickDeviceProvider(page, label);
  await expect(dialog.getByPlaceholder("Search models…")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", ADD).click();
  await expect(dialog.locator('[data-slot="add-connection-failure"]')).toBeFocused();
});

test("a saved first connection hands focus to the Add connection button that replaces the empty state's", async ({ corpus, mount, page }) => {
  const { caller, label, providers } = await scenario();
  // The corpus owner already holds connections; the list stays empty until the create the test makes lands.
  const served = serveCorpusProcedures(caller, ["connection.list", "connection.create"]);
  // A served responder is the hold marker the server's answer settles; the union it is typed as also admits plain values.
  const answer = <Marker,>(route: unknown, input: unknown): Marker => Reflect.apply(route as (input: unknown) => Marker, undefined, [input]);
  let created = false;
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "connection.listBindings",
      "credentials.list",
      "credentials.storageStatus",
      "connection.draftCatalogModels",
    ]),
    "connection.list": (input) => (created ? answer<ReturnType<typeof trpcHold<"connection.list">>>(served["connection.list"], input) : []),
    "connection.create": (input) => {
      created = true;
      return answer<ReturnType<typeof trpcHold<"connection.create">>>(served["connection.create"], input);
    },
    "connection.providersAvailable": () => providers,
  });
  await mount<typeof ConnectionsListStory>(STORY, {});
  await expect(page.getByText("No connections yet", { exact: true })).toBeVisible();
  const dialog = await pickDeviceProvider(page, label);
  await expect(dialog.getByPlaceholder("Search models…")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", ADD).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("No connections yet", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", ADD)).toBeFocused();
});
