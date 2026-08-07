// Story module for the message-list EDGE-FADE pixel CT (side-eye 2026-08-07 finding 5). Its own module,
// not `_ct-stories.tsx`, for ONE reason: it side-effect imports the CLIENT's global stylesheet, which is
// where the fade rule lives and which the CT harness (playwright/index.css) deliberately does not load for
// every spec. Scoping that import to the one story that needs it keeps every other chat CT's pixels
// unchanged.
//
// The subject is the @orb/ui `MessageList` itself — it is what stamps `data-slot="message-list-scroll"`
// and toggles `data-fade-top`/`-bottom`, and the rule keys on exactly those. Wrapping it in a
// `data-has-bg-image` ancestor reproduces the shell grid's own flag (shell.css stamps it; the row
// legibility scrims in `message-row-backing.ts` read it through Tailwind's `in-*` ancestor variant), and a
// SATURATED backdrop makes "did the row's card dissolve into what is behind it?" a one-channel question
// instead of a contrast estimate — a photo would prove the same thing less legibly.

import { MessageList } from "@orb/ui/message-list";
import type { ReactElement } from "react";
import "../../../../packages/client/src/styles/globals.css";

// MODULE-PRIVATE, and that is a CT-harness constraint, not a style choice: playwright-ct rewrites a
// spec's named imports from a story module into generated component consts, so this module may export
// COMPONENTS ONLY — a spec importing one of these alongside the story fails to parse.
/** The backdrop behind the thread — pure green, so ANY bleed-through is unmistakable in one channel. */
const BACKDROP_RGB = { r: 0, g: 255, b: 0 } as const;
/** The row card — an opaque cream, the reading surface the rows paint. */
const CARD_RGB = { r: 245, g: 239, b: 227 } as const;

const ROWS = Array.from({ length: 40 }, (_, i) => ({ id: `row-${i}`, text: `Message ${i} — the story continues.` }));

const ROW_HEIGHT = 48;

export interface MessageListEdgeFadeStoryProps {
  /** `true` mounts the thread under the shell's `data-has-bg-image` flag (an art theme). */
  readonly artBackdrop: boolean;
}

/** A real `MessageList` over a saturated backdrop, with or without the shell's art flag. Fixed 320×400 —
 *  the narrowest real host, where the 10% fade band is ~40px of a screen the reader is actively reading. */
export function MessageListEdgeFadeStory({ artBackdrop }: MessageListEdgeFadeStoryProps): ReactElement {
  const backdrop = `rgb(${BACKDROP_RGB.r} ${BACKDROP_RGB.g} ${BACKDROP_RGB.b})`;
  const card = `rgb(${CARD_RGB.r} ${CARD_RGB.g} ${CARD_RGB.b})`;
  return (
    <div {...(artBackdrop ? { "data-has-bg-image": "" } : {})} style={{ background: backdrop, height: 400, width: 320 }}>
      <MessageList
        className="h-full"
        estimateSize={(): number => ROW_HEIGHT}
        getItemKey={(item): string => item.id}
        items={ROWS}
        renderItem={(item): ReactElement => (
          <div data-testid="fade-row" style={{ background: card, color: "#141414", height: ROW_HEIGHT, padding: 8 }}>
            {item.text}
          </div>
        )}
      />
    </div>
  );
}
