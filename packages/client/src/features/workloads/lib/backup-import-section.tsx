// The Backup IMPORT config-section CONTRIBUTION — the group's second row.
// No `owns`: a raw `/api/import` POST, not a setting.

import type { ConfigSectionContribution } from "#state";
import { BackupImportSection } from "../components/backup-import-section.tsx";
import { BACKUP_IMPORT_SUBCATEGORY } from "./backup-nav.ts";

export const backupImportSection: ConfigSectionContribution = {
  id: "backup-import",
  anchor: "backup",
  nav: BACKUP_IMPORT_SUBCATEGORY,
  body: () => <BackupImportSection />,
};
