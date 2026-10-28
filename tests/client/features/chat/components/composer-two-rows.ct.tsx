import { spawn } from "node:child_process";
import { IMPERSONATE_STOP_LABEL } from "@orb/client/lib";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, emulateSoftKeyboard, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHAT_CONTEXT_TAB_LABELS } from "#client/features/chat/lib/chat-context-tab-labels.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const SETTINGS_READS = [
  "chat.getGroupConfig",
  "chat.listChatInjections",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "chat.listEffectiveRegex",
  "regex.listForChat",
  "automation.listRules",
] as const;
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 900 },
] as const;

test.use({ hasTouch: true, isMobile: true });

for (const viewport of VIEWPORTS) {
  for (const roomKind of ["solo", "group"] as const) {
    test(`${roomKind} composer keeps two command/input rows at ${viewport.width}×${viewport.height}`, async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({}) });
      const room = corpus.reads["chat.getChat"].find(
        ({ output }) => output.participants.filter((participant) => participant.kind === "character").length > 1 === (roomKind === "group"),
      )?.output;
      const commands = corpus.pluginLibrary?.ownerActive.reads.commands.output;
      if (room === undefined || commands === undefined) {
        throw new Error("Composer case needs the corpus room and plugin command publication");
      }
      const chatId = (await caller.chat.getChat({ chatId: room.id })).id;
      const placed = commands.filter((command) => command.placements.some((placement) => placement.target === "composer-action"));
      expect(placed.length).toBeGreaterThan(0);
      await page.setViewportSize(viewport);
      await seedShellState(page, { activeSection: "chats" });
      const rpc = await routeTrpc(page, {
        ...createShellAmbientReads(corpus, root.ownerId),
        ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...SETTINGS_READS, "rpg.getGame", "rpg.listTurnToolCalls"]),
        "plugin.listCommands": () => commands,
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId });
      const upper = page.locator('[data-slot="composer-utilities"]');
      const lower = page.locator('[data-slot="composer-input"]');
      const input = lower.getByRole("textbox", { name: "Message", exact: true });
      await expect(upper.getByRole("button", { name: "Message tools", exact: true })).toBeVisible();
      const plugins = upper.getByRole("button", { name: "Plugin actions", exact: true });
      await expect(plugins).toBeVisible();
      await expect(lower.getByRole("button", { name: "Chat options", exact: true })).toBeVisible();
      await expect(lower.getByRole("button", { name: "Send message", exact: true })).toBeVisible();
      await expect(input).toHaveValue("");
      await expect(input).toHaveAttribute("autocorrect", "off");
      await expect(input).toHaveAttribute("autocapitalize", "off");
      await expect(upper.getByRole("group", { name: "Your message", exact: true })).toBeVisible();
      await expect(upper.getByRole("group", { name: "Their reply", exact: true })).toBeVisible();

      for (const draft of ["", "Keep the observatory quiet."]) {
        await input.fill(draft);
        await expectRowsFit(page);
        if (draft === "") {
          await plugins.tap();
        } else {
          await plugins.press("Enter");
        }
        const menu = page.getByRole("menu");
        await expect(menu).toBeVisible();
        const overflow = await menu.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return Math.max(-box.left, -box.top, box.right - innerWidth, box.bottom - innerHeight);
        });
        expect(overflow).toBeLessThanOrEqual(1);
        for (const command of placed) {
          const placement = command.placements.find((candidate) => candidate.target === "composer-action");
          if (placement === undefined) {
            throw new Error("Missing command placement");
          }
          await expect(
            menu.getByRole("menuitem", { name: `${command.pluginName} · ${command.group ?? "Commands"} · ${placement.label}`, exact: true }),
          ).toBeVisible();
          await expect(upper.getByRole("button", { name: `${command.pluginName} · ${placement.label}`, exact: true })).toHaveCount(0);
        }
        await page.keyboard.press("Escape");
        await expect(plugins).toBeFocused();
        const tools = upper.getByRole("button", { name: "Message tools", exact: true });
        await tools.press("Enter");
        await expect(page.getByRole("menuitem", { name: "Clear input", exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(input).toHaveValue(draft);
        expect(rpc.count("plugin.invokeUiCommand")).toBe(0);
        if (roomKind === "group") {
          await expectGroupControls(
            page,
            room.participants.filter((seat) => seat.kind === "character").map((seat) => seat.displayName),
            draft !== "",
          );
        }
        expect(rpc.count("chat.generate")).toBe(0);
      }
    });
  }
}

