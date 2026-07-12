// The LIST-hub Rename flow (BUILD-SPEC §4.3) — a SMALL single-field Dialog (a lone rename stays controlled +
// no form factory, §13.4 "single rename" allowlist). Confirming writes `preset.update {id, name}` (the name-
// only path; config untouched). Owns its overlay (a component, not the surface — surface-purity). The surface
// passes the current name (seed) + `onRename`; local input state is committed on submit.

import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

export interface PresetRenameDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentName: string;
  readonly onRename: (name: string) => void;
}

/** The rename dialog — a single text field seeded with the current name. */
export function PresetRenameDialog({
  open,
  onOpenChange,
  currentName,
  onRename,
}: PresetRenameDialogProps): ReactElement {
  const [name, setName] = useState(currentName);

  const trimmed = name.trim();
  const canSave = trimmed !== "" && trimmed !== currentName;

  return (
    <Dialog
      open={open}
      onOpenChange={(next): void => {
        // Re-seed on each open so a cancelled edit doesn't carry into the next rename.
        if (next) {
          setName(currentName);
        }
        onOpenChange(next);
      }}
    >
      <DialogPopup>
        <DialogTitle>Rename preset</DialogTitle>
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
      </DialogPopup>
    </Dialog>
  );
}
