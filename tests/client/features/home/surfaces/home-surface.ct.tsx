// HomeSurface CT — the DOOR seam (home-section-spec §8.1): tiles arrive as a hand-built contributor
// registry of fakes and the REAL grid renders them. What this pins is the seam's contract, not pixels:
// the `(order, id)` sort, `useVisible:false` ⇒ NO DOM, the dormant arm's zero-control doorway, the
// zero-tile empty state, and the duplicate-id THROW at construction.

import { createContributorRegistry } from "@orb/client/lib";
import type { HomeTileContribution } from "@orb/client/state";
import { Clock } from "@orb/ui/icons";
import { expect, test } from "@playwright/experimental-ct-react";
import { HomeDormantTileStory, HomeEmptyStory, HomeRegionStory, HomeTileOrderStory, HomeTileVisibilityStory } from "../_ct-stories.tsx";

const TEASER_RE = /Your companion/u;
const REASON_RE = /waiting on: domain\/buddy/u;
const DUPLICATE_ID_RE = /duplicate contributor id "same"/u;

test("tiles render in (order, id), not door-array order", async ({ mount }) => {
  const home = await mount(<HomeTileOrderStory />);

  const tiles = home.locator("[data-home-tile]");
  await expect(tiles).toHaveCount(3);
  // Declared z-third(30), a-first(10), b-second(20) — rendered first, second, third.
  await expect(tiles.nth(0)).toHaveAttribute("data-home-tile", "a-first");
  await expect(tiles.nth(1)).toHaveAttribute("data-home-tile", "b-second");
  await expect(tiles.nth(2)).toHaveAttribute("data-home-tile", "z-third");
});

test("a `useVisible:false` tile renders NOTHING — no gap, no empty card", async ({ mount }) => {
  const home = await mount(<HomeTileVisibilityStory />);

  await expect(home.locator("[data-home-tile]")).toHaveCount(3);
  await expect(home.locator('[data-home-tile="hidden"]')).toHaveCount(0);
  await expect(home.getByText("Hidden tile")).toHaveCount(0);
});

test("a DORMANT tile is a doorway: name + teaser + reason, and ZERO interactive elements", async ({ mount }) => {
  // The per-doorway `Dormant` BADGE went with #102: home collects every declared doorway under one
  // "Not yet" band, so the group's own name says once what N badges said N times. The doorway's own
  // title is what it gained in exchange — it used to be the frame's h2 and is now its first line.
  const home = await mount(<HomeDormantTileStory />);

  const tile = home.locator('[data-home-tile="dormant"]');
  await expect(tile).toBeVisible();
  await expect(tile.getByText("Buddy", { exact: true })).toBeVisible();
  await expect(tile.getByText(TEASER_RE)).toBeVisible();
  await expect(tile.getByText(REASON_RE)).toBeVisible();
  // The doorway does not fake a control, a spinner, or a skeleton.
  await expect(tile.getByRole("button")).toHaveCount(0);
  await expect(tile.locator("[aria-busy]")).toHaveCount(0);
});

test("ZERO contributions renders the designed empty state with its action, never a blank grid", async ({ mount }) => {
  const home = await mount(<HomeEmptyStory />);

  await expect(home.getByText("Nothing on your home yet")).toBeVisible();
  await expect(home.getByRole("button", { name: "New chat" })).toBeVisible();
  await expect(home.locator("[data-home-tile]")).toHaveCount(0);
});

// ── RENDERED truth, not source (done ≠ rendered) ───────────────────────────────────────────────────
// The grid reflows on the CONTENT PANE's own inline size, never the viewport. These assert the RESOLVED
// track template + the tile card's RESOLVED padding against the token, so a collapsed/1-column/3-column
// grid or an unpadded card fails here rather than shipping.

const WHITESPACE_RE = /\s+/u;
const trackCount = (template: string): number => template.trim().split(WHITESPACE_RE).length;

test("the tile grid resolves to TWO columns at the content width", async ({ mount }) => {
  const home = await mount(<HomeTileOrderStory />);

  const template = await home.locator("[data-home-grid]").evaluate((el) => globalThis.getComputedStyle(el).gridTemplateColumns);
  expect(trackCount(template)).toBe(2);
});

