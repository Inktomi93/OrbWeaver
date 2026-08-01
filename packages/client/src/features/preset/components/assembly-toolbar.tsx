// AssemblyToolbar — the rack's top bar, now just **Add** (preset-surface-redesign.md §5.1): the
// Compose|Preview mode toggle is DELETED. The assembled preview moved WHOLE to the Prompt view's CONTEXT
// readout (decision D2, §16 row 29), so compose is the center's only mode and a toggle with one arm is
// chrome.
//
// ADD MINTS AND AUTO-DRILLS (§16 row 16): the menu offers "Literal text" plus every ABSENT marker (an ST
// import can arrive marker-less, and a placed marker is thereafter disabled-not-deleted — the deliberate
// one-way door). Picking one appends the section AND drills straight into its editor, where the NAME field
// is: naming is part of creating, one flow, not "add a row then go find it".

import type { MarkerType, PromptConfig, PromptSection } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Toolbar } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import { addableSections } from "../lib/assembly-model";

type AssemblyForm = AppFormInstance<PromptConfig>;

export interface AssemblyToolbarProps {
  readonly form: AssemblyForm;
  /** Append a new section (a literal when `marker` is `null`, else that marker) and drill into it. */
  readonly onAdd: (marker: MarkerType | null) => void;
}

export function AssemblyToolbar({ form, onAdd }: AssemblyToolbarProps): ReactElement {
  return (
    <Toolbar aria-label="Assembly controls">
      <Row align="center" className="ml-auto" gap="field">
        <form.Subscribe selector={(state): readonly PromptSection[] => state.values.sections}>
          {(sections): ReactElement => (
            <Menu>
              <MenuTrigger
                render={
                  <Button intent="primary" size="sm">
                    <Icon icon={Plus} size="sm" />
                    Add
                  </Button>
                }
              />
              <MenuPopup>
                {addableSections(sections).map((entry) => (
                  <MenuItem key={entry.marker ?? "literal"} onClick={(): void => onAdd(entry.marker)}>
                    {entry.label}
                  </MenuItem>
                ))}
              </MenuPopup>
            </Menu>
          )}
        </form.Subscribe>
      </Row>
    </Toolbar>
  );
}
