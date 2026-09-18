// RenameChatDialog — the single-controlled-input rename shell shared by ChatOptionsMenu and
// ChatListRowMenu (rollup-audit C1: byte-identical Rename anatomy in both). §13.4's single-rename
// carve-out (a controlled Input in a Dialog, not a form factory) still applies — this only dedupes the
// two identical wrappers around it.
//
// #2350 — migrated to `FormDialog` PROMPT mode. The anatomy is unchanged: a controlled Input plus
// Cancel/Save. The migration removes the raw `@orb/ui/dialog` import, resolving the
// `dialog-via-composite-debt` gate finding for this path.

import { Input } from "@orb/ui/input";
import type { ReactElement } from "react";
import { FormDialog } from "#components";

export interface RenameChatDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly onSave: () => void;
}

/** The chat rename dialog — a controlled title Input + Cancel/Save. */
export function RenameChatDialog({ open, onOpenChange, value, onValueChange, onSave }: RenameChatDialogProps): ReactElement {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Rename chat" size="sm" submit={{ label: "Save", onSubmit: onSave }}>
      <Input aria-label="Chat title" value={value} onValueChange={onValueChange} placeholder="Untitled chat" />
    </FormDialog>
  );
}
