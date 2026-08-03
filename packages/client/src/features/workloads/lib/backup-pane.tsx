// The Backup & Restore settings pane (client-architecture-lockdown.md §8) — co-located
// SettingsPaneDefinition wrapping the feature's own surface. Owned by features/workloads — the M6.2
// de-god move LANDED (O3 as ratified: import/export is the workloads engine's, "backup has no feature" of
// its own); `surface` mode because this pane is an import/export screen, not a knob stack.

import { Archive } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { BackupSettingsSurface } from "../surfaces/backup-settings-surface.tsx";
import { BACKUP_SUBCATEGORY_IDS } from "./backup-nav.ts";

export const backupPane: SettingsPaneDefinition = {
  id: "backup",
  group: "user",
  label: "Backup & Restore",
  icon: Archive,
  description: "Export your whole library, or import a backup / SillyTavern bundle.",
  subcategories: [
    {
      id: BACKUP_SUBCATEGORY_IDS.export,
      label: "Export",
      keywords: ["backup", "download", "save", "zip", "portability", "migrate", "leave"],
    },
    {
      id: BACKUP_SUBCATEGORY_IDS.import,
      label: "Import",
      keywords: ["restore", "upload", "sillytavern", "st", "migrate", "bundle", "zip", "card"],
    },
  ],
  body: { kind: "surface", render: () => <BackupSettingsSurface /> },
};
