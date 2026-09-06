// CT: the tag collection's ROWS — the OWNER half of the config seam, driven through the host's view.
//
// The row is a SCENT now (F-11): swatch · name · usage. What this pins is what that split must NOT lose —
// the usage census still reads per row, and the comparator/handle fork still answers the sort mode.
//
// ═══ THE CHROME LEFT THIS COMPONENT (#1725) ══════════════════════════════════════════════════════════
// The sort SELECT and the "Prune unused" BUTTON used to be drawn here, and they are the config host's
// control row now (`tagCollection.sort` / `.actions`, DESIGN.md §3.2). Both write store functions, so this
// file drives those functions through the story's buttons and asserts what the ROWS do with them; the host
// half — that a Select and a kebab item exist, are absent for the libraries that declare neither, and write
// exactly these values — is pinned in `tests/client/features/config/components/config-collection-landing.ct.tsx`.
// Nothing was dropped; the two halves are asserted where each is drawn.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { TagCollectionRowsStory } from "../_ct-stories.tsx";

const TAGS = [
  {
    id: "tag_adventure",
    name: "adventure",
    color: "#3355ff",
    color2: null,
    source: "manual",
    folderType: "NONE",
    sortOrder: 0,
    isHiddenOnCard: false,
    usage: { characters: 5, chats: 1, worldBooks: 1, personas: 0, presets: 0, total: 7 },
  },
  {
    id: "tag_orphan",
    name: "orphan",
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: 1,
    isHiddenOnCard: true,
    usage: { characters: 0, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 0 },
  },
];

function stub(page: Page, tags: readonly unknown[] = TAGS): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "tag.listTagsWithUsage": () => tags,
    "tag.pruneUnusedTags": () => ({ removed: 1 }),
    "tag.setTagOrder": () => undefined,
    "tag.removeTag": () => undefined,
  });
}

/** The row-kebab delete confirm's cascade line for "adventure" (5 characters, 1 chat, 1 world book) — the
 *  consequence a scan-line roster row cannot show, carried by the confirm the way the member editor's used to. */
const DELETE_CASCADE = /5 characters, 1 chat, 1 world book/;

// A third row whose ALPHABETICAL rank and its USAGE rank disagree — without it "most-used" and "A–Z"
// produce the identical order and neither assertion proves anything.
const ZEAL = {
  id: "tag_zeal",
  name: "zeal",
  color: null,
  color2: null,
  source: "manual",
  folderType: "NONE",
  sortOrder: 2,
  isHiddenOnCard: false,
  usage: { characters: 9, chats: 3, worldBooks: 0, personas: 0, presets: 0, total: 12 },
};

const THREE = [TAGS[0], TAGS[1], ZEAL];

/** The SortableList handle's per-row accessible name (`Reorder <tag>`). */
const REORDER_HANDLE = /Reorder/u;

test("SORT MODE: the roster leads with MOST-USED by default and switches to A–Z", async ({ mount, page }) => {
  await stub(page, THREE);
  const rows = await mount(<TagCollectionRowsStory />);
  // Default is most-used: zeal (12) · adventure (7) · orphan (0).
  await expect(rows.locator('[data-slot="list-row-title"]')).toHaveText(["zeal", "adventure", "orphan"]);

  await rows.getByRole("button", { name: "sort: a-z" }).click();
  await expect(rows.locator('[data-slot="list-row-title"]')).toHaveText(["adventure", "orphan", "zeal"]);
});

test("SORT MODE: manual order is still reachable and is the only arm that offers drag handles", async ({ mount, page }) => {
  await stub(page, THREE);
  const rows = await mount(<TagCollectionRowsStory />);
  // Most-used (the default) is a derived order — a drag handle there would write a lie.
  await expect(rows.getByRole("button", { name: REORDER_HANDLE })).toHaveCount(0);

  await rows.getByRole("button", { name: "sort: manual" }).click();
  await expect(rows.locator('[data-slot="list-row-title"]')).toHaveText(["adventure", "orphan", "zeal"]);
  await expect(rows.getByRole("button", { name: REORDER_HANDLE }).first()).toBeVisible();
});

