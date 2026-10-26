import { CHAT_PLUGINS_TAB_LABEL } from "@orb/client/lib";
import { rpgTrackerDefSchema } from "@orb/contracts/rpg";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ChatId } from "@orb/kit/ids";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { RpgRoomStory } from "./_own-key-panels-stories.tsx";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgRoomStory";
const TRACKER = rpgTrackerDefSchema.parse({ key: "resolve", label: "Resolve", shape: "meter", write: "delta", subject: "actor", max: 10, pinned: true });
const VALUE = 3;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

async function prepareRoom(root: Root, populated: boolean): Promise<ChatId> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  await caller.settings.updateUserSettingsSection({ section: "profile", patch: DEFAULT_USER_SETTINGS.profile });
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal: await root.principalFor(root.ownerId), chatId, mode: "lite", ruleset: "d20" });
  const config = await caller.rpg.getConfigView({ chatId });
  await caller.rpg.updateConfig({ chatId, patch: { dateMode: "structured", trackers: [...config.trackers, TRACKER] } });
  expect(
    await caller.rpg.patchActor({
      chatId,
      targetRef: { kind: "user", userId: root.ownerId },
      ops: [{ op: "setTracker", key: TRACKER.key, value: { value: VALUE } }],
    }),
  ).toEqual({ ok: true });
  expect(
    await caller.rpg.editSnapshot({
      chatId,
      patch: populated
        ? { location: "The observatory", clock: { day: 4, hour: 12, minute: 30 }, weather: { type: "rain", label: "Steady rain" } }
        : { location: "", calendarDate: null, clock: null, weather: null },
    }),
  ).toEqual({ ok: true });
  return chatId;
}

for (const populated of [false, true]) {
  test(`${populated ? "populated" : "unset"} ambient keeps its clock and cues while Plugins owns the phone Context`, async ({ corpus, mount, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await using root = await createCorpusHarness();
    const chatId = await prepareRoom(root, populated);
    const caller = await root.internalCallerFor(root.ownerId);
    await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus),
      ...serveCorpusProcedures(caller, [
        ...SECTION_PROCEDURES,
        ...ROOM_PROCEDURES,
        "rpg.getGame",
        "rpg.getTrackerView",
        "rpg.revealHidden",
        "rpg.listTurnToolCalls",
      ]),
    });
    await mount<typeof RpgRoomStory>(STORY, { chatId });
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    const header = page.locator('[data-slot="rpg-takeover-header"]');
    const stone = header.locator('[data-slot="waystone"]');
    await expect(header).toBeVisible();
    const freshness = header.locator('[data-slot="rpg-freshness"]');
    const recordedCue = await freshness.allTextContents();
    const readOnly = header.getByText("Read-only", { exact: true });
    const readOnlyCount = await readOnly.count();
    expect(recordedCue.length + readOnlyCount).toBeGreaterThan(0);
    await page.getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true }).click();
    await expect(page.getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(freshness).toHaveText(recordedCue);
    await expect(readOnly).toHaveCount(readOnlyCount);
    const size = await resolvedLength(page, populated ? "var(--size-meter-hero)" : "var(--size-meter-sm)");
    await expect.poll(async () => (await stone.boundingBox())?.height).toBe(size);
    await expect(header).toContainText(populated ? "The observatory" : "No ambient set");
    const tracker = await caller.rpg.getTrackerView({ chatId });
    expect(tracker.trackerOrbs).toContainEqual(expect.objectContaining({ key: TRACKER.key, value: VALUE, max: TRACKER.max }));
    const satellite = header.locator('[data-slot="rpg-band-satellites"]');
    await expect(satellite).toContainText(`${TRACKER.label} ${VALUE}/${TRACKER.max}`);
  });
}
