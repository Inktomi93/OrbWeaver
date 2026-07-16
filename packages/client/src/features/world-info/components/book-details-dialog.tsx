// The book DETAILS dialog — a SMALL two-field editor (name + description, the only two `BookView` fields) in
// a controlled Dialog (a lone book-header edit stays controlled + no form factory, §13.4 "single rename"
// allowlist extended to the book's two-field header). Confirming writes `worldInfo.updateBook {name,
// description}`. Owns its overlay (a component, not the surface — surface-purity). The caller passes the
// current name/description (seed) + `onSave`; local state is committed on submit. Used both for RENAME (from
// the library row kebab) and for editing the open book's header in CONTENT.

import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";
import { useState } from "react";

interface BookDetailsPatch {
  readonly name: string;
  /** The trimmed description (`""` clears it — `updateBook` has no null form). */
  readonly description: string;
}

export interface BookDetailsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentName: string;
  readonly currentDescription: string | null;
  readonly onSave: (patch: BookDetailsPatch) => void;
}

/** The book details dialog — a name field + a description textarea, seeded with the current values. */
export function BookDetailsDialog({ open, onOpenChange, currentName, currentDescription, onSave }: BookDetailsDialogProps): ReactElement {
  const [name, setName] = useState(currentName);
  const [description, setDescription] = useState(currentDescription ?? "");

  const trimmedName = name.trim();
  const canSave = trimmedName !== "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next): void => {
        // Re-seed on each open so a cancelled edit doesn't carry into the next open.
        if (next) {
          setName(currentName);
          setDescription(currentDescription ?? "");
        }
        onOpenChange(next);
      }}
    >
      <DialogPopup>
        <DialogTitle>Book details</DialogTitle>
        <form
          onSubmit={(event): void => {
            event.preventDefault();
            if (canSave) {
              onSave({ name: trimmedName, description: description.trim() });
              onOpenChange(false);
            }
          }}
        >
          <Stack gap="block">
            <Field label="Name">
              <Input
                value={name}
                onValueChange={setName}
                placeholder="Book name"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus={true}
              />
            </Field>
            <Field label="Description" description="An optional note for the library — never injected.">
              <Textarea value={description} onChange={(event): void => setDescription(event.target.value)} placeholder="Optional" rows={3} />
            </Field>
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
