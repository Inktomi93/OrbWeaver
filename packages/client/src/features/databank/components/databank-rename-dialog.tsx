// The document RENAME flow — a SMALL single-field prompt (§13.4's "single rename" allowlist: controlled
// local state, no form factory), the `RenameChatDialog` shape on `FormDialog` prompt mode. Renaming touches
// display metadata only: nothing derived moves, no re-index is triggered. Owns its overlay (a component, not a surface).

import { Input } from "@orb/ui/input";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog } from "#components";

export interface DatabankRenameDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentName: string;
  readonly onRename: (name: string) => void;
}

export function DatabankRenameDialog({ open, onOpenChange, currentName, onRename }: DatabankRenameDialogProps): ReactElement {
  const [name, setName] = useState(currentName);

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
      submit={{
        label: "Save",
        disabled: !canSave,
        onSubmit: (): void => {
          onRename(trimmed);
          onOpenChange(false);
        },
      }}
      title="Rename document"
    >
      <Input aria-label="Document name" onValueChange={setName} placeholder="Document name" value={name} />
    </FormDialog>
  );
}
