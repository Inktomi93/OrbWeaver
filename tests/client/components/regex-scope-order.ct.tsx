// CT: the regex EXECUTION-ORDER editor (REGORDER). `regex.applyScopeOrder` shipped int-tested, cross-tenant
// classified, and with zero client callers — per-scope run order was data the server modelled and no
// surface could author. These are the pins that close that pair:
//
//   1. the attached slice is an ORDERED group with a named grip per row, and the rest of the library
//      follows it in its own group (the split is IN PLACE — one row per script, never a second list);
//   2. a KEYBOARD reorder (Space · arrows · Space) writes the new id order to `applyScopeOrder` AND
//      repaints in it — the optimistic arm, because a reorder's only feedback is the new order;
//   3. past `COLLECTION_LARGE_GROUP` the grips give way to explicit Move up / Move down buttons, so the
//      capability never cliffs — only the mechanism changes (the tag collection drops drag outright);
//   4. one attached script offers NO reorder affordance (a grip that cannot move anything still
//      announces "Reorder <name>");
//   5. the GLOBAL tier's order is authored where its membership is — the collection's context arm.
//
// Order is asserted through ACCESSIBLE NAMES (the grips' and the move buttons' labels, in DOM order), not
// a data-slot census: those names are what a screen-reader user navigates the list by, and they are the
// affordance the whole ticket adds.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../support/ct/route-trpc.ts";
import { RegexContextStory, RegexPickerStory } from "../features/regex/_ct-stories.tsx";

const APPLY_PROC = "regex.applyScopeOrder";

const SCRIPT_BASE = {
  findRegex: "a",
  replaceString: "b",
  placement: ["AI_OUTPUT"],
  enabled: true,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: [],
  // A fixed edit stamp (X-16's `RegexScriptRow.updatedAt`) — the wall clock never reaches a fixture.
  updatedAt: 1_760_000_000_000,
  substituteRegex: 0,
};

const FIRST = { ...SCRIPT_BASE, id: "regex_script_000000000000000a", name: "strip ooc" };
const SECOND = { ...SCRIPT_BASE, id: "regex_script_000000000000000b", name: "rename hero" };
const LOOSE = { ...SCRIPT_BASE, id: "regex_script_000000000000000c", name: "not attached one" };

/** A STATEFUL stub: `applyScopeOrder` re-seats the node-side attached list and the `listFor*` read serves
 *  it, so the assertion is a round trip through the recorded wire order rather than a client-only illusion.
 *  (The verb is `busDriven`, so nothing refetches in a CT — the repaint under test is the optimistic one;
 *  the state here is what makes any refetch agree with it instead of racing it.) */
function stubScope(
  page: Page,
  proc: string,
  library: readonly { readonly id: string; readonly name: string }[],
  attached: readonly { readonly id: string; readonly name: string }[],
): Promise<TrpcRecorder> {
  let current = [...attached];
  return routeTrpc(page, {
    "regex.listScripts": () => library,
    // The context pane also reads the reverse ROSTERS (REGROSTER). Not what these tests are about, but an
    // unlisted proc resolves `null` and the pane would render nothing at all — the rosters are pinned by
    // tests/client/features/regex/components/regex-context-body.ct.tsx.
    "regex.listScriptUsage": () => ({ presets: [], characters: [], rooms: [] }),
    [proc]: () => current,
    [APPLY_PROC]: (input: unknown): unknown => {
      const ordered = (input as { readonly orderedScriptIds: readonly string[] }).orderedScriptIds;
      const byId = new Map(current.map((row) => [row.id, row]));
      current = ordered.flatMap((id) => {
        const row = byId.get(id);
        return row === undefined ? [] : [row];
      });
      return { reordered: current.length };
    },
  });
}

/** The grip labels in DOM order — the ordered slice as an assistive tech reads it. */
function gripNames(page: Page): Promise<(string | null)[]> {
  return page.locator('[data-slot="sortable-handle"]').evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
}

