// @subject packages/client/src/features/credentials/components/connection-limits-step.tsx
// Adding a connection whose context window is a guess says so at that moment and takes the real numbers, typed as
// people copy them, into the connection's own declaration, without a per-model probe to learn them. A provider that
// states its window goes straight on, and so does one whose only guess is the max output, even when its image input is
// a guess. A step raised for a guessed window carries the one "Takes images" switch when that answer is a guess too,
// opening on the guess and writing only an answer the user changes, and the connection editor's switch states the same
// stored fact in all three states: stated, assumed and set. A failed read or a refused save still leaves a way on, a
// close while the read is out never leaves the next open on a stale step, and the Advanced tier's override of the same
// limit reads and refuses them the same way.

import { DIALOG_VERBS } from "@orb/client/lib";
import { providerDisplayLabel } from "@orb/contracts/inference";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { setRootFontScale } from "@orb/testkit/browser/spec";
import type { ServedHold, TrpcRecorder } from "@orb/testkit/ct";
import { channelName, holdServed, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import { ADD_CONNECTION_NAME, CONNECTION_PROVIDER_FIELD_NAME } from "#client/features/credentials/lib/connections-copy.ts";
import {
  API_KEY_FIELD_NAME,
  CONNECTION_EDITOR_TIER_TITLES,
  CONNECTION_LIMIT_FIELD_NAMES,
  CONNECTION_LIMITS_KEEP_NAME,
  CONNECTION_LIMITS_SAVE_NAME,
  CONNECTION_LIMITS_TITLE,
  FACT_COUNT_INVALID,
  FACT_NAMES,
  FIRST_MODEL_FINISH_NAME,
  factOverrideName,
  factSaveName,
  factYourValueName,
  IMAGE_SWITCH_ASSUMED_GLOSS,
  IMAGE_SWITCH_NAME,
  IMAGE_SWITCH_STATED_GLOSS,
  imageSwitchSetGloss,
  MODEL_FIELD_NAME,
  MODEL_IMAGES_ONLY_LABEL,
} from "#client/features/credentials/lib/credentials-names.ts";
import type { ConnectionLimitsStory } from "./_connection-limits-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connection-limits-stories/ConnectionLimitsStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "connection.list",
  "connection.listBindings",
  "connection.setBinding",
  "credentials.list",
  "credentials.add",
  "credentials.storageStatus",
  "connection.providersAvailable",
  "connection.draftCatalogModels",
  "connection.catalogModels",
  "connection.create",
  "connection.get",
  "connection.embedSpaceChangePreview",
  "search.spaceStatus",
] as const;
// A hosted proxy reached through Custom OpenAI-compatible: its model list carries ids and nothing about their limits.
const PROXY_HOST = "llm.example.com";
const PROXY_URL = `https://${PROXY_HOST}/v1`;
const PROXY_PROVIDER = "custom-openai";
const PROXY_MODEL = "vendor/long-context-model";
// A model whose window the built-in table states and whose max output nothing states.
const WINDOW_KNOWN_MODEL = "grok-4.7";
// The OpenRouter catalog: one row states its window and output cap, the other only its output cap.
const ROUTER_HOST = "openrouter.ai";
const ROUTER_PROVIDER = "openrouter";
const ROUTER_MODEL = { id: "anthropic/claude-haiku-5.5", name: "Anthropic: Claude Haiku 5.5" };
const ROUTER_NO_WINDOW_MODEL = { id: "vendor/unlisted-window", name: "Vendor: Unlisted window" };
// An image model the catalog lists with its window: it makes pictures and answers no chat.
const ROUTER_IMAGE_MODEL = { id: "vendor/painter", name: "Vendor: Painter" };
const ROUTER_KEY = "synthetic-limits-key-never-returned";
// The model's real limits, as its provider's page states them, and the ways a newcomer copies them off it.
const REAL = { window: 1_000_000, output: 32_000 } as const;
const TYPED = { window: "1,000,000", output: "32k" } as const;
const NONSENSE = "12 tokens";
const ADVANCED_TYPED = { refused: "0", read: "128k", stored: 128_000 } as const;
const PUBLIC_ADDRESS = "93.184.215.14";
const HTTP_NOT_FOUND = 404;
const WIDE = { width: 960, viewport: { width: 1440, height: 1000 } } as const;
const PHONE = { width: 390, height: 844 } as const;
const ENLARGED_SCALES = [2, 3] as const;
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

