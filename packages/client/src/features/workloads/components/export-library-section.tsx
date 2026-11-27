// export-library-section — the Backup & Restore pane's export half: a checkbox per portable kind, a
// note that media travels automatically, and the "Download my library" action; then the SillyTavern export, whose
// preflight previews what carries and what stays before the download. Owner-scoped by the server; this surface just
// picks the kinds and triggers the browser download. The SillyTavern export is always the whole library, since
// SillyTavern pairs chats with their cards by folder, so it offers no kind picks.

import type { PortableKind } from "@orb/contracts/portability";
import { PORTABLE_EXPORT_REPORT_FILE } from "@orb/contracts/portability";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Fieldset, FieldsetLegend } from "@orb/ui/fieldset";
import { Download, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { CommitRow, SettingCheckboxRow, SettingRowGroup, SettingTrackRow } from "#components";
import { downloadUrl, testId } from "#lib";
import { useStExportPreview } from "../hooks/use-st-export-preview.ts";
import { buildLibraryExportHref, EXPORTABLE_KINDS, PORTABLE_KIND_LABELS } from "../lib/portability-model.ts";
import { ST_EXPORT_DOWNLOAD_NAME, ST_EXPORT_LEDE, ST_EXPORT_OPEN_NAME, ST_EXPORT_PLACEMENT_NOTE, ST_EXPORT_TITLE } from "../lib/st-export-names.ts";
import { EXPORT_DOWNLOAD_NAME, EXPORT_INCLUDE_LEGEND } from "../lib/workloads-names.ts";
import { StExportPreviewSummary } from "./import-preview-summary.tsx";

/** THE "INCLUDE" GROUP IS A BULK DEFAULT, SO IT SPENDS NO ACCENT (#1110, owner ruling 2026-09-02).
 *  Every exportable kind starts SELECTED — that is the useState seed below and it is the right default —
 *  so the accent skin painted eleven saturated squares before the user had decided anything, making the
 *  unremarkable default the loudest ink in the pane. The tone is chosen ONCE, here, for the whole
 *  fieldset (not per row): one group-level decision, applied to every row it owns. Polarity is unchanged
 *  — checked still carries its own ink (`checkbox/variants.ts`'s `quiet` arm), just not the ember. */
const INCLUDE_GROUP_TONE = "quiet";

/** The SillyTavern export: its open button, then the preflight that previews the dry run and confirms the download. The
 *  download appears only beside a preview that read. The open button and the retry unmount as the preflight opens and
 *  re-reads, so focus is handed on: the preflight takes it while it reads, and the open button takes it back on close. */
function StExport(): ReactElement {
  const { state, open, close, download } = useStExportPreview();
  const preflightRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const isOpen = state.status !== "off";
  const reading = state.status === "reading";
  useEffect(() => {
    if (reading) {
      preflightRef.current?.focus({ preventScroll: true });
    }
  }, [reading]);
  useEffect(() => {
    if (!isOpen && wasOpen.current) {
      openRef.current?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);
  if (state.status === "off") {
    return (
      <Stack gap="field">
        <Text cap="prose" ink="muted">
          {ST_EXPORT_LEDE}
        </Text>
        <Row justify="start">
          <Button variant="outline" onClick={open} ref={openRef}>
            {ST_EXPORT_OPEN_NAME}
          </Button>
        </Row>
      </Stack>
    );
  }
  return (
    // Focusable by script, not a tab stop: a screen reader lands on the group's name when the preview opens or reads again.
    <Card aria-label={ST_EXPORT_TITLE} focusable={true} padding="none" ref={preflightRef} role="group" shape="row" tabIndex={-1} variant="outline">
      <Stack gap="field" padding="field">
        <Text voice="promoted">{ST_EXPORT_TITLE}</Text>
        <StExportPreviewSummary state={state} onRetry={open} />
        <Text cap="prose" voice="reading">
          {ST_EXPORT_PLACEMENT_NOTE}
        </Text>
        <CommitRow surface="island" onCancel={close}>
          {state.status === "ready" ? <Button onClick={download}>{ST_EXPORT_DOWNLOAD_NAME}</Button> : null}
        </CommitRow>
      </Stack>
    </Card>
  );
}

/** The export controls: per-kind checkboxes + the download button. */
export function ExportLibrarySection(): ReactElement {
  const [selected, setSelected] = useState<ReadonlySet<PortableKind>>(() => new Set(EXPORTABLE_KINDS));

  const toggle = (kind: PortableKind, next: boolean): void => {
    setSelected((prev) => {
      const draft = new Set(prev);
      if (next) {
        draft.add(kind);
      } else {
        draft.delete(kind);
      }
      return draft;
    });
  };

  const download = (): void => {
    downloadUrl(buildLibraryExportHref(selected));
  };

  return (
    <Stack cap="reading" gap="block">
      <Text cap="prose" ink="muted">
        Download a zip of your library to back it up or move it to another Orbweaver. Media (avatars, gallery, generated images) always travels with it. When a
        row can't be carried as stored, the zip's {PORTABLE_EXPORT_REPORT_FILE} says which.
      </Text>
      <Fieldset>
        <FieldsetLegend>{EXPORT_INCLUDE_LEGEND}</FieldsetLegend>
        {/* Choices share their label track without stacking each mark beneath its label in a narrow host. */}
        <SettingRowGroup kind="choices">
          {EXPORTABLE_KINDS.map((kind) => (
            <SettingTrackRow key={kind}>
              <SettingCheckboxRow
                orientation="inline"
                label={PORTABLE_KIND_LABELS[kind]}
                checked={selected.has(kind)}
                tone={INCLUDE_GROUP_TONE}
                onChange={(next): void => toggle(kind, next)}
              />
            </SettingTrackRow>
          ))}
        </SettingRowGroup>
      </Fieldset>
      <Row justify="start">
        <Button disabled={selected.size === 0} onClick={download} data-testid={testId("backupExportButton")}>
          <Icon icon={Download} size="sm" />
          {EXPORT_DOWNLOAD_NAME}
        </Button>
      </Row>
      <StExport />
    </Stack>
  );
}
