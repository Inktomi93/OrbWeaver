// The message row's STATIC accessible names — the one home for every affordance in a transcript row's
// action cluster and its variant pager (#2436, the #2261 pattern applied to the names that take no subject).
//
// WHY A MODULE AND NOT A LITERAL AT EACH BUTTON: these eight strings were re-spelled across four components
// and ~60 CT locators in nine spec files, none of which imported the thing they assert. That is exactly the
// coupling #2245 broke — a spec kept asserting a name the product no longer builds and stayed green because
// the row it looked for simply had zero matches. With the consts, the component and its tests read the same
// binding and a drifted spelling is a COMPILE error; the wording itself is spelled once, here.
//
// It is a `.ts` LEAF on purpose: a CT spec's node side cannot import a value out of a `.tsx`, and these
// names are read from the node side of every spec that locates by role+name.
//
// NOT here: names that take a SUBJECT (`Actions for <x>`, `Remove <x>`) — those are BUILDERS and live at
// `@orb/client/lib` / `@orb/ui/lib`; and names a test FIXTURE invents (the `_ct-stories` footer
// disclosure's "What this turn did"), which no component renders.

/**
 * The row's edit affordance — BOTH the cluster's pencil door and the textarea it opens.
 *
 * ONE const rather than two identical literals because they are one affordance at two moments: the action
 * cluster is suppressed while editing (`message-row.tsx` — `editing ? null : …`), so the door and the field
 * never coexist and can never collide as two same-named controls in one row.
 */
export const MESSAGE_EDIT_NAME = "Edit message";

/** The row's fork door — branches the conversation at this message. */
export const MESSAGE_FORK_NAME = "Fork chat here";

/** The row's overflow-menu door that copies the message to a new slot at the end of the chat. */
export const MESSAGE_DUPLICATE_NAME = "Duplicate message";

/** Why the duplicate door is disabled while a turn is generating in the room. */
export const MESSAGE_DUPLICATE_GENERATING = "Wait for the reply to finish.";

/** The viewer's own user row's restamp door: their lines from this one onward take their current persona. */
export const MESSAGE_REATTRIBUTE_NAME = "Reattribute from here";

/** The host's submenu on a reply: it re-voices the row onto another character seated in the room. */
export const MESSAGE_REATTRIBUTE_VOICE_NAME = "Reattribute";

/** The disabled reason beside that door, and the toast its refusal raises. */
export const MESSAGE_REATTRIBUTE_NO_OTHER_SEAT = "No other character is in this chat.";
export const MESSAGE_REATTRIBUTE_GENERATING = "Wait for the reply to finish before changing its voice.";
export const MESSAGE_REATTRIBUTE_VOICE_FAILED = "Couldn't reattribute that message.";

/** The host-only door to the prompt a reply was generated from, in the row's overflow menu. */
export const MESSAGE_VIEW_WIRE_TRACE_NAME = "View wire trace…";

/** The row's reaction door (`message-actions-row.tsx`, ordered AFTER Edit/Fork by the #786 owner ruling). */
export const MESSAGE_REACTION_ADD_NAME = "Add a reaction";

/** The row's checkbox in bulk selection mode. */
export const MESSAGE_SELECT_NAME = "Select message";

/**
 * The transcript article's name: the speaker and the row's own number (`#3`, the `message-readout` label), `Aria · #3`.
 *
 * The article is the scope every control in a row sits under ("Edit message" under `Aria · #3`). A speaker's name alone
 * gave every message they wrote the same scope, so a transcript of eight replies offered eight identical "Edit message"
 * buttons to a name-driven walk. A row with no number (a draft greeting) keeps the speaker alone; there is only one.
 */
export function messageArticleName(speaker: string | null, position: number | undefined): string | undefined {
  if (position === undefined) {
    return speaker ?? undefined;
  }
  return speaker === null ? `Message #${String(position)}` : `${speaker} · #${String(position)}`;
}

/**
 * The row's overflow menu trigger.
 *
 * DELIBERATELY DISTINCT from the composer's own utility menu (`composer-utility-menu.tsx`, "Message tools"):
 * #869 found Chrome stacking two tooltips with different copy because a popup restated a name instead of
 * speaking the trigger's verbatim, and the two menus have carried separate names since.
 */
export const MESSAGE_ACTIONS_MENU_NAME = "More message actions";

/**
 * The settled reasoning disclosure's label (`message-row-parts.tsx`).
 *
 * The CHANNEL names itself rather than a duration: a canon-rehydrated row carries no measured think window,
 * so "Thought for 4s" there would be a fabricated number.
 */
export const MESSAGE_REASONING_NAME = "Reasoning";

