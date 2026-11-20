// @subject packages/client/src/features/chat/components/art-slot.tsx
// A message's avatar button keeps its painted size and reaches the coarse-pointer touch floor with a layout-neutral
// hit area, for the speaker on either side of the row.

import { viewImageActionName } from "@orb/client/lib";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nameShape } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROLES = ["user", "assistant"] as const;
const IMAGE_ACTION = nameShape(viewImageActionName);

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test("each speaker's avatar button keeps its painted size and has a touch-floor hit area at a coarse pointer", async ({ corpus, corpusMedia, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const pictured = (await caller.character.list({ limit: 100 })).items.find((character) => character.avatarHash !== null && character.avatarAssetId !== null);
  if (pictured === undefined) {
    throw new Error("Corpus needs an owned pictured character");
  }
  let chatId: ChatId | undefined;
  const messageIds = new Map<(typeof ROLES)[number], MessageId>();
  for (const room of (await caller.chat.listChats({ limit: 100 })).items) {
    const { messages } = await caller.chat.listMessages({ chatId: room.id, limit: 6 });
    const user = messages.find((message) => message.role === "user" && message.personaId !== null);
    const assistant = messages.find((message) => message.role === "assistant" && message.characterId !== null && message.kind === "standard");
    if (user === undefined || user.personaId === null || assistant === undefined || assistant.characterId === null) {
      continue;
    }
    await caller.persona.update({ personaId: user.personaId, input: { avatarAssetId: pictured.avatarAssetId } });
    await caller.character.update({ characterId: assistant.characterId, input: { avatarAssetId: pictured.avatarAssetId } });
    chatId = room.id;
    messageIds.set("user", user.id).set("assistant", assistant.id);
    break;
  }
  if (chatId === undefined) {
    throw new Error("Corpus needs a room with pictured persona and character messages");
  }
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { showInChatAvatars: true, backgroundImageKind: "none" } });
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls"]),
  });
  await corpusMedia();
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });

  for (const role of ROLES) {
    const row = page.locator(`[data-slot="message-row"][data-message-id="${messageIds.get(role)}"]`);
    await row.scrollIntoViewIfNeeded();
    const opener = row.getByRole("button", { name: IMAGE_ACTION });
    await expect(opener).toHaveCount(1);
    const floor = await resolvedLength(page, `var(${TOKENS["size.touch-target"].cssVar})`, opener);
    const hit = await opener.evaluate((element) => {
      const reach = getComputedStyle(element, "::before");
      return { inline: Number.parseFloat(reach.width), block: Number.parseFloat(reach.height), position: reach.position };
    });
    expect(hit.position).toBe("absolute");
    expect(hit.inline).toBeGreaterThanOrEqual(floor);
    expect(hit.block).toBeGreaterThanOrEqual(floor);
    // The painted button stays under the floor: the target grew, the row did not.
    const painted = await opener.boundingBox();
    expect(painted?.width).toBeLessThan(floor);
    expect(painted?.height).toBeLessThan(floor);
  }
});