test("each row carries its name and its usage census", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<TagCollectionRowsStory />);
  await expect(rows.getByText("adventure")).toBeVisible();
  await expect(rows.getByText("7 uses")).toBeVisible();
  await expect(rows.getByText("unused", { exact: true })).toBeVisible();
});

// DELETE CONVERGED ONTO THE ROW'S KEBAB (config-delete #271). Before this, a tag could be deleted ONLY from
// the member editor — the odd one out among the three config collections (world-info row-kebab-only, regex
// both). This pins the converged affordance where the other two already have it: the row's ⋯ carries Delete,
// the confirm names the real usage cascade the scan row cannot show, and the click alone fires nothing —
// asserted through accessible names and the wire, never the component's internals.
test("the row's kebab carries Delete, confirms with the usage cascade, and fires removeTag", async ({ mount, page }) => {
  const trpc = await stub(page);
  const rows = await mount(<TagCollectionRowsStory />);
  await expect(rows.getByText("adventure")).toBeVisible();

  // §12.2: the kebab rests hidden + inert like every row affordance, so reach it by hovering the row first.
  await rows.locator('[data-slot="list-row-root"]', { hasText: "adventure" }).hover();
  await rows.getByRole("button", { name: "Actions for adventure", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByText(DELETE_CASCADE)).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await expect.poll(() => trpc.lastInput("tag.removeTag"), { intervals: [20, 50, 100] }).toEqual({ tagId: "tag_adventure" });
});

// The confirm is the GATE, not a formality: opening the kebab menu and dismissing the dialog must delete
// nothing. Barriers on the CLOSED dialog — a rendered state only reachable after the whole open→cancel
// round-trip, so a call the menu had fired would already be recorded.
test("the kebab Delete ASKS FIRST — cancelling the confirm fires nothing", async ({ mount, page }) => {
  const trpc = await stub(page);
  const rows = await mount(<TagCollectionRowsStory />);
  await rows.locator('[data-slot="list-row-root"]', { hasText: "adventure" }).hover();
  await rows.getByRole("button", { name: "Actions for adventure", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect.poll(() => trpc.count("tag.removeTag"), { intervals: [20, 50, 100] }).toBe(0);
});

// A ROW IS A SCAN LINE, AND ITS SPOKEN FORM IS TOO (side-eye re-verify 2026-08-06). A fix that put the
// swatch's colour value in `markers` — the row's `aria-describedby` channel — made a screen reader recite
// an 8-word "not set — uses the theme default" disclaimer once per row, ahead of the census, and
// concatenated to it with no separator, across a 400-tag library. The row's description is the census
// ALONE; the colour's value is stated once, in words, in the editor the row's click mounts.
test("a row's spoken DESCRIPTION is the census alone — no per-row colour disclaimer", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<TagCollectionRowsStory />);
  // `exact`: the row now carries a kebab named "Actions for adventure" (config-delete #271's converged
  // Delete), so a substring "adventure" match resolves to both the row and its menu. The ROW button's own
  // accessible name is exactly the tag name — that is the one whose description is the census.
  const row = rows.getByRole("button", { name: "adventure", exact: true });
  await expect(row).toHaveAccessibleDescription("7 uses");
  // The words are nowhere in the roster at all — not in a row's name, not in its description.
  await expect(rows.getByText("theme default")).toHaveCount(0);
});

test("the host's filter string narrows the OWNER's rows", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<TagCollectionRowsStory filter="orph" />);
  await expect(rows.getByText("orphan")).toBeVisible();
  await expect(rows.getByText("adventure")).toHaveCount(0);
});

