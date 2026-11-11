// The note under the Looks import button for a SillyTavern theme that carried settings Orbweaver did not bring over.
// The success toast says the theme landed and then leaves; this stays beside the grid where the theme appears, until
// the next import replaces it or the section is left.

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { THEME_IMPORT_LEFTOVER_GLOSS, themeImportLeftoverTitle, themeImportLeftoverToggleName } from "../lib/theme-import-copy.ts";

export interface ThemeImportLeftoversProps {
  /** The landed theme's name, after any collision suffix. */
  readonly themeName: string;
  /** The ST setting names the file carried that found no Orbweaver field. */
  readonly keys: readonly string[];
}

export function ThemeImportLeftovers({ themeName, keys }: ThemeImportLeftoversProps): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="field" data-slot="theme-import-leftovers" role="note">
      <Text voice="label">{themeImportLeftoverTitle(themeName, keys.length)}</Text>
      <Text voice="quiet" cap="prose">
        {THEME_IMPORT_LEFTOVER_GLOSS}
      </Text>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger>{themeImportLeftoverToggleName(open)}</CollapsibleTrigger>
        <CollapsiblePanel>
          <Text voice="datumMono" wrap="anywhere">
            {keys.join(", ")}
          </Text>
        </CollapsiblePanel>
      </Collapsible>
    </Stack>
  );
}
