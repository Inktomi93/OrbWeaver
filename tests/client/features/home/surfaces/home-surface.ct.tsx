// HomeSurface CT — the DOOR seam (home-section-spec §8.1): tiles arrive as a hand-built contributor
// registry of fakes and the REAL grid renders them. What this pins is the seam's contract, not pixels:
// the `(order, id)` sort, `useVisible:false` ⇒ NO DOM, the dormant arm's zero-control doorway, the
// zero-tile empty state, and the duplicate-id THROW at construction.

import { createContributorRegistry } from "@orb/client/lib";
import type { HomeTileContribution } from "@orb/client/state";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { Clock } from "@orb/ui/icons";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { pixelExtremaContrast } from "../../../../support/browser/pixel-contrast.ts";
import { trpcHold } from "../../../../support/node/route-trpc.ts";
import { characterListResponder, makeCharacterSummary } from "../../character/fixtures.ts";
// `CHAT_ROOM_ROUTES` is AMBIENT to every home mount in this file since #1126: the hearth tile warms the
// room it offers (`usePrefetchRoom` — `chat.getChat` leaves with the tile's mount, a human reaction time
// ahead of the Resume click), so the roster key is requested by any tree containing the recents tile. Fed
// at its honest empty default, never left to `routeTrpc`'s null, so the warm-up runs for real here instead
// of resolving a non-view. The map's `chat.listMessages` row rides along because the two are one feed —
// the owner ruled that read is NOT warmed, so nothing here requests it.
import { CHAT_ROOM_ROUTES, chatListResponder, makeChatSummary, makeSeatPortrait } from "../../chat/fixtures.ts";
import { READY_DOC, stubDatabank } from "../../databank/fixtures.ts";
import {
  HomeDormantTileStory,
  HomeEmptyStory,
  HomeFoldStory,
  HomeRegionStory,
  HomeRoadmapStory,
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

// ── THE DOORWAY GROUP'S BAND (#833) ────────────────────────────────────────────────────────────────
// The fold shipped as a bare sentence-case trigger — the ONE right-column block with no section voice
// beside six caps-kicker-over-hairline bands, which at 1920 lands it on the databank band's baseline
// reading as a third databank control. The band is back and HOSTS the trigger; #482's control ruling is
// untouched, so this pin asserts BOTH halves at once — a fix that regained the voice by dropping the tap
// floor, or by renaming the control, fails here.
/** WCAG 2.5.8 — the floor #482 minted `size="control"` for. Asserted RENDERED, never off a class. */
const TAP_FLOOR_PX = 24;

test("#833 the doorway fold wears the sibling band (kicker register + hairline) with #482's trigger intact", async ({ mount }) => {
  const home = await mount(<HomeRegionStory />);

  // EXACT, and computed rather than read off an attribute: the band's register is a `text-transform`,
  // and a substring/prefix matcher matches the very run-on (or re-case) it would be written to prevent.
  const trigger = home.getByRole("button", { exact: true, name: GROUP_LABEL });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  const box = await trigger.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(TAP_FLOOR_PX);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(TAP_FLOOR_PX);

  // The VOICE half: the trigger's visible label runs in the caps instrument register its sibling kickers
  // do — at the readable label step, which is what keeps the tap floor and the register compatible.
  const label = trigger.getByText(GROUP_LABEL, { exact: true });
  await expect(label).toHaveCSS("text-transform", "uppercase");

  // The RULE half: one hairline in the band, decorative exactly like every `TileBand` rule, and it is in
  // the BAND rather than inside the panel (which is unmounted while the fold is closed).
  const rule = home.locator(`section[aria-label="${GROUP_LABEL}"] [data-slot="separator"]`);
  await expect(rule).toHaveCount(1);
  await expect(rule).toHaveAttribute("aria-hidden", "true");
});

// ── WHAT THE REGION LISTS (#834) ───────────────────────────────────────────────────────────────────
// B3 retired automation's doorway and left this whole region delivering ONE dateless row, so the owner
// ruled its SUBJECT rather than its existence: it lists the committed-but-unrealized programs of
// `docs/architecture/proposed/INDEX.md` (FUTURE + PARTIAL), buddy among them. The tuple's parity with that
// table is a node test (`tests/client/features/home/lib/roadmap.test.ts`); what only a browser can say is
// that the curated list REACHES the surface — one named row each, in order, behind one press, with the
// count the band advertises equal to what opens.
/** The shipped set, in door order: buddy's 80 leads, then the roadmap tuple's own reading order. */
const ROADMAP_ROW_NAMES = ["Buddy", "RPG mode", "Expressions", "Reactions", "World state", "Agents of their own", "World maps"];

test("#834 the fold lists the committed roadmap — a derived count on the band, one named row per program", async ({ mount }) => {
  const home = await mount(<HomeRoadmapStory />);
  const region = home.locator(`section[aria-label="${GROUP_LABEL}"]`);

  // The count is the band's TRAILING chip and it is DERIVED — asserted against the rows that actually
  // open, so a tuple that grows while the chip does not (or the reverse) fails here rather than lying.
  //
  // RED-FIRST (side-eye HOME 2026-09-02 H10): the chip used to reach AT as a BARE "7" — `snap --aria`
  // rendered `button "What's coming"` and then an unattributed `text: "7"`, so a screen-reader user heard
  // "What's coming, collapsed… seven". The unit word is real text INSIDE the chip, screen-reader-only, so
  // the chip names itself. What it is NOT is the review's other suggestion — folding the count into the
  // trigger's accessible name — because #482 and #833 both ruled on that exact string, and the chip sits
  // outside the button precisely so nothing concatenates into it. The trigger assertion below is the
  // other half of this pin: the name is still EXACTLY the group's one name.
  await expect(region.locator('[data-slot="badge"]')).toHaveText(`${String(ROADMAP_ROW_NAMES.length)} items`);
  // …and the unit word costs the band NOTHING: it is clipped to the screen-reader box, so the chip still
  // paints the bare figure the mock draws in the trailing slot.
  await expect
    .poll(async () => await region.locator('[data-slot="badge"] [data-slot="text"]').evaluate((el) => el.getBoundingClientRect().width))
    .toBeLessThanOrEqual(1);
  // …and the chip is BESIDE the trigger, never inside it: the accessible name is still exactly the group's
  // one name, which is the string #482 and #833 both ruled on.
  const trigger = home.getByRole("button", { exact: true, name: GROUP_LABEL });
  await trigger.click();

  // EXACT names, in order — a heading each, which is how a heading-navigating reader steps the list.
  await expect(region.getByRole("heading", { level: 3 })).toHaveText(ROADMAP_ROW_NAMES);
  // Every row is a DOORWAY, not an IOU with a control on it: the opened panel offers nothing to press.
  await expect(region.locator('[data-slot="collapsible-panel"] button')).toHaveCount(0);
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
  await expect
    .poll(async () => trackCount(await home.locator("[data-home-grid]").evaluate((el) => globalThis.getComputedStyle(el).gridTemplateColumns)))
    .toBe(2);
});

test("the tile grid collapses to ONE column when its own pane is narrow", async ({ mount, page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  const home = await mount(<HomeTileOrderStory />);
  await expect
    .poll(async () => trackCount(await home.locator("[data-home-grid]").evaluate((el) => globalThis.getComputedStyle(el).gridTemplateColumns)))
    .toBe(1);
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
  await expect
    .poll(
      async () =>
        (
          await home.locator('[data-home-tile="a-first"]').evaluate((el) => {
            const style = globalThis.getComputedStyle(el);
            return { border: Number.parseFloat(style.borderTopWidth), radius: Number.parseFloat(style.borderTopLeftRadius), bg: style.backgroundColor };
          })
        ).border,
    )
    .toBe(0);
  await expect
    .poll(
      async () =>
        (
          await home.locator('[data-home-tile="a-first"]').evaluate((el) => {
            const style = globalThis.getComputedStyle(el);
            return { border: Number.parseFloat(style.borderTopWidth), radius: Number.parseFloat(style.borderTopLeftRadius), bg: style.backgroundColor };
          })
        ).radius,
    )
    .toBe(0);
  // `rgba(0, 0, 0, 0)` is the transparent-background computed form.
  await expect
    .poll(
      async () =>
        (
          await home.locator('[data-home-tile="a-first"]').evaluate((el) => {
            const style = globalThis.getComputedStyle(el);
            return { border: Number.parseFloat(style.borderTopWidth), radius: Number.parseFloat(style.borderTopLeftRadius), bg: style.backgroundColor };
          })
        ).bg,
    )
    .toBe("rgba(0, 0, 0, 0)");
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
  await expect
    .poll(async () =>
      (await home.locator("[data-home-grid]").evaluate((el) => globalThis.getComputedStyle(el).gridTemplateColumns))
        .trim()
        .split(WHITESPACE_RE)
        .map(Number.parseFloat),
    )
    .toHaveLength(2);
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
  await expect.poll(async () => trackCount(await foot.evaluate((el) => globalThis.getComputedStyle(el).gridTemplateColumns))).toBe(2);

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
  await expect
    .poll(async () => trackCount(await home.locator("[data-home-shelf-foot]").evaluate((el) => globalThis.getComputedStyle(el).gridTemplateColumns)))
    .toBe(1);
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

// ── RENDERED fidelity against the mock (docs/history/design/mocks/home-section/home.html) ───────────────────

test("a DORMANT doorway wears a DASHED RULE — not-built-yet, at a fraction of a dashed card's weight", async ({ mount }) => {
  // #102 moved the dashed edge from the tile's whole FRAME (a full dashed card, one per doorway) to a
  // single dashed rule down the doorway's inline start (the mockup's `.doorway`). Same signal, no box.
  const dormant = await mount(<HomeDormantTileStory />);
  await dormant.getByRole("button", { name: GROUP_LABEL }).click();
  await expect
    .poll(
      async () =>
        (
          await dormant.locator('[data-home-tile="dormant"]').evaluate((el) => {
            const s = globalThis.getComputedStyle(el);
            return { style: s.borderLeftStyle, width: s.borderLeftWidth, top: Number.parseFloat(s.borderTopWidth) };
          })
        ).style,
    )
    .toBe("dashed");
  // A dashed edge that resolved to 0 width would be invisible — the mock's rule is a real hairline.
  await expect
    .poll(async () =>
      Number.parseFloat(
        (
          await dormant.locator('[data-home-tile="dormant"]').evaluate((el) => {
            const s = globalThis.getComputedStyle(el);
            return { style: s.borderLeftStyle, width: s.borderLeftWidth, top: Number.parseFloat(s.borderTopWidth) };
          })
        ).width,
      ),
    )
    .toBeGreaterThan(0);
  // …and it is a RULE, not a frame: no box round the doorway.
  await expect
    .poll(
      async () =>
        (
          await dormant.locator('[data-home-tile="dormant"]').evaluate((el) => {
            const s = globalThis.getComputedStyle(el);
            return { style: s.borderLeftStyle, width: s.borderLeftWidth, top: Number.parseFloat(s.borderTopWidth) };
          })
        ).top,
    )
    .toBe(0);
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
  await expect
    .poll(
      async () =>
        (
          await tile.getByText(TEASER_RE).evaluate((el) => {
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
          })
        ).color,
    )
    .toBe(teaser.muted);
  await expect
    .poll(
      async () =>
        (
          await tile.getByText(TEASER_RE).evaluate((el) => {
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
          })
        ).color,
    )
    .not.toBe(teaser.foreground);
  await expect
    .poll(
      async () =>
        (
          await tile.getByText(REASON_RE).evaluate((el) => ({
            size: Number.parseFloat(globalThis.getComputedStyle(el).fontSize),
            family: globalThis.getComputedStyle(el).fontFamily,
            alpha: globalThis.getComputedStyle(el).opacity,
          }))
        ).size,
    )
    .toBeLessThanOrEqual(teaser.size);
  await expect
    .poll(async () =>
      (
        await tile.getByText(REASON_RE).evaluate((el) => ({
          size: Number.parseFloat(globalThis.getComputedStyle(el).fontSize),
          family: globalThis.getComputedStyle(el).fontFamily,
          alpha: globalThis.getComputedStyle(el).opacity,
        }))
      ).family.toLowerCase(),
    )
    .toContain("mono");
  // RED-FIRST (rail sweep P1-3): the state line carries NO alpha. `opacity-60` over the already-muted ink
  // measured **3.68:1** on the live surface — under the 4.5 floor — and the design-audit's own contrast
  // walker could not see it (it does not compose ancestor opacity, so it scored the line as opaque). The
  // mono face alone carries the separation now, which costs no contrast. This inverts the assertion that
  // used to stand here (`alpha < 1`), deliberately.
  await expect
    .poll(async () =>
      Number.parseFloat(
        (
          await tile.getByText(REASON_RE).evaluate((el) => ({
            size: Number.parseFloat(globalThis.getComputedStyle(el).fontSize),
            family: globalThis.getComputedStyle(el).fontFamily,
            alpha: globalThis.getComputedStyle(el).opacity,
          }))
        ).alpha,
      ),
    )
    .toBe(1);
});

// ── RED-FIRST (side-eye HOME 2026-09-02 H8 + H9): ONE VOICE NAME, ONE SPELLING ──────────────────────
// The doorway rendered TWO typographic spellings under ONE `data-voice="gloss"`, stacked 4px apart: the
// teaser at `Geist 13px/20px` and the state line at `"Geist Mono" 10.5px/13px`, the same colour. The
// voice grammar exists precisely so a role has one spelling, and the second spelling was only reachable
// by re-spelling `gloss` with a `font-mono` className at the call site. H9 is the same defect measured
// from the reader's side: a 95-character SENTENCE ("Partly built — the table runs; …") set at the 10.5px
// stamp step with a 13px line box.
// The state line carries its own RATIFIED voice now (`datumMono` — the muted mono readout at the code
// step). The rail-sweep P1-3 ruling it was set under is UNTOUCHED and is what this asserts: the
// separation between teaser and state is carried by the MONO FACE, which costs no contrast. Asserted
// through rendered attributes + computed type, so it compiles and fails against the old source.
test("H8/H9 the doorway's two lines are two NAMED voices at the readable step, separated by the face alone", async ({ mount }) => {
  const dormant = await mount(<HomeDormantTileStory />);
  await dormant.getByRole("button", { name: GROUP_LABEL }).click();
  const tile = dormant.locator('[data-home-tile="dormant"]');
  const readType = async (locator: Locator): Promise<{ family: string; size: number; voice: string | null }> =>
    await locator.evaluate((el) => ({
      family: globalThis.getComputedStyle(el).fontFamily.toLowerCase(),
      size: Number.parseFloat(globalThis.getComputedStyle(el).fontSize),
      voice: el.getAttribute("data-voice"),
    }));

  // ONE NAME, ONE SPELLING: the two lines no longer share a voice name.
  await expect.poll(async () => (await readType(tile.getByText(REASON_RE))).voice).not.toBe((await readType(tile.getByText(TEASER_RE))).voice);
  // …and both name a voice — a bare `null` here would mean a call site spelling type by className again.
  await expect.poll(async () => (await readType(tile.getByText(REASON_RE))).voice).not.toBeNull();
  // H9: the state line is a SENTENCE, so it reads at the same step as the teaser beside it, never two
  // steps below it. Compared against the teaser rather than a literal px, so the ramp owns the number.
  await expect.poll(async () => (await readType(tile.getByText(REASON_RE))).size).toBe((await readType(tile.getByText(TEASER_RE))).size);
  // The MONO FACE is what separates them (rail sweep P1-3) — that ruling survives the step change.
  await expect.poll(async () => (await readType(tile.getByText(REASON_RE))).family).toContain("mono");
  await expect.poll(async () => (await readType(tile.getByText(TEASER_RE))).family).not.toContain("mono");
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
    ...CHAT_ROOM_ROUTES,
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

// ── A READ-LESS TILE MUST NOT RESIZE WHILE ITS NEIGHBOURS SETTLE (#835) ─────────────────────────────
// `home.jump` reads nothing: its rows come from the section registry, a module-scope value the door hands
// down by context, so its box is decided at the first commit and has nothing to wait for. A live boot
// disagrees — the buffered layout-shift replay attributes 0.02208 to two movers, and one of them is this
// tile's own box growing `[88,773,686,27] → [88,683,686,92]` as the five reads land (2026-08-30, live
// :5173, reproduced on four localStorage arms). Whatever the mechanism turns out to be, the CONTRACT is
// the one this pins: a tile with no read of its own is not entitled to change size when a sibling's read
// resolves, and this fence is independent of every reservation number around it.
//
// IT IS A FENCE, NOT A DEFECT PROOF, AND THAT IS ITSELF THE FINDING. It passes against the unmodified
// tree: with every read held and released here the jump tile's box does not move by a pixel, so the live
// mover does NOT live in this surface's own code. Ruled out on the way to that: the remembered box (a
// boot-two seeded with the app's own bytes replays byte-identical shifts), web fonts (`fontCount` 0 — the
// app is on the system stack, so there is no swap to reflow the wrap), and a growing section registry
// (`createRegistry` is a module-scope array). Left standing so a future change cannot make the read-less
// tile data-dependent while the live mover is still unattributed.
/** Sub-pixel layout rounding between two `getBoundingClientRect` reads of the same unchanged box. */
const READ_LESS_TILE_EPSILON_PX = 1;

test("#835 the read-less jump tile keeps its own box across every neighbour's resolve", async ({ mount, page }) => {
  const chats = trpcHold();
  const characters = trpcHold();
  const settings = trpcHold();
  const documents = trpcHold();
  const health = trpcHold();
  await stubDatabank(page, {
    ...CHAT_ROOM_ROUTES,
    "chat.listChats": chats,
    "chat.reapTemporaryChats": { reaped: 0 },
    "character.list": characters,
    "databank.bankHealth": health,
    "databank.list": documents,
    "settings.getUserSettings": settings,
  });

  const home = await mount(<HomeShippedFirstBootStory />);
  await Promise.all([chats.requested, characters.requested, settings.requested, documents.requested, health.requested]);
  const jump = home.locator('[data-home-tile="home.jump"]');
  // Barrier on the tile's OWN rendered content, never on "the grid is up": its rows are what the fence is
  // about, so a measurement taken before the first pill paints would compare two different things.
  await expect(jump.getByRole("button", { name: "Go to Chats" })).toBeVisible();
  const held = (await jump.boundingBox())?.height ?? 0;

  chats.release(chatListResponder(FIRST_BOOT_ROOMS)({ limit: RECENTS_LIMIT }));
  characters.release(characterListResponder(FIRST_BOOT_FACES)({ limit: QUICK_PICKS_FACES }));
  settings.release({ config: DEFAULT_USER_SETTINGS, schemaVersion: 1, updatedAt: 0, userId: "user_ct_read_less" });
  documents.release(FIRST_BOOT_BANK);
  health.release(FIRST_BOOT_HEALTH);

  // SETTLED, not "no longer busy" — every held tile must have committed its content before the second read.
  await expect(home.locator('[data-home-hearth="chat_boot_0"]')).toBeVisible();
  await expect(home.getByRole("list", { name: "Character quick-picks" })).toBeVisible();
  await expect(home.getByText("Doc 0", { exact: true })).toBeVisible();
  await expect(home.locator("[aria-busy]")).toHaveCount(0);
  const settled = (await jump.boundingBox())?.height ?? 0;

  expect(Math.abs(settled - held)).toBeLessThanOrEqual(READ_LESS_TILE_EPSILON_PX);
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
    ...CHAT_ROOM_ROUTES,
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
  // Printed on PASS as well as fail — and it is the RE-MEASURE PROTOCOL's own instrument, not decoration.
  // Each of these tiles declares its box as a px constant (`HomeTileContribution.skeletonBlock`), and every
  // one of those constants' notes says "re-measure with the same probe if the cell anatomy changes". A bare
  // "moved 2px" tells the next reader the drift and not the two numbers, so the re-measure was a guess at
  // the delta rather than a reading of the settled box. These are the numbers to copy.
  console.info(
    `\n#177 first-boot reservation (declared box → settled box)\n${EXACTLY_RESERVED_TILES.map(
      (id, i) => `${id}\treserved ${(reserved[i] ?? 0).toFixed(2)}\tsettled ${(settled[i] ?? 0).toFixed(2)}\tdrift ${(drift[id] ?? 0).toFixed(2)}`,
    ).join("\n")}\n`,
  );
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
    ...CHAT_ROOM_ROUTES,
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
    ...CHAT_ROOM_ROUTES,
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
      ...CHAT_ROOM_ROUTES,
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

  // Every cell resizes the same live pane, so each width must settle before the next is probed.
  const cells: { width: number; cell: FoldCell }[] = [];
  for (const width of FOLD_WIDTHS) {
    cells.push({ width, cell: await measureFoldReach(page, width) });
  }

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

// ── #1128 · THE FOLD FADE PAINTED OVER LIVE CONTROLS (side-eye HOME 2026-09-02 H1) ──────────────────
// The block-axis fade that #455/P2-1 landed as the below-fold CUE was `--fade-edge-stop` (10%) deep — 75px
// of a 752px scroller — and it ramped to ZERO alpha. The databank empty state's two buttons sit at y
// 773..805 at the shipped 1280x800 default, i.e. 27px inside that band at ~36% alpha, and were measured
// LIVE at 1.75:1 while a button one block up read 17.14:1. A mask is paint, so the buttons stay fully
// hit-testable: a user can click a primary door they cannot read.
//
// WHY IT IS A PIXEL PIN AND WHY IT NEEDS `pixelExtremaContrast` RATHER THAN `pixelContrast`. Every
// contrast instrument we own resolves the subject through `getComputedStyle` — snap --contrast,
// design-audit's whole contrast family, axe, and `pixelContrast` itself (which composites ancestor
// OPACITY, a property a mask never touches). All of them report this control PASSING. Only the
// framebuffer sees it, so this reads the framebuffer: the two extreme pixels inside the control's own
// box. See the helper's header for why an upper bound is the honest question to ask of a gradient.
//
// ITS OWN POSITIVE CONTROL, in the same decode: `Start a temp chat` — the shelf's other peer-rank CTA,
// one block ABOVE the band — must read at the full ink ratio in every cell. Pre-fix it did (17.14:1)
// while the two subjects read 1.75:1, which is what proves the sampler honest rather than uniformly dim.
//
// A POINT MEASUREMENT NEVER PROVES A RANGE PROPERTY: the matrix is three viewports x both POLARITIES.
// The light arm is a `background`-derived scope (the whole surface/foreground ramp derives from it), and
// it is not decoration — the alpha a fade may bottom out at is polarity-dependent arithmetic, and the
// LIGHT arm is the demanding one (a 16.9:1 near-black-on-near-white pair needs alpha >= 0.60 to hold
// 4.5:1, against 0.48 for the dark arm's near-white-on-near-black).
const FADE_CELLS = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;
/** The desktop shell's own chrome, subtracted from the viewport to get home's real content box. */
const FADE_PANE_INSET = { inline: FOLD_RAIL_PX, block: 48 };
/** A light scope by DERIVATION, never a hand-listed palette — `background` grows the whole ramp. */
const LIGHT_SCOPE_BACKGROUND = "oklch(0.98 0.004 75)";
/** WCAG 1.4.3 normal text. The CTAs are 13px/500, so the large-text 3:1 relaxation does not apply. */
const FADE_INK_FLOOR = 4.5;
/** DIAGNOSTIC ONLY (it labels a printed row, it gates no assertion): the deepest block-axis band this
 *  recipe has ever resolved — the pre-fix `--fade-edge-stop` 10% of a 752px scroller. A control whose box
 *  reaches within this of the cut is reported `IN BAND` so the table says WHICH rows the fade could touch. */
const FADE_BAND_PROBE_PX = 80;

interface FadeCellReading {
  readonly cta: string;
  readonly ratio: number;
  readonly inBand: boolean;
  readonly describe: string;
}

/** Every control this cell must decode, measured against the scroller's own resolved fade band. */
async function readFadeCell(page: Page, home: Locator, names: readonly string[]): Promise<readonly FadeCellReading[]> {
  const band = await page.evaluate(() => {
    const scroller = document.querySelector(".scroll-fade-y");
    if (scroller === null) {
      return null;
    }
    const rect = scroller.getBoundingClientRect();
    return { bottom: rect.top + scroller.clientHeight, faded: scroller.hasAttribute("data-fade-bottom") };
  });
  if (band === null) {
    throw new Error("#1128: no .scroll-fade-y scroller — the fixture is not the surface under test");
  }
  const readings: FadeCellReading[] = [];
  for (const cta of names) {
    const target = home.getByRole("button", { name: cta });
    const box = await target.boundingBox();
    const receipt = await pixelExtremaContrast(page, target);
    readings.push({
      cta,
      ratio: receipt.ratio,
      // "Inside the band" is the FADED region only: an unfaded scroller paints no gradient at all.
      inBand: band.faded && box !== null && box.y + box.height > band.bottom - FADE_BAND_PROBE_PX,
      describe: receipt.describe,
    });
  }
  return readings;
}

for (const polarity of ["dark", "light"] as const) {
  test(`#1128 the fold fade never takes a live control below AA — ${polarity} polarity, the width matrix`, async ({ mount, page }) => {
    await page.setViewportSize({ width: FADE_CELLS[0].width, height: FADE_CELLS[0].height });
    await stubDatabank(
      page,
      {
        ...CHAT_ROOM_ROUTES,
        "chat.listChats": chatListResponder(FIRST_BOOT_ROOMS),
        "chat.reapTemporaryChats": { reaped: 0 },
        "character.list": characterListResponder(FIRST_BOOT_FACES),
        "settings.getUserSettings": { config: DEFAULT_USER_SETTINGS, schemaVersion: 1, updatedAt: 0, userId: "user_ct_fade" },
      },
      [],
    );

    // An EMPTY bank is the arm that renders the two CTAs at all — the first-run user's arm, and the one
    // the live receipt was taken on.
    const home = await mount(<HomeFoldStory />, polarity === "light" ? { hooksConfig: { theme: { background: LIGHT_SCOPE_BACKGROUND } } } : undefined);
    // SETTLED, never "not busy": the decode must not land between two tiles' commits.
    await expect(home.getByText("No documents yet")).toBeVisible();
    await expect(home.getByRole("button", { name: ADD_DOCUMENT_CTA })).toBeVisible();
    await expect(home.locator("[aria-busy]")).toHaveCount(0);

    // THE POLARITY IS PROVEN, NEVER ASSUMED. A "light arm" whose scope failed to invert is a SECOND DARK
    // ARM wearing a label — it would retire the demanding half of this matrix and read as coverage. The
    // engine resolves both tokens (oklch authored; a regex here would return nothing — memory
    // `oklch-kills-rgb-regex-probes`), and the arm asserts which of the pair is the lighter one.
    const polarityLuminance = await page.evaluate(() => {
      const scroller = document.querySelector(".scroll-fade-y");
      if (scroller === null) {
        return null;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      if (context === null) {
        return null;
      }
      const style = getComputedStyle(scroller);
      const read = (token: string): number => {
        context.fillStyle = style.getPropertyValue(token).trim();
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        const channel = (value: number): number => {
          const unit = value / 255;
          return unit <= 0.040_45 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r ?? 0) + 0.7152 * channel(g ?? 0) + 0.0722 * channel(b ?? 0);
      };
      return { background: read("--color-background"), foreground: read("--color-foreground") };
    });
    if (polarityLuminance === null) {
      throw new Error("#1128: could not resolve the surface's own polarity tokens");
    }
    const inverted = polarityLuminance.background > polarityLuminance.foreground;
    expect(inverted, `${polarity} arm resolved bg L=${polarityLuminance.background.toFixed(3)} fg L=${polarityLuminance.foreground.toFixed(3)}`).toBe(
      polarity === "light",
    );

    const rows: string[] = [];
    const failures: string[] = [];
    for (const cell of FADE_CELLS) {
      await page.setViewportSize({ width: cell.width, height: cell.height });
      await page.evaluate(
        ({ inline, block }) => {
          const pane = document.querySelector("[data-home-fold-pane]") as HTMLElement | null;
          pane?.style.setProperty("inline-size", `${String(inline)}px`);
          pane?.style.setProperty("block-size", `${String(block)}px`);
        },
        { inline: cell.width - FADE_PANE_INSET.inline, block: cell.height - FADE_PANE_INSET.block },
      );
      // The scroller re-syncs its fade attributes from a ResizeObserver, so the resize must land before
      // a pixel is read — poll the RENDERED state rather than sampling the frame the resize was queued in.
      await expect
        .poll(async () => await page.evaluate(() => document.querySelector(".scroll-fade-y")?.clientWidth ?? 0))
        .toBe(cell.width - FADE_PANE_INSET.inline);
      const readings = await readFadeCell(page, home, [ADD_DOCUMENT_CTA, OPEN_DATABANK_CTA, TEMP_CHAT_CTA]);
      for (const reading of readings) {
        rows.push(
          `${String(cell.width)}x${String(cell.height)}\t${polarity}\t${reading.cta}\t${reading.ratio.toFixed(2)}:1\t${reading.inBand ? "IN BAND" : "clear"}\t${reading.describe}`,
        );
        if (reading.ratio < FADE_INK_FLOOR) {
          failures.push(`${String(cell.width)}x${String(cell.height)} ${polarity}: "${reading.cta}" ${reading.ratio.toFixed(2)}:1 — ${reading.describe}`);
        }
      }
    }
    // Printed on PASS as well as fail — this table IS #1128's closing receipt, and the `clear` rows are
    // the positive control that says the sampler is reading ink and not a uniformly dimmed page.
    console.info(`\n#1128 fold-fade ink (framebuffer extrema inside each control's own box)\n${rows.join("\n")}\n`);
    expect(failures, failures.join("\n")).toEqual([]);
  });
}

// ── #1130 · THE TEACHING PROSE HAD NO MEASURE (side-eye HOME 2026-09-02 H5) ─────────────────────────
// ── #1145 · …AND THE MEASURE IT TOOK COULD NOT SATISFY THE LAW (owner ruling 2026-09-02) ───────────
// Two of home's three teaching paragraphs resolved `max-width: none` and took whatever their column gave
// them: the temp-chat gloss measured 76.7ch at 1280 and **153.2ch at 1920**, over twice the 65-75ch
// reading band, and the databank one was saved only by the 1920 sub-column split — a layout accident, not
// a measure. #1130 capped both at the house measure. That closed HALF the finding.
//
// THE OTHER HALF, AND WHY THIS PIN'S BAR MOVED. The two ways of counting a character disagree: CSS `ch`
// is the advance of the "0" glyph — measured 0.6625em in Geist — while the design law's "65-75 characters
// per line" is the typographic AVERAGE GLYPH ADVANCE, which across this app's own prose runs 0.4248em (the
// densest real copy is the temp-chat gloss THIS test measures) to 0.4629em (a pangram). One CSS ch is
// therefore 1.43-1.56 law-characters, `--reading-measure`'s 75ch reads 107-117 of them — the row this test
// prints at 1920 is exactly 117.0 — and NO paragraph capped at the house measure can meet the law at any
// font size. #1130's pin said exactly that and deliberately stopped, because closing it meant moving a
// token that every reading surface in the app takes — an owner call.
//
// THE OWNER TOOK IT (#1145, 2026-09-02): SPLIT, don't narrow. `--reading-measure` (75ch) stays the CHAT
// TRANSCRIPT's — dialogue is short attributed lines, not continuous body copy — and teaching/body prose
// moved to `--reading-measure-prose`. Its value is 47ch, not the ruling's estimated 48: at 48 the densest
// copy lands on 74.9, a tenth of a character under the ceiling, and 47ch = 31.14em = 67.3-73.3 law
// characters — inside the band at both ends, which is what a derived number owes.
// So the ruling #1130 recorded SURVIVES; its INPUT changed. The bar below is now the LAW's unit, not the
// token's: every paragraph carrying the prose measure must read ≤ 75 AVERAGE GLYPH ADVANCES, and the two
// teaching paragraphs must be on that measure rather than the transcript one. Both counts still print.
//
// WHAT IS DELIBERATELY NOT JUDGED HERE: the hearth hero's scent line. It is a two-line clamp of the last
// TRANSCRIPT message, and its cap is `--reading-measure-min` because that token is one half of a
// GEOMETRIC pair with the art-bleed band inset (#1121, the test directly below this one) — moving it
// would move the band, not just a line length. It is asserted capped, never asserted narrow.
const PROSE_WIDTHS = [1280, 1440, 1920] as const;
/** The design law's own ceiling (`.claude/skills/side-eye-design-review/SKILL.md` §2), in the law's own
 *  unit: AVERAGE GLYPH ADVANCES per line, not CSS `ch`. Never a px literal and never a token value —
 *  this is the number the prose token was derived to satisfy, so comparing against it is what proves the
 *  derivation rather than restating it. */
const LAW_CHARACTERS_PER_LINE = 75;
/** The two teaching paragraphs #1130 capped, keyed on their first words. A text key, not a `data-*` hook:
 *  the assertion is about the copy a reader actually meets, and inventing a test-only attribute to find it
 *  would let the paragraph move off the measure while the hook stayed put. */
const TEACHING_PROSE_PREFIXES = ["A room that never joins your chats list", "Upload a file, paste text, or pull in a page"] as const;

interface ProseReading {
  readonly text: string;
  readonly widthPx: number;
  readonly maxWidth: string;
  readonly cssCh: number;
  readonly advanceCh: number;
  /** `--reading-measure-prose` resolved to px INSIDE this paragraph — same inherited font, same `ch`. */
  readonly proseTokenPx: number;
  /** `--reading-measure` resolved the same way, so "which measure did it take" is a comparison, not a guess. */
  readonly houseTokenPx: number;
}

/** Every rendered paragraph on the surface, measured two ways in its OWN resolved font, against both
 *  measures resolved in that same font. The probes are absolutely positioned and removed before layout
 *  can see them, so nothing they touch perturbs the column they are planted in. */
function measureProse(page: Page, paneInline: number): Promise<readonly ProseReading[]> {
  return page.evaluate((pane) => {
    (document.querySelector("[data-home-fold-pane]") as HTMLElement | null)?.style.setProperty("inline-size", `${String(pane)}px`);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("#1130: no 2d context to measure glyph advance through");
    }
    const resolve = (host: HTMLElement, token: string): number => {
      const probe = document.createElement("div");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.width = `var(${token})`;
      host.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    };
    return [...document.querySelectorAll("p")].flatMap((paragraph) => {
      const text = (paragraph.textContent ?? "").replace(/\s+/gu, " ").trim();
      const box = paragraph.getBoundingClientRect();
      if (text.length < 40 || box.width === 0) {
        return [];
      }
      const style = getComputedStyle(paragraph);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const advance = context.measureText(text).width / text.length;
      const zero = context.measureText("0").width;
      return [
        {
          text: text.slice(0, 46),
          widthPx: box.width,
          maxWidth: style.maxWidth,
          cssCh: box.width / zero,
          advanceCh: box.width / advance,
          proseTokenPx: resolve(paragraph, "--reading-measure-prose"),
          houseTokenPx: resolve(paragraph, "--reading-measure"),
        },
      ];
    });
  }, paneInline);
}

/** Did this paragraph actually render AT the prose measure? Compared against the token resolved INSIDE the
 *  paragraph, so it answers at any font scale and names no px. */
function onProseMeasure(reading: ProseReading): boolean {
  return Math.abs(reading.widthPx - reading.proseTokenPx) <= 0.5 || Number.parseFloat(reading.maxWidth) === reading.proseTokenPx;
}

/** One paragraph, judged: the printed row plus every complaint it earns. Lifted out of the width loop so
 *  the test body stays a walk over widths rather than a nest of conditions. */
function judgeProse(
  width: number,
  reading: ProseReading,
): { readonly row: string; readonly uncapped: readonly string[]; readonly wrongMeasure: readonly string[]; readonly overrun: readonly string[] } {
  const at = onProseMeasure(reading);
  const row = `${String(width)}\t${reading.widthPx.toFixed(0)}px\tcss ${reading.cssCh.toFixed(1)}ch\tlaw ${reading.advanceCh.toFixed(1)}\tmax-width ${reading.maxWidth}\t${at ? "PROSE" : "other"}\t"${reading.text}"`;
  // THE RE-POINT (#1145). A teaching paragraph must resolve the PROSE token in its own font.
  const isTeaching = TEACHING_PROSE_PREFIXES.some((prefix) => reading.text.startsWith(prefix));
  const wrongMeasure =
    isTeaching && Number.parseFloat(reading.maxWidth) > reading.proseTokenPx + 0.5
      ? [
          `${String(width)}: "${reading.text}" caps at ${reading.maxWidth} — the prose measure resolves to ${reading.proseTokenPx.toFixed(1)}px here (the transcript measure is ${reading.houseTokenPx.toFixed(1)}px)`,
        ]
      : [];
  // THE LAW (#1145). Anything rendering AT the prose measure must be inside the band the measure was
  // derived to hit — the derivation, re-proved at every width instead of trusted.
  const overrun =
    at && reading.advanceCh > LAW_CHARACTERS_PER_LINE
      ? [`${String(width)}: "${reading.text}" reads ${reading.advanceCh.toFixed(1)} characters — the law's ceiling is ${String(LAW_CHARACTERS_PER_LINE)}`]
      : [];
  return { overrun, row, uncapped: reading.maxWidth === "none" ? [`${String(width)}: "${reading.text}" has max-width: none`] : [], wrongMeasure };
}

test("#1145 the teaching paragraphs take the PROSE measure, and it reads inside the law's 65-75 band at every width", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await stubDatabank(
    page,
    {
      ...CHAT_ROOM_ROUTES,
      "chat.listChats": chatListResponder(FIRST_BOOT_ROOMS),
      "chat.reapTemporaryChats": { reaped: 0 },
      "character.list": characterListResponder(FIRST_BOOT_FACES),
      "settings.getUserSettings": { config: DEFAULT_USER_SETTINGS, schemaVersion: 1, updatedAt: 0, userId: "user_ct_measure" },
    },
    [],
  );

  const home = await mount(<HomeFoldStory />);
  await expect(home.getByText("No documents yet")).toBeVisible();
  await expect(home.getByRole("button", { name: TEMP_CHAT_CTA })).toBeVisible();
  await expect(home.locator("[aria-busy]")).toHaveCount(0);

  const rows: string[] = [];
  const uncapped: string[] = [];
  const wrongMeasure: string[] = [];
  const overrun: string[] = [];
  for (const width of PROSE_WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    const readings = await measureProse(page, width - FOLD_RAIL_PX);
    expect(readings.length, `#1130: no paragraphs found at ${String(width)} — the fixture is not the surface`).toBeGreaterThan(0);
    for (const reading of readings) {
      const verdict = judgeProse(width, reading);
      rows.push(verdict.row);
      uncapped.push(...verdict.uncapped);
      wrongMeasure.push(...verdict.wrongMeasure);
      overrun.push(...verdict.overrun);
    }
  }
  // Printed on PASS: `law` is the design law's unit and `css` is the token's. The gap between them is the
  // whole of #1145, and printing both is what stops the next lane re-deriving it from a symptom.
  console.info(`\n#1145 home teaching prose (law ceiling = ${String(LAW_CHARACTERS_PER_LINE)} average glyph advances, per element)\n${rows.join("\n")}\n`);
  expect(uncapped, uncapped.join("\n")).toEqual([]);
  expect(wrongMeasure, wrongMeasure.join("\n")).toEqual([]);
  expect(overrun, overrun.join("\n")).toEqual([]);
});

// THE APPEARANCE ARM (#1145). The whole point of stating the measure in `ch` rather than px is that a
// reader who scales the type keeps the same LINE, not the same width — `--font-scale` re-sizes the root
// and the paragraph's `ch` re-resolves with it. This is the arm that would catch someone "fixing" the
// token into a px or rem literal: a px cap would hold its width and the law-character count would balloon
// with the type. `reading` is the shipped preset's own fontScale (tooling/src/_shared/appearance-presets.json
// -> presets.reading.fontScale = 1.25); `compact` is a DENSITY arm, spacing-only by construction
// (tiers.css re-points four spacing vars and no type step), so its law count must not move either.
/** The tolerance the `ch` unit itself carries, MEASURED: Chromium resolves `ch` from an INTEGER-rounded
 *  zero advance — 13.59px type gives 9.0px (0.6625em = 9.005) and 16.99px type gives 11.0px (11.256
 *  rounded DOWN), so one `ch` is worth ~2% less at the larger step while the glyph advances scale exactly.
 *  The measure therefore reads 73.3 law-characters at scale 1 and 71.8 at the `reading` preset's 1.25 —
 *  a property of the unit, moving the SAFE way (shorter). A px or rem literal would send the same number
 *  to ~91, an 18-character jump this tolerance cannot absorb. */
const CH_QUANTIZATION_SLACK = 2.5;

/** The token's own length in law-characters at this paragraph's type. `advanceCh / widthPx` is one
 *  law-character in px in that font, so this names no font size and no px literal. */
function measureLawLength(reading: ProseReading): number {
  return (reading.proseTokenPx * reading.advanceCh) / reading.widthPx;
}

/** One complaint, or none, so the arm loop stays a walk rather than a nest of `if`s. */
function overLaw(what: string, characters: number): readonly string[] {
  return characters > LAW_CHARACTERS_PER_LINE ? [`${what} ${characters.toFixed(1)} characters — the law's ceiling is ${String(LAW_CHARACTERS_PER_LINE)}`] : [];
}

const APPEARANCE_ARMS = [
  { name: "defaults", fontScale: 1, density: "comfortable" },
  { name: "reading", fontScale: 1.25, density: "comfortable" },
  { name: "compact", fontScale: 1, density: "compact" },
] as const;

test("#1145 the prose measure is a LINE, not a width — font scale moves its px and never its character count", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stubDatabank(
    page,
    {
      ...CHAT_ROOM_ROUTES,
      "chat.listChats": chatListResponder(FIRST_BOOT_ROOMS),
      "chat.reapTemporaryChats": { reaped: 0 },
      "character.list": characterListResponder(FIRST_BOOT_FACES),
      "settings.getUserSettings": { config: DEFAULT_USER_SETTINGS, schemaVersion: 1, updatedAt: 0, userId: "user_ct_measure" },
    },
    [],
  );

  const home = await mount(<HomeFoldStory />);
  await expect(home.getByText("No documents yet")).toBeVisible();
  await expect(home.getByRole("button", { name: TEMP_CHAT_CTA })).toBeVisible();
  await expect(home.locator("[aria-busy]")).toHaveCount(0);

  const rows: string[] = [];
  const failures: string[] = [];
  /** The MEASURE's own resolved width per arm, and the MEASURE's own length in law-characters. Judged on
   *  the token rather than on the rendered box on purpose: at the `reading` scale everything else scales
   *  too, so the hearth column becomes narrower than the cap and the paragraph is column-bound (495.7px
   *  against a 529px cap). A box-based assertion would then be measuring the COLUMN and calling it the
   *  measure. The rendered box still gets the law ceiling below — that arm is unconditional. */
  const tokenPxByArm = new Map<string, number>();
  const tokenLawByArm = new Map<string, number>();
  for (const arm of APPEARANCE_ARMS) {
    await page.evaluate(
      ({ fontScale, density }) => {
        document.documentElement.style.setProperty("--font-scale", String(fontScale));
        for (const scope of document.querySelectorAll("[data-density]")) {
          scope.setAttribute("data-density", density);
        }
      },
      { fontScale: arm.fontScale, density: arm.density },
    );
    const readings = (await measureProse(page, 1440 - FOLD_RAIL_PX)).filter((reading) =>
      TEACHING_PROSE_PREFIXES.some((prefix) => reading.text.startsWith(prefix)),
    );
    expect(readings.length, `#1145: the teaching paragraphs vanished under the ${arm.name} arm`).toBeGreaterThan(0);
    for (const reading of readings) {
      const tokenLaw = measureLawLength(reading);
      rows.push(
        `${arm.name}\tscale ${String(arm.fontScale)}\tbox ${reading.widthPx.toFixed(1)}px (law ${reading.advanceCh.toFixed(1)})\tmeasure ${reading.proseTokenPx.toFixed(1)}px (law ${tokenLaw.toFixed(1)})\t"${reading.text}"`,
      );
      failures.push(...overLaw(`${arm.name}: "${reading.text}" reads`, reading.advanceCh));
      failures.push(...overLaw(`${arm.name}: the prose measure at "${reading.text}"'s type is`, tokenLaw));
    }
    const first = readings[0];
    if (first !== undefined) {
      tokenPxByArm.set(arm.name, first.proseTokenPx);
      tokenLawByArm.set(arm.name, measureLawLength(first));
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.removeProperty("--font-scale");
  });

  console.info(`\n#1145 appearance arms (law ceiling = ${String(LAW_CHARACTERS_PER_LINE)})\n${rows.join("\n")}\n`);
  expect(failures, failures.join("\n")).toEqual([]);
  const basePx = tokenPxByArm.get("defaults") ?? 0;
  const readingPx = tokenPxByArm.get("reading") ?? 0;
  const baseLaw = tokenLawByArm.get("defaults") ?? 0;
  // The measure's PX moved with the type — that is the half a px or rem literal would break.
  expect(readingPx, `the reading preset scaled the type but the measure stayed ${basePx.toFixed(1)}px — it is not in ch`).toBeGreaterThan(basePx * 1.1);
  // …and its LINE stayed put, to within the quantization the unit itself carries (CH_QUANTIZATION_SLACK
  // above states the measurement behind that number).
  expect(Math.abs((tokenLawByArm.get("reading") ?? 0) - baseLaw), `the reading preset moved the measure's LINE, not just its px`).toBeLessThanOrEqual(
    CH_QUANTIZATION_SLACK,
  );
  // Compact is a spacing tier, not a type tier (tiers.css re-points four spacing vars and no type step):
  // same type, same `ch`, same line — this one IS an equality.
  expect(tokenLawByArm.get("compact") ?? 0).toBeCloseTo(baseLaw, 0);
});

// ── #1121 · THE HERO'S ART BAND WAS A RESIDUAL OF THE WRONG MEASURE (H7) ───────────────────────────
// `@orb/ui/art-bleed`'s geometry is a RESIDUAL: the band starts one reading measure plus a padding
// clearance in from the host's start, and the host is the hero card. At `--reading-measure` (75ch) that
// start landed past the hero's own end edge at every width anyone runs — the live measurement was
// `[773, 175, 0, 132]` at 1280 (zero) and a 33px face-slice at 1920, so #205's owner ruling ("the hero
// gets its room's art") effectively never fired. Both halves of the pair now name `--reading-measure-min`
// (65ch): the band's start AND the hero column's own cap, which keeps the no-ink-over-art guarantee
// byte-for-byte and hands the accent 42px at 1440 and 143px at 1920 (this fixture; 35px before).
//
// AND THE 1280 ARM IS A MEASURED REFUSAL, NOT A GAP — it is pinned here so nobody re-opens it by eye.
// At 1280 the hero card is 686px wide while `--reading-measure-min` resolves to 715px in the card's own
// type: the HOST IS ALREADY NARROWER THAN THE DESIGN LAW'S MINIMUM READING MEASURE. Any band at that
// width is width taken from prose that is already under the floor, so the recipe's own "a narrow surface
// gets no band, by construction" clause is not a shortfall there — it is the law being obeyed. The
// alternative (cap the hero's prose at ~54ch to reserve an art strip) was measured and refused: it puts
// the one paragraph the surface exists to show below `--reading-measure-min`.
//
// IT IS A PAIR, SO THIS PIN IS A PAIR: a band exactly where the host can afford one, none where it
// cannot, and no ink inside it at ANY width. Asserting only the first would ratify a band that eats the
// prose, which is the exact trade the guarantee forbids; asserting only a lower bound would let the
// residual drift back to zero everywhere and still read green.
/** The hash is the point: a seat WITHOUT one gives the hero nothing to bleed, and every assertion below
 *  would pass vacuously against a room that simply has no art. */
const HERO_SEAT = makeSeatPortrait("char_hearth", "Wren", "hash_hearth_portrait");
const ART_ROOMS = [
  makeChatSummary({
    id: "chat_hearth_art",
    lastMessageAt: 1_750_000_000_000,
    participantCharacterIds: ["char_hearth"],
    participantNames: ["Wren"],
    participantPortraits: [HERO_SEAT],
    title: "The Ashen Spire",
    updatedAt: 1_750_000_000_000,
  }),
  ...FIRST_BOOT_ROOMS.slice(1),
];

test("#1121 the hero's art band exists wherever the host can afford one — and holds no ink at any width", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await stubDatabank(
    page,
    {
      ...CHAT_ROOM_ROUTES,
      "chat.listChats": chatListResponder(ART_ROOMS),
      "chat.reapTemporaryChats": { reaped: 0 },
      "character.list": characterListResponder(FIRST_BOOT_FACES),
      "settings.getUserSettings": { config: DEFAULT_USER_SETTINGS, schemaVersion: 1, updatedAt: 0, userId: "user_ct_bleed" },
    },
    [],
  );

  const home = await mount(<HomeFoldStory />);
  await expect(home.locator('[data-slot="art-bleed"]')).toBeAttached();
  await expect(home.locator("[aria-busy]")).toHaveCount(0);

  const rows: string[] = [];
  const absent: string[] = [];
  const overlapping: string[] = [];
  for (const width of PROSE_WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    const cell = await page.evaluate((pane) => {
      (document.querySelector("[data-home-fold-pane]") as HTMLElement | null)?.style.setProperty("inline-size", `${String(pane)}px`);
      const island = document.querySelector("[data-home-hearth]");
      const band = island?.querySelector('[data-slot="art-bleed"]')?.getBoundingClientRect();
      const inks = [...(island?.querySelectorAll("span,p") ?? [])]
        .map((el) => ({ text: (el.textContent ?? "").trim().slice(0, 24), right: el.getBoundingClientRect().right }))
        .filter((ink) => ink.text.length > 0);
      const worst = inks.reduce((max, ink) => (ink.right > max.right ? ink : max), { text: "", right: 0 });
      const islandBox = island?.getBoundingClientRect();
      // The measure resolved in the BAND's own font, which is the only place the recipe's `ch` means
      // anything — a literal here would lie the moment `--font-scale` moved.
      const probe = document.createElement("div");
      probe.style.inlineSize = "var(--reading-measure-min)";
      (island ?? document.body).append(probe);
      const measure = probe.getBoundingClientRect().width;
      probe.remove();
      return { left: band?.left ?? 0, width: band?.width ?? 0, height: band?.height ?? 0, worst, island: islandBox?.width ?? 0, measure };
    }, width - FOLD_RAIL_PX);
    rows.push(
      `${String(width)}\tband ${cell.width.toFixed(0)}x${cell.height.toFixed(0)} @ x=${cell.left.toFixed(0)}\tisland ${cell.island.toFixed(0)}px\tmeasure-min ${cell.measure.toFixed(0)}px\tworst ink right=${cell.worst.right.toFixed(0)} "${cell.worst.text}"`,
    );
    // WHICH SIDE OF THE MEASURE the host sits on decides whether a band is owed at all — so this is a
    // biconditional, not a floor: a host wider than the minimum measure MUST paint one, a host narrower
    // than it MUST NOT.
    const affordsBand = cell.island > cell.measure;
    if (affordsBand && cell.width < 1) {
      absent.push(
        `${String(width)}: island ${cell.island.toFixed(0)}px clears the ${cell.measure.toFixed(0)}px measure, so a band is owed — it is ${cell.width.toFixed(1)}px`,
      );
    }
    if (!affordsBand && cell.width > 0) {
      absent.push(
        `${String(width)}: island ${cell.island.toFixed(0)}px is under the ${cell.measure.toFixed(0)}px minimum measure, so the band must be ZERO — it is ${cell.width.toFixed(1)}px`,
      );
    }
    // Sub-pixel tolerance only: the trailing hint ends AT the measure, which is the band's own start.
    if (cell.worst.right > cell.left + 1) {
      overlapping.push(`${String(width)}: "${cell.worst.text}" runs ${(cell.worst.right - cell.left).toFixed(1)}px into the art band`);
    }
  }
  console.info(`\n#1121 hero art bleed at the shipped widths\n${rows.join("\n")}\n`);
  expect(absent, absent.join("\n")).toEqual([]);
  expect(overlapping, overlapping.join("\n")).toEqual([]);
});

// ── #1130 · THE CHIP RAIL'S WRAP IS NOT A LAYOUT CHOICE (side-eye HOME 2026-09-02 H16) ──────────────
// H16 asked for "no orphan chip at 1280 / 1440 / 1920". That is REFUSED, and this pin is the refusal's
// receipt rather than its fix. `SectionJumpRail` derives its pills FROM THE SECTION REGISTRY (a section
// that ships gets a pill with no home edit — the `no-parallel-section-map` rule), so N is whatever the app
// has sections; the pills are content-width; and "the last row is never an orphan" is not a property a
// wrap layout can hold for an unknown N against three column widths. The only construction that holds it
// is a fixed-column grid, which reverses the recorded register the rail was built on: "a wrapping row of
// destinations — a rail you skim, not a directory you read" (section-jump-rail.tsx). The owner decides
// against numbers, so the numbers are printed here on every run.
//
// WHAT IS ASSERTED is the property the wrap must never be allowed to eat: the POPULATION is
// width-invariant. A narrow pane may re-wrap the rail; it may not drop a destination. That is the real
// regression this row can own, and it is the same fact that makes the orphan undesignable — the row is a
// projection of the registry, not a layout with a chosen cell count.
//
// The other two things H6 filed at 1920 are deliberately NOT re-asserted here, and the reason is the
// trap this file could otherwise walk into. COLUMN BALANCE is #226's, ruled ("no shell game — self-balance
// by construction") and pinned on its OWN fixture by `home-column-balance.suite.ct.tsx`; a second
// ceiling measured on THIS fixture would be a second oracle for one property, and the two disagree by
// construction because the fixtures carry different content mixes (measured: 51px apart at 1280/1440 and
// 221px at 1920 here, against the balance instrument's 11px at 1920 — same law, different page). WHICH
// BLOCK LANDS IN WHICH QUADRANT is a composition decision whose two costed arms are already recorded as
// measured-and-refused in `home-surface.tsx`'s own header. Both are printed, neither is judged.

test("#1130 the jump rail's population is width-invariant — the wrap re-flows, the destinations do not", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await stubDatabank(
    page,
    {
      ...CHAT_ROOM_ROUTES,
      "chat.listChats": chatListResponder(FIRST_BOOT_ROOMS),
      "chat.reapTemporaryChats": { reaped: 0 },
      "character.list": characterListResponder(FIRST_BOOT_FACES),
      "settings.getUserSettings": { config: DEFAULT_USER_SETTINGS, schemaVersion: 1, updatedAt: 0, userId: "user_ct_wide" },
    },
    [],
  );

  const home = await mount(<HomeFoldStory />);
  await expect(home.getByText("No documents yet")).toBeVisible();
  await expect(home.getByRole("list", { name: "Character quick-picks" })).toBeVisible();
  await expect(home.locator("[aria-busy]")).toHaveCount(0);

  const rows: string[] = [];
  const populations: number[] = [];
  for (const width of PROSE_WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    const cell = await page.evaluate((pane) => {
      (document.querySelector("[data-home-fold-pane]") as HTMLElement | null)?.style.setProperty("inline-size", `${String(pane)}px`);
      const grid = document.querySelector("[data-home-grid]");
      const hearth = grid?.firstElementChild?.getBoundingClientRect();
      const shelf = document.querySelector("[data-home-shelf]")?.getBoundingClientRect();
      // The wrap, counted by DISTINCT ROW TOPS — the only honest reading of a flex-wrap row.
      const chips = [...(document.querySelector('[data-home-tile="home.jump"]')?.querySelectorAll("button") ?? [])].map((chip) =>
        Math.round(chip.getBoundingClientRect().top),
      );
      const perRow = [...new Set(chips)].sort((a, b) => a - b).map((top) => chips.filter((chipTop) => chipTop === top).length);
      // Which quadrant of the PANE each region's own box centres in — H6's "alone in a quadrant" read.
      const paneBox = document.querySelector("[data-home-fold-pane]")?.getBoundingClientRect();
      const quadrants = [...(grid?.querySelectorAll('[role="region"]') ?? [])].map((region) => {
        const box = region.getBoundingClientRect();
        const centre = { x: box.left + box.width / 2 - (paneBox?.left ?? 0), y: box.top + box.height / 2 - (paneBox?.top ?? 0) };
        const half = { x: (paneBox?.width ?? 1) / 2, y: (paneBox?.height ?? 1) / 2 };
        return `${centre.y < half.y ? "top" : "bottom"}-${centre.x < half.x ? "left" : "right"}`;
      });
      const tally = quadrants.reduce<Record<string, number>>((acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }), {});
      return { hearthBottom: hearth?.bottom ?? 0, shelfBottom: shelf?.bottom ?? 0, chips: chips.length, perRow, tally };
    }, width - FOLD_RAIL_PX);
    populations.push(cell.chips);
    rows.push(
      `${String(width)}\tchips ${String(cell.chips)} as ${cell.perRow.join("+")}\thearth ends ${cell.hearthBottom.toFixed(0)}\tshelf ends ${cell.shelfBottom.toFixed(0)}\tdelta ${Math.abs(cell.hearthBottom - cell.shelfBottom).toFixed(0)}px\tregions ${JSON.stringify(cell.tally)}`,
    );
  }
  console.info(`\n#1130 wide-pane composition (chips = pills, then pills per wrapped row; regions = per-quadrant count)\n${rows.join("\n")}\n`);
  expect(populations.at(0) ?? 0, "the rail must render at least two destinations, or the invariance below is vacuous").toBeGreaterThan(1);
  expect(new Set(populations).size, `the rail dropped destinations across widths: ${populations.join(", ")}`).toBe(1);
});
