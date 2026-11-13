// The one commit row: Cancel, then the submit, end-aligned, Cancel always the ghost variant. A dialog footer and an inline preflight draw
// it, so the order a person reaches for the primary action by is the same on both. Inside a dialog Cancel closes it; an island that is
// no dialog names its surface and passes what Cancel does, so a row outside a dialog cannot render a close with nothing to close.

import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { Row } from "@orb/ui/layout";
import type { ReactElement, ReactNode, Ref } from "react";
import { DIALOG_VERBS } from "#lib";

interface CommitRowShared {
  /** Cancel's word, for a flow whose way out is named for its own act. @defaultValue Cancel */
  readonly cancelLabel?: ReactNode;
  readonly cancelRef?: Ref<HTMLButtonElement>;
  /** The submit, drawn after Cancel. */
  readonly children: ReactNode;
}

// A "dialog" row is a dialog's footer, so Cancel closes that dialog. An "island" row sits outside a dialog, so Cancel does what `onCancel` says.
export type CommitRowProps = CommitRowShared &
  ({ readonly surface: "dialog"; readonly onCancel?: never } | { readonly surface: "island"; readonly onCancel: () => void });

export function CommitRow({ cancelLabel = DIALOG_VERBS.cancel, cancelRef, children, ...where }: CommitRowProps): ReactElement {
  const button = (
    <Button {...(cancelRef === undefined ? {} : { ref: cancelRef })} {...(where.surface === "island" ? { onClick: where.onCancel } : {})} variant="ghost">
      {cancelLabel}
    </Button>
  );
  const cancel: ReactElement = where.surface === "island" ? button : <DialogClose render={button} />;
  return (
    <Row align="center" gap="field" grow={true} justify="end" wrap={true}>
      {cancel}
      {children}
    </Row>
  );
}
