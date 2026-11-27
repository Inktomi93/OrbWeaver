// The Add connection dialog through the real Connections section: the model picker takes the caret when its list lands
// and centres the row a keyboard pick lands on; a refused save puts focus on its inline failure; a saved connection
// hands focus to the Add connection button that replaces the one the empty state drew.
import type { ConnectionRefusalTarget } from "@orb/client/lib";
import { connectionFieldRefusalOf } from "@orb/client/lib";
import type { ProviderAuth, ProviderId } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES, modelListingSchema, providerDisplayLabel } from "@orb/contracts/inference";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import { ADD_CONNECTION_NAME, CONNECTION_PROVIDER_FIELD_NAME } from "#client/features/credentials/lib/connections-copy.ts";
import {
  API_KEY_FIELD_NAME,
  API_KEY_OPTIONAL_FIELD_NAME,
  CONNECTIONS_EMPTY_TITLE,
  MODEL_SEARCH_PLACEHOLDER,
  SETUP_TOKEN_FIELD_NAME,
} from "#client/features/credentials/lib/credentials-names.ts";
import type { ConnectionsListStory } from "./_connections-list-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connections-list-stories/ConnectionsListStory";
const SERVED = ["sessions.me", "connection.list", "connection.listBindings", "credentials.list", "credentials.storageStatus"] as const;
const SERVER_SENTENCE = "The server's own sentence.";
const MODEL_COUNT = 80;
const PICKED_INDEX = 45;
const ADD = { name: ADD_CONNECTION_NAME, exact: true } as const;

type MountFn = PlaywrightTestArgs["mount"];

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
  readonly providerId: ProviderId;
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
  await dialog.getByRole("combobox", { name: CONNECTION_PROVIDER_FIELD_NAME, exact: true }).click();
  await page.getByRole("option", { name: label }).first().click();
  return dialog;
}

// The key field's name says what the provider asks for: a key it requires, an optional bearer for an endpoint, or a setup
// token. Each case picks a provider by its own auth kind, so the name it expects is chosen by the test's state.
for (const { auth, field } of [
  { auth: "apiKey", field: API_KEY_FIELD_NAME },
  { auth: "endpoint", field: API_KEY_OPTIONAL_FIELD_NAME },
  { auth: "oauthToken", field: SETUP_TOKEN_FIELD_NAME },
] as const) {
  test(`an ${auth} provider's key field is named for what it asks`, async ({ corpus, mount, page }) => {
    // The corpus root keeps key storage off, which hides every key field; this root turns it on.
    await using keyed = await createCorpusHarness(undefined, { secretBoxKey: Buffer.alloc(32, 17) });
    const dialog = await openDialogOnAuth(keyed, { corpus, mount, page }, auth);
    await expect(dialog.getByLabel(field, { exact: true })).toBeVisible();
  });
}

/** Opens the Add connection dialog on the first provider signed in by `auth`. */
async function openDialogOnAuth(
  keyed: Awaited<ReturnType<typeof createCorpusHarness>>,
  { corpus, mount, page }: { readonly corpus: CorpusPlayback; readonly mount: MountFn; readonly page: Page },
  auth: ProviderAuth,
): Promise<Locator> {
  const caller = await keyed.internalCallerFor(keyed.ownerId);
  const available = await caller.connection.providersAvailable();
  const picked = available.find((entry) => entry.provider.auth === auth);
  if (picked === undefined) {
    throw new Error(`The corpus root offers no ${auth} provider`);
  }
  const providers = available.map((entry) => (entry.provider.id === picked.provider.id ? { ...entry, available: true } : entry));
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, keyed.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    "connection.providersAvailable": () => providers,
    "connection.draftCatalogModels": (input) => {
      if (input.providerId !== picked.provider.id) {
        throw new Error(`The model list was asked for ${input.providerId}, not the ${auth} provider under test`);
      }
      return catalog;
    },
  });
  await mount<typeof ConnectionsListStory>(STORY, {});
  return await pickDeviceProvider(page, providerDisplayLabel(picked.provider));
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

  await expect(dialog.getByPlaceholder(MODEL_SEARCH_PLACEHOLDER)).toBeFocused();
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
  await expect(dialog.getByPlaceholder(MODEL_SEARCH_PLACEHOLDER)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", ADD).click();
  await expect(dialog.locator('[data-slot="add-connection-failure"]')).toBeFocused();
});

