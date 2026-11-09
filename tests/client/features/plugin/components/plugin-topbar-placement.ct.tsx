// The top bar shows a plugin only where its guest placed a command: real guests through the production shell, one
// icon button per placed command in host order, the row's overflow, the phone's You sheet, and the palette door
// that keeps an unplaced command reachable.

import { spawn } from "node:child_process";
import { MESSAGE_TOOLS_LABEL, TRAIL_OVERFLOW_LABEL } from "@orb/client/lib";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_TOAST_COOLDOWN_SECONDS, pluginManifestSchema } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { MS_PER_SECOND } from "@orb/kit/time";
import { seedShellState } from "@orb/testkit/browser/spec";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { PLUGIN_ACTIONS_NAME } from "#client/features/plugin/lib/plugin-command-copy.ts";
import type { PluginRoomShellStory } from "../_ct-stories.tsx";

const STORY = "tests/client/features/plugin/_ct-stories/PluginRoomShellStory";
const PLUGIN_NAME = "Top bar witness";
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const OVERFLOW_WIDTH = { width: 800, height: 800 };
const UNPLACED = { name: "ledger" };
// The names sort the other way round from the labels, so a passing order is the host's label order.
const SNAPSHOT = { name: "a_snapshot", placements: [{ target: "topbar", label: "Snapshot", icon: "images" }] };
const DRAW = { name: "z_draw", placements: [{ target: "topbar", label: "Draw", icon: "sparkles" }] };

interface Registration {
  readonly name: string;
  readonly placements?: readonly { readonly target: string; readonly label: string; readonly icon?: string }[];
}

interface Scene {
  readonly root: Awaited<ReturnType<typeof createCorpusHarness>>;
  readonly corpus: Parameters<typeof createShellAmbientReads>[0];
  readonly page: Page;
  readonly show: (chatId: ChatId) => Promise<unknown>;
}

const attributed = (label: string): string => `${PLUGIN_NAME} · Commands · ${label}`;
const trailOf = (page: Page): Locator => page.locator(".shell-topbar-trail");
const reached = (page: Page, name: string): Locator => page.getByText(`${PLUGIN_NAME}: Reached ${name}`, { exact: true });
const pluginControls = (scope: Locator): Locator => scope.getByRole("button", { name: new RegExp(PLUGIN_NAME, "u") });

async function openRoom(
  { root, corpus, page, show }: Scene,
  registrations: readonly Registration[],
  viewport: { readonly width: number; readonly height: number },
): Promise<TrpcRecorder> {
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.listChats({ limit: 1 })).items[0];
  if (room === undefined) {
    throw new Error("The corpus needs a room");
  }
  const manifest = pluginManifestSchema.parse({
    id: "topbar-witness",
    name: PLUGIN_NAME,
    description: "A native guest that places commands in the top bar.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["ui.surface"],
  });
  const source = `const host=orb.host(1);for(const command of ${JSON.stringify(registrations)}){host.ui.registerCommand({...command,describe:"Witness",onRun:async()=>{await host.ui.toast("success","Reached "+command.name);}});}`;
  const plugin = await caller.plugin.install({
    bundleBase64: Buffer.from(makePluginBundle(manifest, source, root.clock.now())).toString("base64"),
    grant: manifest.capabilities,
  });
  await caller.plugin.setEnabled({ pluginId: plugin.id, enabled: true });
  await page.setViewportSize(viewport);
  await seedShellState(page, { activeSection: "chats" });
  const rpc = await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      "plugin.listCommands",
      "plugin.invokeUiCommand",
      "rpg.getGame",
      "rpg.listTurnToolCalls",
    ]),
  });
  await show(room.id);
  await expect.poll(() => rpc.count("plugin.listCommands")).toBeGreaterThan(0);
  return rpc;
}

async function runFromPalette(page: Page, name: string): Promise<void> {
  const palette = page.getByRole("dialog", { name: "Jump to…" });
  await palette.getByRole("combobox").fill(name);
  await palette.getByRole("option", { name: new RegExp(`^Run ${name}`, "u") }).click();
  await expect(reached(page, name)).toBeVisible();
}

test("with no plugin placing, nothing plugin-related renders in the top bar and the palette still reaches an unplaced command", async ({
  corpus,
  mount,
  page,
}) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const show = (chatId: ChatId): Promise<unknown> => mount<typeof PluginRoomShellStory>(STORY, { chatId });
  const rpc = await openRoom({ root, corpus, page, show }, [UNPLACED], DESKTOP);
  const trail = trailOf(page);
  await expect(trail.getByRole("button", { name: "Report a bug", exact: true })).toBeVisible();
  await expect(pluginControls(trail)).toHaveCount(0);
  await expect(trail.getByRole("button", { name: "Plugin commands", exact: true })).toHaveCount(0);
  await expect(trail.getByRole("button", { name: TRAIL_OVERFLOW_LABEL })).toHaveCount(0);
  await trail.getByRole("button", { name: /^Jump/u }).click();
  await runFromPalette(page, UNPLACED.name);
  expect(rpc.lastInput("plugin.invokeUiCommand")).toMatchObject({ name: UNPLACED.name });
});

