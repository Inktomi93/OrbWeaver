// @subject packages/client/src/features/chat/components/regex-on-screen-group.tsx
// The On screen roster's Stopped mark, through a real stop: a display script that overruns the display pass's Worker
// deadline on a real transcript row is stopped, and the room's roster marks that script's row stopped and no other.
// The defect it catches is a roster that lists a stopped script as if it still ran on this device.
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { TranscriptBesideTabStory } from "./_chat-forks-stories.tsx";
import { GHOST_ROOM_PROCEDURES, soloRoom } from "./ghost-room.fixtures.ts";

const STORY = "tests/client/features/chat/components/_chat-forks-stories/TranscriptBesideTabStory";
const UTC = "UTC";
/** Backtracks exponentially on a run of `a` that does not end the line: at forty, for longer than any test runs. */
const RUNAWAY = { name: "Runaway", findRegex: "(a+)+$", replaceString: "MATCHED" } as const;
const RUNAWAY_TEXT = `${"a".repeat(40)}!`;
const STEADY = { name: "Steady", findRegex: "STEADYMARK", replaceString: "steady" } as const;
test.use({ viewport: { width: 1280, height: 1000 }, isMobile: false, hasTouch: false });

const PROCEDURES = [
  ...GHOST_ROOM_PROCEDURES,
  "chat.listForks",
  "chat.listChatInjections",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "regex.listForChat",
  "regex.listGlobal",
  "chat.listEffectiveRegex",
  "chat.getUserMacroPicks",
  "chat.getVariablePicks",
  "preset.get",
] as const;

/** A roster row, by its script's title. */
function rosterRow(page: Page, name: string): ReturnType<Page["locator"]> {
  return page
    .locator('[data-slot="regex-on-screen"] [data-slot="list-row-root"]')
    .filter({ has: page.locator('[data-slot="list-row-title"]').getByText(name, { exact: true }) });
}

/** The roster's warning mark on a row: the stopped state, read by its tone rather than its words. */
function stoppedMark(row: ReturnType<Page["locator"]>): ReturnType<Page["locator"]> {
  return row.locator('[data-slot="badge"][data-tone="warning"]');
}

test("a display script the Worker stops on a real row is marked stopped in the room's roster, and a steady one is not", async ({
  mount,
  page,
  corpusMedia,
}) => {
  await using root = await createCorpusHarness();
  const { chatId } = await soloRoom(root);
  const owner = await root.internalCallerFor(root.ownerId);
  for (const script of [RUNAWAY, STEADY]) {
    const created = await owner.regex.createScript({ input: { ...script, targets: ["AI_OUTPUT", "USER_INPUT"], passes: ["display"] } });
    await owner.regex.attachGlobal({ scriptId: created.id });
  }
  const { messages } = await owner.chat.listMessages({ chatId, limit: 1 });
  const newest = messages.at(-1);
  if (newest === undefined) {
    throw new Error("The corpus room has no message to rewrite");
  }
  await owner.chat.editMessage({ chatId, messageId: newest.id, content: RUNAWAY_TEXT, timeZone: UTC });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(owner, PROCEDURES));
  await corpusMedia();
  await mount<typeof TranscriptBesideTabStory>(STORY, { chatId, isHost: (await owner.chat.getChat({ chatId })).viewerIsHost });

  // The stop itself: the row keeps its own text, and one notice is raised.
  await expect(page.locator(`[data-message-id="${newest.id}"]`).getByText(RUNAWAY_TEXT, { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(1);

  await page.getByRole("button", { name: /^Regex/u }).click();
  // The positive control: both scripts are listed, so a missing mark is not a missing row.
  await expect(rosterRow(page, STEADY.name)).toHaveCount(1);
  await expect(stoppedMark(rosterRow(page, RUNAWAY.name))).toHaveCount(1);
  await expect(stoppedMark(rosterRow(page, STEADY.name))).toHaveCount(0);
});
