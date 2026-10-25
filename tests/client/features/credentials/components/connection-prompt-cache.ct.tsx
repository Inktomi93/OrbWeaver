import type { PromptCacheSettings } from "@orb/contracts/inference";
import { builtinProvider, effectivePromptCache, foldFeatures, SUMMARIZE_CONCURRENCY_MAX } from "@orb/contracts/inference";
import { expectCacheProse } from "@orb/testkit/browser/spec";
import type { TrpcInput, TrpcRecorder } from "@orb/testkit/ct";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { ConnectionPromptCacheStory } from "./_prompt-cache-stories.tsx";

/** A real root holding the saved connection; it lives until the test disposes the capture. */
interface CacheCapture extends AsyncDisposable {
  readonly caller: object;
  readonly expectedUpdate: TrpcInput<"connection.update">;
  readonly authConfig: string;
  readonly physicalRequests: readonly string[];
}

const CACHE_READS = [
  "sessions.me",
  "settings.getUserSettings",
  "connection.list",
  "connection.listBindings",
  "credentials.list",
  "connection.providersAvailable",
  "connection.catalogModels",
  "connection.get",
  "connection.capabilities",
  "connection.update",
] as const;

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
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({
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
    }),
  );
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
  const savedConnection = await caller.connection.get({ connectionId });
  const capability = await caller.connection.capabilities({ connectionId });
  const generation = capability.capability.kind === "generation" ? capability.capability.generation : null;
  if (generation === null) {
    throw new Error("The real saved cache witness did not resolve as generation");
  }
  const defaults = effectivePromptCache(savedConnection.promptCache, generation.turns?.promptCacheDefaultEnabled, generation.turns?.fixedCacheTtl);
  const expectedUpdate: TrpcInput<"connection.update"> = { connectionId, patch: { promptCache: { ...defaults, ...change } } };
  const authConfig = await root.http.request("/api/auth/config");
  if (!authConfig.ok) {
    throw new Error("The real cache witness root did not serve auth configuration");
  }
  const lifetime = construction.move();
  return { caller, expectedUpdate, authConfig: await authConfig.text(), physicalRequests, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

async function installCacheRoute(page: Page, captured: CacheCapture): Promise<TrpcRecorder> {
  await page.route("**/api/auth/config", (route) => route.fulfill({ contentType: "application/json", body: captured.authConfig }));
  return await routeTrpc(page, serveCorpusProcedures(captured.caller, CACHE_READS));
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
  await using captured = await captureCacheRoute("google", "gemini-3.8-flash");
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
  await using captured = await captureCacheRoute("openai", "gpt-6-sol", false, { disableImplicit: true });
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
  await using captured = await captureCacheRoute("anthropic", "claude-sonnet-5", false, { requestAutomatic: true });
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
  await using captured = await captureCacheRoute("openai", "gpt-5.5", false, { retention: "24h" });
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
  await using captured = await captureCacheRoute("openrouter", "anthropic/claude-sonnet-5", true);
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
    await using captured = await captureCacheRoute("openrouter", "anthropic/claude-sonnet-5", true);
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
