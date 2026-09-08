// CT story module for `form-identity.suite.ct.tsx` (Spine-Testing §7 — a CT mounts ONLY from a non-test
// module). Two surfaces the crunch named by hand which have no story of their own yet: the preset rename
// dialog (a controlled single-field dialog, no data layer) and the character create band (its New dialog
// runs the real create mutation, so it mounts under `CtDataProviders`).
//
// The deep relative imports mirror `features/app-shell/_ct-stories.tsx`'s landed precedent — neither
// component is exported from its feature front door, and both resolve to the SAME module instance the
// `@orb/client/*` providers resolve to (one on-disk path ⇒ one vite module id), so context identity holds.

import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import { CharacterCreateActions } from "../../../../packages/client/src/features/character/components/character-create-actions.tsx";
import { PresetRenameDialog } from "../../../../packages/client/src/features/preset/components/preset-rename-dialog.tsx";
import { CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";

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
 *  name/description fields the crunch named. The real create mutation rides `CtDataProviders`.
 *
 *  WRAPPED IN A `Container` (#1813) — the band's primary is a TWO-ARM container-query pair (#1697:
 *  `CREATE_LABELLED_ARM`/`CREATE_ICON_ARM`, both `@[19rem]:hidden`-class, unnamed so either resolves
 *  against the NEAREST ancestor that establishes containment). Production always mounts the band inside
 *  one (`CharacterLibraryAnchor`'s `container-library` `Container`, `character-library-anchor.tsx`); a
 *  bare story with no container ancestor gives BOTH `@container` conditions nothing to resolve against,
 *  which the CSS containment spec treats as neither matching — so BOTH arms stayed in the accessible tree
 *  at once (`getByRole("button", { name: "New" })` resolving two elements, #1813's whole symptom). The
 *  fixture now mirrors the real ancestor rather than the component growing a JS width branch it was never
 *  designed to need. */
export function CharacterCreateBandStory(): ReactElement {
  return (
    <CtDataProviders>
      <Container>
        <CharacterCreateActions />
      </Container>
    </CtDataProviders>
  );
}
