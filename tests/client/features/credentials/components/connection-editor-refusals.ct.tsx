// @subject packages/client/src/features/credentials/components/connection-editor.tsx
// A write the server refuses with one of the connection codes lands where its fix is, and nowhere else: on the name, the
// Server URL or the model field of the open editor (the refused draft quoted, announced), or on one line above the tiers
// when no control here holds it, with its own next step and a way out when the connection is gone. The editor declares that
// line, so no toast repeats it. Entry: the Connections list's editor (`ConnectionActionGroupsStory`) over a composed
// server, the refusal scripted at the wire as the server's formatter sends it. Layer: Playwright CT.
// Red: dropping a branch of `connectionFieldRefusalOf` or its placement, the editor's inline declaration (a second copy
// toasts), or the announcer, leaves the refusal unsaid, said twice or not announced.

import { connectionEditorRefusalLine, connectionFieldRefusalOf, editorPlacesRefusal } from "@orb/client/lib";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { ALERTS_REGION_NAME, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import { CONNECTION_NAME_FIELD_NAME } from "#client/features/credentials/lib/credentials-names.ts";
import type { ConnectionActionGroupsStory } from "./_connection-action-groups-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connection-action-groups-stories/ConnectionActionGroupsStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "connection.list",
  "connection.listBindings",
  "credentials.list",
  "connection.providersAvailable",
  "connection.catalogModels",
  "connection.get",
  "connection.capabilities",
] as const;
const LABEL = "Own vLLM box";
const RENAMED = "Renamed box";
const SERVER_SENTENCE = "The server's own sentence.";
// The refusals a connection write can meet on this surface, each by its wire code.
const WRITE_REFUSALS = [
  CONNECTION_OP_CODES.labelEmpty,
  CONNECTION_OP_CODES.baseUrlShape,
  CONNECTION_OP_CODES.modelNotInCatalog,
  CONNECTION_OP_CODES.modelIdShape,
  CONNECTION_OP_CODES.taskUnservable,
  CONNECTION_OP_CODES.providerUnknown,
  CONNECTION_OP_CODES.apiIncoherent,
  CONNECTION_OP_CODES.credentialForeign,
  CONNECTION_OP_CODES.notFound,
] as const;

test.use({ viewport: { width: 900, height: 900 } });

type MountFn = PlaywrightTestArgs["mount"];
type Harness = Awaited<ReturnType<typeof createServerHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;

async function seedOwnBox(root: Harness): Promise<Caller> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.connection.create({ providerId: "vllm", credentialId: null, baseUrl: "http://127.0.0.1:8000/v1", model: "own-model", label: LABEL });
  return caller;
}

/** Opens the box's editor and renames it; the server answers that one patch with `refusal`. */
async function renameRefused(page: Page, mount: MountFn, caller: Caller, refusal: () => ReturnType<typeof trpcError>): Promise<void> {
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["connection.update"], (input) => (input.patch.label === RENAMED ? refusal() : undefined)),
  });
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: 900, appearance: appearanceSettingsSchema.parse({}) });
  await page.locator('[data-slot="list-row-body"]').filter({ hasText: LABEL }).click();
  const name = page.getByRole("textbox", { name: CONNECTION_NAME_FIELD_NAME, exact: true });
  await name.fill(RENAMED);
  await name.blur();
}

for (const reason of WRITE_REFUSALS) {
  test(`a ${reason} refusal of a rename is said once, where its fix is`, async ({ mount, page }) => {
    await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
    await renameRefused(page, mount, await seedOwnBox(root), () => trpcError({ code: "BAD_REQUEST", reason, message: SERVER_SENTENCE }));

    // The expected words and place come from the production reader of the same wire shape; a refused field quotes the
    // draft it dropped, and the refused rename is the only draft this case types.
    const refusal = connectionFieldRefusalOf({ data: { code: "BAD_REQUEST", reason } });
    if (refusal === null) {
      throw new Error(`${reason} is a connection write refusal, so the editor reads it`);
    }
    const line = connectionEditorRefusalLine(refusal, refusal.target === "label" ? RENAMED : null);
    const holder = {
      connection: page.locator('[data-slot="connection-editor-refusal"]'),
      label: page.locator('[data-slot="field-root"]'),
      baseUrl: page.locator('[data-slot="field-root"]'),
      model: page.locator('[data-slot="field-root"]'),
      provider: page.locator('[data-slot="connection-editor-refusal"]'),
      api: page.locator('[data-slot="connection-editor-refusal"]'),
      credential: page.locator('[data-slot="connection-editor-refusal"]'),
    }[refusal.target];
    await expect(holder.getByText(line, { exact: true })).toBeVisible();
    // Said once: the toast never repeats a line the open editor shows.
    await expect(page.getByRole("region", { name: ALERTS_REGION_NAME }).getByText(line, { exact: true })).toHaveCount(0);
    // The server's own sentence is never what the person reads for a code the editor words itself.
    await expect(page.getByText(SERVER_SENTENCE, { exact: true })).toHaveCount(0);
    // A field's error is not a live region, so the editor announces it; a line above the tiers announces itself.
    await expect(page.getByRole("status").filter({ hasText: line })).toHaveCount(editorPlacesRefusal(refusal.target) ? 1 : 0);
  });
}

test("a connection that is gone is said on one line that takes focus, at the field-error size, and offers the way out", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  await renameRefused(page, mount, await seedOwnBox(root), () =>
    trpcError({ code: "NOT_FOUND", reason: CONNECTION_OP_CODES.notFound, message: SERVER_SENTENCE }),
  );

  const refusal = connectionFieldRefusalOf({ data: { code: "NOT_FOUND", reason: CONNECTION_OP_CODES.notFound } });
  if (refusal === null) {
    throw new Error("not_found is a connection write refusal, so the editor reads it");
  }
  const holder = page.locator('[data-slot="connection-editor-refusal"]');
  const line = holder.getByText(connectionEditorRefusalLine(refusal, null), { exact: true });
  await expect(line).toBeVisible();
  await expect(holder).toBeFocused();
  await expect(page.getByRole("region", { name: ALERTS_REGION_NAME }).getByRole("alert")).toHaveCount(0);
  // Not the editor's smallest type: larger than the explanatory text it sits among.
  const sizeOf = (target: Locator): Promise<number> => target.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(await sizeOf(line)).toBeGreaterThan(await sizeOf(page.locator('[data-slot="text"][data-voice="gloss"]').first()));

  await holder.getByRole("button", { name: "Back to Connections", exact: true }).click();
  await expect(page.locator('[data-slot="connection-editor"]')).toHaveCount(0);
});

test("a write that fails with no code is said on the editor's line, not in a toast", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  await renameRefused(page, mount, await seedOwnBox(root), () => trpcError({ code: "INTERNAL_SERVER_ERROR", message: SERVER_SENTENCE }));

  const holder = page.locator('[data-slot="connection-editor-refusal"]');
  await expect(holder.getByText("Couldn't save that connection.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: ALERTS_REGION_NAME }).getByRole("alert")).toHaveCount(0);
});
