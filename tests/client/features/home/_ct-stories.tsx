// Home CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The whole point of
// the home section is the DOOR seam, so these stories hand-build a `home-tiles` contributor registry of
// FAKES and drive the REAL `HomeSurface` — proving order, `useVisible` gating, the dormant arm, and the
// zero-tile empty state against the shipped grid, not a bespoke double.

import { SkeletonRows } from "@orb/client/data";
import { chatAlsoOpenTile, chatMastheadTile, chatQuickPicksTile, chatRecentsTile, chatTempChatTile } from "@orb/client/features/chat";
import { databankDocumentsTile } from "@orb/client/features/databank";
import { buddyDormantTile, HomeSurface, homeRoadmapTiles, makeSectionJumpTile } from "@orb/client/features/home";
import { createContributorRegistry } from "@orb/client/lib";
import type { HomeTileContribution } from "@orb/client/state";
import { rememberSurfaceBox, useActiveSection } from "@orb/client/state";
import { Button } from "@orb/ui/button";
import { BrainCircuit, Clock, MessagesSquare } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { use } from "react";
import { CtDataProviders, CtRealSectionRegistry } from "../../../support/browser/ct-data-providers.tsx";
import { FIRST_BOOT_SKELETON_ROWS, RESERVED_TILE_PX } from "./_reserve-box.ts";

/** Deliberately declared OUT of `order` — the grid must re-sort them (order asc, then id). They declare
 *  NO `region`, so all three land in the default one (the shelf) and DOM order is (order, id) with no
 *  column split in between — the split has its own story below. */
const FAKE_TILES: readonly HomeTileContribution[] = [
  { id: "z-third", title: "Third tile", icon: Clock, order: 30, body: () => <Text>third body</Text> },
  { id: "a-first", title: "First tile", icon: MessagesSquare, order: 10, body: () => <Text>first body</Text> },
  { id: "b-second", title: "Second tile", icon: BrainCircuit, order: 20, body: () => <Text>second body</Text> },
];

/** A tile whose LIVE capability gate is false — it must render NOTHING (no gap, no empty card). */
const HIDDEN_TILE: HomeTileContribution = {
  id: "hidden",
  title: "Hidden tile",
  icon: Clock,
  order: 5,
  useVisible: () => false,
  body: () => <Text>hidden body</Text>,
};

/** The DORMANT doorway arm — a real registered tile whose body is `{dormant:{reason,teaser}}`. */
const DORMANT_TILE: HomeTileContribution = {
  id: "dormant",
  title: "Buddy",
  icon: BrainCircuit,
  order: 80,
  body: {
    dormant: {
      reason: "Not started yet, and there is no date to promise.",
      teaser: "Your companion — the agent-role connection that reacts to what you and your characters do.",
    },
  },
};

function Story({ tiles }: { readonly tiles: readonly HomeTileContribution[] }): ReactElement {
  return (
    <CtDataProviders>
      <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", tiles)} />
    </CtDataProviders>
  );
}

/** Three fakes, declared out of order — the grid renders them in `(order, id)`. */
export function HomeTileOrderStory(): ReactElement {
  return <Story tiles={FAKE_TILES} />;
}

/** A `useVisible:()=>false` tile beside two real ones — the hidden one contributes no DOM at all. */
export function HomeTileVisibilityStory(): ReactElement {
  return <Story tiles={[HIDDEN_TILE, ...FAKE_TILES]} />;
}

/** The dormant doorway in isolation — teaser + Dormant badge + reason, and ZERO interactive elements. */
export function HomeDormantTileStory(): ReactElement {
  return <Story tiles={[DORMANT_TILE]} />;
}

/** ZERO contributions — the designed empty state, never a blank grid (the M8 posture). */
export function HomeEmptyStory(): ReactElement {
  return <Story tiles={[]} />;
}

/** The REAL home-owned jump tile over the REAL section registry — its rows must BE the registry, MINUS any
 *  section a sibling tile subsumes (`sectionId`). Mounted with NO siblings, so nothing is claimed and every
 *  non-home section keeps its row; the claim itself is pinned by the databank tile's own CT, which mounts
 *  the jump grid beside the tile that makes the claim. The `<output>` publishes the shell store's active
 *  section so a row click asserts the STORE ACTION fired, never a rendered echo. */
