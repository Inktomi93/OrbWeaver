// The room's plugin column as an overlay: its keyboard exit, the focus Undo hands back, and the room entry that must not
// stamp a glide. Two synthetic plugins register static chat-flank panels, both selected as sidecars, so the production
// column, edge control and hide toast run unchanged.

import { spawn } from "node:child_process";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { ChatId, PluginId } from "@orb/kit/ids";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import { z } from "zod";
import { CHAT_PANEL_HIDE_LABEL, CHAT_PANEL_UNDO_LABEL } from "#client/features/plugin/lib/plugin-copy.ts";
import type { PluginHideFocusStory } from "./_hide-focus-stories.tsx";

const ROOM_STORY = "tests/client/features/plugin/components/_hide-focus-stories/PluginHideFocusStory";
const COLUMN = '[data-slot="chat-thread-flank"]';
const SHELL_EDGE = '[data-slot="panel-edge-control"]';
const EDGE = '[data-slot="panel-edge-control"][aria-controls]';
const COLLAPSED_SHELL = { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } } as const;
// Narrow enough that the transcript cannot keep its reading floor beside the column, so the column is an overlay.
const OVERLAY = { width: 900, height: 800 } as const;
const INLINE = { width: 1600, height: 900 } as const;
const PLUGINS = [
  { id: "flank-one", name: "Flank one" },
  { id: "flank-two", name: "Flank two" },
] as const;

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
let roomId: ChatId;

test.beforeAll(async () => {
  root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.listChats({ limit: 1 })).items[0];
  if (room === undefined) {
    throw new Error("The corpus has no room");
  }
  roomId = room.id;
  const sidecars: { pluginId: PluginId; surfaceId: string }[] = [];
  for (const plugin of PLUGINS) {
    const manifest = pluginManifestSchema.parse({
      id: plugin.id,
      name: plugin.name,
      description: "A synthetic sidecar panel.",
      version: "1.0.0",
      hostVersion: PLUGIN_HOST_VERSIONS[0],
      entry: PLUGIN_MAIN_ENTRY,
      capabilities: ["ui.surface"],
    });
    const source = `orb.host(1).ui.register({ id: "panel", anchor: "chat-flank", title: "${plugin.name}", tier: "static", spec: { kind: "text", value: "${plugin.name} content" } });`;
    const installed = await caller.plugin.install({
      bundleBase64: Buffer.from(makePluginBundle(manifest, source, root.clock.now())).toString("base64"),
      grant: manifest.capabilities,
    });
    await caller.plugin.setEnabled({ pluginId: installed.id, enabled: true });
    sidecars.push({ pluginId: installed.id, surfaceId: "panel" });
  }
  await caller.settings.updateUserSettingsSection({ section: "profile", patch: { sidecarChatPluginSurfaces: sidecars, hiddenChatPluginIds: [] } });
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

async function route(page: Page, corpus: CorpusPlayback, flankCollapsed: boolean): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "profile", patch: { flankCollapsed, hiddenChatPluginIds: [] } });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "plugin.getSurfaceState", "settings.updateUserSettingsSection"]),
  });
}

