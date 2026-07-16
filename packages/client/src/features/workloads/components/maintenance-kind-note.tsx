// The maintenance-kind note shown when a maintenance workload is selected — one deployment-wide job with
// no per-user version. Shared by the Run and Schedule dialogs; `verb` is the ONLY divergent word ("Runs"
// for a one-off run, "Recurs" for a schedule), so the sentence itself lives in one home and can't drift
// (derive-modernization §W5).
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export function MaintenanceKindNote({ verb }: { readonly verb: "Runs" | "Recurs" }): ReactElement {
  return (
    <Text size="label" tone="muted">
      {verb} across every deployment (maintenance) — there's no per-user version.
    </Text>
  );
}
