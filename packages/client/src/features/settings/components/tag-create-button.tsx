// The "New tag" affordance + its create Dialog. A COMPONENT (not the surface) so the interior Dialog is
// legal — a surface renders no outer Dialog (client-structure surface-purity); a component owning its own
// interior Dialog is fine (the character-bulk-bar precedent). Create-by-name; recolor happens after.

import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation } from "#data";
import { useCreateTag } from "../hooks/use-tag-settings-mutations";

export interface TagCreateButtonProps {
  readonly trpc: Trpc;
}

/** The primary "New tag" button + its name-input Dialog (immediate create on submit). */
export function TagCreateButton({ trpc }: TagCreateButtonProps): ReactElement {
  const invalidation = useInvalidation();
  const create = useCreateTag({ trpc, invalidation });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const submit = (): void => {
    const trimmed = name.trim();
    if (trimmed === "") {
      return;
    }
    create.mutate({ input: { name: trimmed } });
    setOpen(false);
    setName("");
  };

  return (
    <>
      <Button intent="primary" size="sm" onClick={(): void => setOpen(true)}>
        New tag
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogPopup>
          <Stack gap="block">
            <DialogTitle>New tag</DialogTitle>
            <DialogDescription>Name the label. You can recolor it after.</DialogDescription>
            <Input aria-label="Tag name" onValueChange={setName} placeholder="e.g. adventure" value={name} />
            <Row gap="field" justify="end">
              <DialogClose render={<Button intent="ghost">Cancel</Button>} />
              <Button disabled={name.trim() === ""} intent="primary" onClick={submit}>
                Create
              </Button>
            </Row>
          </Stack>
        </DialogPopup>
      </Dialog>
    </>
  );
}
