import type { ModelCatalogEntry } from "@orb/contracts/inference";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry, resolvedLength, settledBox } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, TestInfo } from "@playwright/test";
import type { ConnectionActionGroupsStory } from "./_connection-action-groups-stories.tsx";
import type { ConnectionReadoutStory } from "./_connection-readout-stories.tsx";

const GROUP_STORY = "tests/client/features/credentials/components/_connection-readout-stories/ConnectionReadoutStory";
const LIST_STORY = "tests/client/features/credentials/components/_connection-action-groups-stories/ConnectionActionGroupsStory";
const NORMAL = { id: "anthropic/claude-haiku-5.5", name: "Anthropic: Claude Haiku 5.5" };
const BATCH = { id: "anthropic/claude-haiku-5.5:batch", name: "Anthropic: Claude Haiku 5.5 (batch)" };
const LONG_ID = `observatory/${"extremely-descriptive-catalog-identity-".repeat(12)}model`;
const KEY = "synthetic-readout-key-never-returned";
const LABEL = "A shared observatory connection for the northern expedition and its alternate model";
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
  "connection.update",
  "connection.embedSpaceChangePreview",
  "search.spaceStatus",
] as const;
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1440, height: 1000 }, touch: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, touch: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, touch: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, touch: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

const catalogFetch: typeof fetch = (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (request.method !== "GET" || url.hostname !== "openrouter.ai" || url.pathname !== "/api/v1/models") {
    throw new Error(`Unscripted readout external request: ${request.method} ${url}`);
  }
  const facts = {
    ["context_length"]: 200_000,
    pricing: { prompt: "0.000001", completion: "0.000005" },
    architecture: { ["input_modalities"]: ["text", "image"], ["output_modalities"]: ["text"] },
    ["supported_parameters"]: ["tools"],
  };
  return Promise.resolve(
    Response.json({
      data:
        url.search === ""
          ? [
              { ...NORMAL, ...facts },
              { ...BATCH, ...facts },
              { id: LONG_ID, ...facts },
            ]
          : [],
    }),
  );
};

const catalogNetwork = {
  fetch: catalogFetch,
  resolver: (hostname: string): Promise<string[]> =>
    hostname === "openrouter.ai" ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error(`Unscripted readout address: ${hostname}`)),
};

async function seedHosted(caller: Caller, missing: boolean, label: string): ReturnType<Caller["connection"]["create"]> {
  const credential = await caller.credentials.add({ provider: "openrouter", key: KEY });
  const connection = await caller.connection.create({
    providerId: "openrouter",
    credentialId: credential.id,
    baseUrl: null,
    model: NORMAL.id,
    modelCheck: "listed",
    label,
  });
  if (missing) {
    await caller.credentials.remove({ credentialId: credential.id });
  }
  return await caller.connection.get({ connectionId: connection.id });
}

async function expectPaintedLabel(row: Locator, label: string): Promise<void> {
  const text = row.getByText(label, { exact: true });
  await text.scrollIntoViewIfNeeded();
  await test.info().attach("model-label-budget", {
    body: JSON.stringify(
      await text.evaluate((node) => {
        const name = node.getBoundingClientRect();
        const option = node.closest('[role="option"]')?.getBoundingClientRect();
        return {
          label: node.textContent,
          name: { width: name.width, height: name.height },
          option: option === undefined ? null : { width: option.width, height: option.height },
          display: getComputedStyle(node).display,
          visibility: getComputedStyle(node).visibility,
        };
      }),
    ),
    contentType: "application/json",
  });
  await expect(text).toBeVisible();
  const paint = await text.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(node);
    return {
      bounds: { height: bounds.height, bottom: bounds.bottom },
      rects: Array.from(range.getClientRects(), (rect) => ({ bottom: rect.bottom })),
      lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight),
    };
  });
  expect(paint.bounds.height).toBeLessThanOrEqual(paint.lineHeight * 2 + 1);
  for (const rect of paint.rects) {
    expect(rect.bottom).toBeLessThanOrEqual(paint.bounds.bottom + 1);
  }
}

