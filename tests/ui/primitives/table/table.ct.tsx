// CT: the table seal — a hand-rolled data-grid (no @tanstack/react-table, see
// packages/ui/src/primitives/table/variants.ts for why). Covers: column/row rendering, the
// click-to-sort cycle (asc → desc → none) with `aria-sort` + a non-color glyph swap, keyboard
// activation, pagination, row selection (incl. indeterminate select-all), density, and the R7
// freshly-derived-array footgun (ui-primitive-contract §13).
import { selectActionName } from "@orb/ui/lib";
import { expect, test } from "@playwright/experimental-ct-react";
import {
  BasicTableStory,
  HostilePaginationTableStory,
  InvalidPageSizeTableStory,
  NullableSortStory,
  PaginatedTableStory,
  ShrinkingDataStory,
} from "./table.fixtures.tsx";

test("renders columns and rows", async ({ mount, page }) => {
  await mount(<BasicTableStory />);
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Age" })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(5); // 1 header + 4 data rows
  await expect(page.getByText("Elara")).toBeVisible();
  await expect(page.getByText("Bram")).toBeVisible();
});

test("clicking a sortable header cycles none -> asc -> desc -> none with aria-sort + a glyph swap", async ({ mount, page }) => {
  await mount(<BasicTableStory />);
  const header = page.getByRole("columnheader", { name: "Name" });
  const sortButton = header.getByRole("button");
  const bodyRows = page.locator("tbody tr");

  await expect(header).toHaveAttribute("aria-sort", "none");
  const unsortedGlyph = await sortButton.locator("svg").innerHTML();

  await sortButton.click();
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await expect(bodyRows.first()).toContainText("Bram"); // alphabetically first
  const ascGlyph = await sortButton.locator("svg").innerHTML();
  // A NON-COLOR signal: the glyph itself is a different icon (different SVG markup), not just a
  // color swap on the same shape.
  expect(ascGlyph).not.toBe(unsortedGlyph);

  await sortButton.click();
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(bodyRows.first()).toContainText("Elara"); // alphabetically last
  const descGlyph = await sortButton.locator("svg").innerHTML();
  expect(descGlyph).not.toBe(ascGlyph);

  await sortButton.click();
  await expect(header).toHaveAttribute("aria-sort", "none");
  await expect(bodyRows.first()).toContainText("Elara"); // back to original insertion order
});

test("blank (null) cells sort LAST in both directions, not flipped to the top under desc", async ({ mount, page }) => {
  // Ascending: the two real values order low→high, then the two blank rows land at the bottom.
  const asc = await mount(<NullableSortStory direction="asc" />);
  await expect.poll(async () => await page.locator("tbody tr td:first-child").allInnerTexts()).toEqual(["Echo", "Alpha", "Ciel", "Bravo", "Delta"]);
  await asc.unmount();

  // Descending: the real values reverse to high→low, but the blanks STAY at the bottom (the fix —
  // the direction sign no longer flips the null placement).
  await mount(<NullableSortStory direction="desc" />);
  await expect.poll(async () => await page.locator("tbody tr td:first-child").allInnerTexts()).toEqual(["Ciel", "Alpha", "Echo", "Bravo", "Delta"]);
});

test("a non-sortable column carries no aria-sort attribute at all (vs. 'none' for sortable-unsorted)", async ({ mount, page }) => {
  await mount(<BasicTableStory />);
  await expect(page.getByRole("columnheader", { name: "Status" })).not.toHaveAttribute("aria-sort");
  await expect(page.getByRole("columnheader", { name: "Status" }).getByRole("button")).toHaveCount(0);
});

test("keyboard: Enter on a focused sort button toggles sort", async ({ mount, page }) => {
  await mount(<BasicTableStory />);
  const header = page.getByRole("columnheader", { name: "Name" });
  const sortButton = header.getByRole("button");
  await sortButton.focus();
  await page.keyboard.press("Enter");
  await expect(header).toHaveAttribute("aria-sort", "ascending");
});

test("pagination: prev/next navigate pages and self-disable at the bounds", async ({ mount, page }) => {
  await mount(<PaginatedTableStory />);
  const prev = page.getByRole("button", { name: "Previous page" });
  const next = page.getByRole("button", { name: "Next page" });

  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await expect(page.getByText("1–5 of 12")).toBeVisible();
  await expect(prev).toBeDisabled();
  await expect(next).toBeEnabled();
  await expect(page.getByText("Person 01")).toBeVisible();

  await next.click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await expect(page.getByText("Person 06")).toBeVisible();
  await expect(page.getByText("Person 01")).toHaveCount(0);
  await expect(prev).toBeEnabled();

  await next.click();
  await expect(page.getByText("Page 3 of 3")).toBeVisible();
  await expect(page.getByText("11–12 of 12")).toBeVisible();
  await expect(next).toBeDisabled();
  await expect(page.getByRole("row")).toHaveCount(3); // 1 header + 2 rows on the last page

  await prev.click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
});

test("pagination clamps page sizes below one to one row per page", async ({ mount, page }) => {
  await mount(<InvalidPageSizeTableStory pageSize={0.5} />);
  await expect(page.getByText("Page 1 of 12")).toBeVisible();
  await expect(page.getByText("1–1 of 12")).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(2); // 1 header + 1 data row
});

