// The model picker offers a capability chip only where it splits the list: Vision when some listed models see images
// and some do not, Tools when some state tool use and some do not. A list where no model, or every model, passes a
// chip shows no chip for it, so a chip can never empty the list.
import type { ProviderDef } from "@orb/contracts/inference";
import { modelListingSchema, providerDisplayLabel, TOOLS_PARAMETER } from "@orb/contracts/inference";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import { ADD_CONNECTION_NAME, CONNECTION_PROVIDER_FIELD_NAME } from "#client/features/credentials/lib/connections-copy.ts";
import { API_KEY_FIELD_NAME, MODEL_TOOLS_LABEL, MODEL_VISION_LABEL } from "#client/features/credentials/lib/credentials-names.ts";
import type { ConnectionsListStory } from "./_connections-list-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connections-list-stories/ConnectionsListStory";
const SERVED = ["sessions.me", "connection.list", "connection.listBindings", "credentials.list", "credentials.storageStatus"] as const;
const PASTED_KEY = "synthetic-pasted-key";
const FILTER_GROUP_NAME = "Filter models";
const PUBLIC_CATALOG_PROVIDER = "openrouter";

type MountFn = PlaywrightTestArgs["mount"];
type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

/** A root with key storage on, so the dialog offers the key field a hosted list reads under. */
function keyedRoot(): Promise<Root> {
  return createCorpusHarness(undefined, { secretBoxKey: Buffer.alloc(32, 17) });
}
type Listing = ReturnType<typeof modelListingSchema.parse>;

interface Model {
  readonly name: string;
  readonly input?: readonly string[];
  readonly tools?: boolean;
}

function listingOf(models: readonly Model[]): Listing {
  return modelListingSchema.parse({
    listed: true,
    models: models.map((model) => ({
      id: `vendor/${model.name}`,
      name: `Model ${model.name}`,
      contextLength: null,
      promptPrice: null,
      completionPrice: null,
      cacheReadPrice: null,
      cacheWritePrice: null,
      inputModalities: model.input ?? [],
      supportedParameters: model.tools === true ? [TOOLS_PARAMETER] : [],
    })),
  });
}

/** Opens Add connection on a hosted provider and lists `listing` under a pasted key. */
async function dialogListing(
  root: Root,
  listing: Listing,
  harness: { readonly corpus: CorpusPlayback; readonly mount: MountFn; readonly page: Page },
): Promise<Locator> {
  const { corpus, mount, page } = harness;
  const caller = await root.internalCallerFor(root.ownerId);
  const offered = await caller.connection.providersAvailable();
  const provider: ProviderDef | undefined = offered.find(
    (entry) => entry.provider.auth === "apiKey" && entry.provider.id !== PUBLIC_CATALOG_PROVIDER,
  )?.provider;
  if (provider === undefined) {
    throw new Error("The corpus root offers no hosted provider that lists under a key");
  }
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    "connection.providersAvailable": () => offered.map((entry) => (entry.provider.id === provider.id ? { ...entry, available: true } : entry)),
    "connection.draftCatalogModels": () => listing,
  });
  await mount<typeof ConnectionsListStory>(STORY, {});
  await page.getByRole("button", { name: ADD_CONNECTION_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: CONNECTION_PROVIDER_FIELD_NAME, exact: true }).click();
  await page
    .getByRole("option", { name: providerDisplayLabel(provider) })
    .first()
    .click();
  await dialog.getByRole("textbox", { name: API_KEY_FIELD_NAME, exact: true }).fill(PASTED_KEY);
  await expect(dialog.getByRole("option", { name: /Model /u }).first()).toBeVisible();
  return dialog;
}

function listedIds(dialog: Locator): Promise<string[]> {
  return dialog
    .getByRole("option", { name: /Model /u })
    .evaluateAll((options) => options.map((option) => /vendor\/[a-z]+/u.exec(option.textContent)?.[0] ?? ""));
}

test("a list where every model reads text only shows no chips", async ({ corpus, mount, page }) => {
  await using root = await keyedRoot();
  const dialog = await dialogListing(
    root,
    listingOf([
      { name: "plain", input: ["text"] },
      { name: "other", input: ["text"] },
    ]),
    { corpus, mount, page },
  );
  await expect(dialog.getByRole("group", { name: FILTER_GROUP_NAME })).toHaveCount(0);
  expect(await listedIds(dialog)).toEqual(["vendor/plain", "vendor/other"]);
});

test("a list where some models see images offers Vision only, and it keeps those models", async ({ corpus, mount, page }) => {
  await using root = await keyedRoot();
  const dialog = await dialogListing(
    root,
    listingOf([
      { name: "seer", input: ["text", "image"] },
      { name: "plain", input: ["text"] },
    ]),
    { corpus, mount, page },
  );
  const group = dialog.getByRole("group", { name: FILTER_GROUP_NAME });
  await expect(group.getByRole("button", { name: MODEL_TOOLS_LABEL, exact: true })).toHaveCount(0);
  await group.getByRole("button", { name: MODEL_VISION_LABEL, exact: true }).click();
  await expect.poll(() => listedIds(dialog)).toEqual(["vendor/seer"]);
});

test("a list where some models take tools offers Tools, and it keeps those models, never none", async ({ corpus, mount, page }) => {
  await using root = await keyedRoot();
  const dialog = await dialogListing(
    root,
    listingOf([
      { name: "caller", input: ["text"], tools: true },
      { name: "plain", input: ["text"] },
      { name: "helper", input: ["text"], tools: true },
    ]),
    { corpus, mount, page },
  );
  const group = dialog.getByRole("group", { name: FILTER_GROUP_NAME });
  await expect(group.getByRole("button", { name: MODEL_VISION_LABEL, exact: true })).toHaveCount(0);
  await group.getByRole("button", { name: MODEL_TOOLS_LABEL, exact: true }).click();
  await expect.poll(() => listedIds(dialog)).toEqual(["vendor/caller", "vendor/helper"]);
});
