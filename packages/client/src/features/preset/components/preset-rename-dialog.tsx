// The preset Rename flow (BUILD-SPEC §4.3) — a SMALL single-field Dialog (a lone rename stays controlled +
// no form factory, §13.4 "single rename" allowlist). Confirming writes `preset.update {id, name}` (the name-
// only path; config untouched). Owns its overlay (a component, not the surface — surface-purity). The caller
// passes the current name (seed) + `onRename`; local input state is committed on submit.
//
// ITS ONE MOUNT IS THE EDITOR HEADER (#506). It was minted for the LIST hub and mounted in both places for a
// day; #442 ruled this verb's home for the whole class ("rename single-homes in the EDITOR" — the posture
// tags and regex already ship) and the list-row kebab's item went. Nothing about the dialog changed; only
// who opens it.

import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog } from "#components";

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
      onOpenChange={(next): void => {
        // Re-seed on each open so a cancelled edit doesn't carry into the next rename.
        if (next) {
          setName(currentName);
        }
        onOpenChange(next);
      }}
      open={open}
      title="Rename preset"
    >
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          if (canSave) {
            onRename(trimmed);
            onOpenChange(false);
          }
        }}
      >
        <Stack gap="block">
          <Input
            value={name}
            onValueChange={setName}
            aria-label="Preset name"
            placeholder="Preset name"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={true}
          />
          <Row gap="field" justify="end">
            <DialogClose render={<Button intent="ghost">Cancel</Button>} />
            <Button intent="primary" type="submit" disabled={!canSave}>
              Save
            </Button>
          </Row>
        </Stack>
      </form>
    </FormDialog>
  );
}