export function HomeSectionJumpStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <ActiveSectionProbe />
        <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", [makeSectionJumpTile([])])} />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

function ActiveSectionProbe(): ReactElement {
  return <output>section={useActiveSection()}</output>;
}

/** The REAL registered doorway (buddy — automation's retired with B3) — the shipped tile, not a fake: proof
 *  the DORMANT arm survives the round trip through the door and the frame. Buddy ALONE, deliberately: the
 *  tile's own contract is what this story serves, and the roadmap set has its own story below. */
export function HomeRealDoorwaysStory(): ReactElement {
  return <Story tiles={[buddyDormantTile]} />;
}

/** THE SHIPPED "What's coming" SET (#834) — buddy plus the roadmap tuple, exactly as the door assembles
 *  them, so the region's rendered contents ARE the curated list rather than a story's own invention. */
export function HomeRoadmapStory(): ReactElement {
  return <Story tiles={[buddyDormantTile, ...homeRoadmapTiles]} />;
}

// ── The THREE REGIONS (#102, the Hearth Room) ───────────────────────────────────────────────────────
// `region` replaced `span`: a tile declares WHICH COLUMN it lands in, home holds no list of who goes
// where. This exercises all three at once plus the grouped doorways, which is the whole surface anatomy.

const REGION_TILES: readonly HomeTileContribution[] = [
  { id: "top", title: "Masthead tile", icon: Clock, order: 0, region: "masthead", body: () => <Text>masthead body</Text> },
  { id: "lead", title: "Hearth tile", icon: MessagesSquare, order: 10, region: "hearth", body: () => <Text>hearth body</Text> },
  { id: "rail", title: "Shelf tile", icon: BrainCircuit, order: 20, region: "shelf", body: () => <Text>shelf body</Text> },
  // No `region` at all — the DEFAULT, which must be the shelf (never a silent promotion into the hearth).
  { id: "unplaced", title: "Unplaced tile", icon: Clock, order: 30, body: () => <Text>unplaced body</Text> },
  buddyDormantTile,
];

/** All three regions + the real doorway: the masthead above the split, one tile per column, the
 *  unplaced tile defaulting to the shelf, and the (now single) doorway collected under ONE fold (#455 —
 *  automation's doorway retired with B3). */
export function HomeRegionStory(): ReactElement {
  return <Story tiles={REGION_TILES} />;
}

// ── The SPLIT UNDER PRESSURE (#102 review P1-1) ─────────────────────────────────────────────────────
// The declared 1.55fr/1fr only means anything if the tracks may shrink BELOW their content. A grid track
// child is `min-width:auto`, so the shipped hearth was floored at the hero's ~743px min-content and
// rendered 1.92/1 at the 1280px pane — the shelf lost a whole face column and the page grew ~200px. This
// story reproduces the pressure with a tile whose content simply cannot wrap, which is the general case
// (a long unbroken title, a wide credit line, a nowrap datum row) rather than one room's cast.

/** Wider than the hearth track's fair share at the story's mount width, and unbreakable. */
const WIDE_CONTENT_PX = 900;

const PRESSURE_TILES: readonly HomeTileContribution[] = [
  {
    id: "lead",
    title: "Hearth tile",
    icon: MessagesSquare,
    order: 10,
    region: "hearth",
    body: () => (
      <Text className="truncate whitespace-nowrap" style={{ minInlineSize: `${WIDE_CONTENT_PX}px` }}>
        an unbreakable hearth line
      </Text>
    ),
  },
  { id: "rail", title: "Shelf tile", icon: BrainCircuit, order: 20, region: "shelf", body: () => <Text>shelf body</Text> },
];

/** A hearth tile whose content is wider than its track's fair share, beside a shelf tile — the shape that
 *  broke the approved ratio. Mounted WIDE enough for the two-column arm to be live. */
export function HomeSplitPressureStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ inlineSize: 1160 }}>
        <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", PRESSURE_TILES)} />
      </div>
    </CtDataProviders>
  );
}

