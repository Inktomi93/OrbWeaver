// The explicit-commit dialog family: a dialog that commits owns one footer, Cancel and a required submit, so a form with no way
// out or no commit fails to compile. Cancel abandons pre-submit input, never a submitted write. A dialog with nothing to commit
// is a `DismissDialog`; `RequiredFormDialog` is the one forced ask, which D330 rules. A registry modal that commits
// takes the same form and footer from `ModalHost`, through `CommitForm` and `CommitFooter`. A `DismissDialog` stage that commits draws
// `CommitFooter` too, so every commit footer in a feature is this one: a second stage's exit is a Back, a stage with nothing to commit
// draws none, and the submit is whatever the stage's state makes it.

import { Button } from "@orb/ui/button";
import type { DialogPopupProps } from "@orb/ui/dialog";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogPopup, DialogTitle, DialogTrigger } from "@orb/ui/dialog";
import { Icon, X } from "@orb/ui/icons";
import { Corner, DialogBody, Stack } from "@orb/ui/layout";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { useId, useRef, useState } from "react";
import type { DialogSubmit, NonEmptyLabel } from "#lib";
import { DIALOG_VERBS, testId } from "#lib";
import type { CommitExit } from "./commit-row.tsx";
import { CommitRow } from "./commit-row.tsx";
import { ModalTitle } from "./modal-title.tsx";

/** A registered test-id key (the registry is the API — never a new literal). */
type TestKey = Parameters<typeof testId>[0];

export interface FormDialogRootProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Native completion seam for a forward-navigation dismissal, after the modal finishes closing. */
  readonly onOpenChangeComplete?: ComponentProps<typeof Dialog>["onOpenChangeComplete"];
  /**
   * The control that opens the dialog, when it sits beside it. It renders through the dialog's own trigger, so it states
   * `aria-haspopup="dialog"` and `aria-expanded` from the dialog's open state, opens it through `onOpenChange` and takes
   * focus back on close. A dialog opened from a menu command or another section has no trigger here.
   */
  readonly trigger?: ReactElement;
  readonly children: ReactNode;
}

interface DialogFrameProps {
  /** The title's whole text, which stays the dialog's name when a short window cuts it to one line. */
  readonly title: string;
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
  readonly submit: DialogSubmit<L>;
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
export function FormDialogRoot({ open, onOpenChange, onOpenChangeComplete, trigger, children }: FormDialogRootProps): ReactElement {
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
      {trigger === undefined ? null : <DialogTrigger render={trigger} />}
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
          <ModalTitle title={title} />
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

const isBlocked = (submit: Pick<DialogSubmit, "disabled" | "loading">): boolean => (submit.disabled ?? false) || (submit.loading ?? false);

// With a form the button submits it natively, so Enter and the press take one path through the form's own handler. A stage whose act
// is not a form presses the submit directly.
function SubmitButton<L extends string>({ submit, formId }: { readonly submit: DialogSubmit<L>; readonly formId: string | undefined }): ReactElement {
  return (
    <Button
      {...(submit.testKey === undefined ? {} : { "data-testid": testId(submit.testKey) })}
      disabled={submit.disabled ?? false}
      tone="primary"
      loading={submit.loading ?? false}
      {...(formId === undefined
        ? {
            type: "button" as const,
            onClick: (): void => {
              if (!isBlocked(submit)) {
                submit.onSubmit();
              }
            },
          }
        : { form: formId, type: "submit" as const })}
    >
      {submit.label}
    </Button>
  );
}

/** The popup of a dialog that commits: its body is a form, and its footer is Cancel and the submit. */
export function FormDialogPopup<L extends string>({ submit, footerLead, children, ...frame }: FormDialogPopupProps<L>): ReactElement {
  const formId = useId();
  const titleId = useId();
  return (
    <DialogFrame {...frame} titleId={titleId}>
      <CommitForm formId={formId} submit={submit} titleId={titleId}>
        {children}
      </CommitForm>
      <CommitFooter formId={formId} footerLead={footerLead} submit={submit} />
    </DialogFrame>
  );
}

interface CommitFooterProps<L extends string = string> {
  /** The form the submit submits; that form's submit handler runs `submit.onSubmit`. Omit for a stage whose act is not a form. */
  readonly formId?: string;
  readonly submit: DialogSubmit<L>;
  /** Controls beside the commit that do not commit, such as a selection's count, led into the footer before the exit. */
  readonly footerLead?: ReactNode;
  /** @defaultValue "cancel" */
  readonly exit?: CommitExit;
  /** The dialog refuses to close while its write is in flight, so the exit shows that it is held. @defaultValue false */
  readonly exitHeld?: boolean;
}

/**
 * A commit dialog's footer: the lead controls, then the exit and the submit. `FormDialogPopup` and `ModalHost` draw it under their form; a
 * stage of a `DismissDialog` whose reads suspend inside the frame draws it as the stage's own commit.
 */
export function CommitFooter<L extends string>({ formId, submit, footerLead, exit = "cancel", exitHeld = false }: CommitFooterProps<L>): ReactElement {
  return (
    <DialogFooter>
      {footerLead}
      <CommitRow exit={exit} exitHeld={exitHeld} surface="dialog">
        <SubmitButton formId={formId} submit={submit} />
      </CommitRow>
    </DialogFooter>
  );
}

/** The whole commit dialog, for a caller that holds the form state. A body that holds it renders {@link FormDialogPopup} under {@link FormDialogRoot}. */
export function FormDialog<L extends string>({ open, onOpenChange, onOpenChangeComplete, trigger, ...popup }: FormDialogProps<L>): ReactElement {
  return (
    <FormDialogRoot
      onOpenChange={onOpenChange}
      open={open}
      {...(onOpenChangeComplete === undefined ? {} : { onOpenChangeComplete })}
      {...(trigger === undefined ? {} : { trigger })}
    >
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
  trigger,
  children,
  ...frame
}: DismissDialogProps<L>): ReactElement {
  return (
    <FormDialogRoot
      onOpenChange={onOpenChange}
      open={open}
      {...(onOpenChangeComplete === undefined ? {} : { onOpenChangeComplete })}
      {...(trigger === undefined ? {} : { trigger })}
    >
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
        <CommitForm formId={formId} submit={submit} titleId={titleId}>
          {children}
        </CommitForm>
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
export function CommitForm<L extends string>({
  formId,
  submit,
  titleId,
  children,
}: {
  readonly formId: string;
  readonly submit: DialogSubmit<L>;
  /** The dialog title's id, which names the form. */
  readonly titleId: string;
  readonly children: ReactNode;
}): ReactElement {
  const blocked = isBlocked(submit);
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
