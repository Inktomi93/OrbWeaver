// Story module for the B6 reaction CTs (pill row + the two picker doors). Its own module rather than a
// block in `_ct-stories.tsx` because its subject is the REACTION plane and its fixtures are reaction groups
// — the `_edge-fade-stories` split, same reason.
//
// THE PILLS MOUNT THROUGH THE REAL CONTRIBUTION, not through `<MessageReactions>` directly: the door the
// production tree takes is `chatMessageReactionsSurface.body(state)` off the `message-footer` anchor (the
// rpg `_ct-stories` precedent), so a CT that called the component would be testing a path `main.tsx` does
// not use — and would silently keep passing if the contribution were unregistered or misanchored.
//
// IMPORT PATHS, stated precisely (this header used to say "everything through the `@orb/client/*` front
// doors, a relative import renders blank", which is not what the rule is and this file already broke it).
// The hazard is a component reaching a DIFFERENT copy of a CONTEXT than the one `CtDataProviders` mounts —
// so anything the PROVIDERS also touch comes through the front door, and the shared registries/providers
// above do. A FEATURE-INTERNAL leaf the front door does not re-export comes in by relative path (the
// `_ct-stories` precedent: `MessageRow`, `MessageActionsRow`), which resolves through the same alias to the
// same module instance — proven by these CTs, whose subjects all read `useTRPC` and render.

import { chatMessageReactionsSurface, RowReactionPicker } from "@orb/client/features/chat";
import type { ChatSurfaceContribution } from "@orb/client/lib";
import { CtDataProviders } from "@orb/testkit/browser/ct-data-providers.tsx";
import { storyTestId } from "@orb/testkit/browser/story-test-ids.ts";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { useState } from "react";
// The leaf ACTION ROW, the PICKER and the reaction hooks are feature internals the front door does not
// re-export — the `_ct-stories` precedent for a leaf (`MessageRow`/`MessageActionsRow` both come in this way).
import { MessageActionsRow } from "#client/features/chat/components/message-actions-row.tsx";
import { useReactionsForVariant, useViewerSeatId } from "#client/features/chat/hooks/use-message-reactions.ts";
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
      <div data-testid={storyTestId("reactionsHost")} style={{ width: 320 }}>
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
      <div data-testid={storyTestId("actionsHost")} style={{ width: 320 }}>
        <MessageActionsRow message={FOOTER_STATE.message} messageActions="expanded" />
      </div>
    </CtDataProviders>
  );
}

// B7/MR3 — the segment-target stories: the SAME multi-speaker labelled body under the two kinds the
// row-level narrator gate distinguishes. The cast names are what production threads (the row passes
// `speakerThemesByName`'s keys); the KIND is what decides whether they reach the parse — `narrator` offers
// per-speaker targets, `standard` must offer none (a `Alice:` line in a one-speaker row is prose).
const NARRATOR_STATE = {
  message: makeMessageView({ role: "assistant", kind: "narrator", content: "Alice: Hello there.\nBob: Fine day." }),
} as const;
const STANDARD_LABELED_STATE = {
  message: makeMessageView({ role: "assistant", kind: "standard", content: "Alice: Hello there.\nBob: Fine day." }),
} as const;

/** The action cluster on a NARRATOR row with the room's cast threaded — the segment-target path. */
export function NarratorActionsDoorsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div data-testid={storyTestId("actionsHost")} style={{ width: 320 }}>
        <MessageActionsRow characterNames={["Alice", "Bob"]} message={NARRATOR_STATE.message} messageActions="expanded" />
      </div>
    </CtDataProviders>
  );
}

/** The SAME body + cast on a STANDARD row — the narrator gate's negative arm (no targets may be offered). */
export function StandardLabeledDoorsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div data-testid={storyTestId("actionsHost")} style={{ width: 320 }}>
        <MessageActionsRow characterNames={["Alice", "Bob"]} message={STANDARD_LABELED_STATE.message} messageActions="expanded" />
      </div>
    </CtDataProviders>
  );
}

/** The picker as the row mounts it: the row's own `RowReactionPicker`, fed the live groups and seat the row
 *  feeds it, so the pick travels the production hook to the production proc and the CT can assert the WIRE VARS
 *  off `routeTrpc`'s recorder instead of a callback nobody ships. */
function ReactionPickerHarness(): ReactElement {
  const [open, setOpen] = useState(false);
  const { chatId, selectedVariantId } = FOOTER_STATE.message;
  const groups = useReactionsForVariant(chatId, selectedVariantId);
  const viewerSeatId = useViewerSeatId(chatId);
  return (
    <>
      <Button intent="ghost" onClick={(): void => setOpen(true)}>
        Open the picker
      </Button>
      {open ? (
        <RowReactionPicker characterNames={[]} groups={groups} message={FOOTER_STATE.message} onOpenChange={setOpen} viewerSeatId={viewerSeatId} />
      ) : null}
    </>
  );
}

/**
 * The PICKER as its own subject (the component-presence ratchet's direct-CT decision). It mounts CLOSED
 * behind a plain trigger so one story can drive the whole lifecycle the row does — open → read the grid →
 * pick (which writes and closes) → reopen → dismiss without writing. A story that mounted it already-open
 * could pin the grid but neither of the two ways it CLOSES, which is half of what a dialog is.
 */
export function ReactionPickerStory(): ReactElement {
  return (
    <CtDataProviders>
      <div data-testid={storyTestId("pickerHost")} style={{ width: 320 }}>
        <ReactionPickerHarness />
      </div>
    </CtDataProviders>
  );
}
