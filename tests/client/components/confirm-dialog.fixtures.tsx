// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome
// forbids exporting a component from a `.ct.tsx`). Exercises the controlled entry shape: caller owns
// `open`/`onOpenChange`, no default trigger renders.
import { ConfirmDialog } from "@orb/client/components";
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
