// @subject packages/client/src/features/credentials/components/add-connection-form-body.tsx
// @subject packages/client/src/features/credentials/components/add-connection-provider-fields.tsx
// Adding a hosted connection on a key the provider refuses: the API key field is marked invalid and described by one
// sentence naming the refusal and where a new key comes from, focus returns to it, the model field says only why it has
// no list, no retry is offered under the same key, and the add is refused with nothing saved. NanoGPT's list answers
// without a key, so its refusal comes from the row's key check, and a key check with no verdict warns and still adds.
// Each list is read by the composed root's real draft catalog door over a scripted provider transport.
import type { ProviderId } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, providerDisplayLabel, providerIdSchema } from "@orb/contracts/inference";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import { ADD_CONNECTION_NAME, CONNECTION_PROVIDER_FIELD_NAME } from "#client/features/credentials/lib/connections-copy.ts";
import {
  API_KEY_FIELD_NAME,
  KEY_REFUSED_MODEL_NOTICE,
  KEY_REFUSED_SAVE_REASON,
  keyRefusedNotice,
  keyUncheckedNotice,
  MODEL_FIELD_NAME,
  MODEL_LIST_RETRY_NAME,
  MODEL_SEARCH_PLACEHOLDER,
} from "#client/features/credentials/lib/credentials-names.ts";
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
const KEY = "synthetic-refused-key";
const TYPED_MODEL = "vendor/chat-model";
const PUBLIC_ADDRESS = "93.184.215.14";
const HTTP_UNAUTHORIZED = 401;
const HTTP_SERVER_ERROR = 500;
const REFUSAL_BODY = { error: { message: "Incorrect API key provided", type: "invalid_request_error", code: "invalid_api_key" } };
const LIST_BODY = { object: "list", data: [{ id: TYPED_MODEL, object: "model" }] };
const NANOGPT = providerIdSchema.parse("nanogpt");
const NANOGPT_KEY_CHECK = BUILTIN_PROVIDERS.find((row) => row.id === NANOGPT)?.features?.keyCheckPath ?? "";

type MountFn = PlaywrightTestArgs["mount"];
type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

/** A transport whose key check answers `keyCheck` and whose every other read answers `others`. */
function service(keyCheck: { readonly status: number; readonly body: unknown }, others: { readonly status: number; readonly body: unknown }): typeof fetch {
  return (input, init) => {
    const answer = new URL(new Request(input, init).url).pathname === NANOGPT_KEY_CHECK ? keyCheck : others;
    return Promise.resolve(Response.json(answer.body, { status: answer.status }));
  };
}

async function rootOn(transport: typeof fetch): Promise<Root> {
  return await createCorpusHarness(undefined, {
    secretBoxKey: Buffer.alloc(32, 17),
    providerFetch: transport,
    networkExecution: { fetch: transport, resolver: () => Promise.resolve([PUBLIC_ADDRESS]) },
  });
}

/** Opens Add connection on `providerId`, types the key by hand and leaves the field, so the list is read
 *  with focus elsewhere. Returns the dialog, the key input and the provider's label. */
async function typeKeyAndLeave(
  root: Root,
  providerId: ProviderId,
  { corpus, mount, page }: { readonly corpus: CorpusPlayback; readonly mount: MountFn; readonly page: Page },
): Promise<{ readonly dialog: Locator; readonly key: Locator; readonly label: string }> {
  const caller = await root.internalCallerFor(root.ownerId);
  const available = await caller.connection.providersAvailable();
  const provider = available.find((entry) => entry.provider.id === providerId)?.provider;
  if (provider === undefined) {
    throw new Error(`The corpus root offers no ${providerId} provider`);
  }
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    "connection.providersAvailable": () => available.map((entry) => (entry.provider.id === providerId ? { ...entry, available: true } : entry)),
  });
  await mount<typeof ConnectionsListStory>(STORY, {});
  await page.getByRole("button", ADD).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: CONNECTION_PROVIDER_FIELD_NAME, exact: true }).click();
  const label = providerDisplayLabel(provider);
  await page.getByRole("option", { name: label }).first().click();
  const key = dialog.getByRole("textbox", { name: API_KEY_FIELD_NAME, exact: true });
  await key.pressSequentially(KEY);
  await key.blur();
  return { dialog, key, label };
}

