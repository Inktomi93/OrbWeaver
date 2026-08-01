// The CONTEXT Options tab (character-editor redesign) — the small per-character SETTINGS, MERGING the former
// separate Appearance + History context tabs into one (owner-signed 3-tab FINAL structure). Both are
// immediate-commit surfaces (never the CONTENT save-bar): the theme override autosaves on change, snapshots
// write on click. This is a pure RE-HOME — it reuses `CharacterAppearanceTab` (the §8.1 theme cluster +
// Trust) and `CharacterHistoryTab` (the snapshots/restore log) verbatim, stacked under headings.

import type { CharacterId } from "@orb/kit/ids";
import { FieldLayout } from "@orb/ui/field";
import { Section, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { CharacterAppearanceTab } from "./character-appearance-tab";
import { CharacterHistoryTab } from "./character-history-tab";

export interface CharacterOptionsTabProps {
  readonly characterId: CharacterId;
}

export function CharacterOptionsTab({ characterId }: CharacterOptionsTabProps): ReactElement {
  return (
    <Stack gap="section">
      {/* The §8.1 per-character theme override + Trust (its own headings live inside). Horizontal is set
          HERE, not in the appearance tab: this panel is the tab's only mount, and the orientation is a
          property of the INSTRUMENT-tier context panel (density spec §3.1), not of the theme cluster.
          Vertical label-over-swatch turned eleven colour rows into a 54px-per-row ladder that exhausted
          the viewport before Trust/Background/History were reachable; label-left/control-right halves it.
          Base UI's horizontal Field self-reverts to stacked below the @md container width, so a narrower
          panel still gets a readable label block. */}
      <FieldLayout orientation="horizontal">
        <CharacterAppearanceTab characterId={characterId} />
      </FieldLayout>
      <Section heading="History">
        <CharacterHistoryTab characterId={characterId} />
      </Section>
    </Stack>
  );
}
