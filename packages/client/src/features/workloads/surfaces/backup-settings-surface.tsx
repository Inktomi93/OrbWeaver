// The BACKUP & RESTORE settings surface (Settings → Backup & Restore) — the per-user face of the
// export/import portability subsystem (server API: GET /api/export/library, POST /api/import/bundle,
// POST /api/import). Two anchored sections mirroring the workloads-pane grammar: EXPORT (pick kinds →
// download a zip) and IMPORT (drop a .zip backup or a card → upload → per-file report). Owner-scoped by
// the server (the session cookie is the only owner every export/import verb sees); this surface holds no
// server read of its own — export is a browser download, import is a POST with a synchronous report, so
// no QueryBoundary is needed here.
//
// This IS the permanent, discoverable "Backup & Restore / Import from SillyTavern" entry — the sole
// import/export surface (the first-run onboarding card that once routed here was deleted at M1.cutover).

import { Container, Section, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useRef } from "react";
import { testId, useFocusOnMount } from "#lib";
import { settingsAnchorId } from "#state";
import { ExportLibrarySection } from "../components/export-library-section";
import { ImportLibrarySection } from "../components/import-library-section";
import { BACKUP_SUBCATEGORY_IDS } from "../lib/backup-nav";

/** The Backup & Restore panel body (rendered inside the settings modal's category column). */
export function BackupSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <Container>
        <Stack gap="section" data-testid={testId("backupSection")}>
          <Section divider={true} heading="Export" id={settingsAnchorId("backup", BACKUP_SUBCATEGORY_IDS.export)}>
            <ExportLibrarySection />
          </Section>
          <Section divider={true} heading="Import" id={settingsAnchorId("backup", BACKUP_SUBCATEGORY_IDS.import)}>
            <ImportLibrarySection />
          </Section>
        </Stack>
      </Container>
    </Stack>
  );
}
