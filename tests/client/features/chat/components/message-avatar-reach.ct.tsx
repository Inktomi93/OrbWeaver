// @subject packages/client/src/features/chat/components/art-slot.tsx
// A message avatar's touch reach survives the transcript scroller's clip and stays clear of the bubble, and the composer
// keeps the start edge the transcript rows take, at the narrowest phone, a phone and a desktop.
import type { ChatId, MessageId } from "@orb/kit/ids";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROLES = ["user", "assistant"] as const;
const IMAGE_ACTION = /^View .+'s image$/;
const ROW = '[data-slot="message-row"]';
const PHONES = [
  { name: "320", viewport: { width: 320, height: 700 }, coarse: true },
  { name: "390", viewport: { width: 390, height: 844 }, coarse: true },
] as const;
const DESKTOP = { name: "desktop", viewport: { width: 1280, height: 800 }, coarse: false } as const;
const REGIMES = [...PHONES, DESKTOP] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

interface RoomRoutes {
  readonly page: Page;
  readonly corpus: Parameters<typeof createShellAmbientReads>[0];
  readonly corpusMedia: () => Promise<unknown>;
}

/** A room whose user and assistant messages both carry a picture, with the shell's reads routed to the corpus. */
async function prepareRoom(routes: RoomRoutes, root: Root): Promise<{ readonly chatId: ChatId; readonly messageIds: Map<(typeof ROLES)[number], MessageId> }> {
  const { corpus, corpusMedia, page } = routes;
  const caller = await root.internalCallerFor(root.ownerId);
  const pictured = (await caller.character.list({ limit: 100 })).items.find((character) => character.avatarHash !== null && character.avatarAssetId !== null);
  if (pictured === undefined) {
    throw new Error("Corpus needs an owned pictured character");
  }
  const messageIds = new Map<(typeof ROLES)[number], MessageId>();
  let chatId: ChatId | undefined;
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
  return { chatId, messageIds };
}

/** The inline edges of the first transcript row and the composer's track. */
async function roomEdges(page: Page): Promise<{ readonly row: readonly [number, number]; readonly composer: readonly [number, number] }> {
  const edgesOf = async (selector: string): Promise<readonly [number, number]> => {
    const box = await page.locator(selector).last().boundingBox();
    return [box?.x ?? Number.NaN, (box?.x ?? Number.NaN) + (box?.width ?? Number.NaN)];
  };
  return { row: await edgesOf(ROW), composer: await edgesOf('[data-track="composer"]') };
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ hasTouch: regime.coarse, isMobile: regime.coarse, viewport: regime.viewport });

    test("the composer and the transcript rows share their edges on a phone and nest on a desktop", async ({ corpus, corpusMedia, mount, page }) => {
      await using root = await createCorpusHarness();
      const { chatId } = await prepareRoom({ corpus, corpusMedia, page }, root);
      await mount<typeof ChatRoomShellStory>(STORY, { chatId });
      await page.locator('[data-track="composer"]').last().waitFor();
      const { row, composer } = await roomEdges(page);
      // A phone's room is one column, so both edges meet; a desktop centres both on one track and the composer sits inside the rows.
      const expected = regime.coarse ? row : [composer[0], composer[1]];
      expect(composer).toEqual(expected);
      expect(composer[0]).toBeGreaterThanOrEqual(row[0]);
    });
  });
}

for (const regime of PHONES) {
  test.describe(`${regime.name} avatar reach`, () => {
    test.use({ hasTouch: true, isMobile: true, viewport: regime.viewport });

    test("each avatar's whole reach hits the avatar inside the scroller and covers no bubble point", async ({ corpus, corpusMedia, mount, page }) => {
      await using root = await createCorpusHarness();
      const { chatId, messageIds } = await prepareRoom({ corpus, corpusMedia, page }, root);
      await mount<typeof ChatRoomShellStory>(STORY, { chatId });
      for (const role of ROLES) {
        const row = page.locator(`${ROW}[data-message-id="${messageIds.get(role)}"]`);
        await row.scrollIntoViewIfNeeded();
        const opener = row.getByRole("button", { name: IMAGE_ACTION });
        await expect(opener).toHaveCount(1);
        const floor = await resolvedLength(page, `var(${TOKENS["size.touch-target"].cssVar})`, opener);
        const probe = await opener.evaluate((element, reach) => {
          const box = element.getBoundingClientRect();
          const centreX = box.left + box.width / 2;
          const centreY = box.top + box.height / 2;
          const inset = reach / 2 - 1;
          const edges = [
            [centreX - inset, centreY],
            [centreX + inset, centreY],
            [centreX, centreY - inset],
            [centreX, centreY + inset],
          ] as const;
          const hits = edges.map(([x, y]) => element.contains(element.ownerDocument.elementFromPoint(x, y)));
          const bubble = element.closest('[data-slot="message-row"]')?.querySelector('[data-slot="message-content-column"]')?.getBoundingClientRect();
          const covered =
            bubble === undefined
              ? []
              : [bubble.left + 1, bubble.right - 1].flatMap((x) =>
                  [bubble.top + 1, bubble.top + bubble.height / 2, bubble.bottom - 1].filter((y) =>
                    element.contains(element.ownerDocument.elementFromPoint(x, y)),
                  ),
                );
          return { hits, covered };
        }, floor);
        expect(probe.hits, `${role} avatar reach edges (start, end, top, bottom)`).toEqual([true, true, true, true]);
        expect(probe.covered, `${role} bubble points the avatar reach covers`).toEqual([]);
      }
    });
  });
}
