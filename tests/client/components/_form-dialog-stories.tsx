import { DismissDialog, FormDialog, FormDialogPopup, FormDialogRoot } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

/** The production form dialog open from the start with a title, a description and enough fields to scroll a short screen, the shape of a create form. */
export function FormDialogCreateStory(): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <CtIsolation subject="FormDialog" isolates="isolates the form frame's title, fields and footer from authenticated mutations">
      <FormDialog
        description="Runs the chosen job on the cadence below."
        onOpenChange={setOpen}
        open={open}
        submit={{ label: "Create schedule", onSubmit: (): void => setOpen(false) }}
        title="Create a schedule"
      >
        {["Kind", "Cadence", "Owner", "Window", "Retries", "Notes"].map((name) => (
          <input aria-label={name} key={name} />
        ))}
      </FormDialog>
    </CtIsolation>
  );
}

/** The production dialog with its corner close, open from the start. */
export function FormDialogCloseStory(): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <CtIsolation subject="FormDialog" isolates="isolates the corner close from authenticated mutations">
      <DismissDialog closeButton={true} onOpenChange={setOpen} open={open} title="Closable form">
        <Stack gap="block">Body</Stack>
      </DismissDialog>
    </CtIsolation>
  );
}

/** The production form composite, isolated from domain writes to test dismissal while submit is blocked. */
export function FormDialogDismissalStory(): ReactElement {
  const [open, setOpen] = useState(false);
  const [submissions, setSubmissions] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <CtIsolation subject="FormDialog" isolates="isolates shared footer dismissal from authenticated mutations">
      <Button onClick={(): void => setOpen(true)} ref={trigger}>
        Open form
      </Button>
      <output aria-label="Submissions">{submissions}</output>
      <FormDialog
        finalFocus={trigger}
        onOpenChange={setOpen}
        open={open}
        submit={{ label: "Save", disabled: true, testKey: "adminCreateUserSubmit", onSubmit: (): void => setSubmissions((count) => count + 1) }}
        title="Incomplete form"
      >
        <input aria-label="Required value" />
      </FormDialog>
    </CtIsolation>
  );
}

function DraftBody({ onSaved }: { readonly onSaved: (draft: string) => void }): ReactElement {
  const [draft, setDraft] = useState("");
  return (
    <FormDialogPopup submit={{ label: "Keep draft", disabled: draft === "", onSubmit: (): void => onSaved(draft) }} title="Draft form">
      <input aria-label="Scratch note" onChange={(event): void => setDraft(event.target.value)} value={draft} />
    </FormDialogPopup>
  );
}

/** A body that holds its own form state above the popup, the shape every form-body dialog takes. */
export function FormDialogBodyStateStory(): ReactElement {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <CtIsolation subject="FormDialogRoot" isolates="isolates the per-open body lifetime from authenticated mutations">
      <Button onClick={(): void => setOpen(true)} ref={trigger}>
        Open draft
      </Button>
      <output aria-label="Committed note">{saved}</output>
      <FormDialogRoot onOpenChange={setOpen} open={open}>
        <DraftBody
          onSaved={(draft): void => {
            setSaved(draft);
            setOpen(false);
          }}
        />
      </FormDialogRoot>
    </CtIsolation>
  );
}
