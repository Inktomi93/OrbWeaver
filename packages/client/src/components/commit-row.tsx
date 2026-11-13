// The one commit row: Cancel, then the submit, end-aligned, Cancel always the ghost variant. A dialog footer and an inline preflight draw
// it, so the order a person reaches for the primary action by is the same on both. Inside a dialog Cancel closes it; an island that is
// no dialog passes what Cancel does.

import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { Row } from "@orb/ui/layout";
import type { ReactElement, ReactNode, Ref } from "react";
import { DIALOG_VERBS } from "#lib";

export interface CommitRowProps {
  /** What Cancel does when the row sits outside a dialog. Inside a dialog omit it, and Cancel closes the dialog. */
  readonly onCancel?: () => void;
  /** Cancel's word, for a flow whose way out is named for its own act. @defaultValue Cancel */
  readonly cancelLabel?: ReactNode;
  readonly cancelRef?: Ref<HTMLButtonElement>;
  /** The submit, drawn after Cancel. */
  readonly children: ReactNode;
}

export function CommitRow({ onCancel, cancelLabel = DIALOG_VERBS.cancel, cancelRef, children }: CommitRowProps): ReactElement {
  const button = (
    <Button {...(cancelRef === undefined ? {} : { ref: cancelRef })} {...(onCancel === undefined ? {} : { onClick: onCancel })} variant="ghost">
      {cancelLabel}
    </Button>
  );
  const cancel: ReactElement = onCancel === undefined ? <DialogClose render={button} /> : button;
  return (
    <Row align="center" gap="field" grow={true} justify="end" wrap={true}>
      {cancel}
      {children}
    </Row>
  );
}
