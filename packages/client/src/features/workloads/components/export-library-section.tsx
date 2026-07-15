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
import {
  buildLibraryExportHref,
  EXPORTABLE_KINDS,
  PORTABLE_KIND_LABELS,
} from "../lib/portability-model";

/** The export controls: per-kind checkboxes + the download button. */
export function ExportLibrarySection(): ReactElement {
  const [selected, setSelected] = useState<ReadonlySet<PortableKind>>(
    () => new Set(EXPORTABLE_KINDS),
  );

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
      <Text tone="muted" size="body">
        Download a zip of your library to back it up or move it to another Orbweaver. Media
        (avatars, gallery, generated images) always travels with it.
      </Text>
      <Fieldset>
        <FieldsetLegend>Include</FieldsetLegend>
        {EXPORTABLE_KINDS.map((kind) => (
          <SettingCheckboxRow
            key={kind}
            id={`export-kind-${kind}`}
            label={PORTABLE_KIND_LABELS[kind]}
            checked={selected.has(kind)}
            onChange={(next): void => toggle(kind, next)}
          />
        ))}
      </Fieldset>
      <Row justify="end">
        <Button
          intent="primary"
          disabled={selected.size === 0}
          onClick={download}
          data-testid={testId("backupExportButton")}
        >
          <Icon icon={Download} size="sm" />
          Download my library
        </Button>
      </Row>
    </Stack>
  );
}
