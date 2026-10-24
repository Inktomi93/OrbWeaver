// The Scene tab at phone width: its Kicker sections are headings and add no landmark of their own (the context
// bracket names the tab panel), and a long goal name stays inside the panel. Reads come from a real corpus root
// whose game is seeded through the product's verbs.
import { rpgNpcSlug, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { RpgContextTabStory } from "./_own-key-panels-stories.tsx";

const TAB_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabStory";
const PHONE_WIDTH = 430;
const ON_STAGE_NPC = "Mira Vale";
const OFFSTAGE_NPC = "Old Tom";
const BEAT = "The lantern gutters.";
const LONG_GOAL = "Recover the three sundered keystones from the drowned archive before the tide closes the lower stacks for good";

/** A game with every Scene section filled, seeded through the verbs, and the reads the tab makes served to `page`. */
async function mountSceneTab(root: Awaited<ReturnType<typeof createCorpusHarness>>, page: Page): Promise<ChatId> {
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal, chatId, mode: "lite", ruleset: "d20" });
  const config = await caller.rpg.getConfigView({ chatId });
  const gameTracker = rpgTrackerDefSchema.parse({ key: "alarm", label: "Alarm", shape: "meter", write: "delta", subject: "game", max: 10 });
  await caller.rpg.updateConfig({ chatId, patch: { trackers: [...config.trackers, gameTracker] } });
  for (const name of [ON_STAGE_NPC, OFFSTAGE_NPC]) {
    const written = await caller.rpg.patchActor({
      chatId,
      targetRef: { kind: "npc", npcKey: rpgNpcSlug(name) },
      ops: [{ op: "setIdentityText", field: "name", text: name }],
    });
    expect(written).toEqual({ ok: true });
  }
  await caller.rpg.upsertQuest({ chatId, name: LONG_GOAL });
  expect(await caller.rpg.editSnapshot({ chatId, patch: { presentCharacters: [`npc:${rpgNpcSlug(ON_STAGE_NPC)}`], recentEvents: [BEAT] } })).toEqual({
    ok: true,
  });
  const viewer = await caller.sessions.me();
  const settings = await caller.settings.getUserSettings();
  const detail = await caller.chat.getChat({ chatId });
  const gameView = await caller.rpg.getGame({ chatId });
  const trackerView = await caller.rpg.getTrackerView({ chatId });
  const messages = await caller.chat.listMessages({ chatId });
  const reveal = await caller.rpg.revealHidden({ chatId });
  await routeTrpc(page, {
    "sessions.me": () => viewer,
    "settings.getUserSettings": () => settings,
    "chat.getChat": () => detail,
    "chat.listMessages": () => messages,
    "rpg.getGame": () => gameView,
    "rpg.getTrackerView": () => trackerView,
    "rpg.revealHidden": () => reveal,
  });
  return chatId;
}

test.describe("at phone width", () => {
  test.use({ viewport: { width: PHONE_WIDTH, height: 900 } });

  test("every Scene section is an h3 heading and none adds a region", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const chatId = await mountSceneTab(root, page);
    await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.scene" });

    const headings = page.getByRole("heading");
    await expect(headings.first()).toBeVisible();
    // The seed fills on stage, known characters, goals, trackers, just now and the card archive.
    expect(await headings.count()).toBeGreaterThanOrEqual(6);
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(await headings.count());
    // The tab panel's own region comes from the context bracket, outside this story; the providers' toast
    // viewport is the one region the story adds.
    const regions = page.getByRole("region");
    await expect(regions).toHaveCount(1);
    await expect(regions).toHaveAttribute("data-slot", "toast-viewport");
  });

  test("a long goal name is clipped inside the panel instead of scrolling it sideways", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const chatId = await mountSceneTab(root, page);
    await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.scene" });

    const goal = page.getByRole("button", { name: LONG_GOAL, exact: false });
    await expect(goal).toBeVisible();
    const overflow = await goal.evaluate((button) => ({
      button: button.scrollWidth - button.clientWidth,
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(overflow).toEqual({ button: 0, page: 0 });
  });
});
