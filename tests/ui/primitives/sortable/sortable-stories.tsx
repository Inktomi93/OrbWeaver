import { CtIsolation } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import { SortableList } from "@orb/ui/sortable";
import type { ReactElement } from "react";
import { useState } from "react";

interface Track {
  readonly id: string;
  readonly name: string;
}

const TRACKS: readonly Track[] = [
  { id: "trk_01", name: "Alpha" },
  { id: "trk_02", name: "Beta" },
  { id: "trk_03", name: "Gamma" },
  { id: "trk_04", name: "Delta" },
];

export function ReorderableTracksStory({ disabled, width }: { readonly disabled: boolean; readonly width?: string }): ReactElement {
  const [tracks, setTracks] = useState(TRACKS);
  return (
    <CtIsolation subject="SortableList" isolates="Keyboard reorder, mid-drag focus and the live-region script are the seal's own wiring over dnd-kit.">
      <Container style={width === undefined ? {} : { inlineSize: width }}>
        <SortableList
          aria-label="Playlist"
          disabled={disabled}
          getItemKey={(track): string => track.id}
          handle={true}
          itemLabel={(track): string => track.name}
          items={tracks}
          onReorder={(keys): void => setTracks(keys.flatMap((key) => tracks.filter((track) => track.id === key)))}
          renderItem={(track): ReactElement => <span>{track.name}</span>}
        />
      </Container>
      <output aria-label="Current order">{tracks.map((track) => track.name).join(" ")}</output>
    </CtIsolation>
  );
}
