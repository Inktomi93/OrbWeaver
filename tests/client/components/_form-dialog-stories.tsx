import { FormDialog, FormSubmitButton } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

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
      <FormDialog finalFocus={trigger} onOpenChange={setOpen} open={open} title="Incomplete form">
        <Stack gap="block">
          <input aria-label="Required value" />
          <FormSubmitButton disabled={true} label="Save" onSubmit={(): void => setSubmissions((count) => count + 1)} testKey="adminCreateUserSubmit" />
        </Stack>
      </FormDialog>
    </CtIsolation>
  );
}
