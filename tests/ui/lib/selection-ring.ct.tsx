// CT: THE SELECTION IDIOMS, COLLAPSED (#1840 — side-eye 2026-09-06 E2, "8 → 5 rendered, target 2").
//
// The census the review ran counts how many different ways this app says "chosen". Two are ruled — a left
// rail plus tint for a selected ROW (`SELECTION_RAIL`, owner-ratified #485) and an inset ring plus a check
// for a selected grid CELL (`PickerCell`, #929/E6) — and three were not:
//   3. the media tile: an OUTSET ring + the rationed `--shadow-glow` + a gradient `::after` border ring in
//      globals.css + a check badge — four layers for the state its picker sibling states in two;
//   4. the tab: a gradient `::after` ring beside the sliding indicator bar — REFUTED below, and the one
//      E2 target this lane did not land: the indicator is opt-in and two of three consumers omit it;
//   5. `bg-accent` as a FILL, which is also the hover paint on every row, menu item, card and button — so
//      "the row you are pointing at" and "the row you have chosen" were one colour on a `<table>`.
//
// WHAT THIS FILE PINS, and why here rather than in the four primitives' own CTs: the claim is a RELATION
// between carriers ("these paint ONE idiom, in two spellings"), and a relation asserted four times in four
// files is four claims that can drift apart — which is the finding, restated. It reads COMPUTED PAINT,
// never class strings: the whole point of a shared fragment is that the resolved declarations agree, and a
// class-list assertion would pass on two fragments that resolve differently.
//
// THE RING CARRIERS ARE COMPARED AGAINST A LIVE PROBE, not against each other across mounts: playwright-ct
// allows one `mount()` per test, so the two grid carriers are anchored to the same in-page element wearing
// the fragment's own utilities. That is a stronger claim than carrier-to-carrier equality anyway — it says
// each carrier paints THE RULED RING, not merely that the two agree on something.
//
// EVERY ARM CARRIES ITS PLANTED CONTROL. An idiom that "collapsed" because nothing paints at all is the
// failure mode a positive-only sweep cannot see, so each selected reading is taken against its own
// unselected twin in the same mount.
import { Tabs, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { SelectableGrid } from "../primitives/media-grid/media-grid.fixtures.tsx";
import { PickerStory } from "../primitives/picker-cell/picker-cell.fixtures.tsx";
import { BasicTableStory } from "../primitives/table/table.fixtures.tsx";

/** A box-shadow layer that PAINTS. Tailwind emits its ring/shadow custom properties as placeholder layers
 *  even when nothing is set — a zero-alpha colour at zero extent, four such layers on any element that touches
 *  the ring utilities — and counting those as ink makes every carrier look like it wears every channel.
 *  A layer is ink when it is neither fully transparent nor zero-extent. */
function paints(layer: string): boolean {
  if (layer === "" || layer === "none") {
    return false;
  }
  // A fully TRANSPARENT layer paints nothing whatever its extent — read the alpha out of the serialized
  // colour rather than matching a colour LITERAL (the `ui-primitive-structure` gate reds a hardcoded colour
  // in a `tests/ui` CT, and rightly: a literal is a second home for a value the page already resolves).
  const alpha = /\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/u.exec(layer);
  if (alpha !== null && Number.parseFloat(alpha[1] ?? "1") === 0) {
    return false;
  }
  return /[1-9]/u.test(layer.replace(/[^\d]/gu, ""));
}

function shadowLayers(value: string): readonly string[] {
  return value
    .split(/,(?![^(]*\))/u)
    .map((layer) => layer.trim())
    .filter(paints);
}

/** The `inset` box-shadow layers of a node — the ratified ring's channel (an inset ring is a box-shadow
 *  layer carrying the literal `inset`, which is why design-audit's own delta walk splits the two). */
function insetLayers(value: string): string {
  return shadowLayers(value)
    .filter((layer) => /(^|\s)inset(\s|$)/u.test(layer))
    .join(",");
}

async function insetShadow(node: Locator): Promise<string> {
  return insetLayers(await node.evaluate((el: Element) => getComputedStyle(el).boxShadow));
}

/** The NON-inset box-shadow layers — where an outset ring or a glow would live. */
async function outerShadow(node: Locator): Promise<string> {
  return shadowLayers(await node.evaluate((el: Element) => getComputedStyle(el).boxShadow))
    .filter((layer) => !/(^|\s)inset(\s|$)/u.test(layer))
    .join(",");
}

/** The serialization of a fully transparent background, RESOLVED in the page — never spelled as a colour
 *  literal (`ui-primitive-structure` reds a hardcoded colour in a `tests/ui` CT, and a literal would also
 *  be a second home for a value the browser already prints). A bare, unstyled `<div>` is the reference. */
async function transparent(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const probe = document.createElement("div");
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  });
}

