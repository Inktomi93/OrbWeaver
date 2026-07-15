// Shared param-form dialog scaffolding for the Workloads dialogs (clone-audit item 7, settings-local):
// the Dialog→DialogPopup(testid)→Stack→Title/Description shell (create-schedule + edit-schedule +
// run-workload all paste it) and the align-end primary submit button. The form BODY stays per-dialog
// (each wires its own fields + save); only the chrome + submit affordance are shared here.

import { Button } from "@orb/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { testId } from "#lib";

/** A registered test-id key (the registry is the API — never a new literal). */
type TestKey = Parameters<typeof testId>[0];

export interface WorkloadFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** A registered test-id key for the popup (never a new literal — the registry is the API). */
  readonly testKey: TestKey;
  readonly title: ReactNode;
  readonly description: ReactNode;
  /** The dialog's form body. */
  readonly children: ReactNode;
}

/** The Workloads dialog shell: Dialog → popup (test-id) → Title + Description + the form body. */
export function WorkloadFormDialog({
  open,
  onOpenChange,
  testKey,
  title,
  description,
  children,
}: WorkloadFormDialogProps): ReactElement {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup data-testid={testId(testKey)}>
        <Stack gap="block">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          {children}
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}

export interface WorkloadSubmitButtonProps {
  readonly testKey: TestKey;
  readonly disabled: boolean;
  readonly label: string;
  readonly onSubmit: () => void;
}

/** The align-end primary submit button shared by the Workloads dialog bodies. */
export function WorkloadSubmitButton({
  testKey,
  disabled,
  label,
  onSubmit,
}: WorkloadSubmitButtonProps): ReactElement {
  return (
    <Stack align="end">
      <Button data-testid={testId(testKey)} disabled={disabled} intent="primary" onClick={onSubmit}>
        {label}
      </Button>
    </Stack>
  );
}
