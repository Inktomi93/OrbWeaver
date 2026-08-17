// The "Elsewhere in the house" row — DERIVED from the section registry (home-section-spec §3.4). Each
// pill borrows that section's own rail icon and rail label. A hardcoded `["chats","characters",…]` here
// would be `no-parallel-section-map` (G2) RED — and rightly: derived rows mean a NEW section appears on
// home automatically, with zero home edits.
//
// IT IS A PILL RAIL NOW, NOT SEVEN FAT ROWS (2026-08-16, program #102 — the Hearth Room build). The rows
// carried each section's gate-checked `placeholder.description` as a two-line teaching gloss, which made
// the NAVIGATION block the tallest thing in the hearth column: seven sentences of copy competing with
// the rooms the page exists to get you back into. The mockup's answer, and the owner's pick, is a
// wrapping row of destinations — a rail you skim, not a directory you read. DELIBERATE LOSS, recorded so
// the next reader does not "restore" it by accident: the teaching copy is gone from HOME. It still
// renders on each section's own placeholder, which is where a first-time visitor meets it in context.
//
// A DECLARED-PLANNED section (refinery, lockdown O1) still renders its state honestly: the Planned badge
// derives from `typeof def.content !== "function"` — the same ONE field that carries the marker — so the
// day refinery ships, the badge disappears by itself. There is no second "which sections are real" list.

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import type { HomeTileContribution } from "#state";
import { setActiveSection, useSectionRegistry } from "#state";

export function SectionJumpRail({ siblings }: { readonly siblings: readonly HomeTileContribution[] }): ReactElement {
  // A section whose TILE does this row's whole job loses the pill (side-eye 2026-08-08 P2-c): the databank
  // tile carries the section's name, its glyph, its live contents, its health and a door into it, so a
  // jump pill beside it is the same destination twice. Derived from the tiles' own `sectionId` claims —
  // never a second list of "which sections have tiles", which would be exactly the parallel map G2 bans.
  const claimed = new Set(siblings.flatMap((tile) => (tile.sectionId === undefined ? [] : [tile.sectionId])));
  // Home is its own host — a pill that navigates to where you already are is dead chrome.
  const sections = useSectionRegistry()
    .list()
    .filter((def) => def.id !== "home" && !claimed.has(def.id));
  return (
    <Row className="flex-wrap" gap="field">
      {sections.map((def) => (
        // A jump IS an action on the shell store (this app has ONE route), so the destination is a
        // Button, never an `<a href>` — and `shape="pill"` is the rail's whole register: one of many
        // small things to skim, not a control to operate.
        <Button intent="secondary" key={def.id} onClick={(): void => setActiveSection(def.id)} shape="pill" size="sm">
          <Icon icon={def.rail.icon} size="sm" />
          {def.rail.label}
          {typeof def.content === "function" ? null : (
            <Badge intent="neutral" size="sm" tone="soft">
              Planned
            </Badge>
          )}
        </Button>
      ))}
    </Row>
  );
}
