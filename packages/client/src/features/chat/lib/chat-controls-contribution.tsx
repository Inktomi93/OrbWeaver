// S1 — THE MOUNT: ONE `above-composer` `ChatSurfaceContribution`
// consuming the door-assembled control-source registry. Every transient control near the transcript —
// B3's rule chips, B4's confirm cards and rate-refusal invitations, B8's dice ask, C2/C3's suggestion
// cards — reaches the room through this one contribution and nothing else, which is what makes the one
// chokepoint reviewable.
//
// THE ACCEPTANCE PROPERTY, and why it is a `when` and not a body branch: with ZERO registered sources the
// contribution is filtered OUT at the anchor (`resolveRoomAnchor`), so the room's above-composer band is
// not rendered at all and the page is byte-identical to a build without S1 (the M8 seam's own property —
// `chat-room-surface.tsx` renders its `chat-above-composer` wrapper only for a NON-EMPTY contribution
// list). A body that returned `null` instead would leave that wrapper standing, which is a DOM difference
// and therefore not the property the spec asks for. `when` is a pure sync predicate over a STATIC registry
// — no hook, no subscription, stable for the life of the door.
//
// The band itself owns liveness: once a source IS registered, an empty publish paints no chrome inside the
// band (the wrapper is then a zero-height row of the room's own track — the seam's shape, not this file's).

import type { ChatControlSource, ChatSurfaceContribution, ContributorRegistry } from "#lib";
import { ChatControlsBand } from "../components/chat-controls-band.tsx";

/** The registry key — one contribution, one id, forever (a second control mount is the shape this seam
 *  exists to prevent). */
const CHAT_CONTROLS_CONTRIBUTION_ID = "chat-controls";

/** Builds the room's control mount over the door-assembled sources. Called ONCE, at the door. */
export function makeChatControlsContribution(sources: ContributorRegistry<ChatControlSource>): ChatSurfaceContribution {
  return {
    id: CHAT_CONTROLS_CONTRIBUTION_ID,
    anchor: "above-composer",
    // A source needs a COMMITTED room (a chip is surfaced onto a chat's bus, a card is keyed by chat), so a
    // rowless draft resolves to no band at all — the same honest absence as zero sources.
    when: (state) => state.chatId !== null && sources.list().length > 0,
    body: (state) => (state.chatId === null ? null : <ChatControlsBand chatId={state.chatId} sources={sources} />),
  };
}
