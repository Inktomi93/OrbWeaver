// @subject packages/client/src/features/credentials/components/connection-limits-step.tsx
// Adding a connection whose server reports no limits says so at that moment and takes the real numbers into the
// connection's own declaration; one whose provider reports them goes straight on; a door outside the list lands on the
// editor's Advanced tier, where the same limits are kept. Each limits row stays readable and pressable at enlarged text.

import { providerDisplayLabel } from "@orb/contracts/inference";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { setRootFontScale } from "@orb/testkit/browser/spec";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { channelName, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
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
  FIRST_MODEL_FINISH_NAME,
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
  "connection.capabilities",
  "connection.update",
  "connection.embedSpaceChangePreview",
  "search.spaceStatus",
] as const;
// A hosted proxy reached through Custom OpenAI-compatible: its model list carries ids and nothing about their limits.
const PROXY_HOST = "llm.example.com";
const PROXY_URL = `https://${PROXY_HOST}/v1`;
const PROXY_PROVIDER = "custom-openai";
const PROXY_MODEL = "vendor/long-context-model";
// The OpenRouter catalog, which states a window and an output cap for every model it lists.
const ROUTER_HOST = "openrouter.ai";
const ROUTER_PROVIDER = "openrouter";
const ROUTER_MODEL = { id: "anthropic/claude-haiku-5.5", name: "Anthropic: Claude Haiku 5.5" };
const ROUTER_KEY = "synthetic-limits-key-never-returned";
// The model's real limits, as its provider's page states them.
const REAL = { window: 1_000_000, output: 32_768 } as const;
const PUBLIC_ADDRESS = "93.184.215.14";
const HTTP_NOT_FOUND = 404;
const WIDE = { width: 960, viewport: { width: 1440, height: 1000 } } as const;
const PHONE = { width: 390, height: 844 } as const;
const ENLARGED_SCALES = [2, 3] as const;
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

/** The two external servers: the proxy's id-only model list, and OpenRouter's catalog with each model's limits. */
const scriptedFetch: typeof fetch = (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (request.method === "GET" && url.hostname === PROXY_HOST && url.pathname === "/v1/models") {
    return Promise.resolve(Response.json({ object: "list", data: [{ id: PROXY_MODEL, object: "model" }] }));
  }
  if (request.method === "GET" && url.hostname === ROUTER_HOST && url.pathname === "/api/v1/models") {
    return Promise.resolve(
      Response.json({
        data:
          url.search === ""
            ? [
                {
                  ...ROUTER_MODEL,
                  ["context_length"]: REAL.window,
                  ["top_provider"]: { ["max_completion_tokens"]: REAL.output },
                  pricing: { prompt: "0.000001", completion: "0.000005" },
                  architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["text"] },
                  ["supported_parameters"]: ["tools"],
                },
              ]
            : [],
      }),
    );
  }
  // Every other read (a server-identity probe, a native model-info route) answers as a server without that route.
  return Promise.resolve(new Response("{}", { status: HTTP_NOT_FOUND }));
};

const scriptedNetwork = {
  fetch: scriptedFetch,
  resolver: (hostname: string): Promise<string[]> =>
    hostname === PROXY_HOST || hostname === ROUTER_HOST ? Promise.resolve([PUBLIC_ADDRESS]) : Promise.reject(new Error(`Unscripted address: ${hostname}`)),
};

async function freshRoot(): Promise<ServerTestHarness> {
  return await createServerHarness({ startJobs: false, providerFetch: scriptedFetch, networkExecution: scriptedNetwork, secretBoxKey: Buffer.alloc(32, 23) });
}

async function mountList(
  page: Page,
  mount: PlaywrightTestArgs["mount"],
  caller: Caller,
  props: Parameters<typeof ConnectionLimitsStory>[0],
): Promise<TrpcRecorder> {
  const calls = await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...READS]));
  await mount<typeof ConnectionLimitsStory>(STORY, props);
  return calls;
}

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