const REFUSING = [
  {
    providerId: providerIdSchema.parse("openai"),
    transport: service({ status: HTTP_UNAUTHORIZED, body: REFUSAL_BODY }, { status: HTTP_UNAUTHORIZED, body: REFUSAL_BODY }),
  },
  { providerId: NANOGPT, transport: service({ status: HTTP_UNAUTHORIZED, body: REFUSAL_BODY }, { status: 200, body: LIST_BODY }) },
] as const;

for (const { providerId, transport } of REFUSING) {
  test(`a ${providerId} key the provider refuses marks the key field, takes focus back and refuses the add`, async ({ corpus, mount, page }) => {
    await using root = await rootOn(transport);
    const caller = await root.internalCallerFor(root.ownerId);
    const connectionsBefore = (await caller.connection.list()).length;
    const keysBefore = (await caller.credentials.list()).length;
    const { dialog, key, label } = await typeKeyAndLeave(root, providerId, { corpus, mount, page });

    const notice = keyRefusedNotice(label);
    await expect(dialog.locator('[data-slot="add-connection-key-verdict"]')).toHaveText(notice);
    await expect(key).toHaveAttribute("aria-invalid", "true");
    await expect(key).toHaveAccessibleDescription(notice);
    await expect(key).toBeFocused();
    await expect(dialog.locator('[data-slot="model-picker-notice"]')).toHaveText(KEY_REFUSED_MODEL_NOTICE);
    await expect(dialog.getByRole("button", { name: MODEL_LIST_RETRY_NAME, exact: true })).toHaveCount(0);

    await dialog.getByRole("textbox", { name: MODEL_FIELD_NAME, exact: true }).fill(TYPED_MODEL);
    await dialog.getByRole("button", ADD).click();
    await expect(dialog.locator('[data-slot="add-connection-failure"]')).toContainText(KEY_REFUSED_SAVE_REASON);
    // Positive control for the reads below: the dialog is still open on the draft, so nothing closed it as saved.
    await expect(dialog).toBeVisible();
    expect(await caller.connection.list()).toHaveLength(connectionsBefore);
    expect(await caller.credentials.list()).toHaveLength(keysBefore);
  });
}

test("a NanoGPT key whose key check gets no verdict is named unchecked, stays valid, and still adds", async ({ corpus, mount, page }) => {
  await using root = await rootOn(service({ status: HTTP_SERVER_ERROR, body: { error: "upstream down" } }, { status: 200, body: LIST_BODY }));
  const caller = await root.internalCallerFor(root.ownerId);
  const connectionsBefore = (await caller.connection.list()).length;
  const { dialog, key, label } = await typeKeyAndLeave(root, NANOGPT, { corpus, mount, page });

  const notice = keyUncheckedNotice(label);
  await expect(dialog.locator('[data-slot="add-connection-key-verdict"]')).toHaveText(notice);
  await expect(key).toHaveAccessibleDescription(notice);
  await expect(key).not.toHaveAttribute("aria-invalid", "true");
  // The list read under the unchecked key still lists.
  await dialog.getByPlaceholder(MODEL_SEARCH_PLACEHOLDER).click();
  await dialog
    .getByRole("option", { name: new RegExp(TYPED_MODEL, "u") })
    .first()
    .click();
  await dialog.getByRole("button", ADD).click();
  // The add may go on to ask for limits the list did not state; the connection is saved either way.
  await expect.poll(async () => (await caller.connection.list()).length).toBe(connectionsBefore + 1);
});