async function expectRowsFit(page: Page): Promise<void> {
  const facts = await page.locator('[data-slot="composer-guided-cluster"]').evaluate((element) => {
    const top = element.querySelector('[data-slot="composer-utilities"]');
    const bottom = element.querySelector('[data-slot="composer-input"]');
    if (top === null || bottom === null) {
      throw new Error("Missing composer rows");
    }
    const upperBox = top.getBoundingClientRect();
    const lowerBox = bottom.getBoundingClientRect();
    const buttons = Array.from(top.querySelectorAll("button"));
    const boxes = buttons.map((button) => button.getBoundingClientRect());
    return {
      rowOverlap: upperBox.bottom - lowerBox.top,
      upperButtonCenters: boxes.map((box) => box.top + box.height / 2),
      escaped: Math.max(...boxes.map((box) => Math.max(upperBox.left - box.left, box.right - upperBox.right))),
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(facts.rowOverlap).toBeLessThanOrEqual(0);
  expect(Math.max(...facts.upperButtonCenters) - Math.min(...facts.upperButtonCenters)).toBeLessThanOrEqual(1);
  expect(facts.escaped).toBeLessThanOrEqual(1);
  expect(facts.documentOverflow).toBeLessThanOrEqual(1);
}

for (const viewport of VIEWPORTS.slice(0, 2)) {
  for (const state of ["drafting", "refused"] as const) {
    test(`group composer ${state} fits at ${viewport.width}×${viewport.height}`, async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({}) });
      const room = corpus.reads["chat.getChat"].find(
        ({ output }) => output.participants.filter((participant) => participant.kind === "character").length > 1,
      )?.output;
      const commands = corpus.pluginLibrary?.ownerActive.reads.commands.output;
      if (room === undefined || commands === undefined) {
        throw new Error("Composer case needs a group room and plugin command publication");
      }
      const chatId = (await caller.chat.getChat({ chatId: room.id })).id;
      if (state === "refused") {
        await caller.connection.setBinding({ task: "chat", connectionId: null });
      }
      await page.setViewportSize(viewport);
      await seedShellState(page, { activeSection: "chats" });
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus, root.ownerId),
        ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls"]),
        "plugin.listCommands": () => commands,
      });
      expect(await caller.chat.checkSendAvailability({ chatId: room.id })).toMatchObject(
        state === "refused" ? { available: false, cause: "no-connection" } : { available: true },
      );
      const requested = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const settled = Promise.withResolvers<void>();
      const pendingRequests: Promise<void>[] = [];
      // JSON procedure holds cannot delay SSE; keep the real subscription pending at its HTTP boundary.
      await page.route("**/api/trpc/chat.impersonateStream", async (route) => {
        pendingRequests.push(settled.promise);
        expect(route.request().method()).toBe("POST");
        expect(route.request().headers()["accept"]).toBe("text/event-stream");
        expect(route.request().postDataJSON()).toMatchObject({
          chatId: room.id,
          guided: { action: "impersonate", input: "Keep the observatory quiet.", person: "first" },
        });
        requested.resolve();
        try {
          await release.promise;
          await route.fulfill({ status: 204, body: "" });
        } finally {
          settled.resolve();
        }
      });
      const component = await mount<typeof ChatRoomShellStory>(STORY, { chatId });
      const input = page.getByRole("textbox", { name: "Message", exact: true });
      await input.fill("Keep the observatory quiet.");
      try {
        if (state === "drafting") {
          await expectDraftingFits(page, requested.promise);
        } else {
          await expectRefusalFits(page, viewport.height);
        }
      } finally {
        release.resolve();
        await Promise.all(pendingRequests);
        await component.unmount();
      }
    });
  }
}

