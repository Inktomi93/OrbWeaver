// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome forbids
// exporting a component from a `.ct.tsx`). The picker over the real data layer: its suggestion source is
// `tag.listTagsWithUsage`, stubbed at the network per test by routeTrpc.

import { TagPickerDialog } from "@orb/client/components";
import type { ReactElement } from "react";
import { useState } from "react";
import { CtDataProviders } from "../../support/ct/ct-data-providers";

export interface TagPickerDialogHarnessProps {
  /** Tag names already on the target — the "everything is attached" arm. */
  readonly attachedNames?: readonly string[];
}

/** The picker, open, with a visible record of what it submitted (the submit seam is a prop, so the
 *  assertion is the rendered name, not a spy that cannot cross the CT boundary). */
export function TagPickerDialogHarness({ attachedNames = [] }: TagPickerDialogHarnessProps): ReactElement {
  const [open, setOpen] = useState(true);
  const [submitted, setSubmitted] = useState<string | null>(null);
  return (
    // ONE root element: the mount root's component locator resolves to the first root node, so a fragment
    // root would put the submitted-name probe outside every component-scoped query.
    <CtDataProviders>
      <div>
        <TagPickerDialog
          attachedNames={attachedNames}
          confirmLabel="Apply"
          description="Attach an existing tag, or type a new one to create it."
          onOpenChange={setOpen}
          onSubmit={setSubmitted}
          open={open}
          title="Tag this character"
        />
        <p data-testid="submitted">{submitted ?? ""}</p>
      </div>
    </CtDataProviders>
  );
}
