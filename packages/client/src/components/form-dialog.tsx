// The explicit-commit dialog family: a dialog that commits owns one footer, Cancel and a required submit, so a form with no way
// out or no commit fails to compile. Cancel abandons pre-submit input, never a submitted write. A dialog with nothing to commit
// is a `DismissDialog`; `RequiredFormDialog` is the one forced ask, which D330 rules.

import { Button } from "@orb/ui/button";
import type { DialogPopupProps } from "@orb/ui/dialog";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Icon, X } from "@orb/ui/icons";
import { Corner, DialogBody, Row, Stack } from "@orb/ui/layout";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { useId, useRef, useState } from "react";
import { DIALOG_VERBS, testId } from "#lib";
import type { NonEmptyLabel } from "./non-empty-label.ts";

/** A registered test-id key (the registry is the API — never a new literal). */
type TestKey = Parameters<typeof testId>[0];

interface FormDialogSubmit<L extends string = string> {
  /** The submit button's label (e.g. "Apply" / "Create" / "Save"). */
  readonly label: NonEmptyLabel<L>;
  /** Fires on the button and on Enter; the caller closes the dialog itself. Never fires while `disabled` or `loading`. */
  readonly onSubmit: () => void;
  /** Disables the submit button (e.g. an empty required field or a pending mutation). @defaultValue false */
  readonly disabled?: boolean;
  /** Shows the submit button's busy state. @defaultValue false */
  readonly loading?: boolean;
  /** A registered test-id key for the submit button. */
  readonly testKey?: TestKey;
}

export interface FormDialogRootProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Native completion seam for a forward-navigation dismissal, after the modal finishes closing. */
  readonly onOpenChangeComplete?: ComponentProps<typeof Dialog>["onOpenChangeComplete"];
  readonly children: ReactNode;
}

interface DialogFrameProps {
  readonly title: ReactNode;
  /** Land focus on the title: a body filled by one tall control would otherwise open scrolled past the heading. */
  readonly arriveOnTitle?: boolean;
  /** Supporting copy under the title (DialogDescription IS a `<p>` — plain text/fragment only). Omit for a title-only dialog. */
  readonly description?: ReactNode;
  /** A registered test-id key for the popup (never a new literal — the registry is the API). Omit where the dialog has no test-id. */
  readonly testKey?: TestKey;
  /** DialogPopup size passthrough (a wide VIEW dialog uses "lg"). @defaultValue "md" */
  readonly size?: DialogPopupProps["size"];
  /** Native block-axis placement; changing-height forms can pin their heading at the viewport gutter. */
  readonly anchor?: DialogPopupProps["anchor"];
  /**
   * A close glyph in the title row's corner, the frame the shell's own modals wear. It follows the body in tab order, so the
   * dialog still opens on its first real control rather than on the glyph.
   * @defaultValue false
   */
  readonly closeButton?: boolean;
  /** Where focus goes on close. Give one when the dialog can open with no trigger focused (a request from another
   *  section), or its close drops focus on the page body. */
  readonly finalFocus?: DialogPopupProps["finalFocus"];
  readonly children: ReactNode;
}

export interface FormDialogPopupProps<L extends string = string> extends DialogFrameProps {
  readonly submit: FormDialogSubmit<L>;
  /** Controls that act on the form without committing it, led into the footer before Cancel. */
  readonly footerLead?: ReactNode;
}

export type FormDialogProps<L extends string = string> = Omit<FormDialogRootProps, "children"> & FormDialogPopupProps<L>;

/** The ways out of a dialog with nothing to commit: a footer verb, a corner glyph or both. Touch has no Escape, so one is required. */
type DismissPath<L extends string> =
  | {
      /** The footer's one `DialogClose`. */
      readonly dismissLabel: NonEmptyLabel<L>;
      /** The verb is the dialog's main act, as Done is on an autosaving editor. @defaultValue false */
      readonly dismissPrimary?: boolean;
    }
  | { readonly closeButton: true; readonly dismissLabel?: never; readonly dismissPrimary?: never };

export type DismissDialogProps<L extends string = string> = Omit<FormDialogRootProps, "children"> & DialogFrameProps & DismissPath<L>;

export type RequiredFormDialogProps<L extends string = string> = Omit<DialogFrameProps, "closeButton"> & Pick<FormDialogPopupProps<L>, "submit">;

/**
 * The dialog root for a body that holds its own form state. Base UI unmounts a closed popup, so a body inside it is fresh on
 * every open; a body that renders `FormDialogPopup` sits above the popup, so this root gives it the same lifetime, from the
 * open through the end of the close motion.
 */
export function FormDialogRoot({ open, onOpenChange, onOpenChangeComplete, children }: FormDialogRootProps): ReactElement {
  const [held, setHeld] = useState(open);
  if (open && !held) {
    setHeld(true);
  }
  return (
    <Dialog
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next): void => {
        if (!next) {
          setHeld(false);
        }
        onOpenChangeComplete?.(next);
      }}
      open={open}
    >
      {open || held ? children : null}
    </Dialog>
  );
}

