import { CtIsolation } from "@orb/testkit/browser";
import type { CSSProperties, ReactElement } from "react";

/** The room's two tracks under the chat-width dial: a content column (the client sheet's reading measure) over a box
 *  wearing the composer track. The class names are the client sheet's own utilities. */
export function RoomTracksStory({ dial }: { readonly dial: string }): ReactElement {
  return (
    <CtIsolation subject="Room tracks" isolates="The composer track against the content column, under one dial value">
      <div className="inline-full" style={{ "--width-shell-content": dial } as CSSProperties}>
        <div className="orb-chat-track inline-full max-inline-(--width-shell-content)">
          <section aria-label="content column" data-slot="message-content-column">
            <p>The column the composer sits under.</p>
          </section>
        </div>
        <section aria-label="composer" className="orb-composer-track inline-full">
          <p>Composer</p>
        </section>
      </div>
    </CtIsolation>
  );
}
