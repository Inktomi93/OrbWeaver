import type { PromptCacheSettings } from "@orb/contracts/inference";
import { builtinProvider, effectivePromptCache, foldFeatures, SUMMARIZE_CONCURRENCY_MAX } from "@orb/contracts/inference";
import { expectCacheProse } from "@orb/testkit/browser";
import type { TrpcInput, TrpcRecorder, TrpcWireOutput } from "@orb/testkit/ct";
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { ConnectionPromptCacheStory } from "./_prompt-cache-stories.tsx";

interface CacheRead {
  readonly connection: TrpcWireOutput<"connection.get">;
  readonly capability: TrpcWireOutput<"connection.capabilities">;
  readonly list: TrpcWireOutput<"connection.list">;
}

interface CacheCapture {
  readonly before: CacheRead;
  readonly after: CacheRead;
  readonly updated: TrpcWireOutput<"connection.update">;
  readonly expectedUpdate: TrpcInput<"connection.update">;
  readonly viewer: TrpcWireOutput<"sessions.me">;
  readonly settings: TrpcWireOutput<"settings.getUserSettings">;
  readonly bindings: TrpcWireOutput<"connection.listBindings">;
  readonly credentials: TrpcWireOutput<"credentials.list">;
  readonly providers: TrpcWireOutput<"connection.providersAvailable">;
  readonly catalog: TrpcWireOutput<"connection.catalogModels">;
  readonly authConfig: string;
  readonly physicalRequests: readonly string[];
}

// Only vendor catalog bytes are scripted; the root owns saved connections, capability synthesis and cache policy.
async function captureCacheRoute(providerId: string, model: string, replay = false, change?: Partial<PromptCacheSettings>): Promise<CacheCapture> {
  const provider = builtinProvider(providerId);
  if (provider?.baseUrl === undefined) {
    throw new Error("The cache witness requires a canonical hosted provider");
  }
  const origin = new URL(provider.baseUrl).origin;
  const catalogPath = `${new URL(provider.baseUrl).pathname.replace(/\/$/u, "")}${providerId === "anthropic" ? "/v1" : ""}/models`;
  const physicalRequests: string[] = [];
  const catalogFetch: typeof fetch = (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== origin || url.pathname !== catalogPath) {
      throw new Error(`Unexpected cache witness physical request: ${request.method} ${url.origin}${url.pathname}`);
    }
    physicalRequests.push(request.url);
    if (providerId === "google") {
      return Promise.resolve(Response.json({ models: [{ name: `models/${model}`, supportedGenerationMethods: ["generateContent"] }] }));
    }
    if (providerId === "openrouter") {
      return Promise.resolve(
        Response.json({
          data: url.searchParams.has("output_modalities")
            ? []
            : [{ id: model, architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["text"] }, ["supported_parameters"]: [] }],
        }),
      );
    }
    return Promise.resolve(Response.json({ data: [{ id: model }] }));
  };
  await using root = await createServerHarness({
    secretBoxKey: Buffer.alloc(32, 17),
    startJobs: false,
    providerFetch: catalogFetch,
    networkExecution: {
      fetch: catalogFetch,
      resolver: (hostname) => {
        if (hostname !== new URL(origin).hostname) {
          throw new Error("Unexpected cache witness catalog hostname");
        }
        return Promise.resolve(["93.184.215.14"]);
      },
    },
  });
  const caller = await root.internalCallerFor(root.ownerId);
  const credential = await caller.credentials.add({ provider: providerId, key: "synthetic-cache-editor-key" });
  const connection = await caller.connection.create({
    providerId,
    credentialId: credential.id,
    label: "Caching route",
    baseUrl: null,
    model,
    ...(replay ? { transport: { headers: { "X-OpenRouter-Cache": "true" } } } : {}),
  });
  const connectionId = connection.id;
  const catalog = await caller.connection.catalogModels({ connectionId });
  if (!(catalog.listed && catalog.models.some((row) => row.id === model))) {
    throw new Error("The real provider catalog did not list the cache witness");
  }
  await caller.connection.update({ connectionId, patch: { modelCheck: "listed" } });
  const before = {
    connection: await caller.connection.get({ connectionId }),
    capability: await caller.connection.capabilities({ connectionId }),
    list: await caller.connection.list(),
  };
  const generation = before.capability.capability.kind === "generation" ? before.capability.capability.generation : null;
  if (generation === null) {
    throw new Error("The real saved cache witness did not resolve as generation");
  }
  const defaults = effectivePromptCache(before.connection.promptCache, generation.turns?.promptCacheDefaultEnabled, generation.turns?.fixedCacheTtl);
  const expectedUpdate: TrpcInput<"connection.update"> = { connectionId, patch: { promptCache: { ...defaults, ...change } } };
  const updated = change === undefined ? before.connection : await caller.connection.update(expectedUpdate);
  const after = {
    connection: await caller.connection.get({ connectionId }),
    capability: await caller.connection.capabilities({ connectionId }),
    list: await caller.connection.list(),
  };
  const authConfig = await root.http.request("/api/auth/config");
  if (!authConfig.ok) {
    throw new Error("The real cache witness root did not serve auth configuration");
  }
  return {
    before,
    after,
    updated,
    expectedUpdate,
    viewer: await caller.sessions.me(),
    settings: await caller.settings.getUserSettings(),
    bindings: await caller.connection.listBindings(),
    credentials: await caller.credentials.list(),
    providers: await caller.connection.providersAvailable(),
    catalog,
    authConfig: await authConfig.text(),
    physicalRequests,
  };
}