function DialogFrame({
  title,
  description,
  testKey,
  size,
  anchor,
  arriveOnTitle = false,
  closeButton = false,
  finalFocus,
  titleId,
  children,
}: DialogFrameProps & { readonly titleId?: string }): ReactElement {
  const titleRef = useRef<HTMLHeadingElement>(null);
  return (
    <DialogPopup
      {...(size === undefined ? {} : { size })}
      {...(anchor === undefined ? {} : { anchor })}
      {...(testKey === undefined ? {} : { "data-testid": testId(testKey) })}
      {...(finalFocus === undefined ? {} : { finalFocus })}
      {...(arriveOnTitle ? { initialFocus: titleRef } : {})}
    >
      {/* The popup clamps to the viewport, so a tall body scrolls inside this Stack while the sticky footer
          stays visible on a phone. */}
      <DialogBody grow={true} gap="block">
        <DialogTitle clearsClose={closeButton} focusTarget={arriveOnTitle} id={titleId} {...(arriveOnTitle ? { ref: titleRef, tabIndex: -1 } : {})}>
          {title}
        </DialogTitle>
        {description === undefined ? null : <DialogDescription>{description}</DialogDescription>}
        {children}
      </DialogBody>
      {closeButton ? (
        <Corner>
          <DialogClose
            render={
              <Button aria-label={DIALOG_VERBS.close} variant="ghost" square={true} type="button">
                <Icon icon={X} size="sm" />
              </Button>
            }
          />
        </Corner>
      ) : null}
    </DialogPopup>
  );
}

function SubmitButton<L extends string>({ submit, formId }: { readonly submit: FormDialogSubmit<L>; readonly formId: string }): ReactElement {
  return (
    <Button
      {...(submit.testKey === undefined ? {} : { "data-testid": testId(submit.testKey) })}
      disabled={submit.disabled ?? false}
      form={formId}
      tone="primary"
      loading={submit.loading ?? false}
      type="submit"
    >
      {submit.label}
    </Button>
  );
}

/** The popup of a dialog that commits: its body is a form, and its footer is Cancel and the submit. */
export function FormDialogPopup<L extends string>({ submit, footerLead, children, ...frame }: FormDialogPopupProps<L>): ReactElement {
  const formId = useId();
  const titleId = useId();
  const cancel = <DialogClose render={<Button variant="ghost">{DIALOG_VERBS.cancel}</Button>} />;
  return (
    <DialogFrame {...frame} titleId={titleId}>
      <PromptBody formId={formId} submit={submit} titleId={titleId}>
        {children}
      </PromptBody>
      {footerLead === undefined ? (
        <DialogFooter>
          {cancel}
          <SubmitButton formId={formId} submit={submit} />
        </DialogFooter>
      ) : (
        <DialogFooter>
          {footerLead}
          <Row grow={true} gap="row" justify="end">
            {cancel}
            <SubmitButton formId={formId} submit={submit} />
          </Row>
        </DialogFooter>
      )}
    </DialogFrame>
  );
}

/** The whole commit dialog, for a caller that holds the form state. A body that holds it renders {@link FormDialogPopup} under {@link FormDialogRoot}. */
export function FormDialog<L extends string>({ open, onOpenChange, onOpenChangeComplete, ...popup }: FormDialogProps<L>): ReactElement {
  return (
    <FormDialogRoot onOpenChange={onOpenChange} open={open} {...(onOpenChangeComplete === undefined ? {} : { onOpenChangeComplete })}>
      <FormDialogPopup {...popup} />
    </FormDialogRoot>
  );
}

/** A dialog with nothing to commit: its body is its whole act, or its stages own their commits, and the frame owns the way out. */
export function DismissDialog<L extends string>({
  open,
  onOpenChange,
  onOpenChangeComplete,
  dismissLabel,
  dismissPrimary = false,
  children,
  ...frame
}: DismissDialogProps<L>): ReactElement {
  return (
    <FormDialogRoot onOpenChange={onOpenChange} open={open} {...(onOpenChangeComplete === undefined ? {} : { onOpenChangeComplete })}>
      <DialogFrame {...frame}>
        {children}
        {dismissLabel === undefined ? null : (
          <DialogFooter>
            <DialogClose render={<Button {...(dismissPrimary ? {} : { variant: "ghost" as const })}>{dismissLabel}</Button>} />
          </DialogFooter>
        )}
      </DialogFrame>
    </FormDialogRoot>
  );
}

/** The forced ask: always open, its submit the only way out, so it takes no open state and draws no Cancel. */
export function RequiredFormDialog<L extends string>({ submit, children, ...frame }: RequiredFormDialogProps<L>): ReactElement {
  const formId = useId();
  const titleId = useId();
  return (
    <Dialog open={true}>
      <DialogFrame {...frame} titleId={titleId}>
        <PromptBody formId={formId} submit={submit} titleId={titleId}>
          {children}
        </PromptBody>
        <DialogFooter>
          <SubmitButton formId={formId} submit={submit} />
        </DialogFooter>
      </DialogFrame>
    </Dialog>
  );
}

/** The body's `<form>`, submitted by Enter.
 *
 *  A bare `<form>` intrinsic is the point: implicit submission is a BROWSER behaviour keyed on a real form
 *  owning a real `type="submit"` button, and no amount of `onKeyDown` on the control reproduces it for
 *  every child a prompt might carry. The submit button lives in the sticky footer, OUTSIDE this form, and
 *  names it through the `form` attribute — which still makes it the form's default button for Enter.
 *  `noValidate` because the confirm's own `disabled` is this composite's validity model — a native bubble
 *  would speak a second, uncoordinated one. */
function PromptBody<L extends string>({
  formId,
  submit,
  titleId,
  children,
}: {
  readonly formId: string;
  readonly submit: FormDialogSubmit<L>;
  readonly titleId: string;
  readonly children: ReactNode;
}): ReactElement {
  const blocked = (submit.disabled ?? false) || (submit.loading ?? false);
  return (
    <form
      aria-labelledby={titleId}
      id={formId}
      noValidate={true}
      onSubmit={(event): void => {
        event.preventDefault();
        if (!blocked) {
          submit.onSubmit();
        }
      }}
    >
      <Stack gap="block">{children}</Stack>
    </form>
  );
}
