// The Add connection dialog reads a provider's model list the moment the draft can be listed, with no List models press:
// a public catalog on pick, a hosted catalog once a key is pasted or a saved key is chosen. An own server still waits
// for the press, because a half-typed URL is not a draft.
import type { ProviderDef } from "@orb/contracts/inference";
import { modelListingSchema, providerDisplayLabel, providerIdSchema } from "@orb/contracts/inference";
import type { TrpcInput } from "@orb/testkit/ct";
import { absenceWindow, createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import { ADD_CONNECTION_NAME, CONNECTION_PROVIDER_FIELD_NAME } from "#client/features/credentials/lib/connections-copy.ts";
import { API_KEY_FIELD_NAME, API_KEY_OPTIONAL_FIELD_NAME, LIST_MODELS_NAME } from "#client/features/credentials/lib/credentials-names.ts";
import type { ConnectionsListStory } from "./_connections-list-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connections-list-stories/ConnectionsListStory";
const SERVED = ["sessions.me", "connection.list", "connection.listBindings", "credentials.list", "credentials.storageStatus"] as const;
const ADD = { name: ADD_CONNECTION_NAME, exact: true } as const;
const PASTED_KEY = "synthetic-pasted-key";
const SAVED_KEY_FIELD_NAME = "Saved key";
const PUBLIC_CATALOG_PROVIDER = providerIdSchema.parse("openrouter");
// Longer than the settle the dialog waits for after the last keystroke, so a request that was going to fire has.
const SETTLE_WINDOW_MS = 1200;

type MountFn = PlaywrightTestArgs["mount"];
type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type DraftRequest = TrpcInput<"connection.draftCatalogModels">;

const catalog = modelListingSchema.parse({
  listed: true,
  models: ["alpha", "beta", "gamma"].map((name) => ({
    id: `vendor/${name}`,
    name: `Model ${name}`,
    contextLength: null,
    promptPrice: null,
    completionPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    inputModalities: [],
    supportedParameters: [],
  })),
});
const LISTED_ROW = /Model alpha/u;

interface KeyedRoot extends AsyncDisposable {
  readonly root: Root;
  readonly providers: readonly ProviderDef[];
}

/** A root with key storage on (the key field and the saved-key choice only exist then), and its offered providers. */
async function keyedRoot(): Promise<KeyedRoot> {
  await using construction = new AsyncDisposableStack();
  const root = construction.use(await createCorpusHarness(undefined, { secretBoxKey: Buffer.alloc(32, 17) }));
  const caller = await root.internalCallerFor(root.ownerId);
  const providers = (await caller.connection.providersAvailable()).map((entry) => entry.provider);
  const lifetime = construction.move();
  return { root, providers, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

function providerWhere(providers: readonly ProviderDef[], matches: (provider: ProviderDef) => boolean, what: string): ProviderDef {
  const found = providers.find(matches);
  if (found === undefined) {
    throw new Error(`The corpus root offers no ${what}`);
  }
  return found;
}

/** Mounts the Connections section and opens Add connection on `provider`; every list request lands in `requests`. */
async function openDialogOn(
  root: Root,
  provider: ProviderDef,
  harness: { readonly corpus: CorpusPlayback; readonly mount: MountFn; readonly page: Page },
  requests: DraftRequest[],
): Promise<Locator> {
  const { corpus, mount, page } = harness;
  const caller = await root.internalCallerFor(root.ownerId);
  const providers = (await caller.connection.providersAvailable()).map((entry) => (entry.provider.id === provider.id ? { ...entry, available: true } : entry));
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    "connection.providersAvailable": () => providers,
    "connection.draftCatalogModels": (input) => {
      requests.push(input);
      return catalog;
    },
  });
  await mount<typeof ConnectionsListStory>(STORY, {});
  await page.getByRole("button", ADD).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: CONNECTION_PROVIDER_FIELD_NAME, exact: true }).click();
  await page
    .getByRole("option", { name: providerDisplayLabel(provider) })
    .first()
    .click();
  return dialog;
}

test("a provider whose catalog is public lists on pick with no key and no List models press", async ({ corpus, mount, page }) => {
  await using keyed = await keyedRoot();
  const { root, providers } = keyed;
  const requests: DraftRequest[] = [];
  const provider = providerWhere(providers, (candidate) => candidate.id === PUBLIC_CATALOG_PROVIDER, "public-catalog provider");
  const dialog = await openDialogOn(root, provider, { corpus, mount, page }, requests);

  await expect(dialog.getByRole("option", { name: LISTED_ROW })).toBeVisible();
  expect(requests).toEqual([{ providerId: PUBLIC_CATALOG_PROVIDER }]);
  await expect(dialog.getByRole("button", { name: LIST_MODELS_NAME, exact: true })).toHaveCount(0);

  // The key changes nothing about a public catalog, so pasting one is not a second read.
  await dialog.getByRole("textbox", { name: API_KEY_FIELD_NAME, exact: true }).fill(PASTED_KEY);
  await absenceWindow(page, SETTLE_WINDOW_MS);
  expect(requests).toHaveLength(1);
  await expect(dialog.getByRole("option", { name: LISTED_ROW })).toBeVisible();
});