test("Escape closes the overlay after a press on a part that takes no focus", async ({ corpus, mount, page }) => {
  await page.setViewportSize(OVERLAY);
  await seedShellState(page, COLLAPSED_SHELL);
  await route(page, corpus, false);
  await mount<typeof PluginHideFocusStory>(ROOM_STORY, { chatId: roomId });
  const column = page.locator(COLUMN);
  await expect(column).toHaveAttribute("data-flank-sheet", "parked");
  await page.locator(EDGE).click();
  await expect(column).toHaveAttribute("data-flank-sheet", "shown");
  await column.getByText(`${PLUGINS[0].name} content`, { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(column).toHaveAttribute("data-flank-sheet", "parked");
  await expect(page.locator(EDGE)).toBeFocused();
});

test("Undo in the hide notice leaves the overlay open and returns focus to the restored panel", async ({ corpus, mount, page }) => {
  await page.setViewportSize(OVERLAY);
  await seedShellState(page, COLLAPSED_SHELL);
  await route(page, corpus, false);
  await mount<typeof PluginHideFocusStory>(ROOM_STORY, { chatId: roomId });
  const column = page.locator(COLUMN);
  await page.locator(EDGE).click();
  await expect(column).toHaveAttribute("data-flank-sheet", "shown");
  const hideFirst = column.getByRole("button", { name: `${CHAT_PANEL_HIDE_LABEL} ${PLUGINS[0].name}`, exact: true });
  await hideFirst.click();
  await expect(hideFirst).toHaveCount(0);
  await page.getByRole("button", { name: CHAT_PANEL_UNDO_LABEL, exact: true }).click();
  await expect(column).toHaveAttribute("data-flank-sheet", "shown");
  await expect(hideFirst).toBeFocused();
});

test("a room entered with the column collapsed stamps no glide when its panels arrive", async ({ corpus, mount, page }) => {
  await page.setViewportSize(INLINE);
  await seedShellState(page, COLLAPSED_SHELL);
  await page.addInitScript(() => {
    const stamps: string[] = [];
    Reflect.set(globalThis, "__flankStamps", stamps);
    new MutationObserver((records) => {
      for (const record of records) {
        stamps.push(`${record.attributeName}=${record.target instanceof Element ? record.target.getAttribute(record.attributeName ?? "") : null}`);
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-flank-flip", "data-flank-settle"] });
  });
  await route(page, corpus, true);
  await mount<typeof PluginHideFocusStory>(ROOM_STORY, { chatId: roomId });
  await expect(page.locator(COLUMN)).toHaveAttribute("data-flank-sheet", "parked");
  await expect(page.locator(EDGE)).toBeVisible();
  expect(z.array(z.string()).parse(await page.evaluate((): unknown => Reflect.get(globalThis, "__flankStamps")))).toEqual([]);
});

test("a parked column and the thread beside it clear the edge control by its own box and a row step", async ({ corpus, mount, page }) => {
  await page.setViewportSize(OVERLAY);
  await seedShellState(page, COLLAPSED_SHELL);
  await route(page, corpus, false);
  await mount<typeof PluginHideFocusStory>(ROOM_STORY, { chatId: roomId });
  await expect(page.locator(COLUMN)).toHaveAttribute("data-flank-sheet", "parked");
  const control = await page.locator(EDGE).boundingBox();
  if (control === null) {
    throw new Error("The edge control has no box");
  }
  const clearance = await resolvedLength(page, `var(${TOKENS["size.control-clearance"].cssVar})`);
  const row = await resolvedLength(page, `var(${TOKENS["spacing.row"].cssVar})`);
  expect(clearance).toBeGreaterThanOrEqual(Math.max(control.width, control.height) + row);
  const threadEnd = await page.locator('[data-slot="chat-room-thread"]').evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingInlineEnd));
  const columnStart = await page.locator(COLUMN).evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingBlockStart));
  expect(threadEnd).toBeCloseTo(clearance, 1);
  expect(columnStart).toBeCloseTo(clearance, 1);
});

test.describe("at a coarse pointer", () => {
  test.use({ hasTouch: true });

  test("the room's column has no edge control, and the shell's touch-sized control still fits the clearance", async ({ corpus, mount, page }) => {
    await page.setViewportSize(OVERLAY);
    await seedShellState(page, COLLAPSED_SHELL);
    await route(page, corpus, false);
    await mount<typeof PluginHideFocusStory>(ROOM_STORY, { chatId: roomId });
    await expect(page.locator(COLUMN)).toBeAttached();
    await expect(page.locator(EDGE)).toHaveCount(0);
    const control = await page.locator(SHELL_EDGE).first().boundingBox();
    if (control === null) {
      throw new Error("The shell's edge control has no box");
    }
    const clearance = await resolvedLength(page, `var(${TOKENS["size.control-clearance"].cssVar})`);
    const row = await resolvedLength(page, `var(${TOKENS["spacing.row"].cssVar})`);
    const touch = await resolvedLength(page, `var(${TOKENS["size.touch-target"].cssVar})`);
    // The positive control: this run really is a coarse pointer, whose control is the touch floor.
    expect(control.width).toBeGreaterThanOrEqual(touch);
    expect(clearance).toBeGreaterThanOrEqual(Math.max(control.width, control.height) + row);
  });
});