const routerRow = (model: { readonly id: string; readonly name: string }, window: number | undefined, output: readonly string[] = ["text"]): object => ({
  ...model,
  ...(window === undefined ? {} : { ["context_length"]: window }),
  ["top_provider"]: { ["max_completion_tokens"]: REAL.output },
  pricing: { prompt: "0.000001", completion: "0.000005" },
  architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: output },
  ["supported_parameters"]: ["tools"],
});

/** The external servers the root reaches. */
const scriptedServers: typeof fetch = (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (request.method === "GET" && url.hostname === PROXY_HOST && url.pathname === "/v1/models") {
    return Promise.resolve(Response.json({ object: "list", data: [PROXY_MODEL, WINDOW_KNOWN_MODEL].map((id) => ({ id, object: "model" })) }));
  }
  if (request.method === "GET" && url.hostname === ROUTER_HOST && url.pathname === "/api/v1/models") {
    return Promise.resolve(
      Response.json({
        data:
          url.search === ""
            ? [routerRow(ROUTER_MODEL, REAL.window), routerRow(ROUTER_NO_WINDOW_MODEL, undefined), routerRow(ROUTER_IMAGE_MODEL, REAL.window, ["image"])]
            : [],
      }),
    );
  }
  // Every other read (a server-identity probe, a native model-info route) answers as a server without that route.
  return Promise.resolve(new Response("{}", { status: HTTP_NOT_FOUND }));
};

async function freshRoot(): Promise<ServerTestHarness> {
  return await createServerHarness({
    startJobs: false,
    providerFetch: scriptedServers,
    networkExecution: {
      fetch: scriptedServers,
      resolver: (hostname: string): Promise<string[]> =>
        hostname === PROXY_HOST || hostname === ROUTER_HOST ? Promise.resolve([PUBLIC_ADDRESS]) : Promise.reject(new Error(`Unscripted address: ${hostname}`)),
    },
    secretBoxKey: Buffer.alloc(32, 23),
  });
}

/** Holds for the two procedures a case can stall or fail; absent ⇒ served at once. */
interface Holds {
  readonly capabilities?: ServedHold;
  readonly update?: ServedHold;
}

async function mountList(
  { page, mount }: { readonly page: Page; readonly mount: PlaywrightTestArgs["mount"] },
  caller: Caller,
  props: Parameters<typeof ConnectionLimitsStory>[0],
  holds: Holds = {},
): Promise<TrpcRecorder> {
  const { capabilities, update } = holds;
  const calls = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...READS]),
    ...serveCorpusProcedures(caller, ["connection.capabilities"], capabilities === undefined ? undefined : () => capabilities),
    ...serveCorpusProcedures(caller, ["connection.update"], update === undefined ? undefined : () => update),
  });
  await mount<typeof ConnectionLimitsStory>(STORY, props);
  return calls;
}

const WIDE_PROPS = { width: WIDE.width, appearance: appearanceSettingsSchema.parse({}) } as const;

/** Opens the add dialog and picks the provider whose id is `providerId`. */
async function pickProvider(page: Page, caller: Caller, providerId: string): Promise<Locator> {
  const provider = (await caller.connection.providersAvailable()).find((entry) => entry.provider.id === providerId)?.provider;
  if (provider === undefined) {
    throw new Error(`The root offers no ${providerId} provider`);
  }
  await page.getByRole("button", { name: ADD_CONNECTION_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: CONNECTION_PROVIDER_FIELD_NAME, exact: true }).click();
  await page
    .getByRole("option", { name: providerDisplayLabel(provider) })
    .first()
    .click();
  return dialog;
}

