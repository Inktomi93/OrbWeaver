// The Backup EXPORT config-section CONTRIBUTION — the group's first row.
// features/workloads owns it (backup IS the workloads + portability system, §8/O3). No `owns`: a raw
// `/api/export` download, not a setting.

import type { ConfigSectionContribution } from "#state";
import { BackupExportSection } from "../components/backup-export-section.tsx";
import { BACKUP_EXPORT_SUBCATEGORY } from "./backup-nav.ts";

export const backupExportSection: ConfigSectionContribution = {
  id: "backup-export",
  anchor: "backup",
  nav: BACKUP_EXPORT_SUBCATEGORY,
  body: () => <BackupExportSection />,
};
