import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
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
// The grow ceiling the composer had before it named `maxRows`: a 16rem box.
const FORMER_CAP_REM = 16;
const ROOT_FONT_PX = [16, 20] as const;
const LONG_DRAFT = Array.from({ length: 60 }, (_unused, index) => `line ${index}`).join("\n");

for (const rootFontPx of ROOT_FONT_PX) {
  test(`a long draft stops growing at the former 16rem cap, within a line, at a ${rootFontPx}px root`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({}) });
    const room = corpus.reads["chat.getChat"].find(
      ({ output }) => output.participants.filter((participant) => participant.kind === "character").length === 1,
    )?.output;
    if (room === undefined) {
      throw new Error("Composer case needs the corpus solo room");
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedShellState(page, { activeSection: "chats" });
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...SETTINGS_READS, "rpg.getGame", "rpg.listTurnToolCalls"]),
    });
    const chatId = (await caller.chat.getChat({ chatId: room.id })).id;
    await mount<typeof ChatRoomShellStory>(STORY, { chatId });
    await page.evaluate((px) => {
      document.documentElement.style.fontSize = `${px}px`;
    }, rootFontPx);
    const input = page.locator('[data-slot="composer-input"]').getByRole("textbox", { name: "Message", exact: true });
    await input.fill(LONG_DRAFT);
    const measured = await input.evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      line: Number.parseFloat(getComputedStyle(node).lineHeight),
    }));
    expect(Math.abs(measured.height - FORMER_CAP_REM * rootFontPx)).toBeLessThanOrEqual(measured.line);
  });
}
