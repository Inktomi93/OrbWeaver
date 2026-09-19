// The message row's STATIC accessible names — the one home for every affordance in a transcript row's
// action cluster and its variant pager (#2436, the #2261 pattern applied to the names that take no subject).
//
// WHY A MODULE AND NOT A LITERAL AT EACH BUTTON: these eight strings were re-spelled across four components
// and ~60 CT locators in nine spec files, none of which imported the thing they assert. That is exactly the
// coupling #2245 broke — a spec kept asserting a name the product no longer builds and stayed green because
// the row it looked for simply had zero matches. With the consts, the component and its tests read the same
// binding and a drifted spelling is a COMPILE error; the wording itself is pinned once, in
// `tests/client/features/chat/lib/message-action-names.dom.test.ts`.
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

/** The row's reaction door (`message-actions-row.tsx`, ordered AFTER Edit/Fork by the #786 owner ruling). */
export const MESSAGE_REACTION_ADD_NAME = "Add a reaction";

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

/** The variant pager's back chevron (`swipe-strip.tsx`), present only once a row has more than one variant. */
export const VARIANT_PREV_NAME = "Previous variant";

/** The variant pager's forward chevron — it STEPS, which is why it may only say this when a pager exists. */
export const VARIANT_NEXT_NAME = "Next variant";

/**
 * The lone forward chevron at `variantCount === 1` — it GENERATES rather than steps.
 *
 * #570 (owner, 2026-08-23) ruled the chevron and the ✨ menu's Regenerate row both stay, on condition that
 * their names stay honest; borrowing the pager's `Next variant` here is the exact drift that ruling forbids,
 * and `swipe-strip.ct.tsx` pins the stale name ABSENT as the regression control.
 */
export const VARIANT_GENERATE_NAME = "Generate a variant";
