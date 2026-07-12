// export-library-section — the Backup & Restore pane's EXPORT half: a checkbox per portable kind (which
// entities to include), a note that media travels automatically, and the "Download my library" action.
// Owner-scoped by the server (the session cookie on the GET is the only owner every `exportAll` sees);
// this surface just picks the `kinds` and triggers the browser download of the streamed zip.
//
// SELECTION is plain surface-local `useState<Set<PortableKind>>` (starts all-on) — a transient UI pick,
// not a store. The download href is a PURE derivation (portability-model.buildLibraryExportHref): all
// selected ⇒ everything (no `kinds` param); a partial pick ⇒ `?kinds=<picked>,assets` (blobs always ride).

import type { PortableKind } from "@orb/contracts/portability";
import { Button } from "@orb/ui/button";
import { Fieldset, FieldsetLegend } from "@orb/ui/fieldset";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the file-dropzone.tsx precedent).
import { Download, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { downloadUrl, testId } from "#lib";
import {
  buildLibraryExportHref,
  EXPORTABLE_KINDS,
  PORTABLE_KIND_LABELS,
} from "../lib/portability-model";
import { SettingCheckboxRow } from "./setting-switch-row";

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
