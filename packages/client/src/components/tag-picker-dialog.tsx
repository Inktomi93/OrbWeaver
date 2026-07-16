// TagPickerDialog — the client-shared tag-name prompt (W1 rollup). Four sites across TWO features hand-
// rolled the byte-identical "type a tag name → Apply/Create" Dialog (character bulk-bar + tags-row,
// settings tag-create-button). One text Input, a required-non-empty confirm, its own name state (reset on
// confirm/close). Built ON FormDialog's PROMPT mode. OWNER RULING: lives client-shared (spans character +
// settings — the RowActionsMenu/ConfirmDialog precedent; NOT @orb/ui — ui stays parts-only).

import { Input } from "@orb/ui/input";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { FormDialog } from "./form-dialog";

export interface TagPickerDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description: ReactNode;
  /** The confirm button's label (e.g. "Apply" / "Create"). */
  readonly confirmLabel: string;
  /** The text input's placeholder. @defaultValue "e.g. adventure" */
  readonly placeholder?: string;
  /** Fires with the trimmed, non-empty tag name on confirm (the dialog closes + resets itself). */
  readonly onSubmit: (name: string) => void;
}

/** The tag-name prompt — a single "Tag name" Input + a required-non-empty confirm, over FormDialog. */
export function TagPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  placeholder = "e.g. adventure",
  onSubmit,
}: TagPickerDialogProps): ReactElement {
  const [name, setName] = useState("");

  const close = (): void => {
    setName("");
    onOpenChange(false);
  };

  const confirm = (): void => {
    const trimmed = name.trim();
    if (trimmed === "") {
      return;
    }
    onSubmit(trimmed);
    close();
  };

  return (
    <FormDialog
      description={description}
      onOpenChange={(next): void => {
        // Reset the field on close so a reopened prompt never carries the last attempt's text.
        if (!next) {
          setName("");
        }
        onOpenChange(next);
      }}
      open={open}
      submit={{ label: confirmLabel, onSubmit: confirm, disabled: name.trim() === "" }}
      title={title}
    >
      <Input aria-label="Tag name" onValueChange={setName} placeholder={placeholder} value={name} />
    </FormDialog>
  );
}
