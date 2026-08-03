// CT: the shared tag picker's SUGGESTION half (tag-experience audit 2026-08-03). The end-to-end
// attach/create flow is pinned from the library surface; what only a direct mount can reach are the states
// of the suggestion source, which must NOT say the same thing:
//   · the read still in flight   · the read FAILED   · an empty library   · everything already attached
//   · a stocked library, at rest.
// A null-when-empty field would read as unbuilt, one shared "no results" sentence would be wrong in four of
// the five, and `.data ?? []` said "No tags yet" over a 413-tag library that simply hadn't arrived.
//
// Also pinned: the picker never suggests a tag that is already attached (a suggestion whose only outcome
// is a no-op write), and it submits the LIBRARY's spelling when the typed text differs only in case —
// otherwise a "Fantasy" keystroke is how the display name of "fantasy" starts drifting.
//
// AND THE P0 (side-eye 2026-08-03): the suggestions used to be an anchored POPUP, which at the owner's
// library ran 264px past the bottom of the card, made Cancel and Apply un-hit-testable, and `aria-hidden`
// the dialog's title/description/footer out of the accessibility tree entirely. The proofs below are
// RENDERED — role queries (which only see the accessibility tree) plus `elementFromPoint` and box geometry —
// because a source assertion would have passed for the popup too.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc, trpcError } from "../../support/ct/route-trpc";
import { TagPickerDialogHarness } from "./tag-picker-dialog.fixtures";

const tag = (id: string, name: string, total: number): unknown => ({
  id,
  name,
  color: null,
  color2: null,
  source: "manual",
  folderType: "NONE",
  sortOrder: 0,
  isHiddenOnCard: false,
  usage: { characters: total, chats: 0, worldBooks: 0, personas: 0, presets: 0, total },
});

const LIBRARY = [tag("tag_adventure", "adventure", 5), tag("tag_fantasy", "fantasy", 12)];

/** A library where ONE query matches far more than the suggestion cap — the shape that produced the P0's
 *  347px popup. Every name contains "fantas", so that query fills the list to `SUGGESTION_LIMIT`. */
const CROWDED = [
  tag("tag_fantasy", "fantasy", 99),
  ...Array.from({ length: 12 }, (_unused, at) => tag(`tag_sub_${String(at)}`, `fantasy-${String(at)}`, 12 - at)),
];

/** The confirm's label while "fantas" is typed — a PREFIX of several tags and the exact name of none, which
 *  is the only state that keeps a full suggestion list open (an exact match ends the suggesting). */
const CONFIRM = 'Create "fantas"';

function stub(page: Page, tags: readonly unknown[]): Promise<unknown> {
  return routeTrpc(page, { "tag.listTagsWithUsage": () => tags });
}

/** What the browser's own hit test finds at a control's centre — the only honest answer to "is it
 *  clickable", and the exact probe that returned `<div role="option">` over Cancel before this fix. */
async function topmostAt(page: Page, name: string): Promise<string> {
  const box = await page.getByRole("button", { name, exact: true }).boundingBox();
  expect(box).not.toBeNull();
  const at = { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 };
  return page.evaluate((point: { x: number; y: number }): string => {
    const el = document.elementFromPoint(point.x, point.y);
    const button = el?.closest("button");
    return button === null || button === undefined ? `${el?.tagName ?? "NONE"}:${el?.getAttribute("role") ?? ""}` : (button.textContent ?? "");
  }, at);
}

test("an EMPTY library says so, and still leads somewhere (typing creates the first tag)", async ({ mount, page }) => {
  await stub(page, []);
  const dialog = await mount(<TagPickerDialogHarness />);
  await expect(page.getByText("No tags yet — the name you type becomes your first one.")).toBeVisible();

  await page.getByRole("combobox", { name: "Tag name" }).fill("adventure");
  await page.getByRole("button", { name: 'Create "adventure"' }).click();
  await expect(dialog.getByTestId("submitted")).toHaveText("adventure");
});

test("EVERY tag already attached is its own sentence — not the empty-library one", async ({ mount, page }) => {
  await stub(page, LIBRARY);
  await mount(<TagPickerDialogHarness attachedNames={["adventure", "fantasy"]} />);
  await expect(page.getByText("Every tag you have is already attached. A new name creates a new tag.")).toBeVisible();
  await expect(page.getByText("No tags yet — the name you type becomes your first one.")).toHaveCount(0);
});