/** The large arm's move-up labels in DOM order (one per row, first to last). */
function moveUpNames(page: Page): Promise<(string | null)[]> {
  return page.locator('button[aria-label^="Move "][aria-label$=" up"]').evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
}

test("the attached slice is an ordered group and the rest of the library follows it — one row per script", async ({ mount, page }) => {
  await stubScope(page, "regex.listForCharacter", [FIRST, SECOND, LOOSE], [FIRST, SECOND]);
  await mount(<RegexPickerStory />);
  await expect(page.getByRole("switch", { name: "Attach strip ooc" })).toBeVisible();

  // The two slices are real headings, so a screen reader hears the boundary rather than one flat list.
  await expect(page.getByRole("heading", { name: "Runs here, in order" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Not attached" })).toBeVisible();
  // One row per script: the ordered slice must not RE-PRINT names the library list already carries.
  await expect(page.getByRole("switch", { name: "Attach strip ooc" })).toHaveCount(1);
  await expect(page.getByRole("switch", { name: "Attach not attached one" })).toHaveCount(1);
  // Only the ATTACHED rows are orderable — an unattached script has no position in this scope.
  expect(await gripNames(page)).toEqual(["Reorder strip ooc", "Reorder rename hero"]);
});

// "RUNS HERE, IN ORDER" IS A CLAIM THE ROWS HAVE TO SUPPORT (side-eye sweep 2026-08-03). The kicker
// promised a sequence over rows that showed no rank, so at the owner's 34 attached scripts the only way to
// learn where the row you just moved landed was to count them by eye — while the config rail's global
// readout, the same concept in its other home, had led with a position all along. Asserted as the RENDERED
// leading text of each ordered row (what a reader actually sees), and as its ABSENCE from the unordered
// slice, where a rank would be a number that means nothing.
test("the ordered slice ranks its rows, and the unattached slice does not", async ({ mount, page }) => {
  await stubScope(page, "regex.listForCharacter", [FIRST, SECOND, LOOSE], [FIRST, SECOND]);
  await mount(<RegexPickerStory />);
  await expect(page.getByRole("switch", { name: "Attach strip ooc" })).toBeVisible();

  const leads = await page.evaluate(() => {
    // The row IS the attach switch's parent (identity cluster + switch), so its first rendered line is
    // whatever leads the row — the rank where there is one, the name where there is not.
    const rowFor = (label: string): string => {
      const row = document.querySelector(`[aria-label="Attach ${label}"]`)?.parentElement;
      return (row as HTMLElement | null)?.innerText.split("\n")[0]?.trim() ?? "";
    };
    return { first: rowFor("strip ooc"), second: rowFor("rename hero"), loose: rowFor("not attached one") };
  });
  expect(leads.first).toBe("1");
  expect(leads.second).toBe("2");
  expect(leads.loose).toBe("not attached one");
});

test("a keyboard reorder writes the new id order to applyScopeOrder and repaints in it", async ({ mount, page }) => {
  const trpc = await stubScope(page, "regex.listForCharacter", [FIRST, SECOND, LOOSE], [FIRST, SECOND]);
  await mount(<RegexPickerStory />);
  await expect(page.getByRole("switch", { name: "Attach strip ooc" })).toBeVisible();

  const handles = page.locator('[data-slot="sortable-handle"]');
  await handles.nth(0).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");

  // The WIRE: position 0 runs first, so the persisted list is the rendered list.
  await expect
    .poll(() => trpc.lastInput(APPLY_PROC), { intervals: [100, 250, 500] })
    .toMatchObject({ orderedScriptIds: [SECOND.id, FIRST.id], scope: { kind: "character" } });
  // …and the SETTLED paint agrees (the optimistic write — without it the dropped row snaps back).
  await expect.poll(() => gripNames(page)).toEqual(["Reorder rename hero", "Reorder strip ooc"]);
});

// NO CAPABILITY CLIFF. Past COLLECTION_LARGE_GROUP dragging one row through thirty stops being an
// affordance — but losing the ability to reorder is not the answer, and that is exactly what the tag
// collection does at this same threshold (flagged, owner-unruled). Only the MECHANISM changes here.
test("past the large-group threshold the grips give way to explicit move actions that still reorder", async ({ mount, page }) => {
  const many = Array.from({ length: 32 }, (_, index) => ({
    ...SCRIPT_BASE,
    id: `regex_script_${String(index).padStart(16, "0")}`,
    name: `script ${index}`,
  }));
  const trpc = await stubScope(page, "regex.listForCharacter", many, many);
  await mount(<RegexPickerStory />);
  await expect(page.getByRole("switch", { name: "Attach script 0" })).toBeVisible();

  // Drag is gone…
  expect(await gripNames(page)).toEqual([]);
  // …and the capability is not: every row carries both directions, named by row.
  await expect(page.getByRole("button", { name: "Move script 0 down" })).toBeVisible();
  // The ends are disabled but stay FOCUSABLE — moving a row to an end must not strand focus on <body>.
  await expect(page.getByRole("button", { name: "Move script 0 up" })).toBeDisabled();

  await page.getByRole("button", { name: "Move script 0 down" }).click();
  await expect
    .poll(() => (trpc.lastInput(APPLY_PROC) as { readonly orderedScriptIds: readonly string[] } | undefined)?.orderedScriptIds?.slice(0, 2), {
      intervals: [100, 250, 500],
    })
    .toEqual([many[1]?.id, many[0]?.id]);
  await expect.poll(async () => (await moveUpNames(page)).slice(0, 2)).toEqual(["Move script 1 up", "Move script 0 up"]);
});

test("a single attached script offers no reorder affordance at all", async ({ mount, page }) => {
  await stubScope(page, "regex.listForCharacter", [FIRST, LOOSE], [FIRST]);
  await mount(<RegexPickerStory />);
  await expect(page.getByRole("switch", { name: "Attach strip ooc" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Runs here" })).toBeVisible();
  expect(await gripNames(page)).toEqual([]);
  expect(await moveUpNames(page)).toEqual([]);
});

// THE GLOBAL TIER (the fourth scope arm). Its membership is decided in the collection's context pane, so
// its ORDER is too — the picker never sees `global` (the junction PKs on the script id).
test("the global tier's run order is authored where its membership is", async ({ mount, page }) => {
  const trpc = await stubScope(page, "regex.listGlobal", [FIRST, SECOND], [FIRST, SECOND]);
  await mount(<RegexContextStory />);
  await expect(page.getByRole("heading", { name: "Global run order" })).toBeVisible();
  expect(await gripNames(page)).toEqual(["Reorder strip ooc", "Reorder rename hero"]);

  // RENDERED, at the NARROWEST real host: this pane is the config rail's 320px context column, and a grip
  // that overflows it is an affordance nobody can reach. Measured against the pane's own box, not a px
  // literal, so a token change cannot drift out from under the assertion.
  const fit = await page.evaluate(() => {
    const pane = document.querySelector('[data-slot="regex-context-body"]');
    const handle = document.querySelector('[data-slot="sortable-handle"]');
    if (pane === null || handle === null) {
      return null;
    }
    return { handleRight: handle.getBoundingClientRect().right, paneRight: pane.getBoundingClientRect().right };
  });
  expect(fit).not.toBeNull();
  expect(fit?.handleRight).toBeLessThanOrEqual(fit?.paneRight ?? 0);

  const handles = page.locator('[data-slot="sortable-handle"]');
  await handles.nth(0).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");

  await expect
    .poll(() => trpc.lastInput(APPLY_PROC), { intervals: [100, 250, 500] })
    .toMatchObject({ orderedScriptIds: [SECOND.id, FIRST.id], scope: { kind: "global" } });
  await expect.poll(() => gripNames(page)).toEqual(["Reorder rename hero", "Reorder strip ooc"]);
});
