// CT: the shared CharacterPicker's tail-pagination affordance (#334 Bug 2, owner ruling 2026-08-19). The
// "Load more characters" button is REMOVED; keyboard users reach the tail by roving to the last loaded row
// (Arrow/Page/Home/End), which fires the next-page load on cmdk's active-item STATE — no button, and no
// dependence on cmdk's `scrollIntoView` happening to trip the pointer `onScroll` guard. The pointer
// scroll-load and the server search are unchanged and guarded here against regression.
//

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcInput } from "../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../support/node/route-trpc.ts";
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

  const component = await mount(<CharacterPickerHarness listClassName="h-48" />);
  await expect(component.getByText("Page1 0")).toBeVisible();
  await expect(page.getByText("Page2 0")).toHaveCount(0);
  // Suppress cmdk's incidental scrollIntoView so only the active-item state signal can request page two.
  await page.evaluate(() => {
    Element.prototype.scrollIntoView = (): void => undefined;
  });

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

test("an all-excluded first page advances until an available character is rendered", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "character.list": characterListResponder(LIBRARY) });
  const excluded = PAGE_ONE.map((character) => castId<CharacterId>(character.id));

  const component = await mount(<CharacterPickerHarness excludeIds={excluded} />);
  await expect(component.getByText("Page1 0")).toHaveCount(0);
  await expect.poll(() => trpc.count("character.list"), { intervals: [50, 100, 200] }).toBeGreaterThanOrEqual(2);
  await expect(component.getByText("Page2 0")).toBeVisible();
  await expect(component.getByText("Showing 30 available · checked 130 of 130")).toBeVisible();
});

test("a filtered first page with one visible row advances until pointer scrolling can reach the tail", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "character.list": characterListResponder(LIBRARY) });
  const excluded = PAGE_ONE.slice(0, 99).map((character) => castId<CharacterId>(character.id));

  const component = await mount(<CharacterPickerHarness excludeIds={excluded} />);
  await expect(component.getByText("Page1 99")).toBeVisible();
  await expect.poll(() => trpc.count("character.list"), { intervals: [50, 100, 200] }).toBeGreaterThanOrEqual(2);
  await expect(component.getByText("Page2 0")).toBeVisible();
  await expect(component.getByText("Showing 31 available · checked 130 of 130")).toBeVisible();
});

test("a failed later page keeps loaded rows visible and offers a working retry", async ({ mount, page }) => {
  const responder = characterListResponder(LIBRARY);
  let tailAttempts = 0;
  const trpc = await routeTrpc(page, {
    "character.list": (input: TrpcInput<"character.list">) => {
      if (input?.cursor !== undefined && input.cursor !== null) {
        tailAttempts += 1;
        if (tailAttempts === 1) {
          return trpcError({ message: "tail failed" });
        }
      }
      return responder(input);
    },
  });
  const component = await mount(<CharacterPickerHarness />);
  await expect(component.getByText("Page1 0")).toBeVisible();

  await component.locator('[data-slot="command-list"]').evaluate((el: HTMLElement): void => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(component.getByRole("alert")).toHaveText("Couldn't load more characters.");
  await expect(component.getByText("Page1 0")).toBeVisible();
  await component.getByRole("button", { name: "Retry loading more characters" }).click();

  await expect.poll(() => trpc.count("character.list"), { intervals: [50, 100, 200] }).toBeGreaterThanOrEqual(3);
  await expect(component.getByText("Page2 0")).toBeVisible();
  await expect(component.getByRole("alert")).toHaveCount(0);
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