/** Whether the element paints an `::after` layer at all — the third-layer channel both retired rules used. */
async function afterLayer(node: Locator): Promise<string> {
  return await node.evaluate((el: Element) => getComputedStyle(el, "::after").content);
}

/** The RULED ring, resolved in the page under test: a probe wearing exactly the utilities
 *  `packages/ui/src/lib/selection-ring.ts` spells. Derived, never a literal box-shadow string — a token
 *  retune must move the carriers and this anchor together or the arms below go red for the right reason. */
async function ruledRing(page: Page): Promise<string> {
  const resolved = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "ring-2 ring-inset ring-primary";
    document.body.append(probe);
    const shadow = getComputedStyle(probe).boxShadow;
    probe.remove();
    return shadow;
  });
  return insetLayers(resolved);
}

// ── The two grid carriers now paint ONE ring ────────────────────────────────────────────────────────
test("#1840: a selected media cell paints the RULED inset ring and nothing else", async ({ mount, page }) => {
  const grid = await mount(<SelectableGrid itemCount={4} />);
  const cells = grid.locator('[data-slot="media-grid-cell"]');
  await expect(cells.first()).toBeVisible();
  const ruled = await ruledRing(page);
  expect(ruled, "the probe must resolve a real ring, or every comparison below is vacuous").not.toBe("");

  // PLANTED CONTROL, first: with nothing selected the ring must be absent, or "it matches" is satisfied by
  // an element painting nothing.
  expect(await insetShadow(cells.first()), "an unselected media cell paints no ring").toBe("");

  await cells.first().dispatchEvent("click");
  await expect(cells.first()).toHaveAttribute("data-selected", /.*/);
  expect(await insetShadow(cells.first()), "the selected media cell wears SELECTION_RING_SELECTED").toBe(ruled);
  // …and the ring is the ONLY layer now: no glow, no gradient overlay.
  expect(await outerShadow(cells.first()), "the rationed --shadow-glow left the media cell").toBe("");
  expect(await afterLayer(cells.first()), "the globals.css gradient ::after left the media cell").toBe("none");
});

test("#1840: a checked picker cell paints the SAME ruled ring — one idiom, two state attributes", async ({ mount, page }) => {
  await mount(<PickerStory />);
  const cells = page.locator('[data-slot="picker-cell"]');
  await expect(cells.first()).toBeVisible();
  const ruled = await ruledRing(page);
  expect(ruled).not.toBe("");

  const second = cells.nth(1);
  // PLANTED CONTROL: an unchecked sibling in the same grid paints no ring.
  expect(await insetShadow(second), "an unchecked picker cell paints no ring").toBe("");

  await cells.first().dispatchEvent("click");
  await expect.poll(async () => await insetShadow(cells.first())).toBe(ruled);
  expect(await outerShadow(cells.first()), "a picker cell's selection is the inset ring alone").toBe("");
});

