// AssemblyToolbar — the rack's top bar (BUILD-SPEC §3.2): the Compose | Preview mode toggle · the Add menu
// (a new literal, or a marker type not yet placed). Mode is LOCAL VIEW state (the caller owns it — it never
// touches the form). Add mutates the form (`onAdd(marker)` → the caller appends the fresh section).

import type { MarkerType, PromptConfig, PromptSection } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Plus/Icon fine (the preset-library-surface.tsx precedent).
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Toolbar } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import { ASSEMBLY_MODES, addableSections } from "../lib/assembly-model";

type AssemblyForm = AppFormInstance<PromptConfig>;

/** The rack's two view modes (derived from the tuple — the type-home rule bans an exported alias). */
type AssemblyMode = (typeof ASSEMBLY_MODES)[number];

export interface AssemblyToolbarProps {
  readonly form: AssemblyForm;
  readonly mode: AssemblyMode;
  readonly onModeChange: (mode: AssemblyMode) => void;
  /** Append a new section (a literal when `marker` is `null`, else that marker). */
  readonly onAdd: (marker: MarkerType | null) => void;
}

export function AssemblyToolbar({
  form,
  mode,
  onModeChange,
  onAdd,
}: AssemblyToolbarProps): ReactElement {
  return (
    <Toolbar aria-label="Assembly controls">
      <Row gap="field" align="center" className="ml-auto">
        <ToggleGroup
          aria-label="Rack mode"
          value={[mode]}
          onValueChange={(next): void => {
            const picked = next[0];
            if (picked === "compose" || picked === "preview") {
              onModeChange(picked);
            }
          }}
        >
          {ASSEMBLY_MODES.map((value) => (
            <Toggle
              key={value}
              value={value}
              aria-label={value === "compose" ? "Compose" : "Preview"}
            >
              {value === "compose" ? "Compose" : "Preview"}
            </Toggle>
          ))}
        </ToggleGroup>

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
                  <MenuItem
                    key={entry.marker ?? "literal"}
                    onClick={(): void => onAdd(entry.marker)}
                  >
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