test("a stocked library counts what you can pick from, at rest", async ({ mount, page }) => {
  await stub(page, LIBRARY);
  await mount(<TagPickerDialogHarness />);
  await expect(page.getByText("Start typing to search your 2 tags.")).toBeVisible();
});

test("an ATTACHED tag is never suggested (its only outcome would be a no-op write)", async ({ mount, page }) => {
  await stub(page, LIBRARY);
  await mount(<TagPickerDialogHarness attachedNames={["fantasy"]} />);
  await expect(page.getByText("Start typing to search your 1 tag.")).toBeVisible();

  const field = page.getByRole("combobox", { name: "Tag name" });
  await field.click();
  await field.pressSequentially("a");
  // "adventure" matches and is offered; "fantasy" matches too but is already on the card.
  await expect(page.getByRole("option", { name: "adventure" })).toBeVisible();
  await expect(page.getByRole("option", { name: "fantasy" })).toHaveCount(0);
});

test("a case-only difference ATTACHES the existing tag, and submits the library's spelling", async ({ mount, page }) => {
  await stub(page, LIBRARY);
  const dialog = await mount(<TagPickerDialogHarness />);
  await expect(page.getByText("Start typing to search your 2 tags.")).toBeVisible();

  await page.getByRole("combobox", { name: "Tag name" }).fill("FANTASY");
  await expect(page.getByText('Attaches the existing tag "fantasy".')).toBeVisible();
  // NO dismissal step: the suggestions are in flow now, so nothing is covering the footer to escape from
  // (and Escape here closes the DIALOG — which is exactly what a prompt's Escape should do).
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  // The LIBRARY's spelling on the wire, not the shouted one.
  await expect(dialog.getByTestId("submitted")).toHaveText("fantasy");
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// P0 — the suggestions cover NOTHING, in either direction.

test("suggestions showing: Cancel and Apply are still HIT-TESTABLE", async ({ mount, page }) => {
  await stub(page, CROWDED);
  await mount(<TagPickerDialogHarness />);
  await page.getByRole("combobox", { name: "Tag name" }).fill("fantas");
  // Barrier on the SETTLED list — the state whose geometry is under test.
  await expect(page.getByRole("option", { name: "fantasy-0" })).toBeVisible();

  expect(await topmostAt(page, "Cancel")).toBe("Cancel");
  expect(await topmostAt(page, CONFIRM)).toBe(CONFIRM);
});

test("suggestions showing: the dialog's title, description and footer stay in the accessibility tree", async ({ mount, page }) => {
  await stub(page, CROWDED);
  await mount(<TagPickerDialogHarness />);
  await page.getByRole("combobox", { name: "Tag name" }).fill("fantas");
  await expect(page.getByRole("option", { name: "fantasy-0" })).toBeVisible();

  // Role queries resolve against the accessibility tree ONLY: under the popup these were `aria-hidden` and
  // every one of these four assertions failed.
  await expect(page.getByRole("heading", { name: "Tag this character" })).toBeVisible();
  await expect(page.getByText("Attach an existing tag, or type a new one to create it.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: CONFIRM, exact: true })).toBeVisible();
});

test("suggestions showing: the list stays INSIDE the dialog card, on a 430px phone too", async ({ mount, page }) => {
  await page.setViewportSize({ width: 430, height: 740 });
  await stub(page, CROWDED);
  await mount(<TagPickerDialogHarness />);
  await page.getByRole("combobox", { name: "Tag name" }).fill("fantas");
  await expect(page.getByRole("option", { name: "fantasy-0" })).toBeVisible();

  const card = await page.locator('[data-slot="dialog-popup"]').boundingBox();
  const list = await page.locator('[data-slot="autocomplete-inline-list"]').boundingBox();
  expect(card).not.toBeNull();
  expect(list).not.toBeNull();
  // The popup overshot the card by 264px on desktop and flipped ABOVE the title on mobile; in flow it can
  // do neither, and the title is still the topmost thing in the card.
  expect((list?.y ?? 0) + (list?.height ?? 0)).toBeLessThanOrEqual((card?.y ?? 0) + (card?.height ?? 0));
  expect(list?.y ?? 0).toBeGreaterThan(card?.y ?? 0);
  expect(await topmostAt(page, CONFIRM)).toBe(CONFIRM);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// P1 — the read's own states, the Enter path, and the helper line's wiring.

test("the read IN FLIGHT says so, and claims NO count", async ({ mount, page }) => {
  await stub(page, LIBRARY);
  // Registered AFTER routeTrpc, so it runs FIRST and never falls through — a settled pending state, not a
  // flash: the query stays `pending` for the whole test.
  await page.route("**/api/trpc/**", () => undefined);
  await mount(<TagPickerDialogHarness />);
  await expect(page.getByText("Loading your tags…")).toBeVisible();
  await expect(page.getByText("No tags yet — the name you type becomes your first one.")).toHaveCount(0);
});

test("a FAILED read says so, offers a retry, and the retry recovers", async ({ mount, page }) => {
  let attempt = 0;
  await routeTrpc(page, {
    "tag.listTagsWithUsage": () => {
      attempt += 1;
      return attempt === 1 ? trpcError({ message: "boom" }) : LIBRARY;
    },
  });
  await mount(<TagPickerDialogHarness />);
  await expect(page.getByText("Couldn't load your tags. You can still type a name — an existing one will be reused.")).toBeVisible();

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Start typing to search your 2 tags.")).toBeVisible();
});

test("a FAILED read does not claim the typed name is NEW (it cannot know)", async ({ mount, page }) => {
  await routeTrpc(page, { "tag.listTagsWithUsage": () => trpcError({ message: "boom" }) });
  await mount(<TagPickerDialogHarness />);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

  await page.getByRole("combobox", { name: "Tag name" }).fill("fantasy");
  await expect(page.getByText('Applies the tag "fantasy".')).toBeVisible();
  await expect(page.getByRole("button", { name: 'Create "fantasy"' })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeVisible();
});

test("ENTER submits a freshly typed NEW name — no mouse trip to the confirm", async ({ mount, page }) => {
  await stub(page, LIBRARY);
  const dialog = await mount(<TagPickerDialogHarness />);
  const field = page.getByRole("combobox", { name: "Tag name" });
  await field.click();
  // "zzz" matches nothing, so the list is collapsed and Enter has nothing to be swallowed by.
  await field.pressSequentially("zzz");
  await expect(page.getByRole("button", { name: 'Create "zzz"' })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(dialog.getByTestId("submitted")).toHaveText("zzz");
});

test("ENTER submits the prompt — after the arrow-key pick, and straight from a typed name", async ({ mount, page }) => {
  await stub(page, LIBRARY);
  const dialog = await mount(<TagPickerDialogHarness />);
  const field = page.getByRole("combobox", { name: "Tag name" });
  await field.click();
  await field.pressSequentially("fan");
  await expect(page.getByRole("option", { name: "fantasy" })).toBeVisible();

  // ArrowDown highlights WITHOUT moving focus off the input; the first Enter takes the highlighted item.
  await page.keyboard.press("ArrowDown");
  await expect(field).toHaveAttribute("aria-activedescendant", /.+/u);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeVisible();
  await expect(dialog.getByTestId("submitted")).toHaveText("");

  // The SECOND Enter is the prompt's own submit — it did nothing at all before.
  await page.keyboard.press("Enter");
  await expect(dialog.getByTestId("submitted")).toHaveText("fantasy");
});

test("the helper line is WIRED to the field and announces the create ⇄ attach flip", async ({ mount, page }) => {
  await stub(page, LIBRARY);
  await mount(<TagPickerDialogHarness />);
  const field = page.getByRole("combobox", { name: "Tag name" });
  const describedBy = await field.getAttribute("aria-describedby");
  expect(describedBy).not.toBeNull();

  const helper = page.locator(`[id="${describedBy ?? ""}"]`);
  await expect(helper).toHaveAttribute("aria-live", "polite");
  await expect(helper).toHaveText("Start typing to search your 2 tags.");
  await field.fill("fantasy");
  await expect(helper).toHaveText('Attaches the existing tag "fantasy".');
  await field.fill("fantsy");
  await expect(helper).toHaveText('Creates a new tag "fantsy".');
});

test("the placeholder names the field's PRIMARY job — finding, not inventing", async ({ mount, page }) => {
  await stub(page, LIBRARY);
  await mount(<TagPickerDialogHarness />);
  await expect(page.getByRole("combobox", { name: "Tag name" })).toHaveAttribute("placeholder", "Search or create a tag");
});