// PRUNE CONFIRMS (side-eye 2026-08-03 P2): it was a bare `prune.mutate()` on a ghost button, one mis-click
// from deleting every unused tag with no undo — 394 of them at the owner's library. The confirm is the
// defect's fix, so the CT pins BOTH halves: the click alone must not delete, and the count must be in the
// words the user agrees to.
test("Prune unused ASKS FIRST — the click opens a counted confirm and fires nothing", async ({ mount, page }) => {
  const trpc = await stub(page);
  const rows = await mount(<TagCollectionRowsStory />);
  await rows.getByRole("button", { name: "open prune confirm" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delete 1 unused tag?" })).toBeVisible();
  // Dismiss and settle on the CLOSED dialog before reading the recorder: the barrier is a rendered state
  // that can only exist after the whole open→cancel round-trip, so a call the click had fired would have
  // been recorded by now.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect.poll(() => trpc.count("tag.pruneUnusedTags"), { intervals: [20, 50, 100] }).toBe(0);
});

test("Prune unused fires the library verb once the confirm is accepted", async ({ mount, page }) => {
  const trpc = await stub(page);
  const rows = await mount(<TagCollectionRowsStory />);
  await rows.getByRole("button", { name: "open prune confirm" }).click();
  // SINGULAR (side-eye 2026-08-03 P3): "Delete them" under "Delete 1 unused tag?" was the confirm
  // disagreeing with the question it answers.
  await page.getByRole("button", { name: "Delete it" }).click();
  await expect.poll(() => trpc.count("tag.pruneUnusedTags"), { intervals: [20, 50, 100] }).toBe(1);
});

test("the prune confirm's LABEL agrees in number with its own title", async ({ mount, page }) => {
  const second = { ...TAGS[1], id: "tag_orphan2", name: "orphan2" } as unknown;
  await stub(page, [TAGS[0], TAGS[1], second]);
  const rows = await mount(<TagCollectionRowsStory />);
  await rows.getByRole("button", { name: "open prune confirm" }).click();
  await expect(page.getByRole("heading", { name: "Delete 2 unused tags?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete them" })).toBeVisible();
});

// THE DOUBLE EMPTY STATE (side-eye 2026-08-03 P1): `empty = filtered.length === 0` printed filter copy
// with no filter set, stacked above the HOST's own zero-member slot — an empty collection said two things
// and one of them named a control that isn't even rendered. The needle is the discriminant.
test("an EMPTY library says nothing about filters (the host's empty slot is the only voice)", async ({ mount, page }) => {
  await stub(page, []);
  const rows = await mount(<TagCollectionRowsStory />);
  await expect(rows.getByText("No tags match that filter.")).toHaveCount(0);
});

test("a filter that matches nothing DOES say so", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<TagCollectionRowsStory filter="zzzz" />);
  await expect(rows.getByText("No tags match that filter.")).toBeVisible();
});

