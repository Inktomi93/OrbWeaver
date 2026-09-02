// export-library-section — the Backup & Restore pane's export half: a checkbox per portable kind, a
// note that media travels automatically, and the "Download my library" action. Owner-scoped by the
// server; this surface just picks the kinds and triggers the browser download.

import type { PortableKind } from "@orb/contracts/portability";
import { Button } from "@orb/ui/button";
import { Fieldset, FieldsetLegend } from "@orb/ui/fieldset";
import { Download, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { SettingCheckboxRow } from "#components";
import { downloadUrl, testId } from "#lib";
import { buildLibraryExportHref, EXPORTABLE_KINDS, PORTABLE_KIND_LABELS } from "../lib/portability-model.ts";

/** THE "INCLUDE" GROUP IS A BULK DEFAULT, SO IT SPENDS NO ACCENT (#1110, owner ruling 2026-09-02).
 *  Every exportable kind starts SELECTED — that is the useState seed below and it is the right default —
 *  so the accent skin painted eleven saturated squares before the user had decided anything, making the
 *  unremarkable default the loudest ink in the pane. The tone is chosen ONCE, here, for the whole
 *  fieldset (not per row): one group-level decision, applied to every row it owns. Polarity is unchanged
 *  — checked still carries its own ink (`checkbox/variants.ts`'s `quiet` arm), just not the ember. */
const INCLUDE_GROUP_TONE = "quiet";

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
    <Stack gap="block">
      <Text className="text-muted-foreground">
        Download a zip of your library to back it up or move it to another Orbweaver. Media (avatars, gallery, generated images) always travels with it.
      </Text>
      <Fieldset>
        <FieldsetLegend>Include</FieldsetLegend>
        {EXPORTABLE_KINDS.map((kind) => (
          <SettingCheckboxRow
            key={kind}
            label={PORTABLE_KIND_LABELS[kind]}
            checked={selected.has(kind)}
            tone={INCLUDE_GROUP_TONE}
            onChange={(next): void => toggle(kind, next)}
          />
        ))}
      </Fieldset>
      <Row justify="end">
        <Button intent="primary" disabled={selected.size === 0} onClick={download} data-testid={testId("backupExportButton")}>
          <Icon icon={Download} size="sm" />
          Download my library
        </Button>
      </Row>
    </Stack>
  );
}
