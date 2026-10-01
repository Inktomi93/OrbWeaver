import { Badge } from "@orb/ui/badge";
import type { ReactElement } from "react";

export interface ConfigModifiedMarkProps {
  readonly label: string;
  readonly slot: string;
}

/** The same state mark fits both group bands and title-only section rows. */
export function ConfigModifiedMark({ label, slot }: ConfigModifiedMarkProps): ReactElement {
  return (
    <Badge data-slot={slot} intent="neutral" size="compact" tone="soft">
      {label}
    </Badge>
  );
}
