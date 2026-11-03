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
import { CHAT_MESSAGE_INPUT_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const PLUGIN_NAME = "Menu reach witness";
// The short host, not the item count, makes the menu overflow; every extra item is one more serial pan in the touch walk, and
// a walk that outruns the test budget under load is a timeout, not a verdict on reach.
const COMMANDS_PER_MENU = 4;
const TERMINAL_ORDINAL = String(COMMANDS_PER_MENU).padStart(2, "0");
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
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        const top = visualViewport?.offsetTop ?? 0;
        const bottom = top + (visualViewport?.height ?? innerHeight);
        return { hit: hit !== null && node.contains(hit), topVisible: box.top >= top, bottomVisible: box.bottom <= bottom };
      }),
    )
    .toEqual({ hit: true, topVisible: true, bottomVisible: true });
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
  // The menu is resolved once: a role query per step walks the page's accessibility tree, and a pan is a dozen steps.
  const menuBox = await settledBox(popup);
  const scroller = await popup.elementHandle();
  const action = await item.elementHandle();
  let panLoss: number | undefined;
  for (;;) {
    const target = await action.evaluate((node) => {
      const port = node.closest('[role="menu"]');
      if (port === null) {
        throw new Error("The terminal action lost its native menu");
      }
      const box = node.getBoundingClientRect();
      // The scrollport is the padding box: the border paints outside the clip, so an item flush with the border-box edge is cut.
      const outer = port.getBoundingClientRect();
      const bounds = { top: outer.top + port.clientTop, bottom: outer.top + port.clientTop + port.clientHeight };
      return {
        visible: box.top >= bounds.top && box.bottom <= bounds.bottom,
        offset: (bounds.top + bounds.bottom - box.top - box.bottom) / 2,
        height: box.height,
      };
    });
    if (target.visible) {
      return;
    }
    const before = await scroller.evaluate((node) => node.scrollTop);
    const viewport = await page.evaluate(() => ({ top: visualViewport?.offsetTop ?? 0, height: visualViewport?.height ?? innerHeight }));
    const x = menuBox.x + menuBox.width / 2;
    const y = menuBox.y + menuBox.height * (target.offset < 0 ? 0.85 : 0.15);
    const travel = target.offset < 0 ? y - viewport.top : viewport.top + viewport.height - y;
    // Learn the native pan dead zone so fine corrections do not oscillate around a one-row viewport.
    const distance = panLoss === undefined ? Math.max(target.height / 2, Math.abs(target.offset)) : Math.abs(target.offset) + panLoss;
    const dy = Math.sign(target.offset) * Math.min(travel, distance);
    await expect.poll(() => scroller.evaluate((node, point) => node.contains(document.elementFromPoint(point.x, point.y)), { x, y })).toBe(true);
    await Promise.all([
      scroller.evaluate((node) => new Promise<void>((resolve) => node.addEventListener("scrollend", () => resolve(), { once: true }))),
      touchGesture(page, { x, y }, { drag: { dx: 0, dy }, holdMs: DRAG_RELEASE_PAUSE_MS }),
    ]);
    const after = await scroller.evaluate((node) => node.scrollTop);
    expect(after).not.toBe(before);
    panLoss = Math.max(0, Math.abs(dy) - Math.abs(after - before));
  }
}

for (const rootPx of [16, 32]) {
  for (const input of ["keyboard", "touch"] as const) {
    test(`the last contributed action is reachable by ${input} and returns focus in the short keyboard host at ${rootPx}px root`, async ({
      corpus,
      mount,
      page,
      browserName,
    }) => {
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
      await page.evaluate((px) => {
        document.documentElement.style.fontSize = `${px}px`;
      }, rootPx);
      const draft = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
      await draft.fill(DRAFT);
      expect(rpc.count("plugin.invokeUiCommand")).toBe(0);
      await emulateSoftKeyboard(page, KEYBOARD_HEIGHT);
      await expect.poll(() => page.evaluate(() => visualViewport?.height)).toBe(VIEWPORT.height - KEYBOARD_HEIGHT);
      if (input === "touch") {
        await proveTouchScroll(page);
      }
      for (const [index, { opener, prefix }] of TARGETS.entries()) {
        const trigger = page.getByRole("button", { name: opener, exact: true });
        await trigger.tap();
        const popup = page.getByRole("menu").first();
        const terminal = popup.getByRole("menuitem", { name: `${PLUGIN_NAME} · Commands · Command ${TERMINAL_ORDINAL}`, exact: true });
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
        await expect(page.getByText(`${PLUGIN_NAME}: Reached ${prefix}_${TERMINAL_ORDINAL}`, { exact: true })).toBeVisible();
        expect(rpc.count("plugin.invokeUiCommand")).toBe(index + 1);
        expect(rpc.lastInput("plugin.invokeUiCommand")).toMatchObject({ pluginId: plugin.id, name: `${prefix}_${TERMINAL_ORDINAL}`, chatId });
        await expect(popup).toHaveCount(0);
        await expect(trigger).toBeFocused();
        // The acknowledgement has overlay priority; prove focus and clipping before dismissing it through native controls.
        await expect(trigger).toBeInViewport({ ratio: 1 });
        const acknowledgement = page.getByRole("status", { name: `${PLUGIN_NAME}: Reached ${prefix}_${TERMINAL_ORDINAL}`, exact: true });
        if (input === "keyboard") {
          await page.keyboard.press("F6");
          await acknowledgement.getByRole("button").press("Enter");
        } else {
          const box = await settledBox(acknowledgement);
          const x = box.x + box.width / 2;
          await touchGesture(page, { x, y: box.y + box.height / 2 }, { drag: { dx: (VIEWPORT.width - x) * 0.8, dy: 0 }, holdMs: 0 });
        }
        await expect(acknowledgement).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await expectActionHit(trigger);
        await expect(draft).toHaveValue(DRAFT);
      }
      expect(rpc.count("chat.generate")).toBe(0);
    });
  }
}

test.use({ viewport: VIEWPORT, hasTouch: true, isMobile: true });
