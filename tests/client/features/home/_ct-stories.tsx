// Home CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The whole point of
// the home section is the DOOR seam, so these stories hand-build a `home-tiles` contributor registry of
// FAKES and drive the REAL `HomeSurface` — proving order, `useVisible` gating, the dormant arm, and the
// zero-tile empty state against the shipped grid, not a bespoke double.

import { HomeSurface, sectionJumpTile } from "@orb/client/features/home";
import type { HomeTileContribution } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import { useActiveSection } from "@orb/client/state";
import { BrainCircuit, Clock, MessagesSquare } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { CtDataProviders, CtRealSectionRegistry } from "../../../support/ct/ct-data-providers";

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

/** The REAL home-owned jump tile over the REAL section registry — its rows must BE the registry. The
 *  `<output>` publishes the shell store's active section so a row click asserts the STORE ACTION fired,
 *  never a rendered echo. */
export function HomeSectionJumpStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <ActiveSectionProbe />
        <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", [sectionJumpTile])} />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

function ActiveSectionProbe(): ReactElement {
  return <output>section={useActiveSection()}</output>;
}