async function installCacheRoute(page: Page, captured: CacheCapture): Promise<TrpcRecorder> {
  let acknowledged = false;
  await page.route("**/api/auth/config", (route) => route.fulfill({ contentType: "application/json", body: captured.authConfig }));
  return await routeTrpc(page, {
    "sessions.me": () => captured.viewer,
    "settings.getUserSettings": () => captured.settings,
    "connection.list": () => (acknowledged ? captured.after.list : captured.before.list),
    "connection.listBindings": () => captured.bindings,
    "credentials.list": () => captured.credentials,
    "connection.providersAvailable": () => captured.providers,
    "connection.catalogModels": () => captured.catalog,
    "connection.get": () => (acknowledged ? captured.after.connection : captured.before.connection),
    "connection.capabilities": () => (acknowledged ? captured.after.capability : captured.before.capability),
    "connection.update": () => {
      acknowledged = true;
      return captured.updated;
    },
  });
}

async function openCacheTier(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: /^Caching route · /u }).click();
  await page.getByRole("button", { name: /^Prompt caching/u }).click();
  const tier = page.locator('[data-slot="connection-prompt-cache"]');
  await expect(tier).toBeVisible();
  return tier;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "no-preference", contrast: "no-preference", forcedColors: "none" });
});

test("native implicit caching explains provider ownership without invented controls or price claims", async ({ page, mount }) => {
  const captured = await captureCacheRoute("google", "gemini-3.8-flash");
  await installCacheRoute(page, captured);
  await mount<typeof ConnectionPromptCacheStory>("tests/client/features/credentials/components/_prompt-cache-stories/ConnectionPromptCacheStory", {
    width: 486,
  });
  const tier = await openCacheTier(page);
  await expect(
    tier.getByText("Provider-managed implicit prefix caching is available; eligibility and hits are determined upstream.", { exact: true }),
  ).toBeVisible();
  await expect(tier.getByRole("switch")).toHaveCount(0);
  await expect(tier.getByRole("combobox")).toHaveCount(0);
  await expect(tier.getByRole("radio")).toHaveCount(0);
  await expect(tier.getByText(/a tenth/u)).toHaveCount(0);
  await page.getByRole("button", { name: /^Advanced/u }).click();
  await expect(page.getByText("Endpoint quirks", { exact: true })).toBeVisible();
  const concurrency = page.locator('[data-fact="features.concurrency.summarize"]');
  await expect(concurrency.getByText(String(foldFeatures(builtinProvider("google")?.features).concurrency?.summarize), { exact: true })).toBeVisible();
  await concurrency.getByRole("button", { name: "Override utility calls at once", exact: true }).click();
  const limit = concurrency.getByRole("textbox", { name: "utility calls at once — your value", exact: true });
  await limit.fill(String(SUMMARIZE_CONCURRENCY_MAX + 1));
  await expect(concurrency.getByRole("alert")).toHaveText(`The maximum is ${SUMMARIZE_CONCURRENCY_MAX}.`);
  await expect(concurrency.getByRole("button", { name: "Save your utility calls at once", exact: true })).toBeDisabled();
  await limit.fill(String(SUMMARIZE_CONCURRENCY_MAX));
  await expect(concurrency.getByRole("alert")).toHaveCount(0);
  await expect(concurrency.getByRole("button", { name: "Save your utility calls at once", exact: true })).toBeEnabled();
  expect(captured.physicalRequests.length).toBeGreaterThan(0);
});