// ── The BOOT-CLS reservation (F14) ──────────────────────────────────────────────────────────────────
// A tile that is still reading is the state that used to move the whole grid: its 3-row skeleton is not
// the box its content settles at. The frame reserves the height THIS DEVICE measured last time
// (surface-box-store), so this story pre-seeds a remembered box for a tile whose body suspends until
// the test releases it — the shape of a real boot, where localStorage already holds the last settled box.

let releaseSlowBody: () => void = (): void => undefined;
const slowBodyReady: Promise<void> = new Promise<void>((resolve) => {
  releaseSlowBody = resolve;
});

/** Suspends until the story's "Settle" button fires, then renders a body of EXACTLY the remembered height
 *  — i.e. the tile settles where it settled last boot, which is the case the reservation is built for. */
function SlowTileBody(): ReactElement {
  use(slowBodyReady);
  return (
    <div style={{ blockSize: `${RESERVED_TILE_PX}px` }}>
      <Text>settled slow body</Text>
    </div>
  );
}

const RESERVE_TILES: readonly HomeTileContribution[] = [
  { id: "slow", title: "Slow tile", icon: Clock, order: 10, body: () => <SlowTileBody /> },
  { id: "below", title: "Below tile", icon: MessagesSquare, order: 20, body: () => <Text>below body</Text> },
];

// Seeded at MODULE scope — "this device measured `slow` at 420px last boot", the state a real boot reads
// out of localStorage before the first render (never a side effect inside render).
rememberSurfaceBox("slow", RESERVED_TILE_PX);

/** The reserving frame: `slow` suspends (skeleton in a 420px box) until the "Settle" button releases it;
 *  `below` sits under it in the grid and is the tile that used to be pushed down. */
export function HomeTileReserveStory(): ReactElement {
  return (
    <CtDataProviders>
      <Button intent="secondary" onClick={releaseSlowBody}>
        Settle
      </Button>
      <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", RESERVE_TILES)} />
    </CtDataProviders>
  );
}

// ── The FIRST-EVER-BOOT reservation (#92) ────────────────────────────────────────────────────────────
// The story above is the SECOND boot: a measured box already in the store. This one is the FIRST — no
// memory for this tile id at all — which is the arm that was still shifting the whole grid (live stack,
// 3/3 runs: CLS 0.1338, `chat.recents` growing 233px → 541px and pushing the two tiles under it 308px).
// The tile DECLARES the row count its own read renders, so the loading box and the settled box are the
// same skeleton geometry and the tile below it never moves.

let releaseFirstBootBody: () => void = (): void => undefined;
const firstBootBodyReady: Promise<void> = new Promise<void>((resolve) => {
  releaseFirstBootBody = resolve;
});

/** Suspends until "Settle", then renders EXACTLY the fallback's own shape at the declared row count — so
 *  any movement of the tile below is the reservation being wrong, never the story's own geometry. */
function FirstBootBody(): ReactElement {
  use(firstBootBodyReady);
  return <SkeletonRows count={FIRST_BOOT_SKELETON_ROWS} />;
}

const FIRST_BOOT_TILES: readonly HomeTileContribution[] = [
  { id: "declared", title: "Declared tile", icon: Clock, order: 10, skeletonRows: FIRST_BOOT_SKELETON_ROWS, body: () => <FirstBootBody /> },
  { id: "under", title: "Under tile", icon: MessagesSquare, order: 20, body: () => <Text>under body</Text> },
];

/** No remembered box for either id (nothing seeds them) — the first-ever-boot state, on a tile that
 *  declares its rows. `under` is the tile the +308px push used to move. */
export function HomeTileFirstBootStory(): ReactElement {
  return (
    <CtDataProviders>
      <Button intent="secondary" onClick={releaseFirstBootBody}>
        Settle
      </Button>
      <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", FIRST_BOOT_TILES)} />
    </CtDataProviders>
  );
}

