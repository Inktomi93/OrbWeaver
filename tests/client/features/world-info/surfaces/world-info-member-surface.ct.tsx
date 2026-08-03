// CT: the world-info MEMBER EDITOR — the collection's `detail`, over the stubbed network.
//
// Drives the production path: the host-opaque `memberId` is re-branded against `worldInfo.listBooksWithUsage`
// (the roster's own cache), then `worldInfo.getBook` + `worldInfo.listEntries` (priority DESC = Alpha, Bravo,
// Charlie) render the book view. Three subjects: the GONE arm (the book was deleted under the editor), the
// entry drill, and the sortable entry list (PD-138) — a keyboard-drag of Alpha's grip DOWN past Bravo must
// fire `worldInfo.applyEntryOrder` with the new id order. Keyboard drag (not pointer) is the deterministic CT
// path: @dnd-kit's KeyboardSensor picks up on Space, moves 10px per ArrowDown, drops on Space (its own
// defaults). DEF-14: every assertion is web-first / expect.poll — no bare live-DOM read.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { WorldInfoEditorReorderStory, WorldInfoMemberStory } from "../_ct-stories";

const BOOK_ID = "world_book_reorder001";
const ALPHA = "world_entry_reorder0a";
const BRAVO = "world_entry_reorder0b";
const CHARLIE = "world_entry_reorder0c";

const BOOK_ROW = {
  id: BOOK_ID,
  name: "Reorder Book",
  description: "a book with three entries",
  createdAt: 1,
  entryCount: 3,
  usage: { characters: 0, personas: 0, chats: 0, global: false, total: 0 },
};

function entry(id: string, title: string, priority: number): unknown {
  return {
    id,
    worldBookId: BOOK_ID,
    title,
    description: null,
    content: `${title} lore`,
    keys: [],
    enabled: true,
    priority,
    ignoreBudget: false,
    metadata: null,
  };
}

const ENTRIES = [entry(ALPHA, "Alpha", 3), entry(BRAVO, "Bravo", 2), entry(CHARLIE, "Charlie", 1)];

test("a member id no book matches renders the GONE arm, not a dead form", async ({ mount, page }) => {
  await routeTrpc(page, { "worldInfo.listBooksWithUsage": () => [BOOK_ROW] });

  const surface = await mount(<WorldInfoMemberStory memberId="world_book_deleted0001" />);
  await expect(surface.getByText("Book not found")).toBeVisible();
});

test("the book view names the book and drills into an entry", async ({ mount, page }) => {
  await routeTrpc(page, {
    "worldInfo.listBooksWithUsage": () => [BOOK_ROW],
    "worldInfo.getBook": () => ({ id: BOOK_ID, name: "Reorder Book", description: "a book with three entries", createdAt: 1 }),
    "worldInfo.listEntries": () => ENTRIES,
  });

  const surface = await mount(<WorldInfoMemberStory />);
  await expect(surface.getByRole("heading", { name: "Reorder Book" })).toBeVisible();
  await expect(surface.getByText("3 entries")).toBeVisible();

  // An entry row click drills IN — the editor replaces the list until "Back to entries" clears it.
  await surface.getByText("Bravo", { exact: true }).click();
  await expect(surface.getByRole("button", { name: "Back to entries" })).toBeVisible();
});

test("drag-reorders an entry and persists the new order via applyEntryOrder", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "worldInfo.listBooksWithUsage": () => [BOOK_ROW],
    "worldInfo.getBook": () => ({ id: BOOK_ID, name: "Reorder Book", description: null, createdAt: 1 }),
    // priority DESC → display order Alpha, Bravo, Charlie.
    "worldInfo.listEntries": () => ENTRIES,
    "worldInfo.applyEntryOrder": () => ({ reordered: 3 }),
  });

  await mount(<WorldInfoEditorReorderStory />);

  // The three rows + their per-row drag handles render (handle mode names each grip by its row title).
  await expect(page.getByText("Alpha")).toBeVisible();
  await expect(page.getByText("Bravo")).toBeVisible();
  const alphaGrip = page.getByRole("button", { name: "Reorder Alpha" });
  await expect(alphaGrip).toBeVisible();

  // Keyboard-drag Alpha down past Bravo: Space picks up, each ArrowDown nudges 10px (a row is taller than
  // one nudge), Space drops. Six nudges clear a full row so the sortable swaps Alpha and Bravo.
  await alphaGrip.focus();
  await page.keyboard.press("Space");
  // Drag Alpha from the TOP to the BOTTOM: each ArrowDown nudges 10px, so six nudges clear both remaining
  // rows and drop Alpha last. A deterministic full-length drag (a one-row nudge is pixel-fragile). Space drops.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");

  // The completed drag persists the new id order — Alpha now trails; Bravo, Charlie shift up.
  await expect.poll(() => trpc.count("worldInfo.applyEntryOrder"), { intervals: [20, 50, 100, 200] }).toBeGreaterThanOrEqual(1);
  await expect
    .poll(() => (trpc.lastInput("worldInfo.applyEntryOrder") as { orderedEntryIds?: string[] } | undefined)?.orderedEntryIds, {
      intervals: [20, 50, 100, 200],
    })
    .toEqual([BRAVO, CHARLIE, ALPHA]);
});
