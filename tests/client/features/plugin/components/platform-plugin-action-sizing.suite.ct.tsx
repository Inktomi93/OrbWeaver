import { spawn } from "node:child_process";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginSurfaceSpecSchema } from "@orb/contracts/plugin";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, makePluginBundle, requireShowcaseBundle } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { PluginPresentationPageStory } from "../_ct-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
const STORY = "tests/client/features/plugin/_ct-stories/PluginPresentationPageStory";
const LONG_ACTION = "Review the current note alongside the complete northern expedition reference archive";
const NOTE_FIELD = "Ledger note";
const REGIMES = [
  { name: "narrow desktop", width: 300, viewport: { width: 1440, height: 900 }, touch: false },
  { name: "coarse portrait", width: 390, viewport: { width: 390, height: 844 }, touch: true },
  { name: "wide desktop", width: 960, viewport: { width: 1440, height: 900 }, touch: false },
] as const;
const SPECS = {
  single: pluginSurfaceSpecSchema.parse({
    kind: "stack",
    children: [
      { kind: "button", actionId: "refresh", label: "Refresh note", variant: "primary" },
      { kind: "text", value: { $state: "receipt" } },
    ],
  }),
  mixed: pluginSurfaceSpecSchema.parse({
    kind: "stack",
    children: [
      { kind: "textField", name: "note", label: NOTE_FIELD, value: "original" },
      { kind: "meter", label: "Progress", value: 1, max: 3 },
      { kind: "button", actionId: "apply", label: "Apply note", variant: "primary" },
      { kind: "button", actionId: "review", label: LONG_ACTION, variant: "outline" },
      { kind: "confirmButton", actionId: "clear", label: "Clear note", confirmTitle: "Clear this note?" },
      { kind: "text", value: { $state: "receipt" } },
    ],
  }),
};

async function routePage(page: Page, caller: Caller): Promise<TrpcRecorder> {
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  return await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "plugin.list",
      "plugin.listSurfaces",
      "plugin.getSurfaceState",
      "plugin.invokeUiAction",
    ]),
  );
}

async function installFixture(root: Root, caller: Caller, kind: keyof typeof SPECS): Promise<Awaited<ReturnType<Caller["plugin"]["setGrant"]>>> {
  const manifest = pluginManifestSchema.parse({
    id: "action-size",
    name: "Action sizing witness",
    description: "A static action layout witness rendered through the production plugin page.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["ui.surface"],
  });
  const source = `const host = orb.host(1); host.ui.register({ id: "actions", anchor: "page", title: "Actions", tier: "static", spec: ${JSON.stringify(SPECS[kind])}, onAction: async (action) => { await host.ui.setState("actions", { receipt: action.actionId + ":" + (action.values.note ?? "") }); } });`;
  const installed = await caller.plugin.install({
    bundleBase64: Buffer.from(makePluginBundle(manifest, source, root.clock.now())).toString("base64"),
    grant: ["ui.surface"],
  });
  return await caller.plugin.setGrant({ pluginId: installed.id, grant: ["ui.surface"], acknowledgedNetHosts: [...(installed.netHosts ?? [])], enable: true });
}

async function pageBody(page: Page, pluginName: string): Promise<Locator> {
  const body = page.locator('[data-plugin-surface-scale="page"]').getByRole("group");
  await expect(body).toHaveCount(1);
  await expect(body).toHaveAccessibleName(new RegExp(pluginName, "u"));
  return body;
}

