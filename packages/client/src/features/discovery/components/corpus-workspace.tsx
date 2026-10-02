// The Corpus workspace panes (D271, Variant A): each pane renders the ACTIVE mode's body. Explore is
// discovery's own; Insights and Labels arrive from the door as `CorpusModeContribution`s. The mode switch
// heads the LIST, or heads CONTENT while the LIST is off screen, so exactly one is ever visible.

import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import type { CorpusModeContribution } from "#lib";
import { useCorpusMode, useSectionListMode } from "#state";
import { CorpusListAnchor } from "../anchors/corpus-list-anchor.tsx";
import { CorpusListSurface } from "../surfaces/corpus-list-surface.tsx";
import { CorpusContent } from "./corpus-content.tsx";
import { CorpusModeSwitch } from "./corpus-mode-switch.tsx";

/** The two contributed modes, handed in by the door. */
export interface CorpusModes {
  readonly insights: CorpusModeContribution;
  readonly labels: CorpusModeContribution;
}

export function CorpusWorkspaceList({ modes }: { readonly modes: CorpusModes }): ReactElement {
  const mode = useCorpusMode();
  return (
    <Stack className="h-full min-h-0" data-corpus-mode={mode} data-slot="corpus-workspace-list" gap="block">
      <CorpusModeSwitch />
      <Stack className="min-h-0 flex-1">
        {mode === "explore" ? (
          <CorpusListAnchor>
            <CorpusListSurface />
          </CorpusListAnchor>
        ) : (
          modes[mode].list()
        )}
      </Stack>
    </Stack>
  );
}

export function CorpusWorkspaceContent({ modes }: { readonly modes: CorpusModes }): ReactElement {
  const mode = useCorpusMode();
  const listOffScreen = useSectionListMode("corpus") === "collapsed";
  return (
    // The switch slot is the FIRST child whether or not it renders, so the mode body keeps its tree position
    // and its state when the LIST opens or closes.
    <Stack className="h-full min-h-0" data-corpus-mode={mode} data-slot="corpus-workspace-content">
      {listOffScreen ? (
        <Stack padding="block">
          <CorpusModeSwitch />
        </Stack>
      ) : null}
      <Stack className="min-h-0 flex-1">{mode === "explore" ? <CorpusContent /> : modes[mode].content()}</Stack>
    </Stack>
  );
}
