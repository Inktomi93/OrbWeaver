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

/** A state-only confirm whose handler RETURNS A NON-THENABLE (#1632 item 6). `void` is erased at the type
 *  level only, so a `(): void` handler whose body ends in an expression hands `ConfirmDialog` a value that
 *  is neither `undefined` nor a promise — here `Set.add`, which returns the Set. The old
 *  `settle === undefined` gate let it through to `settle.then(…)` and threw inside the click handler: the
 *  dialog stayed open and nothing was reported. The cast is what a real call site gets for free from
 *  TypeScript's `void` assignability; it is spelled explicitly here so the shape is visible in the fixture. */
export function ConfirmDialogNonThenableHarness(): ReactElement {
  const [confirmed, setConfirmed] = useState(false);
  const seen = new Set<string>();
  return (
    <div>
      <ConfirmDialog
        confirmLabel="Apply"
        confirmIntent="primary"
        description="The handler returns a value that is not a promise."
        onConfirm={
          ((): unknown => {
            setConfirmed(true);
            return seen.add("clicked");
          }) as () => void
        }
        title="Apply this change?"
        trigger={<Button intent="ghost">Apply</Button>}
      />
      <output data-testid="confirm-nonthenable-state">{confirmed ? "applied" : "idle"}</output>
    </div>
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
