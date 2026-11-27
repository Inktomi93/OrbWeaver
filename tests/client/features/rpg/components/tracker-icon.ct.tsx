// @subject packages/client/src/features/rpg/components/rpg-scene-tab.tsx
// @subject packages/client/src/features/rpg/components/rpg-game-tab.tsx
// A tracker's stored icon is drawn beside it on the Scene tab, and the host picks and clears it on the Game tab's tracker
// row. The game is seeded through the product's verbs and the reads and writes go to a real server.

import { rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import { RPG_HOST_ADVANCED_LABEL, trackerDefaultIconName, trackerIconName } from "#client/features/rpg/lib/rpg-names.ts";
import type { RpgContextTabStory } from "./_own-key-panels-stories.tsx";

const TAB_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabStory";
const PICKED = "flame";
const OTHER = "gem";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.listMessages",
  "rpg.getGame",
  "rpg.getTrackerView",
  "rpg.revealHidden",
] as const;
const ALARM = rpgTrackerDefSchema.parse({ key: "alarm", label: "Alarm", shape: "meter", write: "delta", subject: "game", max: 10, icon: PICKED });
const CALM = rpgTrackerDefSchema.parse({ key: "calm", label: "Calm", shape: "meter", write: "delta", subject: "game", max: 10 });

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

/** A game whose config carries the icon-picked tracker and the plain one. */
async function seedGame(root: Root): Promise<ChatId> {
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal: await root.principalFor(root.ownerId), chatId, mode: "lite", ruleset: "d20" });
  const config = await caller.rpg.getConfigView({ chatId });
  await caller.rpg.updateConfig({ chatId, patch: { trackers: [...config.trackers, ALARM, CALM] } });
  return chatId;
}

test("a tracker with a picked icon wears it on the Scene tab and one without keeps the shape's own", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const chatId = await seedGame(root);
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.scene" });

  const rows = page.locator('[data-slot="meter-row"]');
  const glyphOf = (label: string): ReturnType<typeof rows.locator> => rows.filter({ hasText: label }).locator("svg").first();
  await expect(glyphOf("Alarm")).toHaveClass(new RegExp(`lucide-${PICKED}\\b`));
  await expect(glyphOf("Calm")).not.toHaveClass(new RegExp(`lucide-${PICKED}\\b`));
});

test("the host picks an icon on the tracker row, it is stored, and the default returns it to the shape's own", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const chatId = await seedGame(root);
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, [...READS, "rpg.getConfigView", "rpg.updateConfig", "preset.list", "plugin.listMacros"]));
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.game" });

  const storedIcon = async (key: string): Promise<string | null | undefined> =>
    (await caller.rpg.getConfigView({ chatId })).trackers.find((def) => def.key === key)?.icon;
  await page.getByRole("button", { name: RPG_HOST_ADVANCED_LABEL, exact: true }).click();
  await page.getByRole("button", { name: trackerIconName(CALM.label), exact: true }).click();
  await page.getByRole("button", { name: `${CALM.label}: use the ${OTHER} icon`, exact: true }).click();
  await expect.poll(() => storedIcon(CALM.key)).toBe(OTHER);

  // The picker stays open after a pick, and a stored icon adds the way back to the default.
  await page.getByRole("button", { name: trackerDefaultIconName(CALM.label), exact: true }).click();
  await expect.poll(() => storedIcon(CALM.key)).toBeNull();
});
