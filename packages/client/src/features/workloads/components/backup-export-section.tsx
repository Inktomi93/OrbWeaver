// The EXPORT section (Settings → Backup & Restore) — the per-user face of the export half of the portability
// subsystem (server API: GET /api/export/library): pick kinds → download a zip. Owner-scoped by the server
// (the session cookie is the only owner the export verb sees); no server read of its own — export is a
// browser download — so no QueryBoundary. The anchored frame around `ExportLibrarySection`, which owns the
// form.

import { Section } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { configAnchorId } from "#state";
import { BACKUP_EXPORT_SUBCATEGORY } from "../lib/backup-nav.ts";
import { ExportLibrarySection } from "./export-library-section.tsx";

export function BackupExportSection(): ReactElement {
  return (
    <Section divider={true} heading={BACKUP_EXPORT_SUBCATEGORY.label} id={configAnchorId("backup", BACKUP_EXPORT_SUBCATEGORY.id)}>
      <ExportLibrarySection />
    </Section>
  );
}
