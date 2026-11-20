// The one commit row: the exit, then the submit, end-aligned, the exit always the ghost variant. A dialog footer and an inline preflight draw
// it, so the order a person reaches for the primary action by is the same on both. Inside a dialog Cancel closes it; an island that is
// no dialog names its surface and passes what Cancel does, so a row outside a dialog cannot render a close with nothing to close.
// A dialog stage's exit is Cancel, a Back to the stage before it, or the frame's corner close alone.

import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { Row } from "@orb/ui/layout";
import type { ReactElement, ReactNode, Ref } from "react";
import { DIALOG_VERBS } from "#lib";

/**
 * How a dialog's commit row leaves: `cancel` closes the dialog, `back` returns to the stage before this one and keeps the dialog open, and
 * `corner` draws no exit in the row because the frame's corner close is the stage's one way out.
 */
export type CommitExit = "cancel" | "corner" | { readonly back: () => void };

interface CommitRowShared {
  /** Cancel's word, for a flow whose way out is named for its own act. @defaultValue Cancel */
  readonly cancelLabel?: ReactNode;
  readonly cancelRef?: Ref<HTMLButtonElement>;
  /** A write in flight holds the dialog until it settles, so its exit is held with it. @defaultValue false */
  readonly exitHeld?: boolean;
  /** The submit, drawn after the exit. */
  readonly children: ReactNode;
}

// A "dialog" row is a dialog's footer, so Cancel closes that dialog. An "island" row sits outside a dialog, so Cancel does what `onCancel` says.
export type CommitRowProps = CommitRowShared &
  (
    | { readonly surface: "dialog"; readonly exit?: CommitExit; readonly onCancel?: never }
    | { readonly surface: "island"; readonly onCancel: () => void; readonly exit?: never }
  );

function exitOf({ cancelLabel = DIALOG_VERBS.cancel, cancelRef, exitHeld = false, ...where }: Omit<CommitRowProps, "children">): ReactElement | null {
  if (where.surface === "island") {
    return (
      <Button ref={cancelRef} disabled={exitHeld} onClick={where.onCancel} variant="ghost">
        {cancelLabel}
      </Button>
    );
  }
  const exit = where.exit ?? "cancel";
  if (exit === "corner") {
    return null;
  }
  if (exit === "cancel") {
    return (
      <DialogClose
        render={
          <Button ref={cancelRef} disabled={exitHeld} variant="ghost">
            {cancelLabel}
          </Button>
        }
      />
    );
  }
  return (
    <Button ref={cancelRef} disabled={exitHeld} onClick={exit.back} type="button" variant="ghost">
      {DIALOG_VERBS.back}
    </Button>
  );
}

export function CommitRow({ children, ...row }: CommitRowProps): ReactElement {
  return (
    <Row align="center" gap="field" grow={true} justify="end" wrap={true}>
      {exitOf(row)}
      {children}
    </Row>
  );
}