// ── The tab's second layer is a NAMED MISS, and this is the receipt ─────────────────────────────────
// E2 lists "drop the tabs' redundant second selected layer" as one of its three targets. The premise is
// that the tab already carries the sliding indicator bar, so the gradient `::after` is a duplicate. On
// this tree it is not: `TabsIndicator` is an OPT-IN CHILD (`tabs.tsx` exports it; `TabsList` draws none),
// and two of the three consumers — `workloads-jobs-section.tsx` and the shell's `context-rail.tsx` — do
// not render one. Deleting the rule there leaves `data-active:text-foreground` as the whole treatment.
//
// So this arm pins the PREMISE rather than the fix: an indicator-less tab list's active tab has exactly
// one non-ink mark, and it is that `::after`. It reds the day the list draws its own indicator — which is
// the honest collapse, and a seal change with a vertical/`stacked` arm the rail needs rendered receipts
// for, so it is reported rather than improvised here.
test("#1840 NAMED MISS: without an opt-in indicator, the tab's gradient ::after IS its only selection mark", async ({ mount, page }) => {
  await mount(
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTab value="one">One</TabsTab>
        <TabsTab value="two">Two</TabsTab>
      </TabsList>
      <TabsPanel value="one">First</TabsPanel>
      <TabsPanel value="two">Second</TabsPanel>
    </Tabs>,
  );
  const active = page.getByRole("tab", { name: "One" });
  const inactive = page.getByRole("tab", { name: "Two" });
  await expect(active).toHaveAttribute("data-active", /.*/);

  // THE PREMISE: no indicator exists unless a consumer renders one.
  await expect(page.locator('[data-slot="tabs-indicator"]'), "TabsList draws no indicator of its own").toHaveCount(0);
  // …so the gradient layer is load-bearing here, not redundant.
  expect(await afterLayer(active), "the active tab's only geometric mark").not.toBe("none");
  expect(await afterLayer(inactive), "…and the inactive tab carries none of it").toBe("none");
  // The ink difference survives either way — it is the half that was never in question.
  const [activeInk, inactiveInk] = await Promise.all([
    active.evaluate((el: Element) => getComputedStyle(el).color),
    inactive.evaluate((el: Element) => getComputedStyle(el).color),
  ]);
  expect(activeInk).not.toBe(inactiveInk);
});

// ── A selected ROW wears the ruled row idiom, not the hover fill ────────────────────────────────────
test("#1840: a selected table row wears the rail + tint, and never the accent HOVER fill", async ({ mount, page }) => {
  await mount(<BasicTableStory selectable={true} />);
  const rows = page.locator('[data-slot="table-row"]');
  await expect(rows.first()).toBeVisible();

  const paintOf = async (row: Locator): Promise<{ readonly fill: string; readonly rail: string; readonly width: string }> =>
    await row.evaluate((el: Element) => {
      const style = getComputedStyle(el);
      return { fill: style.backgroundColor, rail: style.borderLeftColor, width: style.borderLeftWidth };
    });

  // PLANTED CONTROL: the rail BOX is reserved at rest (transparent, not absent), which is what stops a
  // selection shifting the row's first cell — and the row paints no fill.
  const nothing = await transparent(page);
  const rest = await paintOf(rows.first());
  expect(rest.width, "the rail box is reserved on every row").toBe("2px");
  expect(rest.fill, "an unselected row paints no fill").toBe(nothing);

  await page
    .getByRole("checkbox", { name: /^Select / })
    .first()
    .dispatchEvent("click");
  await expect(rows.first()).toHaveAttribute("data-selected", /.*/);
  const selected = await paintOf(rows.first());
  expect(selected.rail, "a selected row lights its reserved rail").not.toBe(rest.rail);
  expect(selected.fill, "…and tints").not.toBe(rest.fill);

  // THE FINDING ITSELF: the selected fill must not be the `bg-accent` every hovered surface wears. Read
  // from a live probe in the same document rather than from a token literal, so the claim is about what a
  // reader sees and cannot go stale against a retune.
  const accent = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "bg-accent";
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  });
  expect(accent, "the probe must resolve a real accent fill, or the comparison below is vacuous").not.toBe(nothing);
  expect(selected.fill, "a chosen row and a pointed-at row must not be one colour").not.toBe(accent);
});
