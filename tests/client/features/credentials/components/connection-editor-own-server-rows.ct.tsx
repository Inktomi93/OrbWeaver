// @subject packages/client/src/features/credentials/components/connection-fact-rows.tsx
// The connection editor's own-server rows and the fact editor around them: the sampler envelope and antislop proxy are
// switches that write the connection's declared quirks and say what the server needs, the envelope is offered only to a
// server the row speaks as vLLM, a typed value that is no number is refused where it is typed and kept, a connection with no
// vector space is never held for a rebuild confirm, and Esc leaves the open editor.

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import {
  ANTISLOP_NEEDS,
  CONNECTION_EDITOR_TIER_TITLES,
  factOverrideName,
  factSaveName,
  factYourValueName,
  SAMPLER_ENVELOPE_NEEDS,
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
const VLLM_LABEL = "Own vLLM box";
const OLLAMA_LABEL = "Own Ollama box";
const LLAMA_CPP_LABEL = "Own llama.cpp box";
const DEADLINE_MS = 45_000;
// A row is addressed by its path in the connection's declared block, which is the contract's own key.
const ENVELOPE_ROW = "features.samplerEnvelope";
const ANTISLOP_ROW = "features.antislop";
const DEADLINE_ROW = "features.requestTimeoutMs";
const PHRASE_FORM_ROW = "features.bannedStrings";
const NEEDS_BY_ROW = { [ENVELOPE_ROW]: SAMPLER_ENVELOPE_NEEDS, [ANTISLOP_ROW]: ANTISLOP_NEEDS } as const;
// Each control's accessible name opens with the verb its production grammar spells; the fact's own name follows.
const namePrefix = (spelled: string): RegExp => new RegExp(`^${RegExp.escape(spelled.trim())}`, "u");
const nameSuffix = (spelled: string): RegExp => new RegExp(`${RegExp.escape(spelled.trim())}$`, "u");

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const rowAt = (page: Page, path: string): Locator => page.locator(`[data-fact="${path}"]`);
const overrideOf = (row: Locator): Locator => row.getByRole("button", { name: namePrefix(factOverrideName("")) });
const saveOf = (row: Locator): Locator => row.getByRole("button", { name: namePrefix(factSaveName("")) });

async function seed(caller: Caller): Promise<{ readonly vllm: Awaited<ReturnType<Caller["connection"]["create"]>> }> {
  const vllm = await caller.connection.create({
    providerId: "vllm",
    credentialId: null,
    baseUrl: "http://127.0.0.1:8000/v1",
    model: "own-model",
    label: VLLM_LABEL,
  });
  await caller.connection.create({ providerId: "ollama", credentialId: null, baseUrl: "http://127.0.0.1:11434/v1", model: "own-model", label: OLLAMA_LABEL });
  return { vllm };
}

async function openAdvanced(page: Page, label: string): Promise<void> {
  await page.locator('[data-slot="list-row-body"]').filter({ hasText: label }).click();
  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CONNECTION_EDITOR_TIER_TITLES.advanced)}`, "u") }).click();
}

test("the envelope and antislop rows are switches that write the declared quirk and say what the server needs", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  const { vllm } = await seed(caller);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["connection.update", "connection.embedSpaceChangePreview"]),
  });
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: 390, appearance: appearanceSettingsSchema.parse({}) });
  await openAdvanced(page, VLLM_LABEL);

  const envelope = rowAt(page, ENVELOPE_ROW).getByRole("switch");
  const antislop = rowAt(page, ANTISLOP_ROW).getByRole("switch");
  await expect(envelope).not.toBeChecked();
  await expect(antislop).not.toBeChecked();
  // Each row states what the server needs, in view without opening anything, and offers no editor beside the switch.
  for (const path of [ENVELOPE_ROW, ANTISLOP_ROW] as const) {
    await expect(rowAt(page, path).getByText(NEEDS_BY_ROW[path], { exact: true })).toBeVisible();
    await expect(overrideOf(rowAt(page, path))).toHaveCount(0);
  }

  await envelope.click();
  await expect(envelope).toBeChecked();
  await expect.poll(async () => (await caller.connection.get({ connectionId: vllm.id })).declared?.features?.samplerEnvelope).toBe("vllm-xargs");
  await antislop.click();
  await expect(antislop).toBeChecked();
  await expect.poll(async () => (await caller.connection.get({ connectionId: vllm.id })).declared?.features?.antislop).toBe(true);

  // Off removes the declaration instead of writing a second value, and the other switch keeps its own.
  await envelope.click();
  await expect(envelope).not.toBeChecked();
  await expect.poll(async () => (await caller.connection.get({ connectionId: vllm.id })).declared?.features?.samplerEnvelope).toBeUndefined();
  expect((await caller.connection.get({ connectionId: vllm.id })).declared?.features?.antislop).toBe(true);
});

test("the envelope is offered only to a server that speaks vLLM, and the antislop proxy to any own server", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  await seed(caller);
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: 390, appearance: appearanceSettingsSchema.parse({}) });
  await openAdvanced(page, OLLAMA_LABEL);
  // The positive control: the same list does offer the antislop proxy, so an absent envelope is a decision and not an empty list.
  await expect(rowAt(page, ANTISLOP_ROW).getByRole("switch")).toBeVisible();
  await expect(rowAt(page, ENVELOPE_ROW)).toHaveCount(0);
});

// The envelope belongs to the server the row speaks as. A declared tokenize endpoint says which endpoint answers, so it
// neither hides the row from a vLLM nor offers it to a server that is not one.
test("a vLLM row keeps the envelope when its tokenize endpoint is declared otherwise", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.connection.create({
    providerId: "vllm",
    credentialId: null,
    baseUrl: "http://127.0.0.1:8000/v1",
    model: "own-model",
    label: VLLM_LABEL,
    declared: { features: { tokenizeApi: "llama-cpp" } },
  });
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: 390, appearance: appearanceSettingsSchema.parse({}) });
  await openAdvanced(page, VLLM_LABEL);
  await expect(rowAt(page, ANTISLOP_ROW).getByRole("switch")).toBeVisible();
  await expect(rowAt(page, ENVELOPE_ROW).getByRole("switch")).toBeVisible();
});

test("a llama.cpp row is not offered the envelope because it declares vLLM's tokenize endpoint", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.connection.create({
    providerId: "llama-cpp",
    credentialId: null,
    baseUrl: "http://127.0.0.1:8080/v1",
    model: "own-model",
    label: LLAMA_CPP_LABEL,
    declared: { features: { tokenizeApi: "vllm" } },
  });
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: 390, appearance: appearanceSettingsSchema.parse({}) });
  await openAdvanced(page, LLAMA_CPP_LABEL);
  // The positive control: the antislop switch is offered on the same list, so an absent envelope is a decision and not an empty list.
  await expect(rowAt(page, ANTISLOP_ROW).getByRole("switch")).toBeVisible();
  await expect(rowAt(page, ENVELOPE_ROW)).toHaveCount(0);
});

test("a typed value that is no number is refused where it is typed and kept, and a connection with no embedding role is never held for a rebuild confirm", async ({
  mount,
  page,
}) => {
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  const { vllm } = await seed(caller);
  const routes = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["connection.update", "connection.embedSpaceChangePreview"]),
  });
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: 390, appearance: appearanceSettingsSchema.parse({}) });
  await openAdvanced(page, VLLM_LABEL);
  const row = rowAt(page, DEADLINE_ROW);
  await overrideOf(row).click();
  const field = row.getByRole("textbox", { name: nameSuffix(factYourValueName("")) });
  const save = saveOf(row);

  await field.fill("abc");
  await expect(row.getByRole("alert")).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(field).toHaveValue("abc");
  expect(routes.count("connection.update")).toBe(0);
  expect(routes.count("connection.embedSpaceChangePreview")).toBe(0);
  // A fraction is no whole count of milliseconds, so the schema's own refusal never has to answer it.
  await field.fill("1.5");
  await expect(row.getByRole("alert")).toBeVisible();
  await expect(save).toBeDisabled();

  await field.fill(String(DEADLINE_MS));
  await expect(row.getByRole("alert")).toHaveCount(0);
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(async () => (await caller.connection.get({ connectionId: vllm.id })).declared?.features?.requestTimeoutMs).toBe(DEADLINE_MS);
  // The server's own answer is that this connection has no vector space to rebuild, so nothing held the write.
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("Esc leaves the open editor, Override is unavailable while it is open, and Esc inside an open list closes only the list", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  await seed(caller);
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: 390, appearance: appearanceSettingsSchema.parse({}) });
  await openAdvanced(page, VLLM_LABEL);

  const row = rowAt(page, DEADLINE_ROW);
  const override = overrideOf(row);
  const field = row.getByRole("textbox", { name: nameSuffix(factYourValueName("")) });
  await override.click();
  await expect(field).toBeVisible();
  await expect(override).toBeDisabled();
  await field.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(override).toBeEnabled();
  await expect(override).toBeFocused();

  // A select inside the editor: its first Esc closes its own list, the next leaves the editor.
  const formRow = rowAt(page, PHRASE_FORM_ROW);
  await overrideOf(formRow).click();
  const choice = formRow.getByRole("combobox");
  await choice.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(choice).toBeVisible();
  await choice.press("Escape");
  await expect(choice).toHaveCount(0);
});
