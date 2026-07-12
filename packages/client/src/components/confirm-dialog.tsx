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
import type { ReactElement, ReactNode } from "react";

export interface ConfirmDialogProps {
  /** The alert-dialog heading. */
  readonly title: ReactNode;
  /** Supporting copy — plain text/fragment only (AlertDialogDescription IS a <p>; no nested <Text>). */
  readonly description: ReactNode;
  /** The confirm button's label. @defaultValue "Confirm" */
  readonly confirmLabel?: string;
  /** The confirm button's intent. @defaultValue "destructive" */
  readonly confirmIntent?: "destructive" | "primary";
  /** Fires on confirm click (the dialog closes itself via AlertDialogClose regardless of outcome). */
  readonly onConfirm: () => void;
  /** Uncontrolled: renders a default trigger button with this label. Omit to run controlled (below). */
  readonly triggerLabel?: string;
  /** Controlled open state — supply BOTH or neither (paired with a caller-owned trigger elsewhere). */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** Disables the confirm button (e.g. a pending mutation). */
  readonly confirmDisabled?: boolean;
  /** Shows the confirm button's busy state (e.g. `mutation.isPending`). */
  readonly confirmLoading?: boolean;
}

/**
 * The one confirm/destructive dialog — bundles Root/Trigger-or-controlled/Popup/Title/Description/
 * Actions so the anatomy can't drift (message-actions-row.tsx already dropped the Stack/Description
 * siblings once — the rollup audit's drift evidence). Run uncontrolled via `triggerLabel` (renders its
 * own trigger button) or controlled via `open`/`onOpenChange` (caller owns a separate trigger, e.g. a
 * menu item or icon action).
 *
 * Usage (uncontrolled): `<ConfirmDialog title="Delete this persona?" description={...} triggerLabel="Delete" onConfirm={onDelete} />`
 * Usage (controlled): `<ConfirmDialog title="Delete this chat?" description={...} open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={confirmDelete} />`
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  confirmIntent = "destructive",
  onConfirm,
  triggerLabel,
  open,
  onOpenChange,
  confirmDisabled = false,
  confirmLoading = false,
}: ConfirmDialogProps): ReactElement {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {triggerLabel === undefined ? null : (
        <AlertDialogTrigger render={<Button intent="ghost">{triggerLabel}</Button>} />
      )}
      <AlertDialogPopup>
        <Stack gap="block">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
          <AlertDialogActions>
            <AlertDialogClose render={<Button intent="ghost">Cancel</Button>} />
            <AlertDialogClose
              render={
                <Button
                  disabled={confirmDisabled}
                  intent={confirmIntent}
                  loading={confirmLoading}
                  onClick={onConfirm}
                >
                  {confirmLabel}
                </Button>
              }
            />
          </AlertDialogActions>
        </Stack>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
