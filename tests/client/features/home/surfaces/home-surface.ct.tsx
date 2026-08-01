// HomeSurface CT — the DOOR seam (home-section-spec §8.1): tiles arrive as a hand-built contributor
// registry of fakes and the REAL grid renders them. What this pins is the seam's contract, not pixels:
// the `(order, id)` sort, `useVisible:false` ⇒ NO DOM, the dormant arm's zero-control doorway, the
// zero-tile empty state, and the duplicate-id THROW at construction.

import type { HomeTileContribution } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import { Clock } from "@orb/ui/icons";
import { expect, test } from "@playwright/experimental-ct-react";
import { HomeDormantTileStory, HomeEmptyStory, HomeTileOrderStory, HomeTileVisibilityStory } from "../_ct-stories";

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

test("a DORMANT tile is a doorway: teaser + Dormant badge + reason, and ZERO interactive elements", async ({ mount }) => {
  const home = await mount(<HomeDormantTileStory />);

  const tile = home.locator('[data-home-tile="dormant"]');
  await expect(tile).toBeVisible();
  await expect(tile.getByText("Dormant")).toBeVisible();
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

test("a tile card's resolved padding IS the form-tier token — never a hardcoded value", async ({ mount }) => {
  const home = await mount(<HomeTileOrderStory />);

  const [padding, token] = await home.locator('[data-home-tile="a-first"]').evaluate((el) => {
    // Resolve `--spacing-block` to the same UNIT the computed padding reports, so the comparison is
    // token-vs-rendered rather than rem-string-vs-px-string.
    const probe = globalThis.document.createElement("div");
    probe.style.width = "var(--spacing-block)";
    el.append(probe);
    const tokenPx = globalThis.getComputedStyle(probe).width;
    probe.remove();
    return [globalThis.getComputedStyle(el).paddingTop, tokenPx];
  });
  expect(padding).toBe(token);
  // A card that collapsed to zero padding would pass a "toBeVisible" check and look broken.
  expect(Number.parseFloat(padding)).toBeGreaterThan(0);
});

test("a full-span tile spans BOTH columns while a half-span tile does not", async ({ mount }) => {
  const home = await mount(<HomeTileOrderStory />);

  const half = await home.locator('[data-home-tile="a-first"]').boundingBox();
  const full = await home.locator('[data-home-tile="b-second"]').boundingBox();
  expect(half).not.toBeNull();
  expect(full).not.toBeNull();
  expect((full?.width ?? 0) > (half?.width ?? 0) * 1.5).toBe(true);
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

test("a DORMANT tile's frame is DASHED — the doorway reads as not-built-yet from across the grid", async ({ mount }) => {
  const dormant = await mount(<HomeDormantTileStory />);

  const style = await dormant.locator('[data-home-tile="dormant"]').evaluate((el) => {
    const s = globalThis.getComputedStyle(el);
    return { border: s.borderTopStyle, width: s.borderTopWidth };
  });
  expect(style.border).toBe("dashed");
  // A dashed edge that resolved to 0 width would be invisible — the mock's frame is a real hairline.
  expect(Number.parseFloat(style.width)).toBeGreaterThan(0);
});

test("the dev-citation 'waiting on:' line is a FOOTNOTE — mono, and smaller than the teaser it annotates", async ({ mount }) => {
  const dormant = await mount(<HomeDormantTileStory />);
  const tile = dormant.locator('[data-home-tile="dormant"]');

  const teaser = await tile.getByText(TEASER_RE).evaluate((el) => Number.parseFloat(globalThis.getComputedStyle(el).fontSize));
  const reason = await tile.getByText(REASON_RE).evaluate((el) => ({
    size: Number.parseFloat(globalThis.getComputedStyle(el).fontSize),
    family: globalThis.getComputedStyle(el).fontFamily,
    alpha: globalThis.getComputedStyle(el).opacity,
  }));

  expect(reason.size).toBeLessThan(teaser);
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
