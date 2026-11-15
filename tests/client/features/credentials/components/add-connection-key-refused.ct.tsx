// @subject packages/client/src/features/credentials/components/add-connection-form-body.tsx
// @subject packages/client/src/features/credentials/lib/model-picker-model.ts
// Adding a hosted connection on a key the provider refuses: the model field says in one sentence that the key was
// refused and where a new one comes from, with no retry under the same key, and the add is refused with nothing saved.
// The list is read by the composed root's real draft catalog door, whose provider transport answers 401.
import { providerDisplayLabel, providerIdSchema } from "@orb/contracts/inference";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { KEY_REFUSED_SAVE_REASON, submitFailureSentence } from "#client/features/credentials/lib/add-connection-form-model.ts";
import { ADD_CONNECTION_NAME, CONNECTION_PROVIDER_FIELD_NAME } from "#client/features/credentials/lib/connections-copy.ts";
import { API_KEY_FIELD_NAME, MODEL_FIELD_NAME, MODEL_LIST_RETRY_NAME } from "#client/features/credentials/lib/credentials-names.ts";
import { keyRefusedNotice } from "#client/features/credentials/lib/model-picker-model.ts";
import type { ConnectionsListStory } from "./_connections-list-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connections-list-stories/ConnectionsListStory";
const SERVED = [
  "sessions.me",
  "connection.list",
  "connection.listBindings",
  "credentials.list",
  "credentials.storageStatus",
  "connection.draftCatalogModels",
  "credentials.add",
  "connection.create",
  "connection.capabilities",
] as const;
const ADD = { name: ADD_CONNECTION_NAME, exact: true } as const;
const PROVIDER = providerIdSchema.parse("openai");
const REFUSED_KEY = "synthetic-refused-key";
const TYPED_MODEL = "gpt-5-mini";
const PUBLIC_ADDRESS = "93.184.215.14";
const HTTP_UNAUTHORIZED = 401;
const REFUSAL_BODY = { error: { message: "Incorrect API key provided", type: "invalid_request_error", code: "invalid_api_key" } };

test("a key the provider refuses is named on the model field and the add is refused with nothing saved", async ({ corpus, mount, page }) => {
  const refusing: typeof fetch = () => Promise.resolve(Response.json(REFUSAL_BODY, { status: HTTP_UNAUTHORIZED }));
  await using root = await createCorpusHarness(undefined, {
    secretBoxKey: Buffer.alloc(32, 17),
    providerFetch: refusing,
    networkExecution: { fetch: refusing, resolver: () => Promise.resolve([PUBLIC_ADDRESS]) },
  });
  const caller = await root.internalCallerFor(root.ownerId);
  const available = await caller.connection.providersAvailable();
  const provider = available.find((entry) => entry.provider.id === PROVIDER)?.provider;
  if (provider === undefined) {
    throw new Error("The corpus root offers no OpenAI provider");
  }
  const connectionsBefore = (await caller.connection.list()).length;
  const keysBefore = (await caller.credentials.list()).length;
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    "connection.providersAvailable": () => available.map((entry) => (entry.provider.id === PROVIDER ? { ...entry, available: true } : entry)),
  });
  await mount<typeof ConnectionsListStory>(STORY, {});
  await page.getByRole("button", ADD).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: CONNECTION_PROVIDER_FIELD_NAME, exact: true }).click();
  await page
    .getByRole("option", { name: providerDisplayLabel(provider) })
    .first()
    .click();
  await dialog.getByRole("textbox", { name: API_KEY_FIELD_NAME, exact: true }).fill(REFUSED_KEY);

  await expect(dialog.locator('[data-slot="model-picker-notice"]')).toHaveText(keyRefusedNotice(providerDisplayLabel(provider)));
  await expect(dialog.getByRole("button", { name: MODEL_LIST_RETRY_NAME, exact: true })).toHaveCount(0);

  await dialog.getByRole("textbox", { name: MODEL_FIELD_NAME, exact: true }).fill(TYPED_MODEL);
  await dialog.getByRole("button", ADD).click();
  await expect(dialog.locator('[data-slot="add-connection-failure"]')).toHaveText(
    submitFailureSentence({ heldKeyLabel: undefined, reason: KEY_REFUSED_SAVE_REASON }),
  );
  // Positive control for the reads below: the dialog is still open on the draft, so nothing closed it as saved.
  await expect(dialog).toBeVisible();
  expect(await caller.connection.list()).toHaveLength(connectionsBefore);
  expect(await caller.credentials.list()).toHaveLength(keysBefore);
});
