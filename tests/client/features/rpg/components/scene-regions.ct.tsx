// The Scene tab at phone width: every section headed by a Kicker is a region named by its heading. Reads come
// from a real corpus root whose game is seeded through the product's verbs.
import { rpgNpcSlug, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { RpgContextTabStory } from "./_own-key-panels-stories.tsx";

const TAB_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabStory";
const PHONE_WIDTH = 430;
const ON_STAGE_NPC = "Mira Vale";
const OFFSTAGE_NPC = "Old Tom";
const BEAT = "The lantern gutters.";

test.describe("at phone width", () => {
  test.use({ viewport: { width: PHONE_WIDTH, height: 900 } });

  test("each Scene section is a region named by its own heading", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
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
    await caller.rpg.upsertQuest({ chatId, name: "Find the key" });
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
    await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.scene" });

    const headings = page.getByRole("heading", { level: 3 });
    await expect(headings.first()).toBeVisible();
    const names = await headings.allTextContents();
    // One region per heading: the five sections this seed fills, each found by the heading's own text.
    expect(names.length).toBeGreaterThanOrEqual(5);
    for (const name of names) {
      await expect(page.getByRole("region", { name, exact: true })).toHaveCount(1);
    }
  });
});
