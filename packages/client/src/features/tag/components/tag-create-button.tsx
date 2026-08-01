// The "New tag" affordance + its create Dialog. A COMPONENT (not the surface) so the interior Dialog is
// legal — a surface renders no outer Dialog (client-structure surface-purity); a component owning its own
// interior Dialog is fine (the character-bulk-bar precedent). Create-by-name; recolor happens after.

import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { useState } from "react";
import { TagPickerDialog } from "#components";
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

  return (
    <>
      <Button intent="primary" size="sm" onClick={(): void => setOpen(true)}>
        New tag
      </Button>
      <TagPickerDialog
        confirmLabel="Create"
        description="Name the label. You can recolor it after."
        onOpenChange={setOpen}
        onSubmit={(name): void => create.mutate({ input: { name } })}
        open={open}
        title="New tag"
      />
    </>
  );
}
