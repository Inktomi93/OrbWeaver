// The "Elsewhere in the house" row — DERIVED from the section registry. Each
// pill borrows that section's own rail icon and rail label. A hardcoded `["chats","characters",…]` here
// would be `no-parallel-section-map` (G2) RED — and rightly: derived rows mean a NEW section appears on
// home automatically, with zero home edits.
//
// IT IS A PILL RAIL, NOT A COLUMN OF ROWS. Each section's teaching gloss as a row would make the NAVIGATION
// block the tallest thing in the hearth column, competing with the rooms the page exists to get you back
// into. The mockup's answer, and the owner's pick, is a wrapping row of destinations — a rail you skim, not
// a directory you read. The teaching copy rides each pill as its tooltip (see the gloss note on the Button
// below), and it also renders on each section's own placeholder, in context.
//
// A DECLARED-PLANNED section (refinery, lockdown O1) still renders its state honestly: the Planned badge
// derives from `typeof def.content !== "function"` — the same ONE field that carries the marker — so the
// day refinery ships, the badge disappears by itself. There is no second "which sections are real" list.

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { Tip } from "#components";
import type { HomeTileContribution } from "#state";
import { setActiveSection, useSectionRegistry } from "#state";

export function SectionJumpRail({ siblings }: { readonly siblings: readonly HomeTileContribution[] }): ReactElement {
  // A section whose TILE does this row's whole job loses the pill: the databank
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
        // A GLOSS RIDES EVERY PILL. "Corpus", "Refinery" and "Configuration" are insider names, so each pill
        // carries its section's own gate-checked `placeholder.description` as a Tooltip, which the seal also
        // makes the button's accessible DESCRIPTION. Deliberately not `aria-label` (it would replace the
        // visible word and break label-in-name / voice control).
        // THE NAME IS A VERB PHRASE. The bare visible word would COLLIDE with the rail nav's own
        // `aria-label="Chats"` one region over: two buttons, one name, on one screen, ambiguous to AT, to
        // voice control and to a semantic selector. `Go to <label>` CONTAINS the visible word (WCAG 2.5.3
        // label-in-name holds) and says what activation does, the same shape the hero's `Resume <room>` takes.
        <Tip key={def.id} text={def.placeholder.description}>
          <Button aria-label={`Go to ${def.rail.label}`} intent="secondary" onClick={(): void => setActiveSection(def.id)} shape="pill" size="sm">
            <Icon icon={def.rail.icon} size="sm" />
            {def.rail.label}
            {typeof def.content === "function" ? null : (
              <Badge intent="neutral" size="sm" tone="soft">
                Planned
              </Badge>
            )}
          </Button>
        </Tip>
      ))}
    </Row>
  );
}
