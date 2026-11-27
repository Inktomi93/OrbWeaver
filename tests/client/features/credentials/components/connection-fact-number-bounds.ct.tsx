// @subject packages/client/src/features/credentials/lib/connection-fact-model.ts
// A number fact on an embedding connection is refused where it is typed, with Save off and the typed text kept, before the
// pane asks the server anything. And when the server's preview does refuse a change as input, the pane never answers it with
// the confirm that says the user's search index will be deleted; only a preview that could not be read keeps that confirm.

import { DIALOG_VERBS, REINDEX_CONFIRM_COPY } from "@orb/client/lib";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import {
  CONNECTION_EDITOR_TIER_TITLES,
  factOverrideName,
  factSaveName,
  factYourValueName,
  VECTOR_WIDTH_FACT_NAME,
} from "#client/features/credentials/lib/credentials-names.ts";
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
const EMBEDDER_LABEL = "Own embedder";
const VLLM_LABEL = "Own vLLM box";
const VECTOR_WIDTH = 768;
const DEADLINE_MS = 45_000;
const WIDTH_ROW = "embedding.dims";
const DEADLINE_ROW = "features.requestTimeoutMs";
const namePrefix = (spelled: string): RegExp => new RegExp(`^${RegExp.escape(spelled.trim())}`, "u");
const nameSuffix = (spelled: string): RegExp => new RegExp(`${RegExp.escape(spelled.trim())}$`, "u");

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const rowAt = (page: Page, path: string): Locator => page.locator(`[data-fact="${path}"]`);

async function openAdvanced(page: Page, label: string): Promise<void> {
  await page.locator('[data-slot="list-row-body"]').filter({ hasText: label }).click();
  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CONNECTION_EDITOR_TIER_TITLES.advanced)}`, "u") }).click();
}

async function seedVllm(caller: Caller): Promise<Awaited<ReturnType<Caller["connection"]["create"]>>> {
  return await caller.connection.create({ providerId: "vllm", credentialId: null, baseUrl: "http://127.0.0.1:8000/v1", model: "own-model", label: VLLM_LABEL });
}

test("a vector width that is no whole count above zero is refused where it is typed, and the preview is never asked", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.connection.create({
    label: EMBEDDER_LABEL,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: "http://127.0.0.1:9/v1",
    model: "own-embedder",
    declared: { kind: "embedding", features: { detectServer: false } },
  });
  const routes = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["connection.update", "connection.embedSpaceChangePreview"]),
  });
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: 390, appearance: appearanceSettingsSchema.parse({}) });
  await openAdvanced(page, EMBEDDER_LABEL);
  const row = rowAt(page, WIDTH_ROW);
  await expect(row).toContainText(VECTOR_WIDTH_FACT_NAME);
  await row.getByRole("button", { name: namePrefix(factOverrideName("")) }).click();
  const field = row.getByRole("textbox", { name: nameSuffix(factYourValueName("")) });
  const save = row.getByRole("button", { name: namePrefix(factSaveName("")) });

  for (const typed of ["1.5", "-5", "0"]) {
    await field.fill(typed);
    await expect(row.getByRole("alert")).toBeVisible();
    await expect(save).toBeDisabled();
    await expect(field).toHaveValue(typed);
  }
  expect(routes.count("connection.embedSpaceChangePreview")).toBe(0);
  expect(routes.count("connection.update")).toBe(0);

  // The positive control: a whole width lifts the refusal and enables Save on the same field.
  await field.fill(String(VECTOR_WIDTH));
  await expect(row.getByRole("alert")).toHaveCount(0);
  await expect(save).toBeEnabled();
});

// A preview that the server answers with a refusal of the input names nothing about the user's index, so it is never the
// "deletes your search index" confirm; the write that follows meets the server's own refusal for what was typed.
test("a preview the server refuses as bad input does not raise the rebuild confirm, and the write goes on to the server", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  const vllm = await seedVllm(caller);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["connection.update"]),
    ...serveCorpusProcedures(caller, ["connection.embedSpaceChangePreview"], () => trpcError({ code: "BAD_REQUEST" })),
  });
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: 390, appearance: appearanceSettingsSchema.parse({}) });
  await openAdvanced(page, VLLM_LABEL);
  const row = rowAt(page, DEADLINE_ROW);
  await row.getByRole("button", { name: namePrefix(factOverrideName("")) }).click();
  await row.getByRole("textbox", { name: nameSuffix(factYourValueName("")) }).fill(String(DEADLINE_MS));
  await row.getByRole("button", { name: namePrefix(factSaveName("")) }).click();

  await expect.poll(async () => (await caller.connection.get({ connectionId: vllm.id })).declared?.features?.requestTimeoutMs).toBe(DEADLINE_MS);
  await expect(page.getByRole("alertdialog", { name: REINDEX_CONFIRM_COPY.title })).toHaveCount(0);
});

test("a preview that could not be read keeps the rebuild confirm, and cancelling writes nothing", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  const vllm = await seedVllm(caller);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["connection.update"]),
    ...serveCorpusProcedures(caller, ["connection.embedSpaceChangePreview"], () => trpcError({ code: "INTERNAL_SERVER_ERROR" })),
  });
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: 390, appearance: appearanceSettingsSchema.parse({}) });
  await openAdvanced(page, VLLM_LABEL);
  const row = rowAt(page, DEADLINE_ROW);
  await row.getByRole("button", { name: namePrefix(factOverrideName("")) }).click();
  await row.getByRole("textbox", { name: nameSuffix(factYourValueName("")) }).fill(String(DEADLINE_MS));
  await row.getByRole("button", { name: namePrefix(factSaveName("")) }).click();

  const confirm = page.getByRole("alertdialog", { name: REINDEX_CONFIRM_COPY.title });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: DIALOG_VERBS.cancel }).click();
  await expect(confirm).toHaveCount(0);
  expect((await caller.connection.get({ connectionId: vllm.id })).declared?.features?.requestTimeoutMs).toBeUndefined();
});
