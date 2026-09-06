// THE SATELLITE ROW — the pinned trackers as pool-orb ARCS + the wallet DISC, the OSRS glanceable-vitals
// idiom. Extracted from `rpg-takeover-header.tsx` (its birthplace) 2026-08-30 for #878 F7, which gave the
// row a SECOND mount: at a large type scale it leaves the head band and rides the game tab's own scroll
// region instead (`rpg-game-tab-body.tsx`). One implementation, two positions — the alternative was the
// same orbs spelled twice, which is how two mounts drift into two grammars.
//
// SHAPE FOLLOWS THE DATUM (side-eye 08-01, unchanged by the move). The server hands the band exactly the
// trackers the HOST PINNED (`trackerOrbs`, envelope-capped there — the one derivation home) and this
// composition picks each one's FIGURE from whether it has a ceiling: a ceilinged pool is an ARC
// (`RingGauge` — the arc means value/max), a max-less quantity is a DISC (`CoinFigure`), the same grammar
// the wallet already wears, because "a max-less quantity wearing an arc would be a lie of shape" — and
// `max ?? value` was drawing exactly that lie, a permanently-full ring for a tracker that has no full.
// Orb colour rides the ONE `resolveTrackerColor` derivation (`def.color ?? trackColor(ordinal)` — the owner
// free-hex ruling): the orb label joins back to the defining actor's `poolDefs` row for its picked colour.

import type { RpgTrackerOrb, RpgTrackerView } from "@orb/contracts/rpg";
import { Row } from "@orb/ui/layout";
import { CoinFigure, RingGauge } from "@orb/ui/meter";
import type { ReactElement } from "react";
import { HIDE_AT_COARSE } from "#components";
import { cn } from "#lib";
import { resolveTrackerColor, trackColorProps } from "../lib/track-color.ts";

/** The 3-char uppercase tag the orb caption shows ("VIT"), the OSRS glanceable-vitals idiom. */
const ORB_TAG_LEN = 3;

/** ONE pinned tracker as a SATELLITE, on the eligibility rule at the top of this file: a CEILINGED pool
 *  wears the arc (`RingGauge` — value/max, with its 3-char glance tag); a max-less quantity wears the
 *  wallet's disc instead, because an arc with no domain can only ever draw itself full. Both keep the
 *  tracker's own resolved ramp colour, so the definition→orb→bar colour identity survives the shape fork. */
function Satellite({ orb, ordinal }: { readonly orb: RpgTrackerOrb; readonly ordinal: number }): ReactElement {
  const color = trackColorProps(resolveTrackerColor(orb.color, ordinal));
  if (orb.max === null) {
    // The disc is a QUANTITY figure — it carries no arc, so a host-picked free hex has nothing to paint;
    // the ramp step is the honest colour channel it does have.
    return <CoinFigure amount={orb.value} label={orb.label} color={color.color} showCaption={true} />;
  }
  return (
    <RingGauge value={orb.value} max={orb.max} {...color} label={orb.label} showCaption={true} captionLabel={orb.label.slice(0, ORB_TAG_LEN).toUpperCase()} />
  );
}

/** The viewer's primary wallet — the FIRST named amount (the ordinal rule); null when unfunded. Private:
 *  a module that exports components may export nothing else (`useComponentExportOnlyModules`), and this
 *  row is the only caller now that the band no longer assembles the figures itself. */
function primaryWallet(actors: RpgTrackerView["actors"], viewerUserId: string): { readonly name: string; readonly amount: number } | null {
  const viewer = actors.find((a) => a.actorRef.kind === "user" && a.actorRef.userId === viewerUserId) ?? actors[0];
  const first = viewer?.volatile?.wallet[0];
  return first ?? null;
}

export interface RpgSatelliteRowProps {
  readonly trackerOrbs: readonly RpgTrackerOrb[];
  readonly actors: RpgTrackerView["actors"];
  readonly viewerUserId: string;
}

/**
 * The row itself, or `null` when there is nothing pinned and no wallet (the honest empty plane — never an
 * empty strip holding space).
 *
 * IT IS FINE-POINTER CHROME (side-eye 2026-08-07 finding 2). MEASURED on the live stack at 320×568: the
 * claimed pane is 464px tall, this row alone is 100 of it, and the whole HUD column left the active
 * tabpanel EIGHTEEN pixels against a 558px body. The band is the GLANCE and the tab bodies are the
 * READING: on a phone there is no room for both, and the READING is what the pane is for. `pointer-coarse`,
 * not a width query — the constraint is the phone's vertical budget, which a container query cannot see.
 * WHERE THE DROPPED FIGURES GO at coarse (owner ruling 2026-08-07 — KEEP the drop, and the honest version
 * of the claim): HP/Mana/Focus are tracker rows on the Status participant card, one tap away; the WALLET is not
 * a Status row and never was — it renders in the INVENTORY tab header. The accepted cost: on
 * Scene/Quests/Journal/Map at coarse there are no vitals and no wallet on screen.
 *
 * IT DOES NOT WRAP — IT SCROLLS (#875 F14). Five figures in a 306px pane wrapped 4+1 and left the
 * `SILVER MARKS` figure alone at the far left of a second row, right half empty — the ragged-void shape #861
 * filed against the rail's 3+2 fold, in the band. The house answer is already written
 * (`context-rail.tsx` `RAIL_TRACK_CLASSES`): only a set that folds EVENLY folds, everything else keeps its
 * whole item and scrolls. The mock agrees — its `.sat` is a plain non-wrapping row.
 */
export function RpgSatelliteRow({ trackerOrbs, actors, viewerUserId }: RpgSatelliteRowProps): ReactElement | null {
  const wallet = primaryWallet(actors, viewerUserId);
  if (trackerOrbs.length === 0 && wallet === null) {
    return null;
  }
  return (
    <Row gap="block" align="start" className={cn("min-w-0 overflow-x-auto", HIDE_AT_COARSE) ?? ""} data-slot="rpg-band-satellites">
      {trackerOrbs.map((orb, i) => (
        <Satellite key={orb.key} orb={orb} ordinal={i} />
      ))}
      {wallet === null ? null : <CoinFigure amount={wallet.amount} label={wallet.name} showCaption={true} />}
    </Row>
  );
}