/** Adds the proxy through Custom OpenAI-compatible with a typed model id and presses Add. */
async function saveProxy(page: Page, caller: Caller, model: string = PROXY_MODEL): Promise<void> {
  const dialog = await pickProvider(page, caller, PROXY_PROVIDER);
  await dialog.getByLabel("Server URL", { exact: true }).fill(PROXY_URL);
  await dialog.getByLabel(MODEL_FIELD_NAME, { exact: true }).fill(model);
  await dialog.getByRole("button", { name: ADD_CONNECTION_NAME, exact: true }).click();
}

async function saveRouter(page: Page, caller: Caller, model: { readonly name: string }): Promise<void> {
  const dialog = await pickProvider(page, caller, ROUTER_PROVIDER);
  await dialog.getByLabel(API_KEY_FIELD_NAME, { exact: true }).fill(ROUTER_KEY);
  await dialog
    .getByRole("option", { name: new RegExp(model.name, "u") })
    .first()
    .click();
  await dialog.getByRole("button", { name: ADD_CONNECTION_NAME, exact: true }).click();
}

function limitsStep(page: Page): Locator {
  return page.getByRole("dialog", { name: CONNECTION_LIMITS_TITLE, exact: true });
}

function finish(page: Page): Locator {
  return page.getByRole("button", { name: FIRST_MODEL_FINISH_NAME, exact: true });
}

/** The connection the user's Chat role points at, or `null`. */
async function chatBinding(caller: Caller): Promise<string | null> {
  return (await caller.connection.listBindings()).find((view) => view.task === "chat")?.binding?.connectionId ?? null;
}

/** The connection the add dialog saved for `providerId`; a fresh root already holds its built-in embedder. */
async function addedConnection(caller: Caller, providerId: string): Promise<Awaited<ReturnType<Caller["connection"]["list"]>>[number]> {
  const connection = (await caller.connection.list()).find((row) => row.providerId === providerId);
  if (connection === undefined) {
    throw new Error(`The add dialog saved no ${providerId} connection`);
  }
  return connection;
}

test.use({ viewport: WIDE.viewport });

test("a server that states no window asks for the real limits as it is added, reads them as typed, and asks without probing the model", async ({
  mount,
  page,
}) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const calls = await mountList({ page, mount }, caller, WIDE_PROPS);
  await saveProxy(page, caller);
  const step = limitsStep(page);
  await expect(step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.window, { exact: true })).toBeVisible();
  // The step asks for the list-only read; that it runs no per-model probe is `tests/server/domain/connection/verbs/capabilities-list-read.int.test.ts`.
  expect(calls.inputs("connection.capabilities")).toContainEqual(expect.objectContaining({ listFacts: true }));

  await step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.window, { exact: true }).fill(TYPED.window);
  await step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.output, { exact: true }).fill(TYPED.output);
  await step.getByRole("button", { name: CONNECTION_LIMITS_SAVE_NAME, exact: true }).click();
  // The first chat model goes on to the first-model step, as an add without the limits step does.
  await expect(finish(page)).toBeVisible();

  const connection = await addedConnection(caller, PROXY_PROVIDER);
  expect(connection.declared?.generation).toMatchObject({ context: { window: REAL.window }, output: { maxTokens: { max: REAL.output } } });
  const after = await caller.connection.capabilities({ connectionId: connection.id, listFacts: true });
  expect(after.capability).toMatchObject({ generation: { context: { window: REAL.window }, output: { maxTokens: { max: REAL.output } } } });
  expect(after.capability.kind === "generation" ? after.capability.generation.context.windowEstimated : null).toBeUndefined();
});

