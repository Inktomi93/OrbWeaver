// ConfirmDialog — the client-shared composite over @orb/ui/alert-dialog (rollup-audit C1). 16 call
// sites hand-assembled this exact anatomy, each pasting the same `/* nested <Text> is invalid HTML */`
// footgun comment (AlertDialogDescription IS a <p>; a nested <Text> is also a <p> — invalid nesting).
// This composite kills the footgun STRUCTURALLY: plain string/fragment children only, never <Text>.
// OWNER RULING: lives client-shared (NOT @orb/ui — ui stays parts-only); client-structure.ts's
// OUTER_CONTAINER regex already exempts `<ConfirmDialog` for exactly this reason.

import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@orb/ui/alert-dialog";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode, RefObject } from "react";
import { useState } from "react";

export interface ConfirmDialogProps {
  /** The alert-dialog heading. */
  readonly title: ReactNode;
  /** Supporting copy — plain text/fragment only (AlertDialogDescription IS a <p>; no nested <Text>). Omit for a title-only confirm. */
  readonly description?: ReactNode;
  /** OPTIONAL controls the decision itself needs — rendered BETWEEN the description and the actions, outside
   *  the `<p>` (which is exactly why it cannot ride `description`: an interactive control nested in a
   *  paragraph is the invalid-nesting footgun this composite exists to make unreachable). For a confirm that
   *  is genuinely a small FORM — the host handoff's "also give copies…" opt-in — not for decoration. */
  readonly body?: ReactNode;
  /** The confirm button's label. @defaultValue "Confirm" */
  readonly confirmLabel?: string;
  /** The cancel button's label. @defaultValue "Cancel" */
  readonly cancelLabel?: string;
  /** The confirm button's intent. @defaultValue "destructive" */
  readonly confirmIntent?: "destructive" | "primary";
  /**
   * Fires on confirm click. RETURN THE VERB'S SETTLE and this dialog becomes its retry surface (#1563).
   *
   * ═══ WHY THE RETURN VALUE IS THE CONTRACT ═════════════════════════════════════════════════════════
   * This used to close via `AlertDialogClose` REGARDLESS of outcome, which made a whole class of failure
   * UI unreachable BY CONSTRUCTION: the close was not the caller's to gate, so a destructive confirm could
   * never be the retry surface for the verb it fires, and a CT asserting "the confirm stays open on
   * failure" could not be written at all. Where the caller had a second surface that outlives the confirm
   * (the gallery's lightbox) the failure landed there; where it had none, a rejected destructive mutation
   * left the reader with a vanished dialog, a row that may or may not still be there, and nothing to
   * retry from.
   *
   * TWO SHAPES, ONE RULE — the dialog closes when the ACT is done, and returning nothing means it is done
   * on click (every state-only confirm, unchanged). A returned promise means the act is still in flight:
   * the confirm holds, shows its busy state, closes on resolve, and on REJECTION stays open with the
   * reason and its own button as the retry. `mutateAsync`, not `mutate`, is what produces that promise.
   */
  readonly onConfirm: () => void | Promise<void>;
  /** Uncontrolled: the caller's own trigger element (ConfirmDialog owns the open state). Omit to run controlled (below). */
  readonly trigger?: ReactElement;
  /** Controlled open state — supply BOTH or neither (paired with a caller-owned trigger elsewhere). */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** Disables the confirm button (e.g. a pending mutation). */
  readonly confirmDisabled?: boolean;
  /** Shows the confirm button's busy state (e.g. `mutation.isPending`). */
  readonly confirmLoading?: boolean;
  /** Force-renders the backdrop when this confirm nests inside another open Dialog/AlertDialog. */
  readonly forceRender?: boolean;
  /** Where focus goes on close. Give one when the act unmounts the trigger, or focus falls to the page body. */
  readonly finalFocus?: RefObject<HTMLElement | null>;
}

/**
 * Does this `onConfirm` return value name work that is still in flight?
 *
 * PROBING FOR THE THENABLE, not for `undefined` (#1632 item 6). `void` is a TYPE-level erasure, never a
 * runtime one: TypeScript happily assigns `() => number` to `() => void`, so a handler DECLARED `(): void`
 * whose body ends in an expression — `onClick={(): void => setOpen(false)}` is fine, but
 * `(): void => list.push(x)` returns a number — hands this component a value that is neither `undefined`
 * nor a promise. The old `settle === undefined` test let such a value through to `settle.then(…)`, which is
 * a TypeError inside a click handler: the confirm neither closes nor reports, i.e. the exact dead-end the
 * #1563 retry surface exists to remove. No live call site does this today (all 25 `onConfirm` sites read),
 * so this is a widened FLOOR rather than a bug fix — the seam accepts `void` from callers it cannot see the
 * bodies of, and the honest question at a boundary like that is "can I await it", never "is it undefined".
 */