async function expectIntrinsicAction(button: Locator, body: Locator): Promise<void> {
  await expect(button).toBeVisible();
  const measured = await button.evaluate((node) => {
    const actual = node.getBoundingClientRect();
    const value = node.style.getPropertyValue("inline-size");
    const priority = node.style.getPropertyPriority("inline-size");
    try {
      node.style.setProperty("inline-size", "max-content");
      return { actual: actual.width, intrinsic: node.getBoundingClientRect().width };
    } finally {
      if (value === "") {
        node.style.removeProperty("inline-size");
      } else {
        node.style.setProperty("inline-size", value, priority);
      }
    }
  });
  const host = await body.boundingBox();
  if (host === null) {
    throw new Error("The action has no containing surface");
  }
  await test.info().attach("action-intrinsic-width", { body: JSON.stringify({ ...measured, available: host.width }), contentType: "application/json" });
  expect(Math.abs(measured.actual - Math.min(measured.intrinsic, host.width))).toBeLessThanOrEqual(1);
  const geometry = await actionGroupGeometry(body, [button]);
  expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
  expect(await button.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  const floor = await resolvedLength(button.page(), "var(--size-control-sm)", body);
  for (const box of geometry.controls) {
    expect(box.height).toBeGreaterThanOrEqual(floor);
  }
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.touch, isMobile: regime.touch });
    test("one ordinary action remains content-sized and invokes the real guest", async ({ page, mount }) => {
      await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
      const caller = await root.internalCallerFor(root.ownerId);
      const plugin = await installFixture(root, caller, "single");
      const calls = await routePage(page, caller);
      await mount<typeof PluginPresentationPageStory>(STORY, { pluginId: plugin.id, surfaceId: "actions", width: regime.width });
      const body = await pageBody(page, plugin.name);
      const action = body.getByRole("button", { name: "Refresh note", exact: true });
      await expectIntrinsicAction(action, body);
      await expect(action).toHaveAttribute("data-intent", "primary");
      expect(calls.count("plugin.invokeUiAction")).toBe(0);
      await action.click();
      await expect(body.getByText("refresh:", { exact: true })).toBeVisible();
    });

    test("the shipped Deck keeps multiple actions intrinsic and in guest vertical order", async ({ page, mount }) => {
      await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
      const caller = await root.internalCallerFor(root.ownerId);
      const bundleBase64 = Buffer.from(await requireShowcaseBundle("oracle-deck")).toString("base64");
      const existing = (await caller.plugin.list()).find((candidate) => candidate.slug === "oracle-deck");
      const plugin =
        existing === undefined
          ? await caller.plugin.install({ bundleBase64, grant: [] })
          : await caller.plugin.upgrade({ pluginId: existing.id, bundleBase64 });
      await caller.plugin.setGrant({
        pluginId: plugin.id,
        grant: [...plugin.declaredCapabilities],
        acknowledgedNetHosts: [...(plugin.netHosts ?? [])],
        enable: true,
      });
      const calls = await routePage(page, caller);
      await mount<typeof PluginPresentationPageStory>(STORY, { pluginId: plugin.id, surfaceId: "deck_page", width: regime.width });
      const body = await pageBody(page, plugin.name);
      const draw = body.getByRole("button", { name: "Draw a card", exact: true });
      const reveal = body.getByRole("button", { name: "Reveal the session", exact: true });
      await expectIntrinsicAction(draw, body);
      await expectIntrinsicAction(reveal, body);
      const boxes = await actionGroupGeometry(body, [draw, reveal]);
      const [first, second] = boxes.controls;
      if (first === undefined || second === undefined) {
        throw new Error("The Deck did not render its two actions");
      }
      expect(first.y + first.height).toBeLessThanOrEqual(second.y);
      await expect(draw).toHaveAttribute("data-intent", "outline");
      await expect(reveal).toHaveAttribute("data-intent", "secondary");
      await draw.focus();
      await page.keyboard.press("Tab");
      await expect(reveal).toBeFocused();
      expect(calls.count("plugin.invokeUiAction")).toBe(0);
      await page.screenshot({ path: test.info().outputPath("shipped-deck-actions.png") });
    });

    test("mixed inputs and meters retain breadth while commands and confirmation remain bounded", async ({ page, mount }) => {
      await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
      const caller = await root.internalCallerFor(root.ownerId);
      const plugin = await installFixture(root, caller, "mixed");
      const calls = await routePage(page, caller);
      await mount<typeof PluginPresentationPageStory>(STORY, { pluginId: plugin.id, surfaceId: "actions", width: regime.width });
      const body = await pageBody(page, plugin.name);
      const note = body.getByRole("textbox", { name: NOTE_FIELD, exact: true });
      const meter = body.getByRole("meter", { name: "Progress", exact: true });
      const apply = body.getByRole("button", { name: "Apply note", exact: true });
      const review = body.getByRole("button", { name: LONG_ACTION, exact: true });
      const clear = body.getByRole("button", { name: "Clear note", exact: true });
      await expect(note).toHaveValue("original");
      await expect(meter).toHaveAttribute("aria-valuenow", "1");
      const breadth = await actionGroupGeometry(body, [note, meter]);
      const available = await body.evaluate((node) => {
        const style = getComputedStyle(node);
        return node.clientWidth - Number.parseFloat(style.paddingInlineStart) - Number.parseFloat(style.paddingInlineEnd);
      });
      for (const box of breadth.controls) {
        expect(Math.abs(box.width - available)).toBeLessThanOrEqual(1);
      }
      await expectIntrinsicAction(apply, body);
      await expectIntrinsicAction(review, body);
      await expectIntrinsicAction(clear, body);
      await clear.click();
      const confirmation = page.getByRole("alertdialog", { name: "Clear this note?", exact: true });
      await expect(confirmation).toBeVisible();
      expect(calls.count("plugin.invokeUiAction")).toBe(0);
      await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(clear).toBeFocused();
      await note.fill("field witness");
      await apply.click();
      await expect(body.getByText("apply:field witness", { exact: true })).toBeVisible();
    });
  });
}
