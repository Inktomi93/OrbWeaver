// The book DETAILS dialog — a SMALL two-field editor (name + description, the only two `BookView` fields) in
// a controlled Dialog (a lone book-header edit stays controlled + no form factory, §13.4 "single rename"
// allowlist extended to the book's two-field header). Confirming writes `worldInfo.updateBook {name,
// description}`. Owns its overlay (a component, not the surface — `orb/surface-consumes-container`). The caller passes the
// current name/description (seed) + `onSave`; local state is committed on submit. Used both for RENAME (from
// the library row kebab) and for editing the open book's header in CONTENT.

import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Textarea } from "@orb/ui/textarea";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog } from "#components";
import type { Trpc } from "#data";
import { DIALOG_VERBS } from "#lib";
import { WORLD_INFO_BOOK_DESCRIPTION_NAME, WORLD_INFO_BOOK_DETAILS_NAME } from "../lib/world-info-names.ts";

// The dialog sends the wire patch whole (`input: patch`), so the type is the router's own. The description is
// trimmed and `""` clears it — `updateBook` has no null form.
type BookDetailsPatch = inferInput<Trpc["worldInfo"]["updateBook"]>["input"];

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
    <FormDialog
      submit={{
        label: DIALOG_VERBS.save,
        disabled: !canSave,
        onSubmit: (): void => {
          onSave({ name: trimmedName, description: description.trim() });
          onOpenChange(false);
        },
      }}
      onOpenChange={(next): void => {
        // Re-seed on each open so a cancelled edit doesn't carry into the next open.
        if (next) {
          setName(currentName);
          setDescription(currentDescription ?? "");
        }
        onOpenChange(next);
      }}
      open={open}
      title={WORLD_INFO_BOOK_DETAILS_NAME}
    >
      <Field label="Name">
        <Input
          value={name}
          onValueChange={setName}
          placeholder="Book name"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog opens on an explicit action; its name field takes focus
          autoFocus={true}
        />
      </Field>
      <Field label={WORLD_INFO_BOOK_DESCRIPTION_NAME} description="An optional note for the library — never injected.">
        <Textarea value={description} onChange={(event): void => setDescription(event.target.value)} placeholder="Optional" rows={3} />
      </Field>
    </FormDialog>
  );
}
