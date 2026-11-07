import { CtIsolation } from "@orb/testkit/browser";
import type { CSSProperties, ReactElement } from "react";

/** The room's two tracks under the chat-width dial: a content column (the client sheet's reading measure) over a box
 *  wearing the composer track. The stamps are the ones the client sheet keys on. */
export function RoomTracksStory({ dial }: { readonly dial: string }): ReactElement {
  const dialStyle: CSSProperties & Record<`--${string}`, string> = { "--width-shell-content": dial };
  return (
    <CtIsolation subject="Room tracks" isolates="The composer track against the content column, under one dial value">
      <div className="inline-full" style={dialStyle}>
        <div data-track="chat">
          <section aria-label="content column" data-slot="message-content-column">
            <p>The column the composer sits under.</p>
          </section>
        </div>
        <section aria-label="composer" data-track="composer">
          <p>Composer</p>
        </section>
      </div>
    </CtIsolation>
  );
}
