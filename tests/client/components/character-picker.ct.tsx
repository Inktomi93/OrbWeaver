// CT: the shared CharacterPicker's tail-pagination affordance (#334 Bug 2, owner ruling 2026-08-19). The
// "Load more characters" button is REMOVED; keyboard users reach the tail by roving to the last loaded row
// (Arrow/Page/Home/End), which fires the next-page load on cmdk's active-item STATE — no button, and no
// dependence on cmdk's `scrollIntoView` happening to trip the pointer `onScroll` guard. The pointer
// scroll-load and the server search are unchanged and guarded here against regression.
//
// Red-first against the OLD source: every assertion speaks through rendered affordances (a role=button
// count, row text), never the new hook, so it compiles against HEAD. On the old source (a) finds the
// present button and (b) — with the list held open so no scroll can occur — never loads page 2 because the
// old tail-load is scroll-only; both go RED, which is the defect proof.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../support/node/route-trpc.ts";
import { characterListResponder, makeCharacterSummary } from "../features/character/fixtures.ts";
import { CharacterPickerHarness } from "./character-picker.fixtures.tsx";

const LOAD_MORE_LABEL = /load more/i;

// >100 rows so the picker's first `limit: 100` page carries a cursor (hasNextPage) and a real second page
// exists. Array order IS the walk order: the last row of page 1 is `Page1 99`, page 2 opens with `Page2 0`.
const PAGE_ONE = Array.from({ length: 100 }, (_unused, at) => makeCharacterSummary({ id: `char_p1_${String(at)}`, name: `Page1 ${String(at)}` }));
const PAGE_TWO = Array.from({ length: 30 }, (_unused, at) => makeCharacterSummary({ id: `char_p2_${String(at)}`, name: `Page2 ${String(at)}` }));
const LIBRARY = [...PAGE_ONE, ...PAGE_TWO];

test("the 'Load more characters' button is GONE — the tail has no button affordance (#334)", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": characterListResponder(LIBRARY) });

  const component = await mount(<CharacterPickerHarness />);
  await expect(component.getByText("Page1 0")).toBeVisible();

  // hasNextPage is true here (page 1 is full), which is exactly when the old footer rendered the button.
  await expect(page.getByRole("button", { name: LOAD_MORE_LABEL })).toHaveCount(0);
  // The honest count survives the button's removal.
  await expect(component.getByText("Showing 100 of 130")).toBeVisible();
});

test("keyboard roving to the last loaded row loads the next page — no scroll required (#334)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "character.list": characterListResponder(LIBRARY) });

  // `max-h-none`: a whole page fits with no overflow, so the list CANNOT scroll — this isolates the keyboard
  // state signal from the pointer `onScroll` path. On the old (scroll-only) source, End moves the highlight
  // but fires no scroll, so page 2 never loads and `Page2 0` stays absent.
  const component = await mount(<CharacterPickerHarness listClassName="max-h-none" />);
  await expect(component.getByText("Page1 0")).toBeVisible();
  await expect(page.getByText("Page2 0")).toHaveCount(0);

  // End jumps cmdk's roving highlight straight to the last loaded row (a standard keyboard affordance) —
  // reaching the tail by keyboard.
  await component.getByRole("combobox").press("End");

  await expect.poll(() => trpc.count("character.list"), { intervals: [50, 100, 200] }).toBeGreaterThanOrEqual(2);
  await expect(component.getByText("Page2 0")).toBeVisible();
});

test("pointer scroll to the bottom still loads the next page (#334 regression guard)", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": characterListResponder(LIBRARY) });

  const component = await mount(<CharacterPickerHarness />);
  await expect(component.getByText("Page1 0")).toBeVisible();
  await expect(page.getByText("Page2 0")).toHaveCount(0);

  // Drive the list's own scroll to the bottom — the pointer tail-load path.
  await component.locator('[data-slot="command-list"]').evaluate((el: HTMLElement): void => {
    el.scrollTop = el.scrollHeight;
  });

  await expect(component.getByText("Page2 0")).toBeVisible();
});

test("the search input still filters the rows (#334 unchanged)", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": characterListResponder(LIBRARY) });

  const component = await mount(<CharacterPickerHarness />);
  await expect(component.getByText("Page1 77", { exact: true })).toBeVisible();

  await component.getByRole("combobox").fill("Page1 77");
  await expect(component.getByText("Page1 77", { exact: true })).toBeVisible();
  // A row that does not match the needle drops out (cmdk's own value filter, immediate).
  await expect(page.getByText("Page1 0", { exact: true })).toBeHidden();
});
