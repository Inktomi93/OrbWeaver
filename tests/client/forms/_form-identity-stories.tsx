// CT story module for `form-identity.suite.ct.tsx` (Spine-Testing §7 — a CT mounts ONLY from a non-test
// module). Two surfaces the crunch named by hand which have no story of their own yet: the preset rename
// dialog (a controlled single-field dialog, no data layer) and the character create band (its New dialog
// runs the real create mutation, so it mounts under `CtDataProviders`).
//
// The deep relative imports mirror `features/app-shell/_ct-stories.tsx`'s landed precedent — neither
// component is exported from its feature front door, and both resolve to the SAME module instance the
// `@orb/client/*` providers resolve to (one on-disk path ⇒ one vite module id), so context identity holds.

import type { ReactElement } from "react";
import { useState } from "react";
import { CharacterCreateActions } from "../../../packages/client/src/features/character/components/character-create-actions.tsx";
import { PresetRenameDialog } from "../../../packages/client/src/features/preset/components/preset-rename-dialog.tsx";
import { CtDataProviders } from "../../support/ct/ct-data-providers.tsx";

/** The rename dialog, open on mount and seeded — the crunch's named "PresetRenameDialog" surface. */
export function PresetRenameDialogStory(): ReactElement {
  const [open, setOpen] = useState(true);
  const [renamed, setRenamed] = useState("");
  return (
    <div>
      <output data-testid="preset-renamed">{renamed}</output>
      <PresetRenameDialog currentName="Storyteller" onOpenChange={setOpen} onRename={setRenamed} open={open} />
    </div>
  );
}

/** The Characters band cluster (Import ghost + New primary) — clicking New opens the create dialog whose
 *  name/description fields the crunch named. The real create mutation rides `CtDataProviders`. */
export function CharacterCreateBandStory(): ReactElement {
  return (
    <CtDataProviders>
      <CharacterCreateActions />
    </CtDataProviders>
  );
}