test("the tile grid collapses to ONE column when its own pane is narrow", async ({ mount, page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  const home = await mount(<HomeTileOrderStory />);

  const template = await home.locator("[data-home-grid]").evaluate((el) => globalThis.getComputedStyle(el).gridTemplateColumns);
  expect(trackCount(template)).toBe(1);
});

test("RED-FIRST (#102): home's grid FILLS the pane it is given — no centred cap, no symmetric void", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const home = await mount(<HomeTileOrderStory />);

  // The pane is the DOCUMENT's own width, never `closest("[data-surface-tier]")`: <Surface> is
  // `display: contents`, so it generates no box and `getBoundingClientRect()` reports 0×0 — a ratio
  // against it divides by zero and passes whatever it is handed (measured on this very assertion).
  const ratio = await home.locator("[data-home-grid]").evaluate((el) => el.getBoundingClientRect().width / el.ownerDocument.documentElement.clientWidth);
  expect(ratio).toBeGreaterThan(0.9);
});

test("#102 CHROME DIET: a tile frame is a KICKER BAND, not a card — no border, no radius, no fill", async ({ mount }) => {
  // CD1: a read-only grouping gets a caps label and a hairline rule, never a box. Home used to ship SEVEN
  // boxes, all the same weight. The ONE box left on the surface is the hearth hero, which is an
  // interactive island — exactly what CD1 reserves a box for. Asserted on the RESOLVED style, because the
  // Card the frame used to render resolved its padding/radius out of tiers.css, not out of its own class.
  const home = await mount(<HomeTileOrderStory />);

  const box = await home.locator('[data-home-tile="a-first"]').evaluate((el) => {
    const style = globalThis.getComputedStyle(el);
    return { border: Number.parseFloat(style.borderTopWidth), radius: Number.parseFloat(style.borderTopLeftRadius), bg: style.backgroundColor };
  });
  expect(box.border).toBe(0);
  expect(box.radius).toBe(0);
  // `rgba(0, 0, 0, 0)` is the transparent-background computed form.
  expect(box.bg).toBe("rgba(0, 0, 0, 0)");
});

test("#102 REGIONS: masthead above the split, hearth in the LEAD column, an unplaced tile on the SHELF", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1400, height: 1200 });
  const home = await mount(<HomeRegionStory />);

  const grid = await home.locator("[data-home-grid]").boundingBox();
  const top = await home.locator('[data-home-tile="top"]').boundingBox();
  const lead = await home.locator('[data-home-tile="lead"]').boundingBox();
  const rail = await home.locator('[data-home-tile="rail"]').boundingBox();
  const unplaced = await home.locator('[data-home-tile="unplaced"]').boundingBox();

  // The masthead spans the whole width and sits ABOVE the split.
  expect((top?.width ?? 0) / (grid?.width ?? 1)).toBeGreaterThan(0.95);
  expect(top?.y ?? 0).toBeLessThan(grid?.y ?? 0);
  // The hearth is the DOMINANT track and the shelf the companion: unequal on purpose (≈1.55:1).
  expect(lead?.width ?? 0).toBeGreaterThan(rail?.width ?? 0);
  // …and they are side by side, not stacked.
  expect(rail?.x ?? 0).toBeGreaterThan((lead?.x ?? 0) + (lead?.width ?? 0) - 1);
  // A tile that declares NO region defaults to the shelf — never a silent promotion into the hearth.
  expect(unplaced?.x ?? 0).toBe(rail?.x ?? -1);
});

test("#102 DOORWAYS are grouped under ONE 'Not yet' band, not framed one by one", async ({ mount, page }) => {
  await mount(<HomeRegionStory />);

  const group = page.getByRole("region", { name: "Not yet" });
  await expect(group).toBeVisible();
  // Both real doorways live inside that ONE band…
  await expect(group.locator("[data-home-tile]")).toHaveCount(2);
  // …and neither wears a band, a badge or a control of its own (a doorway has no chrome to spend).
  await expect(group.getByText("Dormant")).toHaveCount(0);
  await expect(group.getByRole("button")).toHaveCount(0);
  await expect(group.getByRole("heading", { level: 2 })).toHaveCount(0);
});

// ── A11y STRUCTURE (side-eye F3/F4) — the frame owns it, so every contributed tile inherits it ──────

test("every tile is a REGION named by its own real h2 — home is navigable by heading and by landmark", async ({ mount, page }) => {
  const home = await mount(<HomeTileOrderStory />);

  // One h2 per tile, in grid order (a styled div here would leave the whole screen heading-less).
  await expect(home.getByRole("heading", { level: 2 })).toHaveText(["First tile", "Second tile", "Third tile"]);
  // …and each CARD is the region that heading names, so a screen-reader user can jump tile-to-tile and
  // everything inside a tile (its rows, its trailing action) is announced under that tile's name.
  await expect(page.getByRole("region", { name: "First tile" })).toHaveAttribute("data-home-tile", "a-first");
  await expect(page.getByRole("region", { name: "Second tile" })).toHaveAttribute("data-home-tile", "b-second");
  await expect(page.getByRole("region", { name: "Third tile" })).toHaveAttribute("data-home-tile", "z-third");
});