test("text that names no whole count is refused with what to type, and Save waits for a number", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  await mountList({ page, mount }, caller, WIDE_PROPS);
  await saveProxy(page, caller);
  const step = limitsStep(page);
  const window = step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.window, { exact: true });
  const save = step.getByRole("button", { name: CONNECTION_LIMITS_SAVE_NAME, exact: true });
  await window.fill(NONSENSE);
  await expect(step.getByText(FACT_COUNT_INVALID, { exact: true })).toBeVisible();
  await expect(save).toBeDisabled();
  await window.fill(TYPED.window);
  await expect(step.getByText(FACT_COUNT_INVALID, { exact: true })).toHaveCount(0);
  await expect(save).toBeEnabled();
});

test("keeping the guess writes nothing and goes on", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const calls = await mountList({ page, mount }, caller, WIDE_PROPS);
  await saveProxy(page, caller);
  await limitsStep(page).getByRole("button", { name: CONNECTION_LIMITS_KEEP_NAME, exact: true }).click();
  await expect(finish(page)).toBeVisible();
  expect(calls.count("connection.update")).toBe(0);
  expect((await addedConnection(caller, PROXY_PROVIDER)).declared?.generation).toBeUndefined();
});

test("a refused save stays on the step with the reason inline, and the guess can still be kept", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const update = holdServed();
  await mountList({ page, mount }, caller, WIDE_PROPS, { update });
  await saveProxy(page, caller);
  const step = limitsStep(page);
  await step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.window, { exact: true }).fill(TYPED.window);
  await step.getByRole("button", { name: CONNECTION_LIMITS_SAVE_NAME, exact: true }).click();
  await update.requested;
  update.fail();
  await expect(step.getByRole("alert")).toBeVisible();
  await expect(step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.window, { exact: true })).toHaveValue(TYPED.window);
  expect((await addedConnection(caller, PROXY_PROVIDER)).declared?.generation).toBeUndefined();
  await step.getByRole("button", { name: CONNECTION_LIMITS_KEEP_NAME, exact: true }).click();
  await expect(finish(page)).toBeVisible();
});

test("a failed limits read offers the same way on as keeping the guess", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const capabilities = holdServed();
  await mountList({ page, mount }, caller, WIDE_PROPS, { capabilities });
  await saveProxy(page, caller);
  await capabilities.requested;
  capabilities.fail();
  const step = limitsStep(page);
  await expect(step.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toBeVisible();
  await step.getByRole("button", { name: CONNECTION_LIMITS_KEEP_NAME, exact: true }).click();
  await expect(finish(page)).toBeVisible();
});

