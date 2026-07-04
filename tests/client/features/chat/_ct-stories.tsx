// Chat message-list CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// The surface/anchor come through the feature front door; the leaf components come via relative path
// into the package (stories legitimately compose feature INTERNALS the front door doesn't re-export).
// Fixtures are plain `MessageView`/`ChatBusEvent` literals (the support/factories are DB-row builders
// for a different layer). Data-layer stories wrap in <CtDataProviders> (Query + real tRPC over the
// stubbed network); pure-render stories rely on the beforeMount toast/tooltip chrome.

import type { ChatBusDeps } from "@orb/client/data";
import { createInvalidation, useTRPC } from "@orb/client/data";
import { MessageListSurface, MessageThreadAnchor } from "@orb/client/features/chat";
import { chatStream, committedChat, draftChat, useTurnPhase } from "@orb/client/state";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import type { THEME_SCOPE_CHAT_STYLES } from "@orb/ui/theme-scope";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { GhostMessageRow } from "../../../../packages/client/src/features/chat/components/ghost-message-row";
import { MessageRow } from "../../../../packages/client/src/features/chat/components/message-row";
import { SwipeStrip } from "../../../../packages/client/src/features/chat/components/swipe-strip";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";
import { CHAT_ID, makeMessageView } from "./fixtures";

// ── Pure-render stories (no data layer) ─────────────────────────────────────────────────────────

export interface MessageRowStoryProps {
  readonly chatStyle: (typeof THEME_SCOPE_CHAT_STYLES)[number];
  // Named `messageRole` (not `role`) so the JSX prop at the CT call site isn't read as an ARIA role.
  readonly messageRole?: MessageRole;
  readonly content?: string;
}

/** One row in a chosen chatStyle — the variant-mechanism CT mounts this three times. */
export function MessageRowStory({
  chatStyle,
  messageRole = "assistant",
  content = "**Bold** and _italic_",
}: MessageRowStoryProps): ReactElement {
  return (
    <MessageThreadAnchor>
      <MessageRow message={makeMessageView({ role: messageRole, content })} chatStyle={chatStyle} />
    </MessageThreadAnchor>
  );
}

function GhostRowInner(): ReactElement {
  const phase = useTurnPhase(CHAT_ID);
  return (
    <div>
      <div data-testid="phase">{phase}</div>
      <GhostMessageRow chatId={CHAT_ID} chatStyle="bubble" streaming={phase === "streaming"} />
    </div>
  );
}

/** The ghost row + store-driving controls: proves the token subscription lives in the ghost alone
 *  while the lifecycle-only `phase` read stays stable across tokens (ghost isolation). */
export function GhostRowStory(): ReactElement {
  return (
    // A bounded width so the shimmer's w-full skeleton bars have real size (a bare shrink-to-fit box
    // collapses them to zero width → "hidden"); real rows get width from the message-list.
    <div style={{ width: 360 }}>
      <GhostRowInner />
      <button
        type="button"
        data-testid="begin"
        onClick={(): void => {
          chatStream.beginTurn(CHAT_ID, {
            intent: "send",
            speakerCharacterId: null,
            targetMessageId: null,
          });
        }}
      >
        begin
      </button>
      <button
        type="button"
        data-testid="token"
        onClick={(): void => {
          chatStream.appendDelta({ chatId: CHAT_ID, kind: "text", text: "Hi " });
        }}
      >
        token
      </button>
      <button
        type="button"
        data-testid="complete"
        onClick={(): void => {
          chatStream.completeTurn(CHAT_ID, castId<MessageId>("msg_ct_done"));
        }}
      >
        complete
      </button>
    </div>
  );
}

/** The swipe strip on a 3-variant assistant message (n/m counter + generate-next). */
export function SwipeStripStory(): ReactElement {
  return (
    <CtDataProviders>
      <SwipeStrip message={makeMessageView({ variantCount: 3, selectedVariantIdx: 1 })} />
    </CtDataProviders>
  );
}

// ── Surface story (data layer + live stream) ────────────────────────────────────────────────────

interface SurfaceHarnessProps {
  readonly committed: boolean;
}

function SurfaceHarness({ committed }: SurfaceHarnessProps): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const busDeps: ChatBusDeps = {
    stream: chatStream,
    invalidate: createInvalidation({ queryClient, trpc }).invalidate,
  };
  const handle = committed ? committedChat(CHAT_ID) : draftChat("draft_ct");
  return (
    <div style={{ height: 480 }}>
      <MessageThreadAnchor>
        <MessageListSurface handle={handle} busDeps={busDeps} />
      </MessageThreadAnchor>
    </div>
  );
}

export interface MessageListSurfaceStoryProps {
  readonly committed?: boolean;
}

/** The keystone surface in a bounded box (so the message-list seal has a real scroll window). */
export function MessageListSurfaceStory({
  committed = true,
}: MessageListSurfaceStoryProps): ReactElement {
  return (
    <CtDataProviders>
      <SurfaceHarness committed={committed} />
    </CtDataProviders>
  );
}
