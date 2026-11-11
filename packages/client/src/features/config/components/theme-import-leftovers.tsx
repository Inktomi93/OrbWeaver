// The note under the Looks import button for a SillyTavern theme that carried settings Orbweaver's themes have no field for.
// The success toast says the theme landed and then leaves; this stays beside the grid where the theme appears, until the next
// import starts. It says whether the person has anything to do: the display settings they choose themselves are named by their
// labels in Appearance, the rest need nothing, and the raw SillyTavern names sit behind a disclosure as the secondary detail.

import type { ThemeLeftover, ThemeLeftoverAppearanceSetting } from "@orb/contracts/portability";
import { THEME_LEFTOVER_REASON_KINDS } from "@orb/contracts/portability";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useConfigSectionRegistry } from "#state";
import { appearanceSettingLabel } from "../lib/appearance-setting-label.ts";
import {
  THEME_IMPORT_ACTION,
  THEME_IMPORT_OUTCOME,
  themeImportGroupLine,
  themeImportLeftoverTitle,
  themeImportLeftoverToggleName,
} from "../lib/theme-import-copy.ts";

export interface ThemeImportLeftoversProps {
  /** The landed theme's name, after any collision suffix. */
  readonly themeName: string;
  /** Whether the import made a theme; false is a reuse of one the person already had. */
  readonly created: boolean;
  /** The SillyTavern keys the file carried that found no theme field, each with why. */
  readonly leftovers: readonly ThemeLeftover[];
}

/** The Appearance settings the leftovers stand for, each once, in the order the file listed them. */
function appearanceSettingsOf(leftovers: readonly ThemeLeftover[]): readonly ThemeLeftoverAppearanceSetting[] {
  const settings = leftovers.flatMap(({ reason }) => (reason.kind === "appearance" ? reason.settings : []));
  return settings.filter((setting, index) => settings.indexOf(setting) === index);
}

export function ThemeImportLeftovers({ themeName, created, leftovers }: ThemeImportLeftoversProps): ReactElement {
  const registry = useConfigSectionRegistry();
  const [open, setOpen] = useState(false);
  const appearance = appearanceSettingsOf(leftovers);
  const appearanceLabels = appearance.map((setting) => appearanceSettingLabel(registry, setting));
  // One line per reason kind present, in the contracts' order: a kind with no line here fails `tsc` in the copy module's table.
  const groups = THEME_LEFTOVER_REASON_KINDS.filter((kind) => leftovers.some(({ reason }) => reason.kind === kind));
  return (
    <Stack gap="field" data-slot="theme-import-leftovers" role="note">
      <Text voice="label">{themeImportLeftoverTitle(themeName, leftovers.length, created)}</Text>
      <Text voice="quiet" cap="prose">
        {`${THEME_IMPORT_OUTCOME[created ? "created" : "reused"]} ${THEME_IMPORT_ACTION[appearance.length > 0 ? "needed" : "none"]}`}
      </Text>
      {groups.map((kind) => (
        <Text key={kind} voice="quiet" cap="prose">
          {themeImportGroupLine(kind, appearanceLabels)}
        </Text>
      ))}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger>{themeImportLeftoverToggleName(open)}</CollapsibleTrigger>
        <CollapsiblePanel>
          <Text voice="datumMono" wrap="anywhere">
            {leftovers.map(({ key }) => key).join(", ")}
          </Text>
        </CollapsiblePanel>
      </Collapsible>
    </Stack>
  );
}
