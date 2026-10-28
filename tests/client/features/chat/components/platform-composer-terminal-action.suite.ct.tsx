// Long native guest menus exercise command reach, invocation and canonical focus in the real game room.
import { spawn } from "node:child_process";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_TOAST_COOLDOWN_SECONDS, pluginManifestSchema } from "@orb/contracts/plugin";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { MS_PER_SECOND } from "@orb/kit/time";
import { seedShellState, settledBox, touchGesture } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, emulateSoftKeyboard, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const PLUGIN_NAME = "Menu reach witness";
const COMMANDS_PER_MENU = 18;
const TARGETS = [
  { target: "composer-action", opener: "Plugin actions", prefix: "action" },
  { target: "composer-media", opener: "Message tools", prefix: "media" },
] as const;
const VIEWPORT = { width: 844, height: 390 };
const KEYBOARD_HEIGHT = 190;
// A finger pause before lifting ends the drag without launching a kinetic fling.
const DRAG_RELEASE_PAUSE_MS = 200;
const DRAFT = "Keep this draft while the last guest command runs.";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

async function prepareGame(caller: Caller): Promise<Awaited<ReturnType<Caller["chat"]["getChat"]>>["id"]> {
  const rooms = (await caller.chat.listChats({ limit: 100 })).items;
  for (const room of rooms) {
    const detail = await caller.chat.getChat({ chatId: room.id });
    if (detail.viewerIsHost && detail.rpg === null) {
      await caller.rpg.createGame({ chatId: room.id, mode: "lite" });
      return room.id;
    }
  }
  throw new Error("The corpus needs a hosted room without a game");
}

async function revealByKeyboard(page: Page, popup: Locator, item: Locator): Promise<void> {
  await popup.press("End");
  const population = await popup.getByRole("menuitem").count();
  // Built-in groups follow contributed media; reverse roving focus to the terminal guest command.
  for (let step = 0; step < population && !(await item.evaluate((node) => node === document.activeElement)); step++) {
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(":focus")).toBeVisible();
  }
  await expect(item).toBeFocused();
}

async function expectActionHit(item: Locator): Promise<void> {
  await expect(item).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      item.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const hit = node.ownerDocument.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        const viewport = visualViewport;
        const top = viewport?.offsetTop ?? 0;
        const bottom = top + (viewport?.height ?? innerHeight);
        return hit !== null && node.contains(hit) && box.top >= top && box.bottom <= bottom;
      }),
    )
    .toBe(true);
}

async function proveTouchScroll(page: Page): Promise<void> {
  await page.getByRole("button", { name: TARGETS[0].opener, exact: true }).tap();
  const popup = page.getByRole("menu").first();
  const box = await settledBox(popup);
  const before = await popup.evaluate((node) => node.scrollTop);
  await touchGesture(page, { x: box.x + box.width / 2, y: box.y + box.height * 0.85 }, { drag: { dx: 0, dy: -box.height * 0.7 }, holdMs: 0 });
  await expect.poll(() => popup.evaluate((node) => node.scrollTop)).toBeGreaterThan(before);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
}

async function revealByTouch(page: Page, popup: Locator, item: Locator): Promise<void> {
  for (;;) {
    const target = await item.evaluate((node) => {
      const port = node.closest('[role="menu"]');
      if (port === null) {
        throw new Error("The terminal action lost its native menu");
      }
      const box = node.getBoundingClientRect();
      const bounds = port.getBoundingClientRect();
      return {
        visible: box.top >= bounds.top && box.bottom <= bounds.bottom,
        offset: (bounds.top + bounds.bottom - box.top - box.bottom) / 2,
        height: box.height,
      };
    });
    if (target.visible) {
      return;
    }
    const box = await settledBox(popup);
    const before = await popup.evaluate((node) => node.scrollTop);
    const viewport = await page.evaluate(() => ({ top: visualViewport?.offsetTop ?? 0, height: visualViewport?.height ?? innerHeight }));
    const x = box.x + box.width / 2;
    const y = box.y + box.height * (target.offset < 0 ? 0.85 : 0.15);
    const travel = target.offset < 0 ? y - viewport.top : viewport.top + viewport.height - y;
    // A sub-item correction must still be a pan, not a tap on the item under the finger.
    const dy = Math.sign(target.offset) * Math.min(travel, Math.max(target.height / 2, Math.abs(target.offset)));
    await expect.poll(() => popup.evaluate((node, point) => node.contains(document.elementFromPoint(point.x, point.y)), { x, y })).toBe(true);
    await Promise.all([
      popup.evaluate((node) => new Promise<void>((resolve) => node.addEventListener("scrollend", () => resolve(), { once: true }))),
      touchGesture(page, { x, y }, { drag: { dx: 0, dy }, holdMs: DRAG_RELEASE_PAUSE_MS }),
    ]);
    await expect(popup).toHaveCount(1);
    expect(await popup.evaluate((node) => node.scrollTop)).not.toBe(before);
  }
}

