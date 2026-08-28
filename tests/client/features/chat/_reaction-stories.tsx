// Story module for the B6 reaction CTs (pill row + the two picker doors). Its own module rather than a
// block in `_ct-stories.tsx` because its subject is the REACTION plane and its fixtures are reaction groups
// — the `_edge-fade-stories` split, same reason.
//
// THE PILLS MOUNT THROUGH THE REAL CONTRIBUTION, not through `<MessageReactions>` directly: the door the
// production tree takes is `chatMessageReactionsSurface.body(state)` off the `message-footer` anchor (the
// rpg `_ct-stories` precedent), so a CT that called the component would be testing a path `main.tsx` does
// not use — and would silently keep passing if the contribution were unregistered or misanchored.
//
// EVERYTHING COMES THROUGH THE `@orb/client/*` FRONT DOORS. A relative import into the package gets a
// DIFFERENT React context instance from the one `CtDataProviders` mounts, and the component renders blank.

import { chatMessageReactionsSurface } from "@orb/client/features/chat";
import type { ChatSurfaceContribution } from "@orb/client/lib";
import type { ReactElement } from "react";
// The leaf ACTION ROW is a feature internal the front door does not re-export — the `_ct-stories`
// precedent for a leaf component (`MessageRow`/`MessageActionsRow` both come in this way).
import { MessageActionsRow } from "../../../../packages/client/src/features/chat/components/message-actions-row.tsx";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";
import { makeMessageView } from "./fixtures.ts";

// MODULE-PRIVATE (the playwright-ct constraint: a story module may export COMPONENTS ONLY — a spec that
// imports a constant alongside a story fails to parse, because named imports are rewritten into generated
// component consts).
const FOOTER_STATE = { message: makeMessageView({ role: "assistant", content: "A reply worth reacting to." }) } as const;

/** Render the contribution exactly as the row does: `when` first (absent ⇒ always), then `body`. */
function renderFooter(contribution: ChatSurfaceContribution): ReactElement | null {
  if (contribution.anchor !== "message-footer") {
    return null;
  }
  return <>{contribution.when?.(FOOTER_STATE) === false ? null : contribution.body(FOOTER_STATE)}</>;
}

/**
 * The pill row at its NARROWEST real host (320px — a phone transcript column). The reaction data comes from
 * the routed `chat.listReactions`, so a spec varies the CHIP COUNT by varying the route, and the overflow
 * tail is exercised at the same width the reader would meet it.
 */
export function MessageReactionsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div data-testid="reactions-host" style={{ width: 320 }}>
        {renderFooter(chatMessageReactionsSurface)}
      </div>
    </CtDataProviders>
  );
}

/**
 * The row's ACTION CLUSTER — both picker doors on one mount. `messageActions="expanded"` pins the reveal
 * cluster ON so the fine-pointer inline door is present without a hover dance; the coarse arm is the SAME
 * mount under `pointer: coarse` emulation, where `ROW_ACTION_INLINE` drops the inline door and the ⋯ menu's
 * item is the one left standing. That is the whole coarse/fine claim, and it is why this story takes no
 * pointer prop: the pointer is the BROWSER's, never a story branch.
 */
export function MessageActionsDoorsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div data-testid="actions-host" style={{ width: 320 }}>
        <MessageActionsRow message={FOOTER_STATE.message} messageActions="expanded" />
      </div>
    </CtDataProviders>
  );
}
