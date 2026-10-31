// The settings pane template: a group's name over its sections, one decision per row, in the form tier.
// The sections own their `SettingRowGroup` rows; the pane owns only their order, their rhythm and the tier.

import { Stack, Surface } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface SettingsPaneProps {
  /** The pane's heading: the name of the settings group it shows. */
  readonly title: ReactNode;
  /** The sections, in their contribution order. */
  readonly children: ReactNode;
}

/** `title` over the sections, a section step apart. */
export function SettingsPane({ title, children }: SettingsPaneProps): ReactElement {
  return (
    <Surface tier="form">
      <Stack gap="section">
        {title}
        {children}
      </Stack>
    </Surface>
  );
}