// NOTHING TO PRUNE — the ruling survives, its SURFACE changed (#1725). The verb used to be a button the
// rows HID when `unusedCount === 0`; it is a menu item built from static `actions` data now, and static data
// cannot hide itself, so the same fact is stated by the dialog: it says there is nothing to delete and its
// destructive button is DISABLED. Asserting the disabled state matters more than asserting the copy — a
// confirm that reads "nothing to prune" over a live Delete button would be the capability lie inverted.
test("no unused tags ⇒ the prune confirm says so and cannot fire", async ({ mount, page }) => {
  const trpc = await stub(page, [TAGS[0]]);
  const rows = await mount(<TagCollectionRowsStory />);
  await expect(rows.getByText("adventure")).toBeVisible();
  await rows.getByRole("button", { name: "open prune confirm" }).click();
  await expect(page.getByRole("heading", { name: "Nothing to prune" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete them" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect.poll(() => trpc.count("tag.pruneUnusedTags"), { intervals: [20, 50, 100] }).toBe(0);
});

// THE SORT CONTROL'S GEOMETRY MOVED WITH THE CONTROL (#1725). This file used to pin that the `w-auto`
// Select fitted the 330px roster band without claiming it; the Select is the config host's control row now,
// at CONTENT-pane widths, so that pin lives in the landing's own width matrix
// (`tests/client/features/config/components/config-collection-landing.ct.tsx`). Deleted here rather than
// left asserting a control this component no longer draws.

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// MANUAL ORDER IS NOT A SILENT DEAD MODE (side-eye 2026-08-03 P1). Above COLLECTION_LARGE_GROUP the roster
// virtualizes and drag handles cannot exist — measured at the owner's 413-tag library as
// `{mode:"Manual order", handles:0}`, with every `sortOrder` null so the comparator tiebreaks on name and
// the result is pixel-identical to A–Z. Nothing said so, and the mode persists per device.

/** One more than COLLECTION_LARGE_GROUP — the first library size that windows (and loses drag). */
const OVER_CAP = 31;
const OVER_CAP_TAGS = Array.from({ length: OVER_CAP }, (_unused, at) => ({
  ...(TAGS[0] as Record<string, unknown>),
  id: `tag_bulk_${String(at)}`,
  name: `bulk-${String(at).padStart(2, "0")}`,
  sortOrder: null,
}));

// ABOVE THE CAP the rows LOSE their handles, and that half is this component's. The option's own
// `disabled` + the "Drag to reorder is off above 30 tags." description are the HOST's Select now and are
// pinned in the landing CT — the two halves of one ruling, each asserted where it is drawn.
test("ABOVE the cap: manual mode yields no drag handles, whatever the persisted mode says", async ({ mount, page }) => {
  await stub(page, OVER_CAP_TAGS);
  const rows = await mount(<TagCollectionRowsStory />);
  await rows.getByRole("button", { name: "sort: manual" }).click();
  // The windowed arm is the one that renders, and it has no stable drop target for an unrendered row.
  await expect(rows.locator('[data-slot="virtual-list-scroll"]')).toBeVisible();
  await expect(rows.getByRole("button", { name: REORDER_HANDLE })).toHaveCount(0);
});

test("BELOW the cap: switching to manual puts real handles on screen", async ({ mount, page }) => {
  await stub(page, THREE);
  const rows = await mount(<TagCollectionRowsStory />);
  await expect(rows.getByRole("button", { name: REORDER_HANDLE })).toHaveCount(0);
  await rows.getByRole("button", { name: "sort: manual" }).click();
  await expect(rows.getByRole("button", { name: REORDER_HANDLE }).first()).toBeVisible();
});

test("the WINDOWED roster paints a scroll cue while there is more below, and drops it at the end", async ({ mount, page }) => {
  await stub(page, OVER_CAP_TAGS);
  const rows = await mount(<TagCollectionRowsStory />);
  const scroller = rows.locator('[data-slot="virtual-list-scroll"]');
  await expect(scroller).toBeVisible();
  // RENDERED, not the class string: the bounded window ends mid-row, and with overlay scrollbars that
  // half-row was the only hint that scrolling was possible (side-eye 2026-08-03 P3).
  await expect(scroller).toHaveAttribute("data-more", "");
  await expect.poll(async () => await scroller.evaluate((el: Element): string => globalThis.getComputedStyle(el).maskImage)).not.toBe("none");

  await scroller.evaluate((el: Element): void => {
    el.scrollTop = el.scrollHeight;
  });
  // Poll to SETTLED: the scroll handler runs off the browser's own scroll event.
  await expect(scroller).not.toHaveAttribute("data-more", "");
  await expect.poll(async () => await scroller.evaluate((el: Element): string => globalThis.getComputedStyle(el).maskImage)).toBe("none");
});

// ── #1824 · THE WIDTH MATRIX THE ROW ANATOMY WAS OWED ────────────────────────────────────────────────
// DESIGN.md §5 obligation 6: "Rows at pane width carry more air than at 307px — the width matrix (both
// ends + the crossover, both pointers) is owed before the row anatomy is called converged", and the mock
// review set the bar at an ink-to-ink void ≤ 25%. It was never landed, and #1725 moved these rows from a
// 307px LIST column into a 990px CONTENT pane unchanged. Measured on the live surface 2026-09-06:
//
//   comedy     ink 30→86   "5 uses" ink 934→982   void 848 of 990 = 86%
//   rpg-ready  ink 30→98   "4 uses" ink 934→982   void 836 of 990 = 84%
//   fantasy    ink 30→82   "3 uses" ink 934→982   void 852 of 990 = 86%
//
// THE MEASUREMENT IS A RANGE, NEVER A BOUNDING BOX — and that is the whole reason this defect survived
// two reviews. The title span is `min-w-0 flex-1 truncate`, so its BOX runs the full 30→928 and a
// `getBoundingClientRect` census reports a 6px gap and a clean row (the retracted first pass did exactly
// that). Only `Range.selectNodeContents(textNode).getBoundingClientRect()` sees where the glyphs are.
//
// THE FIX IS A PLACEMENT, NOT A CAP. Board 02 and DESIGN.md §3.3 both put a tag's usage in the row's
// SUBTITLE ("on 12 things" under the name); the build parked it in `markers`, the TITLE line's trailing
// edge, which is the 848px hole. Every other collection row (regex scent, world-info bookScent, roster
// members, databank, preset) already carries a subtitle — tags was the one that did not.

/** One row's ink-to-ink void: the widest horizontal gap between consecutive rendered GLYPH RUNS, as a
 *  fraction of the row's own width. Text nodes only — an invisible hover-revealed kebab is not ink, and a
 *  swatch is not ink either. */
function inkVoid(page: Page, index: number): Promise<{ readonly width: number; readonly pct: number; readonly at: string; readonly runs: number }> {
  return page.evaluate((at: number) => {
    const row = document.querySelectorAll<HTMLElement>('[data-slot="list-row-root"]')[at];
    if (row === undefined) {
      throw new Error(`inkVoid: no row at index ${String(at)}`);
    }
    const inked = (node: Node): boolean => {
      const parent = node.parentElement;
      if (parent === null || (node.textContent ?? "").trim() === "") {
        return false;
      }
      const style = getComputedStyle(parent);
      return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
    };
    const runRect = (node: Node): DOMRect => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect();
    };
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
      acceptNode: (node): number => (inked(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const runs: { readonly left: number; readonly right: number; readonly text: string }[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const rect = runRect(node);
      runs.push({ left: rect.left, right: rect.right, text: (node.textContent ?? "").trim() });
    }
    runs.sort((a, b) => a.left - b.left);
    const width = row.getBoundingClientRect().width;
    const widest = runs
      .slice(1)
      .map((run, i) => ({ gap: run.left - (runs[i]?.right ?? run.left), at: `"${runs[i]?.text ?? ""}" → "${run.text}"` }))
      .reduce((best, candidate) => (candidate.gap > best.gap ? candidate : best), { gap: 0, at: "" });
    return { width: Math.round(width), pct: Math.round((widest.gap / width) * 100), at: widest.at, runs: runs.length };
  }, index);
}

// 382 is the coarse arm's real row width (430px phone), 990 the desktop CONTENT pane with the context
// collapsed, 660 the crossover between them — a point measurement at one width would have missed this in
// either direction (the coarse arm already read 48% while desktop read 86%).
for (const width of [382, 660, 990] as const) {
  test(`#1824: a tag row's ink-to-ink void stays inside the 25% bar at ${String(width)}px`, async ({ mount, page }) => {
    await stub(page, THREE);
    const rows = await mount(<TagCollectionRowsStory width={width} />);
    await expect(rows.getByText("adventure")).toBeVisible();

    for (const index of [0, 1, 2]) {
      const void_ = await inkVoid(page, index);
      expect(void_.runs, "a row must have rendered ink to measure").toBeGreaterThan(0);
      expect(void_.pct, `row ${String(index)} at ${String(void_.width)}px: widest ink gap ${String(void_.pct)}% ${void_.at}`).toBeLessThanOrEqual(25);
    }
  });
}

test("#1824: the usage census reads on the row's SUBTITLE line, under the name it counts", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<TagCollectionRowsStory width={990} />);
  const row = rows.locator('[data-slot="list-row-root"]').first();

  // The board's anatomy, asserted as GEOMETRY rather than as a slot name: the census sits below the title
  // and starts at the same left edge, which is what makes it read as the name's own count at any pane
  // width. On the pre-#1824 source it sat on the title's line, ~850px to the right of it.
  const geometry = await row.evaluate((el: Element) => {
    const title = el.querySelector<HTMLElement>('[data-slot="list-row-title"]');
    const subtitle = el.querySelector<HTMLElement>('[data-slot="list-row-subtitle"]');
    if (title === null || subtitle === null) {
      throw new Error("the row is missing its title or its subtitle");
    }
    const t = title.getBoundingClientRect();
    const s = subtitle.getBoundingClientRect();
    return { text: subtitle.textContent ?? "", below: s.top >= t.bottom - 1, leftDelta: Math.abs(s.left - t.left) };
  });
  expect(geometry.text).toBe("7 uses");
  expect(geometry.below, "the census is on its own line, under the name").toBe(true);
  expect(geometry.leftDelta, "the census starts at the name's left edge").toBeLessThanOrEqual(1);
});