async function expectGroupControls(page: Page, names: readonly string[], guided: boolean): Promise<void> {
  const upper = page.locator('[data-slot="composer-utilities"]');
  const lower = page.locator('[data-slot="composer-input"]');
  await upper.getByRole("button", { name: guided ? "Guided generate reply" : "Generate reply", exact: true }).press("Enter");
  const speakers = page.getByRole("menu");
  await expect(speakers.getByRole("menuitem", { name: "Let the room pick", exact: true })).toBeVisible();
  for (const name of names) {
    await expect(speakers.getByRole("menuitem", { name, exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await lower.getByRole("button", { name: "Chat options", exact: true }).press("Enter");
  await page.getByRole("menuitem", { name: "Chat settings", exact: true }).click();
  await expect(page.getByRole("tab", { name: CHAT_CONTEXT_TAB_LABELS.settings, exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("group", { name: "How the characters reply", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
}

async function expectDraftingFits(page: Page, requested: Promise<void>): Promise<void> {
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await page.getByRole("button", { name: "Guided draft your line", exact: true }).press("Enter");
  await page.getByRole("menuitem", { name: "1st person", exact: true }).click();
  await requested;
  const stop = page.getByRole("group", { name: "Your message", exact: true }).getByRole("button", { name: IMPERSONATE_STOP_LABEL, exact: true });
  await expect(stop).toBeVisible();
  await expectRowsFit(page);
  await stop.tap();
  await expect(stop).toHaveCount(0);
  await expect(input).toHaveValue("Keep the observatory quiet.");
}

async function expectRefusalFits(page: Page, viewportHeight: number): Promise<void> {
  await expect(page.locator('[data-slot="composer-next-turn"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Guided generate reply", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  await expectRowsFit(page);
  const bounds = await page.getByRole("group", { name: "Message composer", exact: true }).boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.y).toBeGreaterThanOrEqual(0);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(viewportHeight);
}

test("the attributed plugin menu collects arguments, runs native commands and undoes a draft replacement", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({}) });
  const captured = corpus.reads["chat.getChat"][0]?.output;
  if (captured === undefined) {
    throw new Error("Plugin command case needs a corpus room");
  }
  const chat = await caller.chat.getChat({ chatId: captured.id });
  const manifest = pluginManifestSchema.parse({
    id: "composer-witness",
    name: "Composer witness",
    description: "Native composer command journey.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["ui.surface"],
  });
  const replacement = "A polished observatory line.";
  const source = `const h = orb.host(1);
  h.ui.registerCommand({ name: "note", describe: "Record a note", args: [{name: "entry", type: "string", required: true}],
    placements: [{target: "composer-action", label: "Add note"}],
    onRun: async ({values}) => { await h.ui.toast("success", "Recorded: " + values.entry); }
  });
  h.ui.registerCommand({ name: "polish", describe: "Polish a draft", composerDraft: true,
    placements: [{target: "composer-action", label: "Polish"}], onRun: () => ${JSON.stringify(replacement)}
  });`;
  const plugin = await caller.plugin.install({
    bundleBase64: Buffer.from(makePluginBundle(manifest, source, root.clock.now())).toString("base64"),
    grant: manifest.capabilities,
  });
  await caller.plugin.setEnabled({ pluginId: plugin.id, enabled: true });
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
  await mount<typeof ChatRoomShellStory>(STORY, { chatId: chat.id });
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  const draft = "A rough observatory line.";
  await input.fill(draft);
  const plugins = page.locator('[data-slot="composer-utilities"]').getByRole("button", { name: "Plugin actions", exact: true });
  await plugins.click();
  await page.getByRole("menuitem", { name: "Composer witness · Commands · Add note", exact: true }).click();
  const argumentsDialog = page.getByRole("dialog", { name: "Run command", exact: true });
  await expect(argumentsDialog).toBeVisible();
  expect(rpc.count("plugin.invokeUiCommand")).toBe(0);
  await argumentsDialog.getByRole("button", { name: "Run note", exact: true }).click();
  await expect(argumentsDialog.getByRole("alert")).toBeVisible();
  expect(rpc.count("plugin.invokeUiCommand")).toBe(0);
  await argumentsDialog.getByRole("textbox", { name: "Entry *", exact: true }).fill("Observatory note");
  await argumentsDialog.getByRole("button", { name: "Run note", exact: true }).click();
  await expect(argumentsDialog).toHaveCount(0);
  await expect(page.getByText("Composer witness: Recorded: Observatory note", { exact: true })).toBeVisible();
  expect(rpc.lastInput("plugin.invokeUiCommand")).toMatchObject({ pluginId: plugin.id, name: "note", values: { entry: "Observatory note" }, chatId: chat.id });
  await expect(input).toHaveValue(draft);
  await plugins.click();
  await page.getByRole("menuitem", { name: "Composer witness · Commands · Polish", exact: true }).click();
  await expect(input).toHaveValue(replacement);
  expect(rpc.lastInput("plugin.invokeUiCommand")).toMatchObject({ pluginId: plugin.id, name: "polish", composerDraft: draft, chatId: chat.id });
  await plugins.click();
  await page.getByRole("menuitem", { name: "Undo Polish", exact: true }).click();
  await expect(input).toHaveValue(draft);
  expect(rpc.count("plugin.invokeUiCommand")).toBe(2);
});

const LONG_KEYBOARD_DRAFT =
  "This longer draft checks whether the writing area stays usable when the landscape keyboard is open. The draft should scroll inside its own field without pushing the tools or Send control outside the visible screen. A second paragraph can be longer still, but it must not change the two-row composition or hide the way back to the conversation.";

for (const unavailable of [false, true]) {
  test(`landscape keyboard keeps a long draft and ${unavailable ? "its refusal" : "its controls"} visible`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({}) });
    const captured = corpus.reads["chat.getChat"][0]?.output;
    if (captured === undefined) {
      throw new Error("Keyboard case needs a corpus room");
    }
    const chatId = (await caller.chat.getChat({ chatId: captured.id })).id;
    if (unavailable) {
      await caller.connection.setBinding({ task: "chat", connectionId: null });
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await seedShellState(page, { activeSection: "chats" });
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "plugin.listCommands", "rpg.getGame", "rpg.listTurnToolCalls"]),
    });
    await mount<typeof ChatRoomShellStory>(STORY, { chatId });
    const input = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(page.locator('[data-slot="composer-next-turn"]')).toHaveCount(unavailable ? 1 : 0);
    await input.fill("A short draft.");
    const naturalHeight = await page.locator('[data-slot="composer"]').evaluate((element) => element.getBoundingClientRect().height);
    await input.focus();
    await emulateSoftKeyboard(page, 190);
    await expect.poll(() => page.locator(".shell-grid").evaluate((element) => element.getBoundingClientRect().height)).toBe(200);
    await expect.poll(() => page.evaluate(() => visualViewport?.height)).toBe(200);
    await expect(page.locator('[data-slot="composer-next-turn"]')).toHaveCount(unavailable ? 1 : 0);
    await input.fill(LONG_KEYBOARD_DRAFT);
    await expect(input).toHaveValue(LONG_KEYBOARD_DRAFT);
    await expectRowsFit(page);
    const facts = await input.evaluate((element: HTMLTextAreaElement) => {
      const viewport = visualViewport;
      const card = element.closest('[data-slot="composer"]');
      const lower = element.closest('[data-slot="composer-input"]');
      const upper = card?.querySelector('[data-slot="composer-utilities"]') ?? null;
      const refusal = document.querySelector('[data-slot="composer-next-turn"]');
      if (viewport === null || card === null || lower === null || upper === null) {
        throw new Error("Missing visible viewport or composer card");
      }
      // Button's centered ::before owns glyph and inline hit regions (selection-control.ts).
      function hitBox(button: HTMLButtonElement): Pick<DOMRectReadOnly, "top" | "bottom" | "left" | "right" | "width" | "height"> {
        const box = button.getBoundingClientRect();
        const before = getComputedStyle(button, "::before");
        const height = Math.max(box.height, before.content === "none" ? 0 : Number.parseFloat(before.height));
        const width = Math.max(box.width, before.content === "none" ? 0 : Number.parseFloat(before.width));
        return {
          top: box.top + (box.height - height) / 2,
          bottom: box.bottom + (height - box.height) / 2,
          left: box.left + (box.width - width) / 2,
          right: box.right + (width - box.width) / 2,
          width,
          height,
        };
      }
      const buttons = Array.from(card.querySelectorAll("button"), (button) => ({ paint: button.getBoundingClientRect().toJSON(), hit: hitBox(button) }));
      const hits = [...buttons.map((button) => button.hit), ...Array.from(refusal?.querySelectorAll("button") ?? [], hitBox)];
      const targets = [...hits, element.getBoundingClientRect()];
      const overlaps = targets.flatMap((box, index) =>
        targets
          .slice(index + 1)
          .map(
            (other) =>
              Math.min(box.right, other.right) - Math.max(box.left, other.left) > 0 && Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 0,
          ),
      );
      return {
        viewportBottom: viewport.offsetTop + viewport.height,
        viewportTop: viewport.offsetTop,
        layoutHeight: innerHeight,
        card: card.getBoundingClientRect().toJSON(),
        field: element.getBoundingClientRect().toJSON(),
        lower: lower.getBoundingClientRect().toJSON(),
        upper: upper.getBoundingClientRect().toJSON(),
        buttons,
        hits,
        collisions: overlaps.filter(Boolean).length,
        refusal: refusal?.getBoundingClientRect().toJSON(),
        refusalOverlap:
          refusal === null ? 0 : Math.max(card.getBoundingClientRect().bottom, lower.getBoundingClientRect().bottom) - refusal.getBoundingClientRect().top,
        cardPadding: getComputedStyle(card).padding,
        lowerMinimum: getComputedStyle(lower).minBlockSize,
        fieldMinimum: getComputedStyle(element).minBlockSize,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      };
    });
    await test.info().attach("keyboard-layout", { body: JSON.stringify(facts, null, 2), contentType: "application/json" });
    expect(facts.layoutHeight).toBe(390);
    expect(facts.card.top).toBeGreaterThanOrEqual(facts.viewportTop);
    expect(facts.card.bottom).toBeLessThanOrEqual(facts.viewportBottom);
    expect(facts.field.bottom).toBeLessThanOrEqual(facts.viewportBottom);
    expect(facts.lower.top).toBeGreaterThanOrEqual(facts.card.top);
    expect(facts.lower.bottom).toBeLessThanOrEqual(facts.card.bottom);
    expect(facts.field.top).toBeGreaterThanOrEqual(facts.lower.top);
    expect(facts.field.bottom).toBeLessThanOrEqual(facts.lower.bottom);
    for (const button of facts.buttons) {
      expect(button.paint.top).toBeGreaterThanOrEqual(facts.card.top);
      expect(button.paint.bottom).toBeLessThanOrEqual(facts.card.bottom);
      expect(button.hit.top).toBeGreaterThanOrEqual(facts.card.top);
      expect(button.hit.bottom).toBeLessThanOrEqual(facts.card.bottom);
      expect(button.hit.height).toBeGreaterThanOrEqual(44);
      expect(button.hit.width).toBeGreaterThanOrEqual(44);
    }
    for (const hit of facts.hits) {
      expect(hit.top).toBeGreaterThanOrEqual(facts.viewportTop);
      expect(hit.bottom).toBeLessThanOrEqual(facts.viewportBottom);
    }
    expect(facts.collisions).toBe(0);
    expect(facts.refusalOverlap).toBeLessThanOrEqual(0);
    expect(facts.scrollHeight).toBeGreaterThan(facts.clientHeight);
    await input.press("ArrowLeft");
    await input.press("ArrowRight");
    await expect.poll(() => input.evaluate((element: HTMLTextAreaElement) => element.selectionEnd)).toBe(LONG_KEYBOARD_DRAFT.length);
    await expect.poll(() => input.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    if (unavailable) {
      await expectKeyboardRefusalVisible(page);
    }
    await emulateSoftKeyboard(page, 0);
    await expect.poll(() => page.locator(".shell-grid").evaluate((element) => element.getBoundingClientRect().height)).toBe(390);
    await expect.poll(() => input.evaluate((element) => element.clientHeight)).toBeGreaterThan(facts.clientHeight);
    await expect(input).toHaveValue(LONG_KEYBOARD_DRAFT);
    await input.fill("A short draft.");
    await expect.poll(() => page.locator('[data-slot="composer"]').evaluate((element) => element.getBoundingClientRect().height)).toBe(naturalHeight);
  });
}

async function expectKeyboardRefusalVisible(page: Page): Promise<void> {
  const refusal = page.locator('[data-slot="composer-next-turn"]');
  await expect(refusal).toBeVisible();
  const facts = await refusal.evaluate((element) => ({
    bottom: element.getBoundingClientRect().bottom,
    edge: (visualViewport?.offsetTop ?? 0) + (visualViewport?.height ?? innerHeight),
  }));
  expect(facts.bottom).toBeLessThanOrEqual(facts.edge);
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
}