/** The host's reorder arrows in the message edit toolbar (`message-move-arrows.tsx`). */
export const MESSAGE_MOVE_UP_NAME = "Move up";
export const MESSAGE_MOVE_DOWN_NAME = "Move down";

/** The disabled reasons, shown beside the arrows (never `title` alone). */
export const MESSAGE_MOVE_UP_UNAVAILABLE = "No message above this one.";
export const MESSAGE_MOVE_DOWN_UNAVAILABLE = "No message below this one.";
export const MESSAGE_MOVE_GENERATING = "Wait for the reply to finish.";
export const MESSAGE_MOVE_LOADING = "Loading the conversation…";

/** The toasts a move that stopped before it reached the server raises, and the one its server refusal shares. */
export const MESSAGE_MOVE_FAILED = "Couldn't move that message.";
export const MESSAGE_MOVE_NEIGHBOUR_GONE = "That message moved. Try again.";

/** The settled reasoning block's author-or-host controls (`message-reasoning.tsx`). The field and its door share
 *  one name for the reason `MESSAGE_EDIT_NAME` gives: the door is hidden while the field is open. */
export const MESSAGE_REASONING_EDIT_NAME = "Edit reasoning";
export const MESSAGE_REASONING_SAVE_NAME = "Save reasoning";
export const MESSAGE_REASONING_CANCEL_NAME = "Cancel reasoning edit";
export const MESSAGE_REASONING_CLEAR_NAME = "Clear reasoning";

/** The clear confirm's copy; the confirm button carries the verb alone. */
export const MESSAGE_REASONING_CLEAR_TITLE = "Clear this reasoning?";
export const MESSAGE_REASONING_CLEAR_DESCRIPTION = "This removes the saved reasoning from the message. This can't be undone.";
export const MESSAGE_REASONING_CLEAR_CONFIRM = "Clear";

/** The variant pager's back chevron (`swipe-strip.tsx`), disabled until a sibling variant exists. */
export const VARIANT_PREV_NAME = "Previous variant";

/** The forward chevron while an already-generated sibling lies ahead. */
export const VARIANT_NEXT_NAME = "Next variant";

/**
 * The forward chevron at the newest variant — it generates rather than steps.
 *
 * #570 (owner, 2026-08-23) ruled the chevron and the ✨ menu's Regenerate row both stay, on condition that
 * their names stay honest; borrowing the pager's `Next variant` here is the exact drift that ruling forbids.
 */
export const VARIANT_GENERATE_NAME = "Regenerate a variant";

/** The row menu's clipboard copy of the shown text. */
export const MESSAGE_COPY_NAME = "Copy";

/** The row menu's prompt-exclusion toggle, in both states. */
export const MESSAGE_HIDE_FROM_AI_NAME = "Hide from AI";
export const MESSAGE_UNHIDE_FROM_AI_NAME = "Unhide from AI";

/** The prompt-exclusion toggle's name for the message's current state. */
export function messagePromptToggleName(excluded: boolean): string {
  return excluded ? MESSAGE_UNHIDE_FROM_AI_NAME : MESSAGE_HIDE_FROM_AI_NAME;
}

// A tool call's prompt toggle while the call is hidden from the model.
const TOOL_CALL_SHOW_TO_AI_NAME = "Show to AI";

/** A tool call's prompt toggle for the call's current state. */
export function toolCallVisibilityName(hidden: boolean): string {
  return hidden ? TOOL_CALL_SHOW_TO_AI_NAME : MESSAGE_HIDE_FROM_AI_NAME;
}

/** The row menu's continue snapshot pair on an assistant reply. */
export const MESSAGE_UNDO_CONTINUATION_NAME = "Undo last continuation";
export const MESSAGE_REAPPLY_CONTINUATION_NAME = "Re-apply continuation";

/** An earlier reply's swipe count, in words: "Reply 3 of 3", or "Edited reply, 3 alternates" off the list. */
export function variantCountName(current: number | null, total: number): string {
  return current === null ? `Edited reply, ${String(total)} alternates` : `Reply ${String(current)} of ${String(total)}`;
}

/** A tool call card's delete trigger. */
export const MESSAGE_DELETE_TOOL_CALL_NAME = "Delete tool call";

/** The tool call delete confirm's title. */
export const MESSAGE_DELETE_TOOL_CALL_TITLE = "Delete this tool call?";

/** The wire viewer's gone state: the message was deleted. */
export const VARIANT_WIRE_GONE_TITLE = "This reply is gone";

/** What the wire viewer reads, as its failed-read sentence names it. */
export const VARIANT_WIRE_READ = "the wire record";
