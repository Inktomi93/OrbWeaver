// The room's composer shares the transcript's middle beside a flank column that is as wide as its contributors make it, and its edges on a phone.
import { CLOCK_MAX_VAR_KEY, CLOCK_VAR_KEY } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import type { AppShellRoomStory } from "./_app-shell-stories.tsx";
import { namedGroupRoom, routeRoom, SHELL_STORIES } from "./app-shell-ct.ts";

const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const ROW = '[data-slot="chat-room-flank-row"] [data-slot="message-row"]';
const REGION = '[data-slot="chat-room-composer-region"]';
const COMPOSER = `${REGION} [data-track="composer"]`;
const SLACK = 1;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

async function serveRoom(page: Page, corpus: CorpusPlayback): Promise<ChatId> {
  const caller = await root.internalCallerFor(root.ownerId);
  const room = namedGroupRoom((await caller.chat.listChats({ limit: 100 })).items);
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
  await routeRoom(page, corpus, caller);
  return room.id;
}

function edges(page: Page): Promise<{ readonly row: readonly [number, number]; readonly composer: readonly [number, number] }> {
  return page.evaluate(
    ([row, composer]) => {
      const edge = (selector: string): readonly [number, number] => {
        const element = Array.from(document.querySelectorAll(selector)).at(-1);
        if (element === undefined) {
          throw new Error(`${selector} is absent`);
        }
        const { left, right } = element.getBoundingClientRect();
        return [left, right];
      };
      return { row: edge(row), composer: edge(composer) };
    },
    [ROW, COMPOSER] as const,
  );
}

test.describe("beside a flank column sized by its content", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the composer's middle is the rows' middle", async ({ corpus, mount, page }) => {
    const caller = await root.internalCallerFor(root.ownerId);
    const chatId = await serveRoom(page, corpus);
    // The clock meter is a thread-flank contributor that takes the width of its ring, not a token's.
    const rule = await caller.automation.createRule({
      chatId,
      creationRequestId: root.idSource.typeId(ID_PREFIX.automationRuleCreation),
      name: "Clock witness",
      trigger: { bus: "chat", type: "messageCommitted" },
      predicateCel: "has(event.message)",
      actions: [
        { type: "set_variable", scope: "chat", key: CLOCK_MAX_VAR_KEY, op: "set", value: "6" },
        { type: "set_variable", scope: "chat", key: CLOCK_VAR_KEY, op: "set", value: "2" },
      ],
      timeZone: "UTC",
    });
    await caller.automation.setRuleEnabled({ ruleId: rule.id, enabled: true });
    await caller.automation.runRuleNow({ ruleId: rule.id });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
    await expect(page.locator('[data-slot="chat-thread-flank"]')).toBeVisible();
    await expect(page.locator(COMPOSER).last()).toBeVisible();
    const { row, composer } = await edges(page);
    const rowMiddle = (row[0] + row[1]) / 2;
    const composerMiddle = (composer[0] + composer[1]) / 2;

    expect(Math.abs(rowMiddle - composerMiddle)).toBeLessThanOrEqual(SLACK);
  });
});

const PHONE_WIDTHS = [320, 390, 430] as const;

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true });

  for (const width of PHONE_WIDTHS) {
    test(`at ${width} the composer card and the message rows share both edges`, async ({ corpus, mount, page }) => {
      await page.setViewportSize({ width, height: 800 });
      const chatId = await serveRoom(page, corpus);
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      await expect(page.locator(COMPOSER).last()).toBeVisible();
      await expect(page.locator(ROW).last()).toBeVisible();
      const { row, composer } = await edges(page);

      expect(Math.abs(row[0] - composer[0])).toBeLessThanOrEqual(SLACK);
      expect(Math.abs(row[1] - composer[1])).toBeLessThanOrEqual(SLACK);
    });

    test(`at ${width} the composer's content keeps the place the card's full padding gave it`, async ({ corpus, mount, page }) => {
      await page.setViewportSize({ width, height: 800 });
      const chatId = await serveRoom(page, corpus);
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      await expect(page.locator(COMPOSER).last()).toBeVisible();
      const field = await resolvedLength(page, `var(${TOKENS["spacing.field"].cssVar})`);
      // The card steps in from the region's start at a narrow width, yet its content stays a border and the full field padding in from it.
      const inset = await page.evaluate(
        ([composer, region]) => {
          const card = Array.from(document.querySelectorAll(composer)).at(-1);
          const content = card?.querySelector('[data-slot="composer-content"]');
          const start = Array.from(document.querySelectorAll(region)).at(-1);
          if (card === undefined || content === null || content === undefined || start === undefined) {
            throw new Error("the composer is absent");
          }
          return {
            border: Number.parseFloat(getComputedStyle(card).borderInlineStartWidth),
            content: content.getBoundingClientRect().left - start.getBoundingClientRect().left,
          };
        },
        [COMPOSER, REGION] as const,
      );

      expect(inset.content).toBeCloseTo(inset.border + field, 0);
    });
  }
});
