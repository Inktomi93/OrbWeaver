// HomeSurface CT — the DOOR seam (home-section-spec §8.1): tiles arrive as a hand-built contributor
// registry of fakes and the REAL grid renders them. What this pins is the seam's contract, not pixels:
// the `(order, id)` sort, `useVisible:false` ⇒ NO DOM, the dormant arm's zero-control doorway, the
// zero-tile empty state, and the duplicate-id THROW at construction.

import { createContributorRegistry } from "@orb/client/lib";
import type { HomeTileContribution } from "@orb/client/state";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { Clock } from "@orb/ui/icons";
import { expect, test } from "@playwright/experimental-ct-react";
import { trpcHold } from "../../../../support/ct/route-trpc.ts";
import { characterListResponder, makeCharacterSummary } from "../../character/fixtures.ts";
import { chatListResponder, makeChatSummary } from "../../chat/fixtures.ts";
import { READY_DOC, stubDatabank } from "../../databank/fixtures.ts";
import {
  HomeDormantTileStory,
  HomeEmptyStory,
  HomeRegionStory,
  HomeShippedFirstBootStory,
  HomeSplitPressureStory,
  HomeTileOrderStory,
  HomeTileVisibilityStory,
} from "../_ct-stories.tsx";

const TEASER_RE = /Your companion/u;
const REASON_RE = /waiting on: domain\/buddy/u;
const DUPLICATE_ID_RE = /duplicate contributor id "same"/u;

// ── #129 first-boot fixtures — a POPULATED house, because that is the shape a declaration is derived
// against: an empty bank/library renders an EmptyState, which is a different box from the one the tile
// reserves rows for. The counts are each tile's own read limit, i.e. the fullest page it can render.
/** `RECENTS_LIMIT` — chat's home read (`home-recents-tile-body.tsx`); one hero + the also-open remainder. */
const RECENTS_LIMIT = 8;
/** `QUICK_PICKS_LIMIT` — the face shelf's read (`home-quick-picks-tile-body.tsx`). */
const QUICK_PICKS_FACES = 6;
/** `RECENT_DOCUMENTS_LIMIT` — the databank tile's read (`home-documents-tile-body.tsx`). */
const RECENT_DOCUMENTS = 4;
const FIRST_BOOT_ROOMS = Array.from({ length: RECENTS_LIMIT }, (_unused, index) =>
  makeChatSummary({
    id: `chat_boot_${String(index)}`,
    lastMessageAt: 1_750_000_000_000 - index,
    participantNames: ["Wren"],
    title: `Room ${String(index)}`,
    updatedAt: 1_750_000_000_000 - index,
  }),
);
const FIRST_BOOT_FACES = Array.from({ length: QUICK_PICKS_FACES }, (_unused, index) =>
  makeCharacterSummary({ id: `character_boot_${String(index)}`, name: `Face ${String(index)}` }),
);
/** The bank the tile's four rows + health line render — the databank fixtures' own `READY_DOC`, four up. */
const FIRST_BOOT_BANK = {
  items: Array.from({ length: RECENT_DOCUMENTS }, (_unused, index) => ({
    ...READY_DOC,
    id: `document_0000000000000000000${String(index)}`,
    name: `Doc ${String(index)}`,
  })),
  nextCursor: null,
  totalCount: RECENT_DOCUMENTS,
};
const FIRST_BOOT_HEALTH = { byPhase: { embedding: 0, empty: 0, indexing: 0, ready: 4, stalled: 0 }, chunks: 48, passages: 48, total: 4 };

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

