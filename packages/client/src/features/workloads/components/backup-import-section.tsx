// The IMPORT section (Settings → Backup & Restore) — the per-user face of the import half of the portability
// subsystem (server API: POST /api/import/bundle, POST /api/import): drop a .zip backup or a card → upload →
// per-file report. This IS the permanent, discoverable "Backup & Restore / Import from SillyTavern" entry —
// the sole import surface (the first-run onboarding card that once routed here was deleted at cutover).
// Import is a POST with a synchronous report, so no QueryBoundary. The anchored frame around
// `ImportLibrarySection`, which owns the dropzone and the tracker.

import { Section } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { configAnchorId } from "#state";
import { BACKUP_IMPORT_SUBCATEGORY } from "../lib/backup-nav.ts";
import { ImportLibrarySection } from "./import-library-section.tsx";

export function BackupImportSection(): ReactElement {
  return (
    <Section divider={true} heading={BACKUP_IMPORT_SUBCATEGORY.label} id={configAnchorId("backup", BACKUP_IMPORT_SUBCATEGORY.id)}>
      <ImportLibrarySection />
    </Section>
  );
}
