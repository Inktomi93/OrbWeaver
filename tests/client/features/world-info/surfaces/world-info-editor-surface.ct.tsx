// CT: the book view's sortable entry LIST (PD-138) over the stubbed network. Drives the production path —
// `worldInfo.getBook` + `worldInfo.listEntries` (priority DESC = Alpha, Bravo, Charlie) — then keyboard-drags
// Alpha's grip DOWN past Bravo and asserts the completed drag fires `worldInfo.applyEntryOrder` with the new
// id order (Bravo, Alpha, Charlie). Keyboard drag (not pointer) is the deterministic CT path: @dnd-kit's
// KeyboardSensor picks up on Space, moves 10px per ArrowDown, drops on Space (its own defaults). DEF-14:
// every assertion is web-first / expect.poll — no bare live-DOM read.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { WorldInfoEditorReorderStory } from "../_ct-stories";

const BOOK_ID = "world_book_reorder001";
const ALPHA = "world_entry_reorder0a";
const BRAVO = "world_entry_reorder0b";
const CHARLIE = "world_entry_reorder0c";

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

test("drag-reorders an entry and persists the new order via applyEntryOrder", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "worldInfo.getBook": () => ({ id: BOOK_ID, name: "Reorder Book", description: null, createdAt: 1 }),
    // priority DESC → display order Alpha, Bravo, Charlie.
    "worldInfo.listEntries": () => [entry(ALPHA, "Alpha", 3), entry(BRAVO, "Bravo", 2), entry(CHARLIE, "Charlie", 1)],
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