test("closing the dialog while the limits read is out opens the next add on the form, not a stale step", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const capabilities = holdServed();
  await mountList({ page, mount }, caller, WIDE_PROPS, { capabilities });
  await saveProxy(page, caller);
  await capabilities.requested;
  // Positive control: the read is out, and the dialog already shows the step's own loading in place of the form.
  await expect(limitsStep(page)).toBeVisible();
  await expect(page.getByRole("combobox", { name: CONNECTION_PROVIDER_FIELD_NAME, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: DIALOG_VERBS.close, exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  capabilities.release();

  await page.getByRole("button", { name: ADD_CONNECTION_NAME, exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("combobox", { name: CONNECTION_PROVIDER_FIELD_NAME, exact: true })).toBeVisible();
  await expect(limitsStep(page)).toHaveCount(0);
});

test("a provider that states its window adds with no limits step", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const calls = await mountList({ page, mount }, caller, WIDE_PROPS);
  await saveRouter(page, caller, ROUTER_MODEL);
  await expect(finish(page)).toBeVisible();
  await expect(limitsStep(page)).toHaveCount(0);
  expect(calls.count("connection.capabilities")).toBeGreaterThan(0);
  const added = await addedConnection(caller, ROUTER_PROVIDER);
  const view = await caller.connection.capabilities({ connectionId: added.id });
  expect(view.capability).toMatchObject({ generation: { context: { window: REAL.window }, output: { maxTokens: { max: REAL.output } } } });
  // The first chat model takes the Chat role.
  await expect.poll(() => chatBinding(caller)).toBe(added.id);
});

test("a first connection on an image-only model adds without taking the Chat role", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  await mountList({ page, mount }, caller, WIDE_PROPS);
  const dialog = await pickProvider(page, caller, ROUTER_PROVIDER);
  await dialog.getByLabel(API_KEY_FIELD_NAME, { exact: true }).fill(ROUTER_KEY);
  // The picker marks the image row before it is picked; the chat row beside it is the positive control.
  const option = (model: { readonly name: string }): Locator => dialog.getByRole("option", { name: new RegExp(model.name, "u") }).first();
  await expect(option(ROUTER_IMAGE_MODEL).getByText(MODEL_IMAGES_ONLY_LABEL, { exact: true })).toBeVisible();
  await expect(option(ROUTER_MODEL).getByText(MODEL_IMAGES_ONLY_LABEL, { exact: true })).toHaveCount(0);
  await option(ROUTER_IMAGE_MODEL).click();
  await dialog.getByRole("button", { name: ADD_CONNECTION_NAME, exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const added = await addedConnection(caller, ROUTER_PROVIDER);
  expect({ model: added.model, tasks: added.tasks, chat: await chatBinding(caller) }).toEqual({
    model: ROUTER_IMAGE_MODEL.id,
    tasks: ["generateImage"],
    chat: null,
  });
});

test("a guessed window beside a stated max output asks only for the window", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  await mountList({ page, mount }, caller, WIDE_PROPS);
  await saveRouter(page, caller, ROUTER_NO_WINDOW_MODEL);
  const step = limitsStep(page);
  await expect(step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.window, { exact: true })).toBeVisible();
  await expect(step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.output, { exact: true })).toHaveCount(0);
});

test("a stated window beside a guessed max output adds with no limits step", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const calls = await mountList({ page, mount }, caller, WIDE_PROPS);
  await saveProxy(page, caller, WINDOW_KNOWN_MODEL);
  await expect(finish(page)).toBeVisible();
  await expect(limitsStep(page)).toHaveCount(0);
  expect(calls.count("connection.capabilities")).toBeGreaterThan(0);
  const view = await caller.connection.capabilities({ connectionId: (await addedConnection(caller, PROXY_PROVIDER)).id, listFacts: true });
  // The premise: the window is stated and only the max output is a guess, beside an image answer that is a guess too.
  expect(view.capability).toMatchObject({ generation: { output: { maxTokensEstimated: true }, modalitiesEstimated: true } });
  expect(view.capability.kind === "generation" ? view.capability.generation.context.windowEstimated : null).toBeUndefined();
});

test("the Advanced override reads a window the way the step does and refuses zero", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const connection = await caller.connection.create({
    providerId: PROXY_PROVIDER,
    credentialId: null,
    baseUrl: PROXY_URL,
    model: PROXY_MODEL,
    label: "Requested proxy",
  });
  await mountList({ page, mount }, caller, { ...WIDE_PROPS, requested: connection.id });
  const advanced = page.locator(`[data-slot="connection-editor-tier"][data-tier="${CONNECTION_EDITOR_TIER_TITLES.advanced}"]`);
  const row = advanced.locator('[data-fact="generation.context.window"]');
  await expect(advanced.locator('[data-fact="generation.output.maxTokens.max"]')).toBeVisible();
  await row.getByRole("button", { name: factOverrideName(FACT_NAMES.contextWindow), exact: true }).click();
  const field = row.getByRole("textbox", { name: factYourValueName(FACT_NAMES.contextWindow), exact: true });
  const save = row.getByRole("button", { name: factSaveName(FACT_NAMES.contextWindow), exact: true });
  await field.fill(ADVANCED_TYPED.refused);
  await expect(row.getByText(FACT_COUNT_INVALID, { exact: true })).toBeVisible();
  await expect(save).toBeDisabled();
  await field.fill(ADVANCED_TYPED.read);
  await save.click();
  await expect
    .poll(async () => (await caller.connection.get({ connectionId: connection.id })).declared?.generation?.context?.window)
    .toBe(ADVANCED_TYPED.stored);
});