// ── The SHIPPED first boot (#129 residual 1) ─────────────────────────────────────────────────────────
// Every story above declares its own tiles, which is right for the FRAME's contract and structurally
// blind to the one question #129 asks: are the SHIPPED declarations the shipped bodies' boxes? A tile's
// `skeletonRows` is a hand-derived number sitting in a different file from the body it claims to size,
// nothing recomputes it when the body changes, and the box memory HEALS it from boot two on — so a wrong
// declaration is invisible on every device that has already booted, and costs a layout shift on every
// device that has not (measured live: `[data-home-grid]` 948px → 869px on a cold profile, CLS 0.0606,
// behind the boot veil).
//
// This story is the missing instrument: the REAL registry from the door (`compose/authed-app.tsx`), in
// door order, at a production-like content width, over the REAL data layer — so a CT can hold every read
// with `trpcHold`, measure the reserved grid, release, and measure the settled one. The frame's own
// mechanism is already pinned above with fakes; this pins the DECLARATIONS.

/** The home content pane's measured production width (`home-surface.tsx` header: `main` is 1224px at the
 *  default desktop shell). The `lead` split and the face shelf's `auto-fill` track count both answer to
 *  THIS number, so a reservation pin at any other width pins a layout the app does not ship. */
const HOME_CONTENT_PX = 1224;

/** The door's array, verbatim (`compose/authed-app.tsx`) — including the jump tile built FROM it, because
 *  `sectionId` claims change which rows that tile renders and therefore its height. */
const SHIPPED_TILES: readonly HomeTileContribution[] = [
  chatMastheadTile,
  chatRecentsTile,
  chatAlsoOpenTile,
  chatQuickPicksTile,
  chatTempChatTile,
  databankDocumentsTile,
  buddyDormantTile,
  // #834 — the roadmap doorways the door spreads after buddy. They are collapsed at rest (the panel is
  // unmounted while the fold is closed), so what they add to a settled measurement is the band's count
  // chip; including them is what keeps "the door's array, verbatim" true.
  ...homeRoadmapTiles,
];

// ── The COLUMN-BALANCE instrument (#226) ─────────────────────────────────────────────────────────────
// The void between the hearth's foot and the shelf's foot CHANGES SIDES with width (hearth short at
// 1280/1440/1920, shelf short at 2560) and the reading appearance arm more than doubles it, so the fix
// has to be measured across a width × appearance MATRIX rather than at one pane. This story is the
// shipped registry with its pane width DRIVEN from the spec: one mount, twelve layouts, no re-settle.
//
// The density override is the bare-attribute `[data-density="compact"]` block since the #866 §7.8 hoist
// (was `.shell-grid[data-density]`), so the compact arm here resolves the SAME four spacing tokens the
// app does off the attribute alone. `.shell-grid` stays on the story for the class's OTHER shell rules;
// its own shell box (grid, 100dvh, clip) is overridden inline. The spec drives `data-density`,
// `--font-scale` and the pane's inline size; nothing here hardcodes a state.

/** The shipped home in a pane whose width the spec drives — the #226 width × appearance matrix. */
export function HomeBalanceStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div className="shell-grid" data-home-pane={true} style={{ display: "block", blockSize: "auto", overflow: "visible", inlineSize: "100%" }}>
          <HomeSurface
            onNewChat={(): void => undefined}
            tiles={createContributorRegistry<HomeTileContribution>("home-tiles", [...SHIPPED_TILES, makeSectionJumpTile(SHIPPED_TILES)])}
          />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

// ── The BELOW-FOLD CUE (side-eye rail-home P2-1) ────────────────────────────────────────────────────
// Home is the app's one content-SCROLLING landing surface and it overflowed silently (293px hidden at
// 1280x800, `mask-image: none`). These two stories are the recipe's two arms in one shape: a pane too
// short for its content, and the same pane with content that fits. The mask is SCROLL-AWARE, so the
// fitting arm must paint no fade at all — the half of the contract a one-arm story cannot see.
//
// `display: grid` on the wrapper, not a bare height: `HomeSurface`'s scroller is `h-full`, so it needs an
// ancestor with a resolved height, and a grid ITEM stretches on both axes by default where a block child
// would only take its content's height and never overflow anything.

/** Shorter than the tall body below, so the scroller genuinely overflows. */
const SCROLL_CUE_PANE_PX = 300;
/** Taller than the pane by a wide margin — the cut has to be unambiguous, not a rounding artifact. */
const SCROLL_CUE_TALL_BODY_PX = 900;

