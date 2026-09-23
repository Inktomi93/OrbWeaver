// The HOME-TILE assembly — a `compose/` SIBLING of `authed-app.tsx`, not a second door.
//
// WHY IT MOVED OUT (2026-08-28, the U5 landing): `authed-app.tsx` reached its `component-size` cap. The gate's
// own prescribed fix is "split into sub-files under a bucket", and §7 + `client-compose-door-only` name a
// `compose/` sibling as exactly that for the door — so this is the sanctioned shape rather than a raised cap.
// NOTHING about the one-assembly law changes: `createContributorRegistry` still runs in a `compose/` module
// (G8's whole predicate), there is still exactly ONE home-tile registry project-wide, and the door still owns
// it — `authed-app.tsx` imports the assembled registry and hands it to `makeHomeSection`, which is the same
// blind consumption it always did.
//
// The HOME-TILE contributor seam — the whole point of the home section: a
// feature raises a tile, home skims it. Adding "future stuff" to home is ONE co-located file in the OWNING
// feature plus ONE array member HERE — home is never edited. Canonical `(order, id)` at the door: chat's
// masthead line is order 0, its recents hero 10, its also-open list 15, the face shelf 20 and temp chat 30;
// home's own "Elsewhere in the house" rail is 40; databank's tile 50; the buddy dormant doorway 80, and the
// the indexed roadmap doorways from 81 (automation's dormant tile 90 was RETIRED with B3 — its own contract said it
// stays "until B3", and B3's chips now consume the channel it stood for). WHICH COLUMN each lands in is the
// tile's own `region`, never a list here. Home consumes the registry BLIND through `makeHomeSection`.
//
// THE ROADMAP BLOCK IS ONE MEMBER, SPREAD (#834): `homeRoadmapTiles` is home's curated mirror of the
// open program items under `docs/work/`, and its own file is the one home for both
// the list and its orders. It is spread rather than enumerated here precisely so the door never becomes a
// second copy of that list — adding a program is an edit to `features/home/lib/roadmap.ts` and nothing else.

import { chatAlsoOpenTile, chatMastheadTile, chatQuickPicksTile, chatRecentsTile, chatTempChatTile } from "#features/chat";
import { databankDocumentsTile } from "#features/databank";
import { buddyDormantTile, homeRoadmapTiles, makeSectionJumpTile } from "#features/home";
import type { ContributorRegistry } from "#lib";
import { createContributorRegistry } from "#lib";
import type { HomeTileContribution } from "#state";

const HOME_TILE_CONTRIBUTIONS: readonly HomeTileContribution[] = [
  chatMastheadTile,
  chatRecentsTile,
  chatAlsoOpenTile,
  chatQuickPicksTile,
  chatTempChatTile,
  databankDocumentsTile,
  buddyDormantTile,
  ...homeRoadmapTiles,
];

/** The ONE home-tile registry (G8) — assembled here, consumed blind by `makeHomeSection` at the door. */
export const homeTiles: ContributorRegistry<HomeTileContribution> = createContributorRegistry<HomeTileContribution>("home-tiles", [
  ...HOME_TILE_CONTRIBUTIONS,
  // LAST, and built FROM the list above: its rows are the section registry minus home minus every section
  // a tile beside it already subsumes (`sectionId`).
  makeSectionJumpTile(HOME_TILE_CONTRIBUTIONS),
]);