/** The "takes" fact's row in the Advanced tier, which the image switch and the list state as one fact. */
function takesRow(page: Page): Locator {
  return page.locator(`[data-slot="connection-editor-tier"][data-tier="${CONNECTION_EDITOR_TIER_TITLES.advanced}"]`).locator('[data-fact="generation.input"]');
}

function storedInput(declared: Awaited<ReturnType<Caller["connection"]["get"]>>["declared"]): readonly string[] | undefined {
  return declared?.generation?.input;
}

test("a model whose inputs nobody reports shows the image switch on as a guess, and turning it off stores the no", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  await mountList({ page, mount }, caller, WIDE_PROPS);
  await saveProxy(page, caller);
  const step = limitsStep(page);
  const images = step.getByRole("switch", { name: IMAGE_SWITCH_NAME, exact: true });
  await expect(images).toBeChecked();
  await expect(step.getByText(IMAGE_SWITCH_ASSUMED_GLOSS, { exact: true })).toBeVisible();
  const save = step.getByRole("button", { name: CONNECTION_LIMITS_SAVE_NAME, exact: true });
  // Untouched, the switch declares nothing, so there is nothing to save.
  await expect(save).toBeDisabled();

  await images.click();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(finish(page)).toBeVisible();

  const connection = await addedConnection(caller, PROXY_PROVIDER);
  expect(storedInput(connection.declared)).not.toContain("image");
  expect(storedInput(connection.declared)).toContain("text");
  // The window box was left empty, so the guess stays on the window.
  expect(connection.declared?.generation?.context).toBeUndefined();
  const after = await caller.connection.capabilities({ connectionId: connection.id, listFacts: true });
  expect(after.capability.kind === "generation" ? after.capability.generation.input : null).not.toContain("image");
});

test("a window typed with the image switch left on writes the window and no input", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  await mountList({ page, mount }, caller, WIDE_PROPS);
  await saveProxy(page, caller);
  const step = limitsStep(page);
  await expect(step.getByRole("switch", { name: IMAGE_SWITCH_NAME, exact: true })).toBeChecked();
  await step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.window, { exact: true }).fill(TYPED.window);
  await step.getByRole("button", { name: CONNECTION_LIMITS_SAVE_NAME, exact: true }).click();
  await expect(finish(page)).toBeVisible();
  const declared = (await addedConnection(caller, PROXY_PROVIDER)).declared;
  expect(declared?.generation?.context).toMatchObject({ window: REAL.window });
  expect(storedInput(declared)).toBeUndefined();
});

test("the editor's image switch reads a stored no, agrees with the takes row, and turning it on stores the yes", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const connection = await caller.connection.create({
    providerId: PROXY_PROVIDER,
    credentialId: null,
    baseUrl: PROXY_URL,
    model: PROXY_MODEL,
    label: "Requested proxy",
    declared: { kind: "generation", generation: { input: ["text"] } },
  });
  await mountList({ page, mount }, caller, { ...WIDE_PROPS, requested: connection.id });
  const images = page.getByRole("switch", { name: IMAGE_SWITCH_NAME, exact: true });
  await expect(images).not.toBeChecked();
  await expect(page.getByText(imageSwitchSetGloss(true), { exact: true })).toBeVisible();
  // The row's value is exactly the stored list, so the two controls cannot read different answers.
  await expect(takesRow(page).getByText(/^text$/u)).toBeVisible();

  await images.click();
  await expect.poll(async () => storedInput((await caller.connection.get({ connectionId: connection.id })).declared)).toContain("image");
  await expect(images).toBeChecked();
  await expect(takesRow(page).getByText("text, image", { exact: true })).toBeVisible();
});