for (const paginationCase of [
  { label: "fractional", pageIndex: 0.5, pageSize: 0.5, pageLabel: "Page 1 of 12", rangeLabel: "1–1 of 12", emitted: "1:1" },
  { label: "negative", pageIndex: -1, pageSize: -1, pageLabel: "Page 1 of 12", rangeLabel: "1–1 of 12", emitted: "1:1" },
  {
    label: "NaN and positive infinity",
    pageIndex: Number.NaN,
    pageSize: Number.POSITIVE_INFINITY,
    pageLabel: "Page 1 of 2",
    rangeLabel: "1–10 of 12",
    emitted: "1:10",
  },
  {
    label: "positive infinity and negative infinity",
    pageIndex: Number.POSITIVE_INFINITY,
    pageSize: Number.NEGATIVE_INFINITY,
    pageLabel: "Page 1 of 2",
    rangeLabel: "1–10 of 12",
    emitted: "1:10",
  },
]) {
  test(`pagination normalizes ${paginationCase.label} inputs before rendering and emitting`, async ({ mount, page }) => {
    await mount(<HostilePaginationTableStory pageIndex={paginationCase.pageIndex} pageSize={paginationCase.pageSize} />);
    await expect(page.getByText(paginationCase.pageLabel)).toBeVisible();
    await expect(page.getByText(paginationCase.rangeLabel)).toBeVisible();
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByTestId("emitted-pagination")).toHaveText(paginationCase.emitted);
  });
}

test("row selection: select-all checks every row and goes indeterminate on a partial selection", async ({ mount, page }) => {
  await mount(<BasicTableStory selectable={true} />);
  const selectAll = page.getByRole("checkbox", { name: "Select all rows" });
  const bram = page.getByRole("checkbox", { name: selectActionName("Bram") });
  const elara = page.getByRole("checkbox", { name: selectActionName("Elara") });

  await expect(selectAll).toHaveAttribute("aria-checked", "false");
  await bram.click();
  await expect(bram).toHaveAttribute("aria-checked", "true");
  await expect(selectAll).toHaveAttribute("aria-checked", "mixed");

  await selectAll.click(); // from indeterminate, select-all selects everything
  await expect(selectAll).toHaveAttribute("aria-checked", "true");
  await expect(elara).toHaveAttribute("aria-checked", "true");

  await selectAll.click(); // fully selected -> clears
  await expect(selectAll).toHaveAttribute("aria-checked", "false");
  await expect(bram).toHaveAttribute("aria-checked", "false");
});

// THE SELECTED ROW LEFT THE ACCENT FILL (#1840, side-eye 2026-09-06 E2). This arm asserted
// `color.accent` — the exact fill `ACCENT_HOVER` paints on every hovered row, menu item, card and button
// — so the row that was CHOSEN and the row being POINTED AT were one colour, and the census counted
// accent-fill as a fifth selection idiom for that reason. A table row is a ROW, so it wears the ruled row
// idiom (`SELECTION_RAIL`: a 2px left ember rail over a 10% primary tint, owner-ratified #485). The claim
// is unchanged in shape — a selected row is visibly marked — and the token it names moved.
//
// AGAINST THE UNSELECTED TWIN, not against a literal: the tint is an ALPHA composite (`bg-primary/10`),
// which serializes as `oklab(… / 0.1)` and cannot be spelled from `TOKENS` without re-implementing the
// compositing. The delta IS the claim.
test("a selected row wears the ruled row idiom — the rail lights and the row tints", async ({ mount, page }) => {
  await mount(<BasicTableStory selectable={true} />);
  const row = page.locator("tbody tr", { hasText: "Bram" });
  const paint = async (): Promise<{ readonly fill: string; readonly rail: string }> =>
    await row.evaluate((el: Element) => {
      const style = getComputedStyle(el);
      return { fill: style.backgroundColor, rail: style.borderLeftColor };
    });
  const rest = await paint();
  await page.getByRole("checkbox", { name: selectActionName("Bram") }).click();
  await expect(row).toHaveAttribute("data-selected", /.*/);
  const selected = await paint();
  expect(selected.rail, "the reserved rail lights on selection").not.toBe(rest.rail);
  expect(selected.fill, "…over a tint the unselected row does not carry").not.toBe(rest.fill);
});

test("compact density is shorter than default density", async ({ mount, page }) => {
  const compact = await mount(<BasicTableStory density="compact" />);
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const compactHeight = await page
    .locator("tbody tr")
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  await compact.unmount();

  const defaultMount = await mount(<BasicTableStory density="default" />);
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const defaultHeight = await page
    .locator("tbody tr")
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  await defaultMount.unmount();

  // @orb-waive ct-no-oneshot-live-read-assert(expect): web-first visibility settled each table before its cross-mount row-height sample.
  expect(compactHeight).toBeLessThan(defaultHeight);
});

test("a parent re-render with a freshly-derived (shrunk) data array clamps the page instead of going blank", async ({ mount, page }) => {
  await mount(<ShrinkingDataStory />);
  // Starts on page 3 of 3 (pageIndex 2, pageSize 5) over 12 rows — the last page has 2 rows.
  await expect(page.getByText("Page 3 of 3")).toBeVisible();
  await expect(page.getByText("Person 11")).toBeVisible();

  // Shrinks the underlying data to 3 rows (a NEW array reference, not the same one truncated) —
  // there is now only 1 page; the table must clamp pageIndex 2 down to 0, not render an empty body.
  await page.getByTestId("shrink").click();
  await expect(page.getByText("Page 3 of 3")).toHaveCount(0);
  await expect(page.getByRole("row")).toHaveCount(4); // 1 header + 3 rows, all visible on page 1
  await expect(page.getByText("Person 01")).toBeVisible();
  await expect(page.getByText("Person 03")).toBeVisible();
});