function isSettle(value: void | Promise<void>): value is Promise<void> {
  return typeof (value as { then?: unknown } | undefined)?.then === "function";
}

/**
 * The one confirm/destructive dialog — bundles Root/Trigger-or-controlled/Popup/Title/Description/
 * Actions so the anatomy can't drift (message-actions-row.tsx already dropped the Stack/Description
 * siblings once — the rollup audit's drift evidence). Run uncontrolled via `trigger` (renders the given
 * element as the trigger) or controlled via `open`/`onOpenChange` (caller owns a separate trigger, e.g. a
 * menu item or icon action).
 *
 * Usage (uncontrolled): `<ConfirmDialog title="Delete this persona?" description={...} trigger={<Button intent="ghost">Delete</Button>} onConfirm={onDelete} />`
 * Usage (controlled): `<ConfirmDialog title="Delete this chat?" description={...} open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={confirmDelete} />`
 */
export function ConfirmDialog({
  title,
  description,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmIntent = "destructive",
  onConfirm,
  trigger,
  open,
  onOpenChange,
  confirmDisabled = false,
  confirmLoading = false,
  forceRender,
  finalFocus,
}: ConfirmDialogProps): ReactElement {
  // The dialog owns its open state in BOTH entry shapes, because a close that must wait for an outcome
  // cannot be Base UI's to make (#1563). Controlled callers are unaffected: `open` still wins, and every
  // transition — theirs, the trigger's, Cancel's, ours — goes out through their `onOpenChange`.
  const [selfOpen, setSelfOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const isOpen = open ?? selfOpen;

  const moveOpen = (next: boolean): void => {
    if (open === undefined) {
      setSelfOpen(next);
    }
    if (!next) {
      // A closed confirm forgets its failure: the next opening is a new decision, not a resumed one.
      setFailure(null);
    }
    onOpenChange?.(next);
  };

  const onConfirmClick = (): void => {
    const settle = onConfirm();
    if (!isSettle(settle)) {
      // Nothing to wait for — the act was done on click, which is every state-only confirm.
      moveOpen(false);
      return;
    }
    setSettling(true);
    // A CHAINED `.catch`, never `.then(ok, err)`: a two-handler `then` leaves a throw inside the success
    // handler unhandled, where a chained catch sees both arms. The failure is OWNED here — rendered, with
    // this dialog's own button as the retry — so nothing is swallowed.
    void settle
      .then((): void => moveOpen(false))
      .catch((error: unknown): void => {
        // The fallback string is FAILURE-VALUED in its own words, and both arms are: the ownership gate
        // reads the argument, and "no reason" alone would not say that anything failed.
        setFailure(error instanceof Error && error.message !== "" ? error.message : "the request failed and gave no reason.");
      })
      .finally((): void => setSettling(false));
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={moveOpen}>
      {trigger === undefined ? null : <AlertDialogTrigger render={trigger} />}
      <AlertDialogPopup {...(forceRender === undefined ? {} : { forceRender })} {...(finalFocus === undefined ? {} : { finalFocus })}>
        <Stack gap="block">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description === undefined ? null : <AlertDialogDescription>{description}</AlertDialogDescription>}
          {body}
          {/* THE FAILURE, IN THE DIALOG THAT CAUSED IT. `role="alert"` because it arrives after the press,
              so a reader who is not looking at this line still hears it; the confirm button below is the
              retry, which is why nothing here is a second control. */}
          {failure === null ? null : (
            <Text data-slot="confirm-dialog-failure" role="alert" tone="destructive">
              {`That didn't go through — ${failure}`}
            </Text>
          )}
          <AlertDialogActions>
            <AlertDialogClose render={<Button intent="ghost">{cancelLabel}</Button>} />
            {/* NOT an `AlertDialogClose` (#1563): the close is this component's to decide once the outcome
                is known. Cancel stays one, because abandoning is done the moment it is pressed. */}
            <Button disabled={settling ? true : confirmDisabled} intent={confirmIntent} loading={settling ? true : confirmLoading} onClick={onConfirmClick}>
              {confirmLabel}
            </Button>
          </AlertDialogActions>
        </Stack>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
