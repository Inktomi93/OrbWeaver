// FormDialog — the client-shared composite over @orb/ui/dialog for FORM + single-control PROMPT dialogs
// (hoisted from the Workloads scaffold). Owns the Dialog→DialogPopup(test-id/size)→Stack→
// Title + Description + body anatomy so it can't drift (the ConfirmDialog precedent, for the non-alert
// species). Two footer shapes:
//   • FORM body — the submit lives INSIDE `children` via FormSubmitButton (it calls form.handleSubmit()).
//   • PROMPT — a single control is `children`; pass `submit` for the Cancel/Confirm footer this composite
//     renders below it (the tag-prompt / rename / merge shape). TagPickerDialog is built on this mode.
// OWNER RULING: lives client-shared (NOT @orb/ui — ui stays parts-only; the ConfirmDialog homing). G24
// (dialog-via-composite) seals the raw @orb/ui/dialog door in features/**: a form/prompt dialog uses this.
//
// PROMPT MODE IS A REAL `<form>` (side-eye 2026-08-03 P1): it was a Row of two buttons with no form and no
// key handler, so Enter in the single control did NOTHING — in EVERY prompt dialog in the app, including
// the tag picker whose entire flow is "type a name → confirm". The submit is `type="submit"`, so the
// browser's own implicit-submission gives Enter back for free, on every one of them at once. It composes
// with a combobox child: Base UI's Autocomplete consumes Enter while its list has a highlighted item
// (`submitOnItemClick` is false by default), so the first Enter picks and the second submits.

import { Button } from "@orb/ui/button";
import type { DialogPopupProps } from "@orb/ui/dialog";
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { testId } from "#lib";

/** A registered test-id key (the registry is the API — never a new literal). */
type TestKey = Parameters<typeof testId>[0];

/** The optional PROMPT-mode footer: a Cancel/Confirm Row below `children` (the single control). */
export interface FormDialogSubmit {
  /** The confirm button's label (e.g. "Apply" / "Create" / "Save"). */
  readonly label: string;
  /** Fires on confirm click (the caller closes the dialog itself; Cancel closes via DialogClose). */
  readonly onSubmit: () => void;
  /** Disables the confirm button (e.g. an empty required field or a pending mutation). @defaultValue false */
  readonly disabled?: boolean;
  /** Shows the confirm button's busy state. @defaultValue false */
  readonly loading?: boolean;
  /** The Cancel button's label. @defaultValue "Cancel" */
  readonly cancelLabel?: string;
  /** The confirm button's intent. @defaultValue "primary" */
  readonly intent?: "destructive" | "primary";
}

export interface FormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  /** Supporting copy under the title (DialogDescription IS a `<p>` — plain text/fragment only). Omit for a title-only dialog. */
  readonly description?: ReactNode;
  /** A registered test-id key for the popup (never a new literal — the registry is the API). Omit where the dialog has no test-id. */
  readonly testKey?: TestKey;
  /** DialogPopup size passthrough (a wide VIEW dialog uses "lg"). @defaultValue "md" */
  readonly size?: DialogPopupProps["size"];
  /** The dialog body — a form body (with its own FormSubmitButton) or, in PROMPT mode, the single control. */
  readonly children: ReactNode;
  /** PROMPT-mode footer — renders a Cancel/Confirm Row below `children`. Omit for a form-body dialog. */
  readonly submit?: FormDialogSubmit;
}

/**
 * The one form/prompt dialog shell — Dialog → popup (optional test-id + size) → Title + Description +
 * body, with an optional PROMPT-mode Cancel/Confirm footer. Form-body dialogs put their submit inside
 * `children` (FormSubmitButton); single-control prompts pass `submit`.
 */
export function FormDialog({ open, onOpenChange, title, description, testKey, size, children, submit }: FormDialogProps): ReactElement {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup {...(size === undefined ? {} : { size })} {...(testKey === undefined ? {} : { "data-testid": testId(testKey) })}>
        <Stack gap="block">
          <DialogTitle>{title}</DialogTitle>
          {description === undefined ? null : <DialogDescription>{description}</DialogDescription>}
          {submit === undefined ? children : <PromptBody submit={submit}>{children}</PromptBody>}
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}

/** The PROMPT footer's `<form>` — the single control plus the Cancel/Confirm Row, submitted by Enter.
 *
 *  A bare `<form>` intrinsic is the point: implicit submission is a BROWSER behaviour keyed on a real form
 *  owning a real `type="submit"` button, and no amount of `onKeyDown` on the control reproduces it for
 *  every child a prompt might carry. `noValidate` because the confirm's own `disabled` is this composite's
 *  validity model — a native bubble would speak a second, uncoordinated one. */
function PromptBody({ submit, children }: { readonly submit: FormDialogSubmit; readonly children: ReactNode }): ReactElement {
  const blocked = (submit.disabled ?? false) || (submit.loading ?? false);
  return (
    <form
      noValidate={true}
      onSubmit={(event): void => {
        event.preventDefault();
        if (!blocked) {
          submit.onSubmit();
        }
      }}
    >
      <Stack gap="block">
        {children}
        <Row gap="field" justify="end">
          <DialogClose render={<Button intent="ghost">{submit.cancelLabel ?? "Cancel"}</Button>} />
          <Button disabled={submit.disabled ?? false} intent={submit.intent ?? "primary"} loading={submit.loading ?? false} type="submit">
            {submit.label}
          </Button>
        </Row>
      </Stack>
    </form>
  );
}

export interface FormSubmitButtonProps {
  /** A registered test-id key for the submit button. */
  readonly testKey: TestKey;
  readonly disabled: boolean;
  readonly label: string;
  readonly onSubmit: () => void;
}

/** The align-end primary submit button for a FORM-body dialog (fires the form's handleSubmit). */
export function FormSubmitButton({ testKey, disabled, label, onSubmit }: FormSubmitButtonProps): ReactElement {
  return (
    <Stack align="end">
      <Button data-testid={testId(testKey)} disabled={disabled} intent="primary" onClick={onSubmit}>
        {label}
      </Button>
    </Stack>
  );
}