const SCROLL_CUE_TILES: readonly HomeTileContribution[] = [
  { id: "tall", title: "Tall tile", icon: Clock, order: 10, body: () => <div style={{ blockSize: SCROLL_CUE_TALL_BODY_PX }} /> },
];

const SCROLL_CUE_FITTING_TILES: readonly HomeTileContribution[] = [
  { id: "short", title: "Short tile", icon: Clock, order: 10, body: () => <Text>short body</Text> },
];

function ScrollCueStory({ tiles }: { readonly tiles: readonly HomeTileContribution[] }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ blockSize: SCROLL_CUE_PANE_PX, display: "grid" }}>
        <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", tiles)} />
      </div>
    </CtDataProviders>
  );
}

/** A pane too short for its content — the arm that must announce the cut. */
export function HomeScrollCueStory(): ReactElement {
  return <ScrollCueStory tiles={SCROLL_CUE_TILES} />;
}

/** The SAME pane with content that fits — the arm that must announce nothing. */
export function HomeScrollCueFittingStory(): ReactElement {
  return <ScrollCueStory tiles={SCROLL_CUE_FITTING_TILES} />;
}

// ── The FOLD REACH (#499, the residual half of #455) ────────────────────────────────────────────────
// #455 folded the roadmap block, which sits BELOW the databank tile in the shelf at a narrow pane — so it
// could not move the thing the finding was about: both of the databank empty state's calls to action were
// still under the cut (`Open Databank` top=819 against a 800px fold, measured live at 1280×800). This
// story is the instrument for that question, and it differs from `HomeBalanceStory` in the two ways that
// decide the answer: the pane is a REAL SCROLLER with the production content box, and the bank is EMPTY
// (the arm that renders the CTAs at all — a populated tile renders four rows and no buttons).
//
// `display: grid` on the host, not a bare height: `HomeSurface`'s scroller is `h-full`, so it needs an
// ancestor with a resolved height, and a grid ITEM stretches on both axes where a block child would take
// its content's height and overflow nothing.

/** The production content box at a 1280×800 viewport (side-eye rail-home P2-1's own measurement: a 752px
 *  scroller inside the 1224px pane the 56px rail leaves). The spec drives both for the width matrix. */
const FOLD_PANE_PX = { inline: 1224, block: 752 };

/** The shipped home in a REAL scrolling pane over an EMPTY bank — the fold-reach instrument (#499).
 *
 *  THE PANE PAINTS ITS OWN BACKDROP, and it must. A `ThemeScope` override (`hooksConfig.theme`) emits CSS
 *  VARIABLES on a wrapper; it paints nothing by itself, and in production the app shell is what fills the
 *  viewport with `--color-background`. Without this declaration the #1128 light arm inverted its TOKENS
 *  while the page kept the dark root paint, so the framebuffer sampler read the light theme's near-black
 *  ink on the dark theme's near-black backdrop and reported every CTA at ~1.1:1 — a fixture artifact that
 *  reads exactly like an unreadable surface. Spelled as the token, never a literal, so the declaration
 *  follows whichever scope is in force. */
export function HomeFoldStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div
          data-home-fold-pane={true}
          style={{ background: "var(--color-background)", display: "grid", inlineSize: FOLD_PANE_PX.inline, blockSize: FOLD_PANE_PX.block }}
        >
          <HomeSurface
            onNewChat={(): void => undefined}
            tiles={createContributorRegistry<HomeTileContribution>("home-tiles", [...SHIPPED_TILES, makeSectionJumpTile(SHIPPED_TILES)])}
          />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The shipped home, tile for tile, at the shipped width. No box memory is seeded, so every tile is on
 *  its DECLARED reservation — a first-ever boot. */
export function HomeShippedFirstBootStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ inlineSize: HOME_CONTENT_PX }}>
          <HomeSurface
            onNewChat={(): void => undefined}
            tiles={createContributorRegistry<HomeTileContribution>("home-tiles", [...SHIPPED_TILES, makeSectionJumpTile(SHIPPED_TILES)])}
          />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}
