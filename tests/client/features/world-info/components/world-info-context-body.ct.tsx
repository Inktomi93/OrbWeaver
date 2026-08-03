// CT: the world-info collection's CONTEXT arm — the book activation panel, over the stubbed network.
//
// It is a `{kind:"body"}` arm, so there is no "nothing selected" state to test here (the host's own
// `context.empty` owns that). What this pins is that an OPEN book's arm is the real activation surface —
// the global toggle writes `worldInfo.attachGlobal` — and that a book deleted under the pane says so.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { WorldInfoContextStory } from "../_ct-stories";

const BOOK_ID = "world_book_reorder001";
const BOOK_ROW = {
  id: BOOK_ID,
  name: "Reorder Book",
  description: null,
  createdAt: 1,
  entryCount: 0,
  usage: { characters: 0, personas: 0, chats: 0, global: false, total: 0 },
};

test("the open book's arm switches the everywhere scope on", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "worldInfo.listBooksWithUsage": () => [BOOK_ROW],
    "worldInfo.listGlobal": () => [],
    "persona.list": () => [],
    "character.list": () => ({ items: [], nextCursor: null }),
    "worldInfo.attachGlobal": () => ({ attached: true }),
  });

  const context = await mount(<WorldInfoContextStory />);
  const globalSwitch = context.getByRole("switch", { name: "Fires in every chat" });
  await expect(globalSwitch).toBeVisible();

  await globalSwitch.click();
  await expect.poll(() => trpc.lastInput("worldInfo.attachGlobal"), { intervals: [20, 50, 100] }).toEqual({ bookId: BOOK_ID });
});

test("a book deleted under the pane says so instead of showing an empty panel", async ({ mount, page }) => {
  await routeTrpc(page, { "worldInfo.listBooksWithUsage": () => [] });

  const context = await mount(<WorldInfoContextStory />);
  await expect(context.getByText("Book not found")).toBeVisible();
});
