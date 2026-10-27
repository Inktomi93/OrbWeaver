import { ASSET_LIST_LIMIT_MAX } from "@orb/contracts/assets";
import { createCharacterSchema } from "@orb/contracts/character";
import type { MessageView, ToolCallRecord } from "@orb/contracts/chat";
import { CHAT_REACT_TOOL_NAME } from "@orb/contracts/chat";
import { rpgTrackerDefSchema } from "@orb/contracts/rpg";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { CharacterId } from "@orb/kit/ids";
import { actionGroupGeometry, resolvedLength, settledBox } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { Locator, TestInfo } from "@playwright/test";
import type { GalleryActionsStory, GameTrackerActionsStory, ToolActionsStory } from "./_remaining-action-groups-stories.tsx";

const STORIES = "tests/client/features/chat/components/_remaining-action-groups-stories";
const nameMaximum = createCharacterSchema.shape.name.maxLength;
if (nameMaximum === null) {
  throw new Error("The gallery case requires a bounded character name");
}
const CHARACTER_NAME = "G".repeat(nameMaximum);
// Tracker labels have no schema maximum; use long supported prose without inventing a limit.
const TRACKER_LABEL = "Unwavering resolve against the gathering darkness beyond the northern mountains";
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

async function measure(region: Locator, controls: readonly Locator[], testInfo: TestInfo, label: string): Promise<void> {
  const geometry = await actionGroupGeometry(region, controls);
  await testInfo.attach(label, { body: JSON.stringify(geometry), contentType: "application/json" });
  expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
}

async function expectBlockContained(popup: Locator, controls: readonly Locator[], viewportHeight: number): Promise<void> {
  const popupBox = await settledBox(popup);
  for (const control of controls) {
    const box = await settledBox(control);
    expect(box.y).toBeGreaterThanOrEqual(popupBox.y);
    expect(box.y + box.height).toBeLessThanOrEqual(popupBox.y + popupBox.height + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewportHeight + 1);
  }
}

async function reachGalleryBodyAction(gallery: Locator, add: Locator, testInfo: TestInfo): Promise<void> {
  const body = gallery.getByRole("banner").locator("xpath=following-sibling::*[1]");
  const before = await body.evaluate((element) => ({ top: element.scrollTop, height: element.clientHeight, content: element.scrollHeight }));
  const bodyBox = await settledBox(body);
  const actionBox = await settledBox(add);
  const minimumScroll = before.top + (actionBox.y + actionBox.height > bodyBox.y + bodyBox.height ? 1 : 0);
  await add.scrollIntoViewIfNeeded();
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(minimumScroll);
  await testInfo.attach("empty-gallery-body-scroll", {
    body: JSON.stringify({
      before,
      after: await body.evaluate((element) => ({ top: element.scrollTop, height: element.clientHeight, content: element.scrollHeight })),
    }),
    contentType: "application/json",
  });
  await measure(body, [add], testInfo, "empty-gallery-body-action");
}

type Caller = Awaited<ReturnType<Awaited<ReturnType<typeof createCorpusHarness>>["internalCallerFor"]>>;

async function addGalleryImage(caller: Caller, characterId: CharacterId): Promise<void> {
  const asset = (await caller.assets.listOwned({ limit: ASSET_LIST_LIMIT_MAX })).find((candidate) => candidate.mime.startsWith("image/"));
  if (asset === undefined) {
    throw new Error("The corpus must contain an owned image for the populated gallery");
  }
  await caller.assets.addToGallery({ assetId: asset.assetId, subjectCharacterId: characterId });
}

async function nativeReaction(caller: Caller): Promise<{ readonly message: MessageView; readonly record: ToolCallRecord }> {
  for (const room of (await caller.chat.listChats({ limit: 100 })).items) {
    if ((await caller.chat.getChat({ chatId: room.id })).viewerIsHost !== true) {
      continue;
    }
    for (const message of (await caller.chat.listMessages({ chatId: room.id })).messages) {
      const record = message.toolCalls.find((candidate) => candidate.name === CHAT_REACT_TOOL_NAME && candidate.deleted !== true);
      if (record !== undefined) {
        return { message, record };
      }
    }
  }
  throw new Error("The actual corpus recursion must retain a native chat reaction tool record");
}