// Each refusal the create can meet is said in the dialog's own words, under the field that holds its fix when this form
// has one (the device provider's form has the provider, the model and the label) and on the failure line for all of them.
// The refusal is scripted at the wire as the server's formatter sends it. Red: a dropped branch of `connectionFieldRefusalOf`
// leaves the server's sentence on the line and nothing under the field.
const CREATE_REFUSALS = [
  CONNECTION_OP_CODES.labelEmpty,
  CONNECTION_OP_CODES.providerUnknown,
  CONNECTION_OP_CODES.apiIncoherent,
  CONNECTION_OP_CODES.baseUrlShape,
  CONNECTION_OP_CODES.modelNotInCatalog,
  CONNECTION_OP_CODES.modelIdShape,
  CONNECTION_OP_CODES.taskUnservable,
  CONNECTION_OP_CODES.credentialForeign,
] as const;

// How many fields of the device provider's form hold the fix for each refusal target: it has a provider, a model and a label,
// and no protocol, URL or saved-key control, so those refusals are said on the failure line alone.
const FIELDS_ON_DEVICE_FORM: Readonly<Record<ConnectionRefusalTarget, number>> = {
  label: 1,
  provider: 1,
  model: 1,
  api: 0,
  baseUrl: 0,
  credential: 0,
  connection: 0,
};

async function submitRefused(
  reason: (typeof CREATE_REFUSALS)[number],
  { corpus, mount, page }: { readonly corpus: CorpusPlayback; readonly mount: MountFn; readonly page: Page },
): Promise<{ readonly line: Locator; readonly said: string; readonly fieldLine: Locator; readonly onField: number }> {
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
    ...serveCorpusProcedures(caller, ["connection.create"], (input) =>
      input.providerId === providerId ? trpcError({ code: "BAD_REQUEST", reason, message: SERVER_SENTENCE }) : undefined,
    ),
  });
  await mount<typeof ConnectionsListStory>(STORY, {});
  const dialog = await pickDeviceProvider(page, label);
  await expect(dialog.getByPlaceholder(MODEL_SEARCH_PLACEHOLDER)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", ADD).click();

  const refusal = connectionFieldRefusalOf({ data: { code: "BAD_REQUEST", reason } });
  if (refusal === null) {
    throw new Error(`${reason} is a connection write refusal, so the form reads it`);
  }
  return {
    line: dialog.locator('[data-slot="add-connection-failure"]'),
    said: refusal.copy.replace(/\.$/u, ""),
    fieldLine: dialog.getByText(refusal.copy, { exact: true }),
    onField: FIELDS_ON_DEVICE_FORM[refusal.target],
  };
}

for (const reason of CREATE_REFUSALS) {
  test(`a ${reason} refusal of the create is said in the dialog's own words`, async ({ corpus, mount, page }) => {
    const { line, said, fieldLine, onField } = await submitRefused(reason, { corpus, mount, page });
    await expect(fieldLine).toHaveCount(onField);
    await expect(line).toContainText(said);
    await expect(line).not.toContainText(SERVER_SENTENCE);
  });
}

test("the Add connection button waits for a provider", async ({ corpus, mount, page }) => {
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
  await page.getByRole("button", ADD).click();
  const dialog = page.getByRole("dialog");
  const submit = dialog.getByRole("button", ADD);
  await expect(submit).toBeDisabled();

  await dialog.getByRole("combobox", { name: CONNECTION_PROVIDER_FIELD_NAME, exact: true }).click();
  await page.getByRole("option", { name: label }).first().click();
  await expect(submit).toBeEnabled();
});

test("a saved first connection hands focus to the Add connection button that replaces the empty state's", async ({ corpus, mount, page }) => {
  const { caller, label, providers } = await scenario();
  // The corpus owner already holds connections; the list stays empty until the create the test makes lands.
  const served = serveCorpusProcedures(caller, ["connection.list", "connection.create"]);
  // A served route is typed as a responder or a plain value; the served one is always a responder.
  const serveList = served["connection.list"];
  const serveCreate = served["connection.create"];
  let created = false;
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "connection.listBindings",
      "credentials.list",
      "credentials.storageStatus",
      "connection.draftCatalogModels",
      "connection.capabilities",
    ]),
    "connection.list": (input) => {
      if (!created) {
        return [];
      }
      return typeof serveList === "function" ? serveList(input) : serveList;
    },
    "connection.create": (input) => {
      created = true;
      return typeof serveCreate === "function" ? serveCreate(input) : serveCreate;
    },
    "connection.providersAvailable": () => providers,
  });
  await mount<typeof ConnectionsListStory>(STORY, {});
  await expect(page.getByText(CONNECTIONS_EMPTY_TITLE, { exact: true })).toBeVisible();
  const dialog = await pickDeviceProvider(page, label);
  await expect(dialog.getByPlaceholder(MODEL_SEARCH_PLACEHOLDER)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", ADD).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(CONNECTIONS_EMPTY_TITLE, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", ADD)).toBeFocused();
});