/** Adds the proxy through Custom OpenAI-compatible with a typed model id, and returns the limits step it opens. */
async function addProxy(page: Page, caller: Caller): Promise<Locator> {
  const dialog = await pickProvider(page, caller, PROXY_PROVIDER);
  await dialog.getByLabel("Server URL", { exact: true }).fill(PROXY_URL);
  await dialog.getByLabel("Model", { exact: true }).fill(PROXY_MODEL);
  await dialog.getByRole("button", { name: ADD_CONNECTION_NAME, exact: true }).click();
  const step = page.getByRole("dialog", { name: CONNECTION_LIMITS_TITLE, exact: true });
  await expect(step).toBeVisible();
  return step;
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

test("a server that reports no limits asks for the real ones as it is added, and keeps them in the connection's own declaration", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  await mountList(page, mount, caller, { width: WIDE.width, appearance: appearanceSettingsSchema.parse({}) });
  const step = await addProxy(page, caller);
  const before = await caller.connection.capabilities({ connectionId: (await addedConnection(caller, PROXY_PROVIDER)).id });
  if (before.capability.kind !== "generation") {
    throw new Error("The proxy connection did not resolve a generation model");
  }
  expect(before.capability.generation.context.windowEstimated).toBe(true);
  expect(before.capability.generation.output.maxTokensEstimated).toBe(true);

  await step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.window, { exact: true }).fill(String(REAL.window));
  await step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.output, { exact: true }).fill(String(REAL.output));
  await step.getByRole("button", { name: CONNECTION_LIMITS_SAVE_NAME, exact: true }).click();
  // The first chat model goes on to the first-model step, as an add without the limits step does.
  await expect(page.getByRole("button", { name: FIRST_MODEL_FINISH_NAME, exact: true })).toBeVisible();

  const connection = await addedConnection(caller, PROXY_PROVIDER);
  expect(connection.declared?.generation).toMatchObject({ context: { window: REAL.window }, output: { maxTokens: { max: REAL.output } } });
  const after = await caller.connection.capabilities({ connectionId: connection.id });
  expect(after.capability).toMatchObject({ generation: { context: { window: REAL.window }, output: { maxTokens: { max: REAL.output } } } });
  expect(after.capability.kind === "generation" ? after.capability.generation.context.windowEstimated : null).toBeUndefined();
});

test("keeping the guess writes nothing and goes on", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const calls = await mountList(page, mount, caller, { width: WIDE.width, appearance: appearanceSettingsSchema.parse({}) });
  const step = await addProxy(page, caller);
  await step.getByRole("button", { name: CONNECTION_LIMITS_KEEP_NAME, exact: true }).click();
  await expect(page.getByRole("button", { name: FIRST_MODEL_FINISH_NAME, exact: true })).toBeVisible();
  expect(calls.count("connection.update")).toBe(0);
  expect((await addedConnection(caller, PROXY_PROVIDER)).declared?.generation).toBeUndefined();
});

test("a provider that reports its limits adds with no limits step", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const calls = await mountList(page, mount, caller, { width: WIDE.width, appearance: appearanceSettingsSchema.parse({}) });
  const dialog = await pickProvider(page, caller, ROUTER_PROVIDER);
  await dialog.getByLabel(API_KEY_FIELD_NAME, { exact: true }).fill(ROUTER_KEY);
  await dialog
    .getByRole("option", { name: new RegExp(ROUTER_MODEL.name, "u") })
    .first()
    .click();
  await dialog.getByRole("button", { name: ADD_CONNECTION_NAME, exact: true }).click();

  await expect(page.getByRole("button", { name: FIRST_MODEL_FINISH_NAME, exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: CONNECTION_LIMITS_TITLE, exact: true })).toHaveCount(0);
  expect(calls.count("connection.capabilities")).toBeGreaterThan(0);
  const view = await caller.connection.capabilities({ connectionId: (await addedConnection(caller, ROUTER_PROVIDER)).id });
  expect(view.capability).toMatchObject({ generation: { context: { window: REAL.window }, output: { maxTokens: { max: REAL.output } } } });
});

test("a door outside the list opens that connection's editor with its Advanced tier expanded", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const connection = await caller.connection.create({
    providerId: PROXY_PROVIDER,
    credentialId: null,
    baseUrl: PROXY_URL,
    model: PROXY_MODEL,
    label: "Requested proxy",
  });
  await mountList(page, mount, caller, { width: WIDE.width, appearance: appearanceSettingsSchema.parse({}), requested: connection.id });
  const editor = page.locator('[data-slot="connection-editor"]');
  await expect(editor).toBeVisible();
  const advanced = editor.locator(`[data-slot="connection-editor-tier"][data-tier="${CONNECTION_EDITOR_TIER_TITLES.advanced}"]`);
  await expect(advanced.locator('[data-fact="generation.context.window"]')).toBeVisible();
  await expect(advanced.locator('[data-fact="generation.output.maxTokens.max"]')).toBeVisible();
});

test.describe("phone at enlarged text", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });
  for (const factor of ENLARGED_SCALES) {
    test(`at ${String(factor * 100)}% text every limits row and both ways on stay readable and pressable`, async ({ mount, page }) => {
      await using root = await freshRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      await mountList(page, mount, caller, { width: PHONE.width, appearance: appearanceSettingsSchema.parse({}) });
      await setRootFontScale(page, channelName("fontScale"), factor);
      const step = await addProxy(page, caller);
      for (const subject of [
        step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.window, { exact: true }),
        step.getByLabel(CONNECTION_LIMIT_FIELD_NAMES.output, { exact: true }),
        step.getByRole("button", { name: CONNECTION_LIMITS_KEEP_NAME, exact: true }),
        step.getByRole("button", { name: CONNECTION_LIMITS_SAVE_NAME, exact: true }),
      ]) {
        await subject.scrollIntoViewIfNeeded();
        await expect(subject).toBeVisible();
        await expectWithinPhone(subject);
      }
      await step.getByRole("button", { name: CONNECTION_LIMITS_KEEP_NAME, exact: true }).click();
      await expect(page.getByRole("button", { name: FIRST_MODEL_FINISH_NAME, exact: true })).toBeVisible();
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
