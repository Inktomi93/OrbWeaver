// Home CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The whole point of
// the home section is the DOOR seam, so these stories hand-build a `home-tiles` contributor registry of
// FAKES and drive the REAL `HomeSurface` — proving order, `useVisible` gating, the dormant arm, and the
// zero-tile empty state against the shipped grid, not a bespoke double.

import { automationDormantTile, buddyDormantTile, HomeSurface, makeSectionJumpTile } from "@orb/client/features/home";
import { createContributorRegistry } from "@orb/client/lib";
import type { HomeTileContribution } from "@orb/client/state";
import { rememberHomeTileBox, useActiveSection } from "@orb/client/state";
import { Button } from "@orb/ui/button";
import { BrainCircuit, Clock, MessagesSquare } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { use } from "react";
import { CtDataProviders, CtRealSectionRegistry } from "../../../support/ct/ct-data-providers.tsx";
import { RESERVED_TILE_PX } from "./_reserve-box.ts";

/** Deliberately declared OUT of `order` — the grid must re-sort them (order asc, then id). */
const FAKE_TILES: readonly HomeTileContribution[] = [
  { id: "z-third", title: "Third tile", icon: Clock, order: 30, body: () => <Text>third body</Text> },
  { id: "a-first", title: "First tile", icon: MessagesSquare, order: 10, body: () => <Text>first body</Text> },
  { id: "b-second", title: "Second tile", icon: BrainCircuit, order: 20, span: "full", body: () => <Text>second body</Text> },
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
      reason: "domain/buddy (not in the retro tree) · the agent-role connection",
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

/** The REAL registered doorways (buddy + automation) — the shipped tiles, not fakes: proof the DORMANT
 *  arm survives the round trip through the door and the frame. */
export function HomeRealDoorwaysStory(): ReactElement {
  return <Story tiles={[buddyDormantTile, automationDormantTile]} />;
}

// ── The BOOT-CLS reservation (F14) ──────────────────────────────────────────────────────────────────
// A tile that is still reading is the state that used to move the whole grid: its 3-row skeleton is not
// the box its content settles at. The frame reserves the height THIS DEVICE measured last time
// (home-tile-box-store), so this story pre-seeds a remembered box for a tile whose body suspends until
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
  { id: "slow", title: "Slow tile", icon: Clock, order: 10, span: "full", body: () => <SlowTileBody /> },
  { id: "below", title: "Below tile", icon: MessagesSquare, order: 20, body: () => <Text>below body</Text> },
];

// Seeded at MODULE scope — "this device measured `slow` at 420px last boot", the state a real boot reads
// out of localStorage before the first render (never a side effect inside render).
rememberHomeTileBox("slow", RESERVED_TILE_PX);

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
