// The document RENAME flow — a SMALL single-field Dialog (§13.4's "single rename" allowlist: controlled
// local state, no form factory), the `PresetRenameDialog` shape. Renaming touches display metadata only:
// nothing derived moves, no re-index is triggered. Owns its overlay (a component, not a surface).

import { Button } from "@orb/ui/button";
import { DialogClose, DialogFooter } from "@orb/ui/dialog";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { FormDialog } from "#components";
import { DIALOG_VERBS, useFocusOnMount } from "#lib";
import { DATABANK_DOCUMENT_NAME_FIELD_NAME, DATABANK_RENAME_NAME } from "../lib/databank-names.ts";

export interface DatabankRenameDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentName: string;
  readonly onRename: (name: string) => void;
}

export function DatabankRenameDialog({ open, onOpenChange, currentName, onRename }: DatabankRenameDialogProps): ReactElement {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusOnMount(inputRef);

  const trimmed = name.trim();
  const canSave = trimmed !== "" && trimmed !== currentName;

  return (
    <FormDialog
      onOpenChange={(next): void => {
        // Re-seed on each open so a cancelled edit doesn't carry into the next rename.
        if (next) {
          setName(currentName);
        }
        onOpenChange(next);
      }}
      open={open}
      title={DATABANK_RENAME_NAME}
    >
      <form
        aria-label={DATABANK_RENAME_NAME}
        onSubmit={(event): void => {
          event.preventDefault();
          if (canSave) {
            onRename(trimmed);
            onOpenChange(false);
          }
        }}
      >
        <Stack gap="block">
          {/* Focus lands on the field through the shared mount hook rather than `autoFocus` — same behavior,
              no a11y suppression to carry (the suppressions ratchet only shrinks). */}
          <Input aria-label={DATABANK_DOCUMENT_NAME_FIELD_NAME} onValueChange={setName} placeholder="Document name" ref={inputRef} value={name} />
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">{DIALOG_VERBS.cancel}</Button>} />
            <Button disabled={!canSave} type="submit">
              {DIALOG_VERBS.save}
            </Button>
          </DialogFooter>
        </Stack>
      </form>
    </FormDialog>
  );
}
