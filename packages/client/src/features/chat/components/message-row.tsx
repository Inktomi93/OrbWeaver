// One canonical message row — the ONE surface behind every chatStyle (bubble|flat|document, §12.1):
// it looks up its skin from the exhaustive `MESSAGE_ROW_SKINS` table by the active chatStyle and paints
// through @orb/ui layout primitives (never a raw intrinsic — the compose-only keystone). Auto-memoized
// by the React Compiler (§4a — no hand-written `memo`), so the windowed list re-renders a row only when
// its props change. The streaming ghost is a SEPARATE component (ghost-message-row) — this row is
// canon-only and holds no per-token subscription.
//
// SEAM (#21 speaker): attribution (name/avatar) + `<speaker>`-span coloring layer in here later; trust
// is `trusted` (own AI output / own input) — other-participant `untrusted` routing lands with the
// multi-human wave (§11.6). SEAM (#31): `chatStyle` flows from the surface's `useChatStyle`.

import type { MessageView } from "@orb/contracts/chat";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants";
import { MessageContent } from "./message-content";
import { SwipeStrip } from "./swipe-strip";

export interface MessageRowProps {
  readonly message: MessageView;
  /** The active appearance — keyed off the skin table so only a painted style is accepted. */
  readonly chatStyle: keyof typeof MESSAGE_ROW_SKINS;
  /** The surface passes true ONLY for the tail assistant message (the swipe-eligible row). */
  readonly showSwipes?: boolean;
}

/** Render one canonical message (slot ⋈ selected variant) in the active chatStyle. */
export function MessageRow({
  message,
  chatStyle,
  showSwipes = false,
}: MessageRowProps): ReactElement {
  const skin = MESSAGE_ROW_SKINS[chatStyle];
  const role = message.role;
  return (
    <Stack gap="row" data-slot="message-row" data-role={role} className={skin.outer(role)}>
      <Stack gap="row" data-slot="message-bubble" className={skin.inner(role)}>
        <MessageContent content={message.content} trust="trusted" />
      </Stack>
      {showSwipes && role === "assistant" ? <SwipeStrip message={message} /> : null}
    </Stack>
  );
}
