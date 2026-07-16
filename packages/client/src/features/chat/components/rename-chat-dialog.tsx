// RenameChatDialog — the single-controlled-input rename shell shared by ChatOptionsMenu and
// ChatListRowMenu (rollup-audit C1: byte-identical Rename anatomy in both). §13.4's single-rename
// carve-out (a controlled Input in a Dialog, not a form factory) still applies — this only dedupes the
// two identical wrappers around it.

import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup size="sm">
        <Stack gap="block">
          <DialogTitle>Rename chat</DialogTitle>
          <Input aria-label="Chat title" value={value} onValueChange={onValueChange} placeholder="Untitled chat" />
          <Row gap="row" justify="end">
            <DialogClose render={<Button intent="ghost">Cancel</Button>} />
            <Button intent="primary" onClick={onSave}>
              Save
            </Button>
          </Row>
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}