test("the editor reads an assumed image answer as the guess and a stored yes as the user's own", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const connection = await caller.connection.create({
    providerId: PROXY_PROVIDER,
    credentialId: null,
    baseUrl: PROXY_URL,
    model: PROXY_MODEL,
    label: "Requested proxy",
  });
  await mountList({ page, mount }, caller, { ...WIDE_PROPS, requested: connection.id });
  const images = page.getByRole("switch", { name: IMAGE_SWITCH_NAME, exact: true });
  await expect(images).toBeChecked();
  await expect(page.getByText(IMAGE_SWITCH_ASSUMED_GLOSS, { exact: true })).toBeVisible();
  await expect(takesRow(page).getByText("text, image, video (assumed)", { exact: true })).toBeVisible();

  // Confirming the guess is an explicit answer: the same switch turned off and on writes the yes.
  await images.click();
  await expect(images).not.toBeChecked();
  await images.click();
  await expect(images).toBeChecked();
  await expect(page.getByText(imageSwitchSetGloss(true), { exact: true })).toBeVisible();
  expect(storedInput((await caller.connection.get({ connectionId: connection.id })).declared)).toContain("image");
});

test("a model whose provider states its inputs shows the stated answer, and the user's yes replaces it", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const credential = await caller.credentials.add({ provider: ROUTER_PROVIDER, key: ROUTER_KEY });
  const connection = await caller.connection.create({
    providerId: ROUTER_PROVIDER,
    credentialId: credential.id,
    baseUrl: null,
    // Its catalog row states a text-only input, and a curated row for the model would state otherwise.
    model: ROUTER_NO_WINDOW_MODEL.id,
    label: "Requested router",
  });
  await mountList({ page, mount }, caller, { ...WIDE_PROPS, requested: connection.id });
  const images = page.getByRole("switch", { name: IMAGE_SWITCH_NAME, exact: true });
  await expect(images).not.toBeChecked();
  await expect(page.getByText(IMAGE_SWITCH_STATED_GLOSS, { exact: true })).toBeVisible();

  await images.click();
  await expect(images).toBeChecked();
  await expect(page.getByText(imageSwitchSetGloss(false), { exact: true })).toBeVisible();
  expect(storedInput((await caller.connection.get({ connectionId: connection.id })).declared)).toContain("image");
});

test.describe("phone at enlarged text", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });
  for (const factor of ENLARGED_SCALES) {
    test(`at ${String(factor * 100)}% text every limits row, the image switch and both ways on stay readable and pressable`, async ({ mount, page }) => {
      await using root = await freshRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      await mountList({ page, mount }, caller, { width: PHONE.width, appearance: appearanceSettingsSchema.parse({}) });
      await setRootFontScale(page, channelName("fontScale"), factor);
      await saveProxy(page, caller);
      const step = limitsStep(page);
      for (const subject of [
        step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.window, { exact: true }),
        step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.output, { exact: true }),
        step.getByRole("switch", { name: IMAGE_SWITCH_NAME, exact: true }),
        step.getByRole("button", { name: CONNECTION_LIMITS_KEEP_NAME, exact: true }),
        step.getByRole("button", { name: CONNECTION_LIMITS_SAVE_NAME, exact: true }),
      ]) {
        await subject.scrollIntoViewIfNeeded();
        await expect(subject).toBeVisible();
        await expectWithinPhone(subject);
      }
      await step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.window, { exact: true }).fill(NONSENSE);
      const refusal = step.getByText(FACT_COUNT_INVALID, { exact: true });
      await refusal.scrollIntoViewIfNeeded();
      await expectWithinPhone(refusal);
      await step.getByRole("button", { name: CONNECTION_LIMITS_KEEP_NAME, exact: true }).click();
      await expect(finish(page)).toBeVisible();
    });
  }
});

async function expectWithinPhone(subject: Locator): Promise<void> {
  const box = await subject.boundingBox();
  if (box === null) {
    throw new Error("The subject has no box");
  }
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width + 1);
  expect(await subject.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
}