async function expectModelFacts(row: Locator, entry: ModelCatalogEntry, testInfo: TestInfo): Promise<void> {
  await expect(row).toContainText(entry.id);
  await expect(row.getByText("vision", { exact: true })).toBeVisible();
  await expect(row.getByText("tools", { exact: true })).toBeVisible();
  await expect(row.getByText("200K", { exact: true })).toBeVisible();
  await expect(row.getByText("$1/M", { exact: true })).toBeVisible();
  const geometry = await actionGroupGeometry(row, await row.locator('[data-slot="badge"]').all());
  await testInfo.attach("actual-model-row-facts", { body: JSON.stringify({ modelId: entry.id, ...geometry }), contentType: "application/json" });
  expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.touch, hasTouch: regime.touch });
    test("drilling a connection removes only the redundant list-heading paint and retains group, anchor and focus", async ({ mount, page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({
        startJobs: false,
        providerFetch: catalogFetch,
        networkExecution: catalogNetwork,
        secretBoxKey: Buffer.alloc(32, 17),
      });
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      await seedHosted(caller, false, LABEL);
      await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...READS]));
      await mount<typeof ConnectionReadoutStory>(GROUP_STORY, { width: regime.width, height: regime.viewport.height, appearance: regime.appearance });
      const group = page.getByRole("heading", { name: "Connections", level: 2, exact: true });
      const heading = page.getByRole("heading", { name: "Connections", level: 3, exact: true });
      await expect(group).toBeVisible();
      expect((await settledBox(heading)).height).toBeGreaterThan(1);
      const anchorId = await heading.locator("..").getAttribute("id");
      if (anchorId === null || anchorId === "") {
        throw new Error("The real Connections section omitted its navigation anchor");
      }
      const opener = page.locator('[data-slot="list-row-body"]').filter({ hasText: LABEL });
      await opener.click();
      const back = page.getByRole("button", { name: "Back to Connections", exact: true });
      const done = page.getByRole("button", { name: "Done", exact: true });
      await expect(back).toBeFocused();
      await expect(group).toBeVisible();
      await expect(heading).toHaveCount(1);
      await expect(heading.locator("..")).toHaveAttribute("id", anchorId);
      expect((await settledBox(heading)).height).toBeLessThanOrEqual(1);
      await expect(page.locator('[data-slot="connection-editor"]').getByText(LABEL, { exact: true })).toBeVisible();
      expect((await actionGroupGeometry(page.locator('[data-slot="config-content"]'), [back, done])).inlineOverflow).toBeLessThanOrEqual(1);
      await page.locator('[data-slot="config-content"]').screenshot({ path: testInfo.outputPath("connection-drilled-heading.png") });
      await done.click();
      await expect(opener).toBeFocused();
      expect((await settledBox(heading)).height).toBeGreaterThan(1);
    });

    test("keyless, attached and removed credentials have distinct honest Essential readouts", async ({ mount, page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({
        startJobs: false,
        providerFetch: catalogFetch,
        networkExecution: catalogNetwork,
        secretBoxKey: Buffer.alloc(32, 17),
      });
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      const builtin = await caller.connection.draftCatalogModels({ providerId: "local-light" });
      if (!builtin.listed || builtin.models[0] === undefined) {
        throw new Error("The actual keyless provider omitted its built-in model catalog");
      }
      const keyless = await caller.connection.create({
        providerId: "local-light",
        credentialId: null,
        baseUrl: null,
        model: builtin.models[0].id,
        modelCheck: "listed",
        label: "Genuinely keyless built-in connection",
      });
      const attached = await seedHosted(caller, false, "A connection with a saved key");
      const missing = await seedHosted(caller, true, "A connection whose saved key was removed");
      const providers = await caller.connection.providersAvailable();
      expect(providers.find((entry) => entry.provider.id === keyless.providerId)?.provider.auth).toBe("none");
      expect(providers.find((entry) => entry.provider.id === missing.providerId)?.provider.auth).toBe("apiKey");
      expect(missing.credentialId).toBeNull();
      const calls = await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof ConnectionActionGroupsStory>(LIST_STORY, { width: regime.width, appearance: regime.appearance });
      for (const [connection, copy] of [
        [keyless, "none — this provider needs no key"],
        [attached, "saved"],
        [missing, "not set — this provider requires a saved credential"],
      ] as const) {
        await page.locator('[data-slot="list-row-body"]').filter({ hasText: connection.label }).click();
        const editor = page.locator('[data-slot="connection-editor"]');
        await expect(editor.getByText(copy, { exact: true })).toBeVisible();
        await expect(editor.getByText(KEY, { exact: false })).toHaveCount(0);
        await editor.screenshot({
          path: testInfo.outputPath(`credential-readout-${connection.providerId}-${connection.credentialId === null ? "unset" : "saved"}.png`),
        });
        await page.getByRole("button", { name: "Done", exact: true }).click();
      }
      expect(calls.count("connection.update")).toBe(0);
      expect((await caller.connection.get({ connectionId: missing.id })).credentialId).toBeNull();
    });

    test("the actual picker preserves normal versus batch identity, facts and selected/current states without uncapping long ids", async ({
      mount,
      page,
    }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({
        startJobs: false,
        providerFetch: catalogFetch,
        networkExecution: catalogNetwork,
        secretBoxKey: Buffer.alloc(32, 17),
      });
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      const connection = await seedHosted(caller, false, LABEL);
      const listing = await caller.connection.catalogModels({ connectionId: connection.id });
      if (!listing.listed) {
        throw new Error(`The scripted external catalog was refused by the real producer: ${listing.reason}`);
      }
      const calls = await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof ConnectionActionGroupsStory>(LIST_STORY, { width: regime.width, appearance: regime.appearance });
      await page.locator('[data-slot="list-row-body"]').filter({ hasText: LABEL }).click();
      const editor = page.locator('[data-slot="connection-editor"]');
      for (const entry of listing.models.filter((model) => model.id === NORMAL.id || model.id === BATCH.id)) {
        const row = editor.getByRole("option").filter({ has: page.getByText(entry.name, { exact: true }) });
        await expectPaintedLabel(row, entry.name);
        await expectModelFacts(row, entry, testInfo);
      }
      await expect(editor.getByRole("option").filter({ hasText: NORMAL.id }).getByText("Selected", { exact: true })).toBeVisible();
      const longLabel = editor.getByRole("option").getByText(LONG_ID, { exact: true });
      await longLabel.scrollIntoViewIfNeeded();
      await expect(longLabel).toBeVisible();
      const cap = await longLabel.evaluate((node) => ({
        height: node.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight),
      }));
      expect(cap.height).toBeLessThanOrEqual(cap.lineHeight * 2 + 1);
      await page.getByRole("button", { name: "Done", exact: true }).click();
      const row = page.locator('[data-slot="list-row-root"]').filter({ hasText: LABEL });
      const menu = row.getByRole("button", { name: /^More actions for /u });
      await menu.click();
      await page.getByRole("menuitem", { name: /^Add another model on this key/u }).click();
      const dialog = page.getByRole("dialog", { name: "Add another model on this key", exact: true });
      const bounds = await settledBox(dialog);
      const dialogCap = await resolvedLength(page, "var(--width-dialog-lg)", dialog);
      const inset = await resolvedLength(page, "var(--spacing-field)", dialog);
      const viewportWidth = await page.evaluate(() => innerWidth);
      await testInfo.attach("model-picker-dialog-width", {
        body: JSON.stringify({ bounds, cap: dialogCap, inset, viewportWidth }),
        contentType: "application/json",
      });
      expect(Math.abs(bounds.width - Math.min(viewportWidth - inset * 2, dialogCap))).toBeLessThanOrEqual(1);
      const current = dialog.getByRole("option").filter({ has: page.getByText(NORMAL.name, { exact: true }) });
      await expect(current.getByText("Already added", { exact: true })).toBeVisible();
      await expectPaintedLabel(current, NORMAL.name);
      const batch = dialog.getByRole("option").filter({ has: page.getByText(BATCH.name, { exact: true }) });
      await batch.scrollIntoViewIfNeeded();
      await settledBox(batch);
      const hit = await batch.evaluate((option) => {
        const optionBounds = option.getBoundingClientRect();
        const point = { x: optionBounds.x + optionBounds.width / 2, y: optionBounds.y + optionBounds.height / 2 };
        const target = document.elementFromPoint(point.x, point.y);
        return {
          point,
          box: { x: optionBounds.x, y: optionBounds.y, width: optionBounds.width, height: optionBounds.height },
          ownsHit: target !== null && option.contains(target),
          targetSlot: target?.closest("[data-slot]")?.getAttribute("data-slot") ?? null,
        };
      });
      await testInfo.attach("settled-batch-hit", { body: JSON.stringify(hit), contentType: "application/json" });
      expect(hit.ownsHit).toBe(true);
      await batch.click();
      await expect(batch.getByText("Selected", { exact: true })).toBeVisible();
      await expectPaintedLabel(batch, BATCH.name);
      await expect(dialog.locator('[data-slot="model-picker-picked"]')).toContainText(BATCH.id);
      await dialog.screenshot({ path: testInfo.outputPath("picker-normal-batch-facts.png") });
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(menu).toBeFocused();
      expect(calls.count("connection.update")).toBe(0);
      expect((await caller.connection.get({ connectionId: connection.id })).model).toBe(NORMAL.id);
    });
  });
}