// ── RED-FIRST (#102 review P1-1): the approved ratio survives CONTENT PRESSURE ──────────────────────
// The shipped split rendered 1.92/1 at the 1280px pane (742.06/385.94 measured in-page) because a grid
// TRACK CHILD is `min-width:auto` and the hearth's content floored its track. Asserted on the RESOLVED
// track template — the only place the defect is visible — against the declared 1.55:1, not a px literal.
test("RED-FIRST (#102-P1-1): the 1.55fr/1fr split holds even when the hearth's content is wider than its track", async ({ mount }) => {
  const home = await mount(<HomeSplitPressureStory />);

  const template = await home.locator("[data-home-grid]").evaluate((el) => globalThis.getComputedStyle(el).gridTemplateColumns);
  const tracks = template.trim().split(WHITESPACE_RE).map(Number.parseFloat);
  expect(tracks).toHaveLength(2);
  const [lead = 0, rail = 0] = tracks;
  // 1.55:1 = 1.55. A track floored at its content read 1.92; anything at or under 1.6 is the declared
  // shape surviving, and the tolerance is what keeps this off a px literal.
  expect(lead / rail).toBeLessThan(1.6);
  expect(lead / rail).toBeGreaterThan(1.5);
});

// ── RED-FIRST (#102 review F3): the rail's SECOND BREATH at a wide pane ─────────────────────────────
test("RED-FIRST (#102-F3): the rail's two footnote blocks go SIDE BY SIDE at a wide pane, not stacked", async ({ mount, page }) => {
  await page.setViewportSize({ width: 2000, height: 1200 });
  const home = await mount(<HomeRegionStory />);

  const foot = home.locator("[data-home-shelf-foot]");
  const footTemplate = await foot.evaluate((el) => globalThis.getComputedStyle(el).gridTemplateColumns);
  expect(trackCount(footTemplate)).toBe(2);

  // …and it is REAL geometry, not just a template: the doorway band sits beside the last shelf tile.
  const tile = await home.locator('[data-home-tile="unplaced"]').boundingBox();
  const doorways = await page.getByRole("region", { name: "Not yet" }).boundingBox();
  expect(doorways?.x ?? 0).toBeGreaterThan((tile?.x ?? 0) + (tile?.width ?? 0) - 1);
});

test("#102-F3 the footnote pair STACKS again at the pane width the rail is narrow", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 1200 });
  const home = await mount(<HomeRegionStory />);

  const template = await home.locator("[data-home-shelf-foot]").evaluate((el) => globalThis.getComputedStyle(el).gridTemplateColumns);
  expect(trackCount(template)).toBe(1);
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
  // The band's OWN h2 is the group's name and is the only heading in it — no doorway draws one.
  await expect(group.getByRole("heading")).toHaveCount(1);
});

