// The "Elsewhere in the house" row — DERIVED from the section registry. Each
// pill borrows that section's own rail icon and rail label. A hardcoded `["chats","characters",…]` here
// would be `no-parallel-section-map` (G2) RED — and rightly: derived rows mean a NEW section appears on
// home automatically, with zero home edits.
//
// IT IS A PILL RAIL NOW, NOT SEVEN FAT ROWS (2026-08-16, program #102 — the Hearth Room build). The rows
// carried each section's gate-checked `placeholder.description` as a two-line teaching gloss, which made
// the NAVIGATION block the tallest thing in the hearth column: seven sentences of copy competing with
// the rooms the page exists to get you back into. The mockup's answer, and the owner's pick, is a
// wrapping row of destinations — a rail you skim, not a directory you read. The teaching copy is gone from
// the PAGE's column, deliberately; it is NOT gone from the pill (see the gloss note on the Button below —
// side-eye 2026-08-16 F10 caught the first version, which stranded three insider names with no gloss in
// any channel at all). It also still renders on each section's own placeholder, in context.
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
        // A GLOSS RIDES EVERY PILL (side-eye 2026-08-16 F10). Deleting the teaching copy from the rows was
        // right for the COLUMN and wrong for the words: "Corpus", "Refinery" and "Configuration" are
        // insider names, and they were left on the LANDING surface with no title, no aria-label and no
        // description — a first-time visitor had nothing to hover and nothing announced. This restores the
        // section's own gate-checked `placeholder.description` through the ONE attribute that serves both
        // channels at zero layout cost: a native `title` is the pointer's tooltip AND — per accname's
        // last-resort description step — the element's accessible DESCRIPTION. Deliberately not
        // `aria-label` (it would replace the visible word and break label-in-name / voice control) and
        // deliberately not `aria-description` (a draft attribute the button role does not support, which
        // `jsx-a11y/role-supports-aria-props` reds).
        // THE NAME IS A VERB PHRASE (side-eye rail sweep P3-19). The pill's name was its bare visible word,
        // which COLLIDES with the rail nav's own `aria-label="Chats"` one region over: two buttons, one
        // name, on one screen. AT reads them identically, "click Chats" is ambiguous to voice control, and
        // a `snap --map` could mint no unique semantic selector for any of the seven — all of them fell
        // back to a DOM PATH, which is what "20 of 58 entries resolve only by DOM path" was mostly made of.
        // `Go to <label>` CONTAINS the visible word (WCAG 2.5.3 label-in-name holds, and voice control
        // still matches on it) and says what activation does, which is the same shape the hero's
        // `Resume <room>` takes. The gloss stays on `title`, i.e. the DESCRIPTION, where it was.
        <Button
          aria-label={`Go to ${def.rail.label}`}
          intent="secondary"
          key={def.id}
          onClick={(): void => setActiveSection(def.id)}
          shape="pill"
          size="sm"
          title={def.placeholder.description}
        >
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
