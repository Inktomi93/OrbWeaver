// The "Jump to" grid — DERIVED from the section registry (home-section-spec §3.4). Each row borrows that
// section's own rail icon, rail label, and gate-checked `placeholder.description` as its teaching gloss. A
// hardcoded `["chats","characters",…]` here would be `no-parallel-section-map` (G2) RED — and rightly:
// derived rows mean a NEW section appears on home automatically, with its own copy, with zero home edits.
//
// A DECLARED-PLANNED section (refinery, lockdown O1) renders its state honestly: the Planned badge derives
// from `typeof def.content !== "function"` — the same ONE field that carries the marker — so the day
// refinery ships, the badge disappears by itself. There is no second "which sections are real" list.

import { Badge } from "@orb/ui/badge";
import { Icon } from "@orb/ui/icons";
import { Grid } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement } from "react";
import type { HomeTileContribution } from "#state";
import { setActiveSection, useSectionRegistry } from "#state";

export function SectionJumpGrid({ siblings }: { readonly siblings: readonly HomeTileContribution[] }): ReactElement {
  // A section whose TILE does this row's whole job loses the row (side-eye 2026-08-08 P2-c): the databank
  // tile carries the section's name, its glyph, its live contents, its health and a door into it, so a jump
  // row beside it is the same destination twice. Derived from the tiles' own `sectionId` claims — never a
  // second list of "which sections have tiles", which would be exactly the parallel map G2 bans.
  const claimed = new Set(siblings.flatMap((tile) => (tile.sectionId === undefined ? [] : [tile.sectionId])));
  // Home is its own host — a row that navigates to where you already are is dead chrome.
  const sections = useSectionRegistry()
    .list()
    .filter((def) => def.id !== "home" && !claimed.has(def.id));
  return (
    <Grid cols="auto" gap="field">
      {sections.map((def) => (
        <ListRow
          actions={
            typeof def.content === "function" ? undefined : (
              <Badge intent="neutral" tone="soft">
                Planned
              </Badge>
            )
          }
          clickable={true}
          key={def.id}
          leading={<Icon className="text-muted-foreground" icon={def.rail.icon} size="sm" />}
          onClick={(): void => setActiveSection(def.id)}
          subtitle={def.placeholder.description}
          // The gloss IS the row's content — a sentence of section-teaching copy. One nowrap line clipped
          // most of it ("Your world books live here — pick one to edit its keyword-…"); the mock clamps to
          // two (`.jump .why`, -webkit-line-clamp:2).
          subtitleWrap={true}
          title={def.rail.label}
        />
      ))}
    </Grid>
  );
}
