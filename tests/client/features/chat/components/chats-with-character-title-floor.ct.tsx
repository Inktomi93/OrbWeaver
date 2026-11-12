// @subject packages/client/src/features/chat/components/chats-with-character-pane.tsx
// In the chats-with-this-character pane every row can carry the same title, so each row's name carries a date qualifier. A short name
// shares its line with the qualifier, and a long name is cut short while the qualifier stays whole; in a narrow pane the name still keeps
// the title floor.

import { createCharacterSchema } from "@orb/contracts/character";
import { MS_PER_HOUR, UTC_TIME_ZONE } from "@orb/kit/time";
import {
  LAYOUT_SUBPIXEL_PX,
  nearestScroller,
  PLATFORM_TEXT_SCALES,
  resolvedLength,
  setPlatformTextSize,
  sidewaysReach,
  titleFit,
} from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createFirstBootHarness, seedCorpusConnections } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import { chatsWithCharacterName } from "#client/features/chat/lib/chat-surface-names.ts";
import type { ChatsWithCharacterStory } from "./_chats-with-character-stories.tsx";

const STORY = "tests/client/features/chat/components/_chats-with-character-stories/ChatsWithCharacterStory";
const READS = ["sessions.me", "settings.getUserSettings", "chat.listChats"] as const;
const SAME_TITLE_ROOMS = 3;
const LONG_TITLE = "The long vigil at the lighthouse keeper's cottage through the storm season, told from the first night to the last";
// 373px is a docked side pane; 280px is one narrow enough that, without the title floor, the qualifier takes the line and squeezes the name.
const CASES = [
  { label: "short", title: null, width: 373, expected: { qualifierBesideName: true, nameKeepsItsFloor: true, nameTruncated: false, qualifierWhole: true } },
  { label: "long", title: LONG_TITLE, width: 373, expected: { qualifierBesideName: true, nameKeepsItsFloor: true, nameTruncated: true, qualifierWhole: true } },
  { label: "short", title: null, width: 280, expected: { qualifierBesideName: false, nameKeepsItsFloor: true, nameTruncated: false, qualifierWhole: true } },
  {
    label: "long",
    title: LONG_TITLE,
    width: 280,
    expected: { qualifierBesideName: false, nameKeepsItsFloor: true, nameTruncated: true, qualifierWhole: true },
  },
] as const;

const PHONE_WIDTH = 390;
const LARGEST_TEXT = PLATFORM_TEXT_SCALES[2];
const PHONE_NAMES = [
  { label: "short", title: "The vigil", nameTruncated: false },
  { label: "long", title: LONG_TITLE, nameTruncated: true },
] as const;

test.use({ viewport: { width: 1280, height: 900 } });

for (const { label, title, width, expected } of CASES) {
  test(`a ${label} name in a ${String(width)}px pane keeps its floor and the date qualifier stays whole`, async ({ mount, page }) => {
    await using root = await createFirstBootHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await seedCorpusConnections(root, await root.principalFor(root.ownerId));
    const keeper = await caller.character.create({
      input: createCharacterSchema.parse({ handle: "native-keeper", name: "Keeper", description: "Keeps the light." }),
    });
    for (let room = 0; room < SAME_TITLE_ROOMS; room += 1) {
      const { chat } = await caller.chat.startChat({ characterIds: [keeper.id], opening: "none" });
      if (title !== null) {
        await caller.chat.updateTitle({ chatId: chat.id, title });
      }
      root.clock.advance(MS_PER_HOUR);
      await caller.chat.commitMessage({ chatId: chat.id, content: `Entry number ${String(room)}.`, timeZone: UTC_TIME_ZONE });
    }
    await routeTrpc(page, serveCorpusProcedures(caller, READS));
    await mount<typeof ChatsWithCharacterStory>(STORY, { characterId: keeper.id, characterName: keeper.name, width });

    const rows = page.getByRole("list", { name: chatsWithCharacterName(keeper.name), exact: true }).locator('[data-slot="list-row-root"]');
    await expect(rows).toHaveCount(SAME_TITLE_ROOMS);
    const floor = await resolvedLength(page, `var(${TOKENS["width.title-floor"].cssVar})`, rows.first());
    for (const row of await rows.all()) {
      expect(await titleFit(row, floor)).toEqual(expected);
    }
  });
}

// The title floor is a rem length, so at the largest browser text it outgrows a phone's whole pane: the floor yields to the row.
test.describe("a phone at the largest browser text", () => {
  test.use({ viewport: { width: PHONE_WIDTH, height: 844 }, hasTouch: true, isMobile: true });

  for (const { label, title, nameTruncated } of PHONE_NAMES) {
    test(`a ${label} name in the pane truncates inside its row and the pane does not scroll sideways`, async ({ mount, page }) => {
      await using _textSize = await setPlatformTextSize(page, LARGEST_TEXT);
      await using root = await createFirstBootHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await seedCorpusConnections(root, await root.principalFor(root.ownerId));
      const keeper = await caller.character.create({
        input: createCharacterSchema.parse({ handle: "native-keeper", name: "Keeper", description: "Keeps the light." }),
      });
      for (let room = 0; room < SAME_TITLE_ROOMS; room += 1) {
        const { chat } = await caller.chat.startChat({ characterIds: [keeper.id], opening: "none" });
        await caller.chat.updateTitle({ chatId: chat.id, title });
        root.clock.advance(MS_PER_HOUR);
        await caller.chat.commitMessage({ chatId: chat.id, content: `Entry number ${String(room)}.`, timeZone: UTC_TIME_ZONE });
      }
      await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof ChatsWithCharacterStory>(STORY, { characterId: keeper.id, characterName: keeper.name, width: PHONE_WIDTH });

      const rows = page.getByRole("list", { name: chatsWithCharacterName(keeper.name), exact: true }).locator('[data-slot="list-row-root"]');
      await expect(rows).toHaveCount(SAME_TITLE_ROOMS);
      const floor = await resolvedLength(page, `var(${TOKENS["width.title-floor"].cssVar})`, rows.first());
      for (const row of await rows.all()) {
        expect(await titleFit(row, floor)).toMatchObject({ nameKeepsItsFloor: true, nameTruncated, qualifierWhole: true });
      }
      const scroller = await rows.first().evaluateHandle(nearestScroller);
      const reach = await scroller.evaluate(sidewaysReach);
      expect(reach.wideners).toEqual([]);
      expect(reach.scrolls).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
    });
  }
});