// ── RENDERED fidelity against the mock (docs/design/mocks/home-section/home.html) ───────────────────

test("a DORMANT doorway wears a DASHED RULE — not-built-yet, at a fraction of a dashed card's weight", async ({ mount }) => {
  // #102 moved the dashed edge from the tile's whole FRAME (a full dashed card, one per doorway) to a
  // single dashed rule down the doorway's inline start (the mockup's `.doorway`). Same signal, no box.
  const dormant = await mount(<HomeDormantTileStory />);

  const style = await dormant.locator('[data-home-tile="dormant"]').evaluate((el) => {
    const s = globalThis.getComputedStyle(el);
    return { style: s.borderLeftStyle, width: s.borderLeftWidth, top: Number.parseFloat(s.borderTopWidth) };
  });
  expect(style.style).toBe("dashed");
  // A dashed edge that resolved to 0 width would be invisible — the mock's rule is a real hairline.
  expect(Number.parseFloat(style.width)).toBeGreaterThan(0);
  // …and it is a RULE, not a frame: no box round the doorway.
  expect(style.top).toBe(0);
});

test("a DORMANT tile RECEDES: a muted-gloss teaser, and the dev citation a mono/faded footnote under it", async ({ mount }) => {
  // The mock's dormant body is quiet twice over (`.dorm .teaser` 11px muted, `.dorm .reason` 9px mono at
  // .75 alpha) because these are the two tiles you CANNOT use. At the `label` voice the teaser was
  // full-foreground and became the brightest prose on home (side-eye P1-2), so the assertion here is the
  // one that catches that: the teaser's COLOR is the muted step, not the foreground.
  //
  // The footnote's separation from it is mono + alpha, NOT size: the type scale's smallest step is `micro`
  // and both land on it (there is no step below, and one is not invented for a footnote). So this asserts
  // "never LARGER than the teaser" — the honest relation — instead of a size gap the scale cannot express.
  const dormant = await mount(<HomeDormantTileStory />);
  const tile = dormant.locator('[data-home-tile="dormant"]');

  const teaser = await tile.getByText(TEASER_RE).evaluate((el) => {
    const style = globalThis.getComputedStyle(el);
    const probe = el.ownerDocument.createElement("span");
    probe.style.color = "var(--color-muted-foreground)";
    el.ownerDocument.body.append(probe);
    const muted = globalThis.getComputedStyle(probe).color;
    const foreground = ((): string => {
      probe.style.color = "var(--color-foreground)";
      return globalThis.getComputedStyle(probe).color;
    })();
    probe.remove();
    return { size: Number.parseFloat(style.fontSize), color: style.color, muted, foreground };
  });
  const reason = await tile.getByText(REASON_RE).evaluate((el) => ({
    size: Number.parseFloat(globalThis.getComputedStyle(el).fontSize),
    family: globalThis.getComputedStyle(el).fontFamily,
    alpha: globalThis.getComputedStyle(el).opacity,
  }));

  expect(teaser.color).toBe(teaser.muted);
  expect(teaser.color).not.toBe(teaser.foreground);
  expect(reason.size).toBeLessThanOrEqual(teaser.size);
  expect(reason.family.toLowerCase()).toContain("mono");
  expect(Number.parseFloat(reason.alpha)).toBeLessThan(1);
});

test("the grid aligns tiles to START — a short tile never stretches to its row-mate's height", async ({ mount }) => {
  const home = await mount(<HomeTileOrderStory />);

  // `items-start` resolves to the computed `flex-start` (its grid-axis synonym) — the point is that it is
  // NOT `normal`/`stretch`, which is what grew the short tile.
  const align = await home.locator("[data-home-grid]").evaluate((el) => globalThis.getComputedStyle(el).alignItems);
  expect(align).toBe("flex-start");
});

test("a duplicate tile id THROWS at door construction — the seam never silently shadows a tile", () => {
  const dup: HomeTileContribution = { id: "same", title: "T", icon: Clock, body: () => null };
  expect(() => createContributorRegistry<HomeTileContribution>("home-tiles", [dup, { ...dup, title: "Other" }])).toThrow(DUPLICATE_ID_RE);
});
