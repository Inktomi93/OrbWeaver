// The preset Rename flow (BUILD-SPEC §4.3) — a SMALL single-field Dialog (a lone rename stays controlled +
// no form factory, §13.4 "single rename" allowlist). Confirming writes `preset.update {id, name}` (the name-
// only path; config untouched). Owns its overlay (a component, not the surface — `orb/surface-consumes-container`). The caller
// passes the current name (seed) + `onRename`; local input state is committed on submit.
//
// ITS ONE MOUNT IS THE EDITOR HEADER (#506). It was minted for the LIST hub and mounted in both places for a
// day; #442 ruled this verb's home for the whole class ("rename single-homes in the EDITOR" — the posture
// tags and regex already ship) and the list-row kebab's item went. Nothing about the dialog changed; only
// who opens it.

import { Input } from "@orb/ui/input";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog } from "#components";
import { DIALOG_VERBS } from "#lib";
import { PRESET_NAME_FIELD_NAME, PRESET_RENAME_NAME } from "../lib/preset-names.ts";

export interface PresetRenameDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentName: string;
  readonly onRename: (name: string) => void;
}

/** The rename dialog — a single text field seeded with the current name. */
export function PresetRenameDialog({ open, onOpenChange, currentName, onRename }: PresetRenameDialogProps): ReactElement {
  const [name, setName] = useState(currentName);

  const trimmed = name.trim();
  const canSave = trimmed !== "" && trimmed !== currentName;

  return (
    <FormDialog
      submit={{
        label: DIALOG_VERBS.save,
        disabled: !canSave,
        onSubmit: (): void => {
          onRename(trimmed);
          onOpenChange(false);
        },
      }}
      onOpenChange={(next): void => {
        // Re-seed on each open so a cancelled edit doesn't carry into the next rename.
        if (next) {
          setName(currentName);
        }
        onOpenChange(next);
      }}
      open={open}
      title={PRESET_RENAME_NAME}
    >
      <Input value={name} onValueChange={setName} aria-label={PRESET_NAME_FIELD_NAME} placeholder="Preset name" />
    </FormDialog>
  );
}