for (const input of ["keyboard", "touch"] as const) {
  test(`the last contributed action is reachable by ${input} and returns focus in the short keyboard host`, async ({ corpus, mount, page, browserName }) => {
    test.skip(input === "touch" && browserName !== "chromium", "Native CDP touch scrolling requires Chromium; keyboard reach still runs on WebKit.");
    await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
    const caller = await root.internalCallerFor(root.ownerId);
    const chatId = await prepareGame(caller);
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({}) });
    const commands = TARGETS.flatMap(({ target, prefix }) =>
      Array.from({ length: COMMANDS_PER_MENU }, (_, index) => ({
        name: `${prefix}_${String(index + 1).padStart(2, "0")}`,
        label: `Command ${String(index + 1).padStart(2, "0")}`,
        target,
      })),
    );
    const manifest = pluginManifestSchema.parse({
      id: "menu-reach-witness",
      name: PLUGIN_NAME,
      description: "A native guest with long attributed composer menus.",
      version: "1.0.0",
      hostVersion: PLUGIN_HOST_VERSIONS[0],
      entry: PLUGIN_MAIN_ENTRY,
      capabilities: ["ui.surface"],
    });
    const source = `const host=orb.host(1);for(const command of ${JSON.stringify(commands)}){host.ui.registerCommand({name:command.name,describe:command.label,placements:[{target:command.target,label:command.label}],onRun:async()=>{await host.ui.toast("success","Reached "+command.name);}});}`;
    const plugin = await caller.plugin.install({
      bundleBase64: Buffer.from(makePluginBundle(manifest, source, root.clock.now())).toString("base64"),
      grant: manifest.capabilities,
    });
    await caller.plugin.setEnabled({ pluginId: plugin.id, enabled: true });
    await page.setViewportSize(VIEWPORT);
    await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
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
    await mount<typeof ChatRoomShellStory>(STORY, { chatId });
    const draft = page.getByRole("textbox", { name: "Message", exact: true });
    await draft.fill(DRAFT);
    if (input === "touch") {
      await proveTouchScroll(page);
    }
    expect(rpc.count("plugin.invokeUiCommand")).toBe(0);
    await emulateSoftKeyboard(page, KEYBOARD_HEIGHT);
    await expect.poll(() => page.evaluate(() => visualViewport?.height)).toBe(VIEWPORT.height - KEYBOARD_HEIGHT);
    for (const [index, { opener, prefix }] of TARGETS.entries()) {
      const trigger = page.getByRole("button", { name: opener, exact: true });
      await trigger.tap();
      const popup = page.getByRole("menu").first();
      const terminal = popup.getByRole("menuitem", { name: `${PLUGIN_NAME} · Commands · Command ${COMMANDS_PER_MENU}`, exact: true });
      await expect(terminal).toBeEnabled();
      expect(await popup.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
      const reveal = input === "keyboard" ? revealByKeyboard : revealByTouch;
      await reveal(page, popup, terminal);
      await expectActionHit(terminal);
      root.clock.advance(PLUGIN_TOAST_COOLDOWN_SECONDS * MS_PER_SECOND);
      if (input === "keyboard") {
        await terminal.press("Enter");
      } else {
        await terminal.tap();
      }
      await expect(page.getByText(`${PLUGIN_NAME}: Reached ${prefix}_${COMMANDS_PER_MENU}`, { exact: true })).toBeVisible();
      expect(rpc.count("plugin.invokeUiCommand")).toBe(index + 1);
      expect(rpc.lastInput("plugin.invokeUiCommand")).toMatchObject({ pluginId: plugin.id, name: `${prefix}_${COMMANDS_PER_MENU}`, chatId });
      await expect(popup).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(draft).toHaveValue(DRAFT);
    }
    expect(rpc.count("chat.generate")).toBe(0);
  });
}

test.use({ viewport: VIEWPORT, hasTouch: true, isMobile: true });