test("modern prefix caching retains provider minimum prose and saves the implicit-disable control", async ({ page, mount }) => {
  const captured = await captureCacheRoute("openai", "gpt-6-sol", false, { disableImplicit: true });
  const calls = await installCacheRoute(page, captured);
  await mount<typeof ConnectionPromptCacheStory>("tests/client/features/credentials/components/_prompt-cache-stories/ConnectionPromptCacheStory", {
    width: 486,
  });
  const tier = await openCacheTier(page);
  await expect(tier.getByRole("radio")).toHaveCount(0);
  await expect(tier.getByText(/at least 30 minutes/u)).toBeVisible();
  const disable = tier.getByRole("switch", { name: "Disable implicit breakpoints on Caching route", exact: true });
  await expect(disable).toBeEnabled();
  await disable.click();
  await expect(disable).toBeChecked();
  await expect.poll(() => calls.lastInput("connection.update")).toEqual(captured.expectedUpdate);
});

test("automatic placement disables manual markers but leaves applicable retention available", async ({ page, mount }) => {
  const captured = await captureCacheRoute("anthropic", "claude-sonnet-5", false, { requestAutomatic: true });
  const calls = await installCacheRoute(page, captured);
  await mount<typeof ConnectionPromptCacheStory>("tests/client/features/credentials/components/_prompt-cache-stories/ConnectionPromptCacheStory", {
    width: 870,
  });
  const tier = await openCacheTier(page);
  const system = tier.getByRole("switch", { name: "Cache the system prompt on Caching route", exact: true });
  const depth = tier.getByRole("textbox", { name: "History cache depth", exact: true });
  await expect(system).toBeEnabled();
  await expect(depth).toBeEnabled();
  await tier.getByRole("switch", { name: "Automatic prefix placement on Caching route", exact: true }).click();
  await expect(system).toBeDisabled();
  await expect(depth).toBeDisabled();
  await expect(tier.getByRole("radio").first()).toBeEnabled();
  await expect.poll(() => calls.lastInput("connection.update")).toEqual(captured.expectedUpdate);
});

test("earlier OpenAI retention offers only its supported provider choices", async ({ page, mount }) => {
  const captured = await captureCacheRoute("openai", "gpt-5.5", false, { retention: "24h" });
  const calls = await installCacheRoute(page, captured);
  await mount<typeof ConnectionPromptCacheStory>("tests/client/features/credentials/components/_prompt-cache-stories/ConnectionPromptCacheStory", {
    width: 486,
  });
  const tier = await openCacheTier(page);
  await tier.getByRole("combobox", { name: "Provider prefix retention on Caching route", exact: true }).click();
  await expect(page.getByRole("option", { name: "Inherit provider default", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "In memory", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Up to 24 hours", exact: true }).click();
  await expect(tier.getByRole("combobox", { name: "Provider prefix retention on Caching route", exact: true })).toHaveText("Up to 24 hours");
  await expect.poll(() => calls.lastInput("connection.update")).toEqual(captured.expectedUpdate);
});

test("header-requested complete-response replay is reported separately from prefix caching", async ({ page, mount }) => {
  const captured = await captureCacheRoute("openrouter", "anthropic/claude-sonnet-5", true);
  await installCacheRoute(page, captured);
  await mount<typeof ConnectionPromptCacheStory>("tests/client/features/credentials/components/_prompt-cache-stories/ConnectionPromptCacheStory", {
    width: 870,
  });
  const tier = await openCacheTier(page);
  await expect(tier.getByText(/Complete-response replay: requested by connection headers/u)).toBeVisible();
  await expect(tier.getByText(/Complete-response replay: off by default/u)).toHaveCount(0);
});

for (const width of [870, 486]) {
  test(`cache explanations retain their own prose typography and reading cap at ${width}`, async ({ page, mount }, testInfo) => {
    const captured = await captureCacheRoute("openrouter", "anthropic/claude-sonnet-5", true);
    await installCacheRoute(page, captured);
    await mount<typeof ConnectionPromptCacheStory>("tests/client/features/credentials/components/_prompt-cache-stories/ConnectionPromptCacheStory", { width });
    const tier = await openCacheTier(page);
    await tier.evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
          .map((animation) => animation.finished),
      );
    });
    const paragraphs = tier.locator('p[data-voice="gloss"]').filter({ hasNotText: /^App prefix request:/u });
    expect(await paragraphs.count()).toBeGreaterThan(3);
    for (const paragraph of await paragraphs.all()) {
      await expectCacheProse(paragraph);
    }
    const screenshot = testInfo.outputPath("prompt-cache.png");
    await tier.screenshot({ path: screenshot });
    await testInfo.attach("prompt-cache", { path: screenshot });
  });
}
