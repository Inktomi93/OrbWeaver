// HomeSurface CT — the DOOR seam (home-section-spec §8.1): tiles arrive as a hand-built contributor
// registry of fakes and the REAL grid renders them. What this pins is the seam's contract, not pixels:
// the `(order, id)` sort, `useVisible:false` ⇒ NO DOM, the dormant arm's zero-control doorway, the
// zero-tile empty state, and the duplicate-id THROW at construction.

import { createContributorRegistry } from "@orb/client/lib";
import type { HomeTileContribution } from "@orb/client/state";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { Clock } from "@orb/ui/icons";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { trpcHold } from "../../../../support/ct/route-trpc.ts";
import { characterListResponder, makeCharacterSummary } from "../../character/fixtures.ts";
import { chatListResponder, makeChatSummary } from "../../chat/fixtures.ts";
import { READY_DOC, stubDatabank } from "../../databank/fixtures.ts";
import {
  HomeDormantTileStory,
  HomeEmptyStory,
  HomeFoldStory,
  HomeRegionStory,
  HomeScrollCueFittingStory,
  HomeScrollCueStory,
  HomeShippedFirstBootStory,
  HomeSplitPressureStory,
  HomeTileOrderStory,
  HomeTileVisibilityStory,
} from "../_ct-stories.tsx";

const TEASER_RE = /Your companion/u;
/** The doorway group's ONE name since #455 — its disclosure trigger, its h2, and its region's a11y name.
 *  It replaced "Not yet", which named the group from inside a band you were already reading. */
const GROUP_LABEL = "What's coming";
/** The doorway's STATE LINE. It was the tracked developer citation ("waiting on: domain/buddy (not in the
 *  retro tree)") until the 2026-08-17 rail sweep (P1-3) — user-voice copy now, and no "waiting on:" prefix. */
const REASON_RE = /^Not started yet/u;
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
  // group, so the group's own name says once what N badges said N times. The doorway's own
  // title is what it gained in exchange — it used to be the frame's h2 and is now its first line.
  // The group is a FOLD since #455, so this contract is asserted on the OPENED panel — the doorway body
  // does not exist in the DOM until a reader asks for it, which is the point of the fold.
  const home = await mount(<HomeDormantTileStory />);
  await home.getByRole("button", { name: GROUP_LABEL }).click();

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
  await expect
    .poll(async () => await home.locator("[data-home-grid]").evaluate((el) => el.getBoundingClientRect().width / el.ownerDocument.documentElement.clientWidth))
    .toBeGreaterThan(0.9);
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

  // …and it is REAL geometry, not just a template: the doorway group sits beside the last shelf tile.
  // Measured COLLAPSED (#455): the fold's own trigger row is the block that has to pair, and the shipped
  // state is closed — a pairing that only holds once a reader opens the panel is not the shipped layout.
  const tile = await home.locator('[data-home-tile="unplaced"]').boundingBox();
  const doorways = await page.getByRole("region", { name: GROUP_LABEL }).boundingBox();
  expect(doorways?.x ?? 0).toBeGreaterThan((tile?.x ?? 0) + (tile?.width ?? 0) - 1);
});

test("#102-F3 the footnote pair STACKS again at the pane width the rail is narrow", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 1200 });
  const home = await mount(<HomeRegionStory />);

  const template = await home.locator("[data-home-shelf-foot]").evaluate((el) => globalThis.getComputedStyle(el).gridTemplateColumns);
  expect(trackCount(template)).toBe(1);
});

test("#102 DOORWAYS are grouped under ONE band, not framed one by one", async ({ mount, page }) => {
  await mount(<HomeRegionStory />);

  const group = page.getByRole("region", { name: GROUP_LABEL });
  await expect(group).toBeVisible();
  // #455: the band is a FOLD now, so the grouping contract is asserted on the opened panel.
  await group.getByRole("button", { name: GROUP_LABEL }).click();
  // The one remaining real doorway lives inside that ONE band (automation's doorway retired with B3 — its
  // chips now consume the channel it stood for; buddy is the last genuinely-dormant feature)…
  await expect(group.locator("[data-home-tile]")).toHaveCount(1);
  // …and neither wears a band, a badge or a control of its own (a doorway has no chrome to spend).
  await expect(group.getByText("Dormant")).toHaveCount(0);
  // The group's ONE button is its own fold trigger (#455) — scoped per doorway, the count is still zero,
  // which is the ruling this line has always carried: a doorway fakes no control.
  await expect(group.getByRole("button")).toHaveCount(1);
  await expect(group.locator("[data-home-tile]").getByRole("button")).toHaveCount(0);
  // The band's OWN h2 is the group's name, and it is the only heading at THAT rank — no doorway draws a
  // band of its own. It used to be the only heading of any rank; the doorway TITLES are `h3` since the
  // rail-home ARIA rec (2026-08-22), which is a different claim: they are the region's CHILDREN, and as
  // `<p>` they read to AT as body text indistinguishable from their own descriptions. The ruling this
  // assertion carries — "a doorway has no chrome of its own" — is untouched: an `h3` is structure, not
  // chrome (no band, no rule, no badge, no control), and the voice is byte-identical to the `<p>`'s.
  await expect(group.getByRole("heading", { level: 2 })).toHaveCount(1);
  await expect(group.getByRole("heading", { level: 3 })).toHaveCount(1);
});

