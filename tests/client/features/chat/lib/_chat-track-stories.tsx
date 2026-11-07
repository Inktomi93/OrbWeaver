import { CtClientProviders } from "@orb/testkit/browser";
import { Container, Row, Stack } from "@orb/ui/layout";
import { OptionStrip } from "@orb/ui/option-strip";
import { RoomIsland } from "@orb/ui/room-island";
import type { CSSProperties, ReactElement } from "react";
import { useId } from "react";
import { Track } from "#client/features/chat/lib/chat-track.tsx";

const NO_ITEMS = [] as const;

/** Every primitive a room rides a track on, in one pane under the reader's chat-width dial. */
export function TrackCarriersStory({ pane, dial }: { readonly pane: string; readonly dial: string }): ReactElement {
  const stripId = useId();
  const box: CSSProperties & Record<`--${string}`, string> = { inlineSize: pane, "--width-shell-content": dial };
  return (
    <CtClientProviders>
      <main style={box} data-slot="track-pane">
        <Track of={Stack} track="chat" data-slot="track-stack" />
        <Track of={Stack} track="echo" data-slot="track-echo" />
        <Track of={Row} track="composer" data-slot="track-row" />
        <Track of={Container} track="composer" data-slot="track-container" />
        <Track of={RoomIsland} track="composer" ownSlot="track-island" />
        <Track of={OptionStrip} track="composer" aria-label="Track strip" id={stripId} items={NO_ITEMS} onSelect={(): void => undefined} />
      </main>
    </CtClientProviders>
  );
}
