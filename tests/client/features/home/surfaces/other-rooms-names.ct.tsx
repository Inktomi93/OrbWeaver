// Home's Other rooms tile names each room apart: rooms that share a title carry a qualifier in their name, a room
// with a title of its own keeps the bare title.
import { ALSO_OPEN_TILE_ID } from "@orb/client/state";
import { HOME_RECENT_CHATS_LIMIT } from "@orb/contracts/chat";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { HomeGridRefStory } from "./_grid-ref-stories.tsx";

const SHARED_TITLE = "Hikari";
const UNIQUE_TITLE = "The Ashen Spire";

test("rooms that share a title are named apart in Other rooms, and a room with its own title keeps it", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const recent = await caller.chat.listChats({ limit: HOME_RECENT_CHATS_LIMIT });
  const [hearth, firstTwin, secondTwin, third] = recent.items;
  if (hearth === undefined || firstTwin === undefined || secondTwin === undefined || third === undefined) {
    throw new Error("The corpus must expose a hero room and three more for Home's Other rooms tile");
  }
  // The hero is the room the viewer spoke in last, so the other rooms carry no turn of theirs.
  const lead = { ...hearth, viewerLastTurnAt: hearth.updatedAt };
  const twins = [firstTwin, secondTwin].map((room, index) => ({
    ...room,
    title: SHARED_TITLE,
    viewerLastTurnAt: null,
    lastMessageAt: hearth.updatedAt - (index + 1) * 60_000,
  }));
  const unique = { ...third, title: UNIQUE_TITLE, viewerLastTurnAt: null };
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "chat.getChat"]),
    "chat.listChats": (input) => {
      expect(input).toEqual({ limit: HOME_RECENT_CHATS_LIMIT });
      return { ...recent, items: [lead, ...twins, unique] };
    },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mount<typeof HomeGridRefStory>("tests/client/features/home/surfaces/_grid-ref-stories/HomeGridRefStory", { width: 1440 });
  const tile = page.locator(`[data-home-tile="${ALSO_OPEN_TILE_ID}"]`);
  await expect(tile.locator('[data-slot="list-row-body"]')).toHaveCount(3);
  // The accessible names as the aria tree states them, so a screen reader's view of the rows is what is compared.
  const names = [...(await tile.ariaSnapshot()).matchAll(/- button "([^"]+)"/gu)].map((match) => match[1] ?? "");
  const rooms = names.filter((name) => name.startsWith(SHARED_TITLE) || name === UNIQUE_TITLE);
  expect(rooms).toHaveLength(3);
  expect(new Set(rooms).size).toBe(rooms.length);
  expect(rooms).toContain(UNIQUE_TITLE);
});