// ── RED-FIRST (#102 review F6): the doorway group is a PEER block, not a child of the tile above it ──
// The h2 MOVED with #455 — it is no longer `<Section kicker level={2}>` but the heading WRAPPING the
// fold's trigger (`<h2><button>`, the canonical disclosure shape; a heading inside a button would be
// invalid HTML). F6's ruling is untouched and is exactly what this still asserts: the block names itself
// at h2, level with home's other blocks, and its h3s are its children.
test("#102-F6 the doorway group names itself with an h2, level with home's other blocks", async ({ mount, page }) => {
  await mount(<HomeRegionStory />);

  const group = page.getByRole("region", { name: GROUP_LABEL });
  await expect(group.getByRole("heading", { level: 2, name: GROUP_LABEL })).toBeVisible();
  await group.getByRole("button", { name: GROUP_LABEL }).click();
  // …and every BLOCK on home is still a peer. This used to read "the surface has NO h3 at all", which was
  // an over-broad restatement of the ruling: F6's defect was a BLOCK announcing as a child of the peer
  // block above it (the outline read h1 → h2 → h3 → h2×4 → h3, so two of seven blocks announced as
  // children of nothing). The doorway TITLES are `h3` since the rail-home ARIA rec (2026-08-22) and are the
  // opposite case — they are genuine CHILDREN of the region they sit in. So the pin now says what F6
  // actually ruled: every h3 on the surface is INSIDE the doorway region, and no block draws one.
  const subheadings = page.getByRole("heading", { level: 3 });
  await expect(subheadings).toHaveCount(await group.getByRole("heading", { level: 3 }).count());
  await expect(subheadings).toHaveText(["Buddy"]);
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

// ── #188 N-3 — the band's hairline is DRAWING, not structure ─────────────────────────────────────────
// `Separator` seals Base UI's real `role="separator"`, so every kicker band donated an UNNAMED separator
// stop to the a11y tree: an AT walk of the live landing hit 10 of them, seven from these bands, each
// announcing nothing a user can act on between blocks that already name themselves with an h2. The rule
// paints identically either way; only the stop goes.
test("#188 a tile band's rule is DECORATIVE — no unnamed separator stops between home's blocks", async ({ mount, page }) => {
  const home = await mount(<HomeTileOrderStory />);

  // The rule still PAINTS (the band is a kicker + a hairline, chrome diet CD1) — this is not a delete.
  await expect(home.locator('[data-slot="separator"]')).toHaveCount(3);
  await expect(page.getByRole("separator")).toHaveCount(0);
});

// ── RENDERED fidelity against the mock (docs/design/mocks/home-section/home.html) ───────────────────

test("a DORMANT doorway wears a DASHED RULE — not-built-yet, at a fraction of a dashed card's weight", async ({ mount }) => {
  // #102 moved the dashed edge from the tile's whole FRAME (a full dashed card, one per doorway) to a
  // single dashed rule down the doorway's inline start (the mockup's `.doorway`). Same signal, no box.
  const dormant = await mount(<HomeDormantTileStory />);
  await dormant.getByRole("button", { name: GROUP_LABEL }).click();

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
  await dormant.getByRole("button", { name: GROUP_LABEL }).click();
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
  // RED-FIRST (rail sweep P1-3): the state line carries NO alpha. `opacity-60` over the already-muted ink
  // measured **3.68:1** on the live surface — under the 4.5 floor — and the design-audit's own contrast
  // walker could not see it (it does not compose ancestor opacity, so it scored the line as opaque). The
  // mono face alone carries the separation now, which costs no contrast. This inverts the assertion that
  // used to stand here (`alpha < 1`), deliberately.
  expect(Number.parseFloat(reason.alpha)).toBe(1);
});

test("the grid aligns tiles to START — a short tile never stretches to its row-mate's height", async ({ mount }) => {
  const home = await mount(<HomeTileOrderStory />);

  // `items-start` resolves to the computed `flex-start` (its grid-axis synonym) — the point is that it is
  // NOT `normal`/`stretch`, which is what grew the short tile.
  await expect.poll(async () => await home.locator("[data-home-grid]").evaluate((el) => globalThis.getComputedStyle(el).alignItems)).toBe("flex-start");
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

// ── THE BELOW-FOLD CUE (side-eye rail-home P2-1) ────────────────────────────────────────────────────
// 293px of home sat below the fold at 1280x800 with `mask-image: none`, no scrollbar gutter and no
// `::after` — the last visible line severed mid-word, reading as a rendering fault rather than "scroll for
// more", with BOTH of the databank empty state's calls to action below the cut.
//
// Pinned through the ATTRIBUTE and the RESOLVED mask, and it takes both: `data-fade-bottom` alone would
// survive the stylesheet losing the `.scroll-fade-y` rule, and the mask alone cannot say whether the fade
// is scroll-AWARE or painted permanently. (A mask is paint — invisible to `elementFromPoint` — but
// `mask-image` itself does resolve on the computed style, which is what the baseline measured as "none".)
const FADE_GRADIENT_RE = /linear-gradient/u;

test("P2-1 a home taller than its pane announces the cut — and scrolling to the end retires the cue", async ({ mount }) => {
  const home = await mount(<HomeScrollCueStory />);
  const scroller = home.locator(".scroll-fade-y");

  // The overflow is real, or everything below passes for the wrong reason.
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);

  await expect(scroller).toHaveAttribute("data-fade-bottom", "");
  // …and nothing is hidden above it yet, so the TOP edge stays fully opaque.
  await expect(scroller).not.toHaveAttribute("data-fade-top", "");
  await expect.poll(() => scroller.evaluate((el) => globalThis.getComputedStyle(el).maskImage)).toMatch(FADE_GRADIENT_RE);

  // Scrolled to the end: the cut is gone, so the bottom cue must go with it and the top one must arrive.
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(scroller).not.toHaveAttribute("data-fade-bottom", "");
  await expect(scroller).toHaveAttribute("data-fade-top", "");
});

test("P2-1 a home that FITS its pane paints no fade at all — the cue is scroll-aware, never decoration", async ({ mount }) => {
  const home = await mount(<HomeScrollCueFittingStory />);
  const scroller = home.locator(".scroll-fade-y");

  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  await expect(scroller).not.toHaveAttribute("data-fade-bottom", "");
  await expect(scroller).not.toHaveAttribute("data-fade-top", "");
  // The recipe is still ON the element — it is the STOPS that resolve to 0%, which is what makes a fitting
  // surface render its edges fully opaque instead of dimming a flush heading against nothing.
  await expect.poll(() => scroller.evaluate((el) => globalThis.getComputedStyle(el).maskImage)).toMatch(FADE_GRADIENT_RE);
});

// ── #499: the databank empty state's CTAs are REACHABLE without scrolling ───────────────────────────
// The residual half of the P2-1 finding. #455 folded the roadmap block, but that block sits BELOW the
// databank tile in the shelf at a narrow pane (the foot subgrid is one track there), so folding it could
// not move the thing the finding was about: `Open Databank` measured top=819 against an 800px fold — an
// empty state whose only calls to action are off-screen teaches nothing.
//
// A POINT MEASUREMENT NEVER PROVES A RANGE PROPERTY, so this is a MATRIX: the fold reach is asserted at
// every width the column-balance instrument uses, spanning the `pairWide` crossover where the shelf's foot
// goes 2-up. The bank is EMPTY — that is the arm that renders CTAs at all, and it is a first-run user's arm.
//
// AND IT IS TWO-SIDED: `Start a temp chat` — the shelf's other peer-rank CTA — is measured by the same
// bar. A fold fix that lifts one control by dropping its neighbour is a shell game, and the only thing
// that can tell the two apart is measuring both. (The fixture is the FULLEST house the shipped registry can
// render, so every margin here is the worst case — it reproduces the live receipt exactly. The bar is
// stated on the DEFAULTS appearance arm, where the finding was measured; `--font-scale 1.25` hides 850px of
// this surface by construction and no block order answers that.)
//
// THE BAR IS THE FINDING'S OWN CRITERION — the control's TOP edge, which is what "top=819 against an 800px
// fold" measured and what decides whether a user sees a control at all. The overhang of each CTA's BOTTOM
// is printed beside it rather than asserted, and it is not zero: at 1280/1440 the `Open Databank` box still
// runs ~5px under the cut on this worst-case fixture. Closing that last 5px needs a block ABOVE this tile to
// shrink, and the two arms that reach it were both measured and refused — promoting the tile above Temp chat
// regresses #226's column-balance fence in three wide-pane cells (see `home-documents-tile.tsx`), and
// trimming the empty state's own copy is what the load-bearing-empty-state law forbids.
const FOLD_WIDTHS = [1280, 1440, 1920, 2560] as const;
/** The desktop shell's rail, ahead of home's pane (`--dimension-rail`) — home declares both panels away. */
const FOLD_RAIL_PX = 56;
const ADD_DOCUMENT_CTA = "Add your first document";
const OPEN_DATABANK_CTA = "Open Databank";
/** The shelf's OTHER peer-rank CTA, one block up. It is measured because a fold fix that lifts one control
 *  by dropping its neighbour is a shell game, not a fix — this row is what makes the receipt two-sided. */
const TEMP_CHAT_CTA = "Start a temp chat";

/** One CTA's edges against the scroller's own visible bottom — negative px means above the cut. `top` is
 *  the bar (a control whose top is under the cut is not on screen at all); `bottom` is the printed residual. */
interface FoldReach {
  readonly cta: string;
  readonly top: number;
  readonly bottom: number;
}

interface FoldCell {
  readonly reach: readonly FoldReach[];
  /** `id:height` per shelf block, in paint order — the diagnostic that says WHICH block the fold is spent on. */
  readonly shelf: string;
}

function measureFoldReach(page: Page, width: number): Promise<FoldCell> {
  return page.evaluate(
    ({ names, pane }) => {
      (document.querySelector("[data-home-fold-pane]") as HTMLElement | null)?.style.setProperty("inline-size", `${String(pane)}px`);
      const scroller = document.querySelector(".scroll-fade-y");
      const fold = scroller === null ? Number.NaN : scroller.getBoundingClientRect().top + scroller.clientHeight;
      const blocks = (column: Element | null): string =>
        [...(column?.children ?? [])]
          .map(
            (child) =>
              `${child.getAttribute("data-home-tile") ?? child.tagName.toLowerCase()}:${child.getBoundingClientRect().height.toFixed(0)}@${(child.getBoundingClientRect().bottom - fold).toFixed(0)}`,
          )
          .join(",");
      const grid = document.querySelector("[data-home-grid]");
      const shelf = `hearth=[${blocks(grid?.firstElementChild ?? null)}] shelf=[${blocks(document.querySelector("[data-home-shelf]"))}]`;
      return {
        shelf,
        reach: names.map((cta) => {
          const box = [...document.querySelectorAll("button")].find((el) => (el.textContent ?? "").includes(cta))?.getBoundingClientRect();
          return { cta, top: box === undefined ? Number.NaN : box.top - fold, bottom: box === undefined ? Number.NaN : box.bottom - fold };
        }),
      };
    },
    { names: [ADD_DOCUMENT_CTA, OPEN_DATABANK_CTA, TEMP_CHAT_CTA], pane: width - FOLD_RAIL_PX },
  );
}

test("#499 the databank empty state's CTAs clear the 1280x800 fold — and the shelf's other CTA still does", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // An EMPTY bank: no rows, a zero census. This is the arm the CTAs live on.
  await stubDatabank(
    page,
    {
      "chat.listChats": chatListResponder(FIRST_BOOT_ROOMS),
      "chat.reapTemporaryChats": { reaped: 0 },
      "character.list": characterListResponder(FIRST_BOOT_FACES),
      "settings.getUserSettings": { config: DEFAULT_USER_SETTINGS, schemaVersion: 1, updatedAt: 0, userId: "user_ct_fold" },
    },
    [],
  );

  const home = await mount(<HomeFoldStory />);
  // SETTLED, never "not busy": barrier on the rendered empty arm itself, so the matrix below cannot be
  // measured between two tiles' commits.
  await expect(home.getByText("No documents yet")).toBeVisible();
  await expect(home.getByRole("button", { name: ADD_DOCUMENT_CTA })).toBeVisible();
  await expect(home.locator("[aria-busy]")).toHaveCount(0);

  // SEQUENTIAL by construction: every cell re-sizes the same live pane, so the widths cannot be probed
  // concurrently (biome `performance/noAwaitInLoops` targets accidental serialization, which this is not).
  const cells = await FOLD_WIDTHS.reduce<Promise<{ width: number; cell: FoldCell }[]>>(async (pending, width) => {
    const done = await pending;
    done.push({ width, cell: await measureFoldReach(page, width) });
    return done;
  }, Promise.resolve([]));

  const matrix = cells.map(
    ({ width, cell }) =>
      `${String(width)}\t${cell.reach.map((row) => `${row.cta}=${row.top.toFixed(0)}..${row.bottom.toFixed(0)}`).join("\t")}\tshelf=[${cell.shelf}]`,
  );
  // Printed on PASS as well as fail — this table IS the issue's closing receipt.
  console.info(`\n#499 databank CTA fold reach (top..bottom px against the cut; negative = above it)\n${matrix.join("\n")}\n`);

  const below = cells.flatMap(({ width, cell }) =>
    cell.reach.filter((row) => !(row.top < 0)).map((row) => `${String(width)}: "${row.cta}" starts ${row.top.toFixed(0)}px past the fold`),
  );
  expect(below, below.join("\n")).toEqual([]);
});

// ── RED-FIRST (#455): the doorway group is a FOLD, collapsed by default ─────────────────────────────
// Owner ruling 2026-08-22: FOLD the roadmap block behind a disclosure, do not cut it. Four paragraphs of
// prose about things that do not exist yet sat below the fold at 1280×800, in the smallest voice on the
// page, above nothing — the least-read real estate carrying the most words (side-eye rail-home P2-1 +
// P3-6 + the taste verdict), on top of #226's open ~370px shelf residual.
//
// Both arms are pinned, and the CLOSED one is the load-bearing half: `CollapsiblePanel` UNMOUNTS its
// content while closed, so the shelf gets the height back instead of hiding it under a clip. A pin that
// only checked the trigger's presence would pass on a panel that renders the whole block behind
// `visibility: hidden` and buys the column nothing.
test("#455 the doorway group ships COLLAPSED — one control line, and the roadmap block is not in the DOM", async ({ mount, page }) => {
  const home = await mount(<HomeRegionStory />);

  const trigger = page.getByRole("button", { name: GROUP_LABEL });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  // The teaser line is ALL that is rendered: no doorway body, no title, no roadmap prose.
  await expect(home.locator('[data-home-tile="buddy"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
});

test("#455 opening the fold restores the block WHOLE — #457's h3 titles and ramped teasers intact", async ({ mount, page }) => {
  const home = await mount(<HomeRegionStory />);

  await page.getByRole("button", { name: GROUP_LABEL }).click();
  await expect(page.getByRole("button", { name: GROUP_LABEL })).toHaveAttribute("aria-expanded", "true");
  await expect(home.locator('[data-home-tile="buddy"]')).toBeVisible();
  // #457's work SURVIVES the fold rather than being folded away with it: real h3 titles, and the teaser
  // still on the `prose` length modifier (the ramp stop above bare micro), which is what P3-6 ruled.
  // (Automation's doorway retired with B3, so buddy is the one remaining h3 title.)
  await expect(page.getByRole("heading", { level: 3 })).toHaveText(["Buddy"]);
  const triggerSize = await page.getByRole("button", { name: GROUP_LABEL }).evaluate((el) => Number.parseFloat(globalThis.getComputedStyle(el).fontSize));
  // P3-6's actual defect: the explanatory paragraph rendered at the SAME step as the label above it.
  await expect
    .poll(async () => await home.getByText(TEASER_RE).evaluate((el) => Number.parseFloat(globalThis.getComputedStyle(el).fontSize)))
    .toBeGreaterThanOrEqual(triggerSize);
});

test("#455 the fold's trigger is a CONTROL, not a kicker — it clears the 24×24 target floor", async ({ mount, page }) => {
  // The ruling #482 landed on the params deck's `Advanced` (side-eye 2026-08-22 P2-4) applies to every
  // disclosure that IS a row of its own: `voice="kicker"` is the 10.5px section eyebrow and measured under
  // WCAG 2.5.8's floor on the one thing you can press. `size="control"` pins the primitive's own
  // pointer-conditional `--spacing-control-sm` row box.
  await mount(<HomeRegionStory />);

  const box = await page.getByRole("button", { name: GROUP_LABEL }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
});

test("a duplicate tile id THROWS at door construction — the seam never silently shadows a tile", () => {
  const dup: HomeTileContribution = { id: "same", title: "T", icon: Clock, body: () => null };
  expect(() => createContributorRegistry<HomeTileContribution>("home-tiles", [dup, { ...dup, title: "Other" }])).toThrow(DUPLICATE_ID_RE);
});