for (const device of [
  { label: "desktop", width: 1280, height: 800, coarse: false },
  { label: "phone", width: 390, height: 844, coarse: true },
] as const) {
  test.describe(`a hosted catalog lists under a pasted key (${device.label})`, () => {
    test.use({ hasTouch: device.coarse, isMobile: device.coarse, viewport: { width: device.width, height: device.height } });

    test("pasting the key lists it, with no List models press", async ({ corpus, mount, page }) => {
      await using keyed = await keyedRoot();
      const { root, providers } = keyed;
      const requests: DraftRequest[] = [];
      const provider = providerWhere(
        providers,
        (candidate) => candidate.auth === "apiKey" && candidate.id !== PUBLIC_CATALOG_PROVIDER,
        "hosted provider that lists under a key",
      );
      const dialog = await openDialogOn(root, provider, { corpus, mount, page }, requests);
      const key = dialog.getByRole("textbox", { name: API_KEY_FIELD_NAME, exact: true });

      await expect(key).toBeVisible();
      await expect(dialog.getByRole("button", { name: LIST_MODELS_NAME, exact: true })).toHaveCount(0);
      await absenceWindow(page, SETTLE_WINDOW_MS);
      expect(requests).toHaveLength(0);

      await key.fill(PASTED_KEY);
      await expect(dialog.getByRole("option", { name: LISTED_ROW })).toBeVisible();
      expect(requests).toEqual([{ providerId: provider.id, key: PASTED_KEY }]);
    });

    test("typing the key is one read of the whole key, not one per keystroke", async ({ corpus, mount, page }) => {
      await using keyed = await keyedRoot();
      const { root, providers } = keyed;
      const requests: DraftRequest[] = [];
      const provider = providerWhere(
        providers,
        (candidate) => candidate.auth === "apiKey" && candidate.id !== PUBLIC_CATALOG_PROVIDER,
        "hosted provider that lists under a key",
      );
      const dialog = await openDialogOn(root, provider, { corpus, mount, page }, requests);

      await dialog.getByRole("textbox", { name: API_KEY_FIELD_NAME, exact: true }).pressSequentially(PASTED_KEY);
      await expect(dialog.getByRole("option", { name: LISTED_ROW })).toBeVisible();
      await absenceWindow(page, SETTLE_WINDOW_MS);
      expect(requests).toEqual([{ providerId: provider.id, key: PASTED_KEY }]);
    });
  });
}

test("choosing a saved key lists under that key with no press", async ({ corpus, mount, page }) => {
  await using keyed = await keyedRoot();
  const { root, providers } = keyed;
  const requests: DraftRequest[] = [];
  const provider = providerWhere(
    providers,
    (candidate) => candidate.auth === "apiKey" && candidate.id !== PUBLIC_CATALOG_PROVIDER,
    "hosted provider that lists under a key",
  );
  const caller = await root.internalCallerFor(root.ownerId);
  const saved = await caller.credentials.add({ provider: provider.id, key: PASTED_KEY, label: "Work key" });
  const dialog = await openDialogOn(root, provider, { corpus, mount, page }, requests);

  await dialog.getByRole("combobox", { name: SAVED_KEY_FIELD_NAME, exact: true }).click();
  await page.getByRole("option", { name: "Work key" }).click();
  await expect(dialog.getByRole("option", { name: LISTED_ROW })).toBeVisible();
  expect(requests).toEqual([{ providerId: provider.id, credentialId: saved.id }]);
});

test("an own server still lists on the press, never while its URL is half typed", async ({ corpus, mount, page }) => {
  await using keyed = await keyedRoot();
  const { root, providers } = keyed;
  const requests: DraftRequest[] = [];
  const provider = providerWhere(providers, (candidate) => candidate.auth === "endpoint", "own-server provider");
  const dialog = await openDialogOn(root, provider, { corpus, mount, page }, requests);

  await dialog.getByRole("textbox", { name: "Server URL", exact: true }).pressSequentially("http://localhost:11434");
  await dialog.getByRole("textbox", { name: API_KEY_OPTIONAL_FIELD_NAME, exact: true }).fill(PASTED_KEY);
  await absenceWindow(page, SETTLE_WINDOW_MS);
  expect(requests).toHaveLength(0);

  await dialog.getByRole("button", { name: LIST_MODELS_NAME, exact: true }).click();
  await expect(dialog.getByRole("option", { name: LISTED_ROW })).toBeVisible();
  expect(requests).toHaveLength(1);
});