test("each placed command is one attributed icon button in host order, with its own glyph, and runs from the keyboard", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const show = (chatId: ChatId): Promise<unknown> => mount<typeof PluginRoomShellStory>(STORY, { chatId });
  const rpc = await openRoom({ root, corpus, page, show }, [SNAPSHOT, UNPLACED, DRAW], DESKTOP);
  const buttons = pluginControls(trailOf(page));
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveAccessibleName(attributed("Draw"));
  await expect(buttons.nth(1)).toHaveAccessibleName(attributed("Snapshot"));
  await expect(buttons.nth(0).locator("svg.lucide-sparkles")).toHaveCount(1);
  await expect(buttons.nth(1).locator("svg.lucide-images")).toHaveCount(1);
  await buttons.nth(0).focus();
  await page.keyboard.press("Enter");
  await expect(reached(page, DRAW.name)).toBeVisible();
  expect(rpc.count("plugin.invokeUiCommand")).toBe(1);
  await expect(buttons.nth(0)).toBeFocused();
});

test("a placed command that declares no glyph wears the command mark, not the Plugin actions trigger's own", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const show = (chatId: ChatId): Promise<unknown> => mount<typeof PluginRoomShellStory>(STORY, { chatId });
  await openRoom({ root, corpus, page, show }, [{ name: "plain", placements: [{ target: "topbar", label: "Plain" }] }], DESKTOP);
  const button = pluginControls(trailOf(page));
  await expect(button).toHaveCount(1);
  await expect(button.locator("svg.lucide-command")).toHaveCount(1);
  await expect(button.locator("svg.lucide-blocks")).toHaveCount(0);
});

test("placed commands that do not fit overflow before any house control and run from the row's menu", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const show = (chatId: ChatId): Promise<unknown> => mount<typeof PluginRoomShellStory>(STORY, { chatId });
  const crowd = Array.from({ length: 24 }, (_unused, index): Registration => {
    const ordinal = String(index + 1).padStart(2, "0");
    return { name: `crowd_${ordinal}`, placements: [{ target: "topbar", label: `Command ${ordinal}` }] };
  });
  await openRoom({ root, corpus, page, show }, crowd, OVERFLOW_WIDTH);
  const trail = trailOf(page);
  const trigger = trail.getByRole("button", { name: TRAIL_OVERFLOW_LABEL });
  await expect(trigger).toBeVisible();
  // Only a settled row proves the order: every action is in the row until the first measure.
  await expect(trail.locator('[data-overflowed] [aria-label="Report a bug"]')).toHaveCount(0);
  await expect(trail.getByRole("button", { name: "Report a bug", exact: true })).toBeVisible();
  // The inert inline control stays mounted, so `__orb.pluginUi()` keeps a host for an overflowed command.
  await expect(trail.locator(`[data-overflowed] [aria-label="${attributed("Command 24")}"]`)).toHaveCount(1);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const last = page.getByRole("menuitem", { name: attributed("Command 24"), exact: true });
  await expect(last).toBeVisible();
  await expect(page.getByRole("menuitem", { name: new RegExp(PLUGIN_NAME, "u") })).toHaveCount(crowd.length);
  await last.focus();
  await page.keyboard.press("Enter");
  await expect(reached(page, "crowd_24")).toBeVisible();
});

test("a command placed at composer-action keeps its top bar button, and only composer-media defers to composer-action", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const show = (chatId: ChatId): Promise<unknown> => mount<typeof PluginRoomShellStory>(STORY, { chatId });
  const both: Registration = {
    name: "both",
    placements: [
      { target: "composer-action", label: "Both" },
      { target: "topbar", label: "Both" },
    ],
  };
  const twin: Registration = {
    name: "twin",
    placements: [
      { target: "composer-action", label: "Twin" },
      { target: "composer-media", label: "Twin" },
    ],
  };
  await openRoom({ root, corpus, page, show }, [both, twin], DESKTOP);
  await expect(pluginControls(trailOf(page))).toHaveCount(1);
  await expect(pluginControls(trailOf(page))).toHaveAccessibleName(attributed("Both"));
  await page.getByRole("button", { name: PLUGIN_ACTIONS_NAME, exact: true }).click();
  await expect(page.getByRole("menuitem", { name: new RegExp(PLUGIN_NAME, "u") })).toHaveCount(2);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: MESSAGE_TOOLS_LABEL, exact: true }).click();
  await expect(page.getByRole("menuitem").first()).toBeVisible();
  await expect(page.getByRole("menuitem", { name: new RegExp(PLUGIN_NAME, "u") })).toHaveCount(0);
});

test("a phone keeps the top bar row clear: placed commands are You sheet rows and the sheet's palette reaches an unplaced command", async ({
  corpus,
  mount,
  page,
}) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const show = (chatId: ChatId): Promise<unknown> => mount<typeof PluginRoomShellStory>(STORY, { chatId });
  await openRoom({ root, corpus, page, show }, [DRAW, UNPLACED], PHONE);
  await expect(pluginControls(trailOf(page))).toHaveCount(0);
  await page.getByRole("button", { name: "Back to Chats", exact: true }).click();
  await page.locator(".shell-rail").getByRole("button", { name: "You", exact: true }).click();
  await page.getByRole("button", { name: attributed("Draw"), exact: true }).click();
  await expect(reached(page, DRAW.name)).toBeVisible();
  root.clock.advance(PLUGIN_TOAST_COOLDOWN_SECONDS * MS_PER_SECOND);
  await page.getByRole("button", { name: "Jump to…", exact: true }).click();
  await runFromPalette(page, UNPLACED.name);
});
