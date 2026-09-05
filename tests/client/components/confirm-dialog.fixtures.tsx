// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome
// forbids exporting a component from a `.ct.tsx`). Exercises the controlled entry shape: caller owns
// `open`/`onOpenChange`, no default trigger renders.
import { ConfirmDialog } from "@orb/client/components";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { useState } from "react";

export function ConfirmDialogControlledHarness(): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <ConfirmDialog
      confirmIntent="primary"
      confirmLabel="Rename"
      description="Renames the chat for everyone."
      onConfirm={(): void => setOpen(false)}
      onOpenChange={setOpen}
      open={open}
      title="Rename this chat?"
    />
  );
}

/** A confirm whose verb REJECTS the first time and succeeds the second (#1563) — the state that used to be
 *  unreachable by construction: the dialog closed on click whatever the verb did, so a destructive confirm
 *  could never be the retry surface for the mutation it fires. The promise is what the dialog waits on. */
export function ConfirmDialogRejectingHarness(): ReactElement {
  const [attempts, setAttempts] = useState(0);
  const [removed, setRemoved] = useState(false);
  return (
    <div>
      <ConfirmDialog
        confirmLabel="Delete"
        description="This permanently deletes the thing."
        onConfirm={async (): Promise<void> => {
          setAttempts((n) => n + 1);
          await new Promise((resolve) => setTimeout(resolve, 10));
          if (attempts === 0) {
            throw new Error("the row is locked by another seat");
          }
          setRemoved(true);
        }}
        title="Delete this thing?"
        trigger={<Button intent="ghost">Delete</Button>}
      />
      <output data-testid="confirm-removed">{removed ? "removed" : "intact"}</output>
    </div>
  );
}
