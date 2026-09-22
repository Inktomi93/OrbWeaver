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
import { touchFloorPx } from "../../support/browser/touch-floor.ts";
import type { TrpcFixtureOutput, TrpcResponder } from "../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../support/node/route-trpc.ts";
import { TagPickerDialogHarness } from "./tag-picker-dialog.fixtures.tsx";

type TagWithUsageFixture = TrpcFixtureOutput<"tag.listTagsWithUsage">[number];

const tag = (id: string, name: string, total: number): TagWithUsageFixture => ({
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

function stub(page: Page, tags: TrpcFixtureOutput<"tag.listTagsWithUsage">): Promise<unknown> {
  const listTags: TrpcResponder<"tag.listTagsWithUsage"> = () => tags;
  return routeTrpc(page, { "tag.listTagsWithUsage": listTags });
}

/** What the browser's own hit test finds at a control's centre — the only honest answer to "is it
 *  clickable", and the exact probe that returned `<div role="option">` over Cancel before this fix. */
async function topmostAt(page: Page, name: string): Promise<string> {
  let box = await page.getByRole("button", { name, exact: true }).boundingBox();
  await expect
    .poll(async () => {
      box = await page.getByRole("button", { name, exact: true }).boundingBox();
      return box;
    })
    .not.toBeNull();
  const at = { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 };
  return page.evaluate((point: { x: number; y: number }): string => {
    const el = document.elementFromPoint(point.x, point.y);
    const button = el?.closest("button");
    return button === null || button === undefined ? `${el?.tagName ?? "NONE"}:${el?.getAttribute("role") ?? ""}` : (button.textContent ?? "");
  }, at);
}

/** Any non-empty id — the assertion is that a descendant IS highlighted, not which one. */
const ANY_ACTIVEDESCENDANT = /.+/u;

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

// The other half of "never suggested": the create-vs-attach QUESTION must not inherit the suggestion
// filter. Deriving the exact match from the FILTERED candidates made an already-attached tag look UNKNOWN,
// so typing its own name read `Create "fantasy"` — this dialog offering the duplicate spelling it exists to
// prevent, over a tag the target already has.
test("typing an ALREADY-ATTACHED tag's name says so — it never offers to create the duplicate", async ({ mount, page }) => {
  await stub(page, LIBRARY);
  const dialog = await mount(<TagPickerDialogHarness attachedNames={["fantasy"]} />);
  await expect(page.getByText("Start typing to search your 1 tag.")).toBeVisible();

  await page.getByRole("combobox", { name: "Tag name" }).fill("FANTASY");
  await expect(page.getByText('"fantasy" is already attached.')).toBeVisible();
  await expect(page.getByRole("button", { name: 'Create "FANTASY"' })).toHaveCount(0);
  // Nothing left to confirm, by BOTH paths — the button is refused and Enter submits nothing.
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(dialog.getByTestId("submitted")).toHaveText("");
});

/** An attached tag whose name is a PREFIX of another library tag — the case the "already attached" arm
 *  must not swallow. */
const NEIGHBOURED = [tag("tag_fantasy", "fantasy", 12), tag("tag_fantasy_noir", "fantasy-noir", 4)];

test("an already-attached EXACT match still suggests the other tags the text matches", async ({ mount, page }) => {
  await stub(page, NEIGHBOURED);
  const dialog = await mount(<TagPickerDialogHarness attachedNames={["fantasy"]} />);
  await expect(page.getByText("Start typing to search your 1 tag.")).toBeVisible();

  const field = page.getByRole("combobox", { name: "Tag name" });
  await field.fill("fantasy");

  // The helper still states the attached fact — that arm is not what is being relaxed…
  await expect(page.getByText('"fantasy" is already attached.')).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
  // …but the search is NOT over: an exact match the user cannot act on is not a decision, and closing the
  // list here left them looking at nothing while a matching tag they CAN attach sat one keystroke away.
  await expect(page.getByRole("option", { name: "fantasy-noir" })).toBeVisible();
  await expect(page.getByRole("option", { name: "fantasy", exact: true })).toHaveCount(0);

  // And it still leads somewhere: picking the neighbour is a real attach.
  await page.getByRole("option", { name: "fantasy-noir" }).click();
  await expect(page.getByText('Attaches the existing tag "fantasy-noir".')).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog.getByTestId("submitted")).toHaveText("fantasy-noir");
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

  let card = await page.locator('[data-slot="dialog-popup"]').boundingBox();
  let list = await page.locator('[data-slot="autocomplete-inline-list"]').boundingBox();
  await expect
    .poll(async () => {
      card = await page.locator('[data-slot="dialog-popup"]').boundingBox();
      return card;
    })
    .not.toBeNull();
  await expect
    .poll(async () => {
      list = await page.locator('[data-slot="autocomplete-inline-list"]').boundingBox();
      return list;
    })
    .not.toBeNull();
  // The popup overshot the card by 264px on desktop and flipped ABOVE the title on mobile; in flow it can
  // do neither, and the title is still the topmost thing in the card.
  expect((list?.y ?? 0) + (list?.height ?? 0)).toBeLessThanOrEqual((card?.y ?? 0) + (card?.height ?? 0));
  expect(list?.y ?? 0).toBeGreaterThan(card?.y ?? 0);
  expect(await topmostAt(page, CONFIRM)).toBe(CONFIRM);
});

// THE PHONE PROOF ABOVE RUNS AT A FINE POINTER. `setViewportSize` narrows the window and changes NOTHING
// about pointer class, so it renders a layout no phone produces: under `pointer: coarse` every suggestion row
// is `min-h-touch-target` (44px, not the fine 28), so the same eight matches ask for ~1.6× the height inside
// the same card. That is precisely the direction the P0 failed in — the list outgrowing its host — and the
// existing proof is structurally incapable of seeing it. `hasTouch: true` is what flips the media query
// (`tests/ui/touch-target-floor.suite.ct.tsx` proves the emulation lands); it needs its own describe because
// `test.use` is scope-wide and the rest of this file is deliberately a desktop pass.
test.describe("on a real phone (coarse pointer, 430px)", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 740 } });

  test("the suggestion rows meet the touch floor, and the list still fits inside the card", async ({ mount, page }) => {
    // The floor is a coarse-only guarantee — assert the emulation landed before trusting any geometry it
    // explains, or a fine-pointer run reads as a pass at 28px.
    // @orb-waive ct-no-oneshot-live-read-assert(expect): pointer class is fixed when the browser CONTEXT is created (`hasTouch` above), not page state — there is no transition for a retry to wait out, and a poll here would only mask a config miss.
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await stub(page, CROWDED);
    await mount(<TagPickerDialogHarness />);
    await page.getByRole("combobox", { name: "Tag name" }).fill("fantas");
    await expect(page.getByRole("option", { name: "fantasy-0" })).toBeVisible();

    // The token, never a literal 44 — the CT's rendering context is not the app's.
    const floor = await touchFloorPx(page);
    await expect
      .poll(async () => await page.getByRole("option", { name: "fantasy-0" }).evaluate((el: Element) => el.getBoundingClientRect().height))
      .toBeGreaterThanOrEqual(floor);

    // Containment and hit-testability re-proven at the taller rows: the inline list is a BOUNDED scroller, so
    // growing the rows must scroll them, never grow the card past the footer it sits above.
    const card = await page.locator('[data-slot="dialog-popup"]').boundingBox();
    const list = await page.locator('[data-slot="autocomplete-inline-list"]').boundingBox();
    expect((list?.y ?? 0) + (list?.height ?? 0)).toBeLessThanOrEqual((card?.y ?? 0) + (card?.height ?? 0));
    expect(await topmostAt(page, CONFIRM)).toBe(CONFIRM);
    expect(await topmostAt(page, "Cancel")).toBe("Cancel");
  });
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
  const listTags: TrpcResponder<"tag.listTagsWithUsage"> = () => {
    attempt += 1;
    return attempt === 1 ? trpcError({ message: "boom" }) : LIBRARY;
  };
  await routeTrpc(page, { "tag.listTagsWithUsage": listTags });
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
  await expect(field).toHaveAttribute("aria-activedescendant", ANY_ACTIVEDESCENDANT);
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
  let describedBy = await field.getAttribute("aria-describedby");
  await expect
    .poll(async () => {
      describedBy = await field.getAttribute("aria-describedby");
      return describedBy;
    })
    .not.toBeNull();

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