async function stageToolVisibility(caller: Caller, target: Awaited<ReturnType<typeof nativeReaction>>, hidden: boolean): Promise<void> {
  const { message, record } = target;
  await caller.chat.editToolCall({
    chatId: message.chatId,
    messageId: message.id,
    variantId: message.selectedVariantId,
    toolCallId: record.toolCallId,
    ...(record.callOrdinal === undefined ? {} : { callOrdinal: record.callOrdinal }),
    ...(record.turnId === undefined ? {} : { turnId: record.turnId }),
    action: hidden ? "hide" : "show",
  });
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
    });

    for (const populated of [false, true]) {
      test(`${populated ? "populated" : "empty"} gallery actions fit and nested dismissal preserves the gallery`, async ({
        mount,
        page,
        corpusMedia,
      }, testInfo) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        const card = await caller.character.create({
          input: createCharacterSchema.parse({ handle: "action-gallery", name: CHARACTER_NAME, description: "Gallery action coverage." }),
        });
        const chatId = (await caller.chat.startChat({ characterIds: [card.id], opening: "none" })).chat.id;
        if (populated) {
          await addGalleryImage(caller, card.id);
        }
        const before = await caller.assets.listGallery({ subjectCharacterId: card.id, limit: ASSET_LIST_LIMIT_MAX });
        const auth = await root.http.request("/api/auth/config");
        const authBody = await auth.text();
        await page.route("**/api/auth/config", (route) => route.fulfill({ contentType: "application/json", body: authBody }));
        await routeTrpc(page, serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "assets.listGallery", "assets.listOwned"]));
        await corpusMedia();
        await mount<typeof GalleryActionsStory>(`${STORIES}/GalleryActionsStory`, {
          characterId: card.id,
          characterName: card.name,
          chatId,
          appearance: regime.appearance,
        });
        const opener = page.getByRole("button", { name: "Open character gallery", exact: true });
        await opener.focus();
        await page.keyboard.press("Enter");
        const gallery = page.getByRole("dialog", { name: `${card.name}'s gallery`, exact: true });
        const add = gallery.getByRole("button", { name: "Add images", exact: true });
        const close = gallery.getByRole("button", { name: "Close", exact: true });
        await expect(add).toBeEnabled();
        await expect(gallery.getByText("No images yet", { exact: true })).toHaveCount(populated ? 0 : 1);
        await measure(gallery, [add, close], testInfo, "gallery-actions");
        if (populated) {
          await measure(add.locator(".."), [add, close], testInfo, "gallery-header-actions");
        }
        await expectBlockContained(gallery, [close], regime.viewport.height);
        if (!populated) {
          await reachGalleryBodyAction(gallery, add, testInfo);
        }
        const floor = await resolvedLength(page, "var(--size-control-sm)", close);
        for (const button of [add, close]) {
          const box = await settledBox(button);
          expect(box.width).toBeGreaterThanOrEqual(floor);
          expect(box.height).toBeGreaterThanOrEqual(floor);
        }
        await expectBlockContained(gallery, [add, close], regime.viewport.height);
        await add.focus();
        await page.keyboard.press("Enter");
        const picker = page.getByRole("dialog", { name: "Add images to the gallery", exact: true });
        await expect(picker).toBeVisible();
        await picker.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(picker).toBeHidden();
        await expect(add).toBeFocused();
        await close.focus();
        await page.keyboard.press("Enter");
        await expect(gallery).toBeHidden();
        await expect(opener).toBeFocused();
        expect(await caller.assets.listGallery({ subjectCharacterId: card.id, limit: ASSET_LIST_LIMIT_MAX })).toEqual(before);
      });
    }

    for (const hidden of [false, true]) {
      test(`${hidden ? "hidden" : "shown"} persisted tool actions fit and Delete cancellation preserves the record`, async ({
        mount,
        page,
        corpusMedia,
      }, testInfo) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        const target = await nativeReaction(caller);
        const { message, record } = target;
        await stageToolVisibility(caller, target, hidden);
        const before = await caller.chat.listMessages({ chatId: message.chatId });
        await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: false } });
        await routeTrpc(
          page,
          serveCorpusProcedures(caller, [
            "sessions.me",
            "settings.getUserSettings",
            "chat.getChat",
            "chat.listMessages",
            "chat.listReactions",
            "chat.previewContextFit",
            "plugin.list",
            "plugin.listDisplayTransforms",
            "plugin.listSurfaces",
            "regex.listScripts",
            "regex.listRoomDisplayScripts",
            "rpg.getGame",
            "rpg.listTurnToolCalls",
          ]),
        );
        await corpusMedia();
        await mount<typeof ToolActionsStory>(`${STORIES}/ToolActionsStory`, {
          chatId: message.chatId,
          width: regime.width,
          height: regime.viewport.height,
          appearance: regime.appearance,
        });
        const row = page.locator(`[data-message-id="${message.id}"]`);
        const group = row.getByRole("group", { name: record.displayName ?? record.name, exact: true }).first();
        const visibility = group.getByRole("button", { name: hidden ? "Show to AI" : "Hide from AI", exact: true });
        const remove = group.getByRole("button", { name: "Delete tool call", exact: true });
        await visibility.focus();
        await expect(visibility).toBeFocused();
        await expect(group.getByRole("button", { name: hidden ? "Hide from AI" : "Show to AI", exact: true })).toHaveCount(0);
        await measure(visibility.locator(".."), [visibility, remove], testInfo, "tool-action-cluster");
        await measure(page.getByRole("group", { name: "Tool action host", exact: true }), [visibility, remove], testInfo, "tool-action-host");
        const floor = await resolvedLength(page, "var(--size-control-sm)", visibility);
        for (const control of [visibility, remove]) {
          const box = await settledBox(control);
          expect(box.width).toBeGreaterThanOrEqual(floor);
          expect(box.height).toBeGreaterThanOrEqual(floor);
        }
        await page.keyboard.press("Tab");
        await expect(remove).toBeFocused();
        await page.keyboard.press("Enter");
        const confirm = page.getByRole("alertdialog", { name: "Delete this tool call?", exact: true });
        await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(confirm).toBeHidden();
        await expect(remove).toBeFocused();
        expect(await caller.chat.listMessages({ chatId: message.chatId })).toEqual(before);
      });
    }

    test("meter and text tracker definitions keep all editors and glyph actions contained", async ({ mount, page }, testInfo) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
      await seedRpgGame(root, { principal: await root.principalFor(root.ownerId), chatId, mode: "lite", ruleset: "freeform" });
      const defs = [
        rpgTrackerDefSchema.parse({ key: "long-meter", label: TRACKER_LABEL, shape: "meter", write: "delta", subject: "actor", max: Number.MAX_SAFE_INTEGER }),
        rpgTrackerDefSchema.parse({ key: "text-track", label: "Weather", shape: "text", write: "set", subject: "game" }),
      ];
      await caller.rpg.updateConfig({ chatId, patch: { trackers: defs } });
      const before = await caller.rpg.getConfigView({ chatId });
      await routeTrpc(
        page,
        serveCorpusProcedures(caller, [
          "sessions.me",
          "settings.getUserSettings",
          "chat.getChat",
          "chat.listMessages",
          "rpg.getGame",
          "rpg.getTrackerView",
          "rpg.getConfigView",
          "preset.list",
        ]),
      );
      await mount<typeof GameTrackerActionsStory>(`${STORIES}/GameTrackerActionsStory`, { chatId, width: regime.width, appearance: regime.appearance });
      // eslint-disable-next-line orb/no-hand-copied-label -- RPG owns this literal trigger; the exported chat group label names a different feature's disclosure.
      await page.getByRole("button", { name: "Advanced", exact: true }).click();
      const rows = page.locator('[data-slot="rpg-tracker-row"]');
      await expect(rows).toHaveCount(2);
      for (const [index, def] of defs.entries()) {
        const row = rows.nth(index);
        const label = row.getByRole("button", { name: `Tracker ${index + 1} label`, exact: true });
        const band = row.getByRole("button", { name: `Show ${def.label} as a band orb`, exact: true });
        const lock = row.getByRole("button", { name: `Lock ${def.label} — the story can no longer write it`, exact: true });
        const remove = row.getByRole("button", { name: `Remove ${def.label}`, exact: true });
        const maximum = row.getByRole("button", { name: `${def.label} default max`, exact: true });
        await expect(label).toBeVisible();
        await expect(maximum).toHaveCount(def.shape === "meter" ? 1 : 0);
        const controls = def.shape === "meter" ? [label, maximum, band, lock, remove] : [label, band, lock, remove];
        await measure(label.locator("..").locator(".."), controls, testInfo, `tracker-${def.shape}-cluster`);
        await measure(page.getByRole("group", { name: "Game action host", exact: true }), controls, testInfo, `tracker-${def.shape}-host`);
        const floor = await resolvedLength(page, "var(--size-control-sm)", band);
        for (const control of [band, lock, remove]) {
          const box = await settledBox(control);
          expect(box.width).toBeGreaterThanOrEqual(floor);
          expect(box.height).toBeGreaterThanOrEqual(floor);
        }
        await label.focus();
        for (const control of controls.slice(1)) {
          await page.keyboard.press("Tab");
          await expect(control).toBeFocused();
        }
        await label.focus();
        await page.keyboard.press("Enter");
        const input = row.getByRole("textbox", { name: `Tracker ${index + 1} label`, exact: true });
        await expect(input).toBeFocused();
        await input.fill("Uncommitted tracker draft");
        await input.press("Escape");
        await expect(input).toHaveCount(0);
        await expect(label).toBeFocused();
      }
      expect((await caller.rpg.getConfigView({ chatId })).trackers).toEqual(before.trackers);
    });
  });
}