// ── RED-FIRST (#102 review F6): "Not yet" is a PEER block, not a child of the tile above it ─────────
test("#102-F6 the 'Not yet' band names itself with an h2, level with home's other blocks", async ({ mount, page }) => {
  await mount(<HomeRegionStory />);

  const group = page.getByRole("region", { name: "Not yet" });
  await expect(group.getByRole("heading", { level: 2, name: "Not yet" })).toBeVisible();
  // …and the surface has NO h3 at all: every block on home is a peer (the outline read h1 → h2 → h3 →
  // h2×4 → h3 before this, so two of seven blocks announced as children of nothing).
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
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

// ── THE SHIPPED FIRST BOOT (#129 residual 1) ─────────────────────────────────────────────────────────
// Everything above drives FAKE tiles, which is right for the door seam and structurally blind to the
// question #129 asks: is each SHIPPED `skeletonRows` the box its own body settles at? The frame's
// mechanism is pinned in home-tile.ct.tsx with fakes; the DECLARATIONS were only ever pinned by the hand
// derivation in each contribution's header, and nothing recomputes them when a body changes. The box
// memory then HEALS the error from boot two on, so a wrong declaration is invisible on any device that
// has already booted and costs a layout shift on every device that has not (measured live on a cold
// profile: `[data-home-grid]` 948px → 869px, CLS 0.0606, behind the boot veil).
//
// So: the real registry, at the shipped content width, over the real data layer with every read HELD —
// `trpcHold` turns the first-boot skeleton into an indefinitely stable state instead of a flash to race.
// Measure the reserved grid, release, measure the settled grid. The delta IS the shift.
//
// IT PINS THE FULL PAGE, AND THAT IS THE WHOLE ANSWER TO #129 (measured here 2026-08-17, both arms):
//   · a FULL house (8 rooms · 6 faces · 4 documents — each tile's own read limit) reserves 1043.75px and
//     settles at 1041.14px. 2.6px. The declarations are RIGHT.
//   · the SAME drive on a sparse house (3 rooms · 2 faces · 1 document) reserves the identical 1043.75px
//     and settles at 698.39px — a 345px SHRINK, which is the reported 948→869 symptom with a smaller
//     library in front of it.
// `skeletonRows` is ONE static number and the settled height is DATA-dependent, so no value is right for
// both arms; reserving the fullest page the tile can render is the correct choice, because the error it
// leaves is a SHRINK (content pulls up, nothing is pushed under the reader's cursor) rather than the push
// the whole #92 mechanism exists to kill. Tightening the declarations toward a sparse library would trade
// this for that. Hence: the full-page arm is the CONTRACT and is pinned; the sparse-library shrink is
// accepted (first boot only, behind the boot veil, healed by the box memory from boot two).
test("#129 the shipped first boot reserves the grid a FULL page settles into", async ({ mount, page }) => {
  const chats = trpcHold();
  const characters = trpcHold();
  const settings = trpcHold();
  const documents = trpcHold();
  const health = trpcHold();
  await stubDatabank(page, {
    "chat.listChats": chats,
    "chat.reapTemporaryChats": { reaped: 0 },
    "character.list": characters,
    "databank.bankHealth": health,
    "databank.list": documents,
    "settings.getUserSettings": settings,
  });

  const home = await mount(<HomeShippedFirstBootStory />);
  await Promise.all([chats.requested, characters.requested, settings.requested, documents.requested, health.requested]);
  const grid = home.locator("[data-home-grid]");
  // Every tile is on its DECLARED reservation: no box MEMORY exists for any id on a first-ever boot.
  // Scoped to the source (#177): a declared px box writes the same `data-tile-reserved` attribute the
  // measured one does, so a bare presence check here would stop meaning "first boot".
  await expect(grid.locator('[data-tile-reserve-source="measured"]')).toHaveCount(0);
  await expect(grid.locator("[aria-busy]").first()).toBeVisible();
  const reserved = (await grid.boundingBox())?.height ?? 0;
  // The tolerance below, read off the RENDERED bars while they are still up — never a literal: a skeleton
  // row is `--spacing-control-lg` plus its gap, and that token is pointer-conditional (40px fine / 56px
  // coarse), so a hardcoded pitch would pass on this runner and lie about a tablet.
  const rowPitch = await grid
    .locator('[data-slot="skeleton"]')
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);

  chats.release(chatListResponder(FIRST_BOOT_ROOMS)({ limit: RECENTS_LIMIT }));
  characters.release(characterListResponder(FIRST_BOOT_FACES)({ limit: QUICK_PICKS_FACES }));
  settings.release({ config: DEFAULT_USER_SETTINGS, schemaVersion: 1, updatedAt: 0, userId: "user_ct_first_boot" });
  documents.release(FIRST_BOOT_BANK);
  health.release(FIRST_BOOT_HEALTH);

  // SETTLED, not "no longer busy": barrier on rendered content from every tile that was held, so the
  // measurement below cannot land between two tiles' commits.
  await expect(grid.locator('[data-home-hearth="chat_boot_0"]')).toBeVisible();
  await expect(grid.getByRole("list", { name: "Character quick-picks" })).toBeVisible();
  await expect(grid.getByText("Start a temp chat")).toBeVisible();
  await expect(grid.getByText("Doc 0", { exact: true })).toBeVisible();
  await expect(grid.locator("[aria-busy]")).toHaveCount(0);
  const settled = (await grid.boundingBox())?.height ?? 0;

  // The whole point: a first boot that reserves what it settles into shifts nothing. The budget is ONE
  // skeleton row's pitch — below that the declaration cannot be made truer (a row is the smallest unit the
  // reservation is spelled in), above it the grid visibly re-flows behind the veil.
  expect(Math.abs(reserved - settled)).toBeLessThanOrEqual(rowPitch);
});

// ── #177 the PER-TILE reservation, which the page total above cannot see ────────────────────────────
// The assertion above is a SUM, and the three declarations it sums were wrong in opposite directions —
// so a 2.6px page residual was hiding a +16.5 / −6.75 / −17.4 spread that a reader watches happen. Every
// one of those three tiles has a settled height that is a CONSTANT (a two-line heading block, a
// fixed-cell face grid at its primary mount, a button over one gloss line), so each is reservable EXACTLY
// and the row-count pitch (~48px) is the only thing that was stopping it. They now declare
// `HomeTileContribution.skeletonBlock` — a measured px box on the same seam the remembered box uses.
//
// The tiles NOT listed here keep `skeletonRows` on purpose: `chat.recents` / `chat.alsoOpen` /
// `databank.documents` settle into N rows of whatever came back, so no static number is right for both a
// full and a sparse library (the ruling above — reserve the fullest page, accept the shrink).
const EXACTLY_RESERVED_TILES = ["chat.masthead", "chat.quickPicks", "chat.tempChat"] as const;
/** Sub-pixel layout rounding only — the declarations are integers against fractional settled boxes. */
const EXACT_RESERVATION_EPSILON_PX = 1;

test("#177 a tile whose settled box is a CONSTANT reserves it exactly — no residual first-boot shift", async ({ mount, page }) => {
  const chats = trpcHold();
  const characters = trpcHold();
  const settings = trpcHold();
  const documents = trpcHold();
  const health = trpcHold();
  await stubDatabank(page, {
    "chat.listChats": chats,
    "chat.reapTemporaryChats": { reaped: 0 },
    "character.list": characters,
    "databank.bankHealth": health,
    "databank.list": documents,
    "settings.getUserSettings": settings,
  });

  const home = await mount(<HomeShippedFirstBootStory />);
  await Promise.all([chats.requested, characters.requested, settings.requested, documents.requested, health.requested]);
  const grid = home.locator("[data-home-grid]");
  await expect(grid.locator("[aria-busy]").first()).toBeVisible();
  const reserved = await Promise.all(EXACTLY_RESERVED_TILES.map(async (id) => (await home.locator(`[data-home-tile="${id}"]`).boundingBox())?.height ?? 0));

  chats.release(chatListResponder(FIRST_BOOT_ROOMS)({ limit: RECENTS_LIMIT }));
  characters.release(characterListResponder(FIRST_BOOT_FACES)({ limit: QUICK_PICKS_FACES }));
  settings.release({ config: DEFAULT_USER_SETTINGS, schemaVersion: 1, updatedAt: 0, userId: "user_ct_first_boot" });
  documents.release(FIRST_BOOT_BANK);
  health.release(FIRST_BOOT_HEALTH);

  // SETTLED, never "no longer busy": barrier on rendered content from every held tile first.
  await expect(grid.locator('[data-home-hearth="chat_boot_0"]')).toBeVisible();
  await expect(grid.getByRole("list", { name: "Character quick-picks" })).toBeVisible();
  await expect(grid.getByText("Start a temp chat")).toBeVisible();
  await expect(grid.getByText("Doc 0", { exact: true })).toBeVisible();
  await expect(grid.locator("[aria-busy]")).toHaveCount(0);
  const settled = await Promise.all(EXACTLY_RESERVED_TILES.map(async (id) => (await home.locator(`[data-home-tile="${id}"]`).boundingBox())?.height ?? 0));

  const drift = Object.fromEntries(EXACTLY_RESERVED_TILES.map((id, i) => [id, Number(((settled[i] ?? 0) - (reserved[i] ?? 0)).toFixed(2))]));
  expect(
    reserved.every((h) => h > 0),
    `every measured tile must exist while reading: ${JSON.stringify(drift)}`,
  ).toBe(true);
  for (const [id, delta] of Object.entries(drift)) {
    expect(Math.abs(delta), `${id} moved ${String(delta)}px between its reserved box and its settled one`).toBeLessThanOrEqual(EXACT_RESERVATION_EPSILON_PX);
  }
});

// ── #188 P2-12 — the landing janitor must not buy the chats list a second round-trip ────────────────
// `chat.reapTemporaryChats` fires once per home mount (owner decision H5) and its `invalidates` used to be
// unconditional, so EVERY landing paid a second full `chat.listChats` inside the boot window — measured on
// the live stack: sweep at +0.26s after the first read burst, refetch at +0.38s, and `data-app-ready` held
// open for both because the readiness signal waits on an idle query cache. The verb's own answer already
// says whether anything moved: `{reaped: 0}` is zero rows deleted, therefore zero rows the list can be
// showing. Both arms are pinned — a sweep that DID delete must still reconcile, or the fix would trade a
// wasted read for a stale list.
//
// The sweep itself is now deferred to an idle frame, so both tests poll for it rather than assuming it has
// already left with the mount commit.
const REAP_SETTLED_ROOMS = [FIRST_BOOT_ROOMS[0] ?? makeChatSummary({ id: "chat_boot_0" })];
/** How long the negative arm watches for the read that must never come. */
const SECOND_READ_WATCH_MS = 1500;

test("#188 a sweep that DID reap reconciles the chats list (the arm the fix must not break)", async ({ mount, page }) => {
  const recorder = await stubDatabank(page, {
    "chat.listChats": chatListResponder(REAP_SETTLED_ROOMS),
    "chat.reapTemporaryChats": { reaped: 3 },
    "character.list": characterListResponder(FIRST_BOOT_FACES),
    "settings.getUserSettings": { config: DEFAULT_USER_SETTINGS, schemaVersion: 1, updatedAt: 0, userId: "user_ct_reap_hit" },
  });

  const home = await mount(<HomeShippedFirstBootStory />);
  await expect(home.getByText("Start a temp chat")).toBeVisible();
  await expect.poll(() => recorder.count("chat.reapTemporaryChats"), { intervals: [20, 50, 100, 250] }).toBe(1);
  // Rows died, so the list the user is looking at is stale — it is re-read.
  await expect.poll(() => recorder.count("chat.listChats"), { intervals: [20, 50, 100, 250] }).toBe(2);
});

test("#188 a sweep that reaped NOTHING costs the landing no second chats read", async ({ mount, page }) => {
  const recorder = await stubDatabank(page, {
    "chat.listChats": chatListResponder(REAP_SETTLED_ROOMS),
    "chat.reapTemporaryChats": { reaped: 0 },
    "character.list": characterListResponder(FIRST_BOOT_FACES),
    "settings.getUserSettings": { config: DEFAULT_USER_SETTINGS, schemaVersion: 1, updatedAt: 0, userId: "user_ct_reap_miss" },
  });

  const home = await mount(<HomeShippedFirstBootStory />);
  // The temp-chat tile is the sweep's own call site, so its button on screen is the barrier that the
  // janitor has a host at all; the quick-picks list settles the rest of the landing.
  await expect(home.getByText("Start a temp chat")).toBeVisible();
  await expect(home.getByRole("list", { name: "Character quick-picks" })).toBeVisible();
  await expect.poll(() => recorder.count("chat.reapTemporaryChats"), { intervals: [20, 50, 100, 250] }).toBe(1);

  // A refetch that never happens paints nothing, so there is no settled state to barrier on — it is
  // OBSERVED instead. This poll is deliberately inverted: it asks for the second read and is expected to
  // exhaust its window without ever seeing one. (`expect.poll(...).toBe(1)` would match on its first
  // sample, before the old code's invalidation had even been raised, and prove nothing.) The positive arm
  // above calibrates the window: there the refetch is recorded within one response turnaround.
  const sawSecondRead = await expect
    .poll(() => recorder.count("chat.listChats"), { intervals: [50, 100, 200, 400], timeout: SECOND_READ_WATCH_MS })
    .toBe(2)
    .then(
      () => true,
      () => false,
    );
  expect(sawSecondRead, "the sweep deleted nothing, so the chats list must not be re-read").toBe(false);
});

test("a duplicate tile id THROWS at door construction — the seam never silently shadows a tile", () => {
  const dup: HomeTileContribution = { id: "same", title: "T", icon: Clock, body: () => null };
  expect(() => createContributorRegistry<HomeTileContribution>("home-tiles", [dup, { ...dup, title: "Other" }])).toThrow(DUPLICATE_ID_RE);
});
