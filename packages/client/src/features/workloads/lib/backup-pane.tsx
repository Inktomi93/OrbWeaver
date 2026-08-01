// The Backup & Restore settings pane (client-architecture-lockdown.md §8) — co-located
// SettingsPaneDefinition wrapping the existing surface. TEMPORARY home (M6.1: panes stay put; the
// workloads+portability-owned move is M6.2, per O3 — "backup has no feature").

import { Archive } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { BackupSettingsSurface } from "../surfaces/backup-settings-surface";
import { BACKUP_SUBCATEGORY_IDS } from "./backup-nav";

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
