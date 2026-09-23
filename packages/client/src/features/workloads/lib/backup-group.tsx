// The Backup & Restore config group (client-architecture-lockdown.md §8) —
// a `sections` SKIMMER on the user shelf. Owned by features/workloads — the M6.2 de-god move LANDED (O3 as
// ratified: import/export is the workloads engine's, "backup has no feature" of its own). Its two rows are
// the contributions beside this file (`backup-export-section.tsx` · `backup-import-section.tsx`).

import { Archive } from "@orb/ui/icons";
import type { ConfigGroupDefinition } from "#state";

export const backupGroup: ConfigGroupDefinition = {
  id: "backup",
  shelf: "user",
  label: "Backup & Restore",
  icon: Archive,
  description: "Export your whole library, or import a backup / SillyTavern bundle.",
  body: { kind: "sections" },
};
