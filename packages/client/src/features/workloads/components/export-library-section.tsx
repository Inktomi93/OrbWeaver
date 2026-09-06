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
import { SettingCheckboxRow, SettingRowGroup, SettingTrackRow } from "#components";
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
        {/* THE SHARED TRACK, NOT A PER-ROW DOCK (#980 F13). These rows sat as direct children of a bare
            `w-full` Fieldset, so each `Field orientation="horizontal"` docked its control in a 200px column
            at the PANE's right edge and the distance from a name to its checkbox was whatever the window
            happened to be: measured 2026-09-06 at 906–937px on the live pane (labels ending x=461–492,
            18px boxes at x=1398), with `design-audit` filing 8 × `row-void` P2 at 71–76%. You could not
            tell by eye whether "Themes" was checked.
            `SettingRowGroup` is the mechanism #932 minted for exactly this and it was simply not being
            used here — the group's longest label sizes ONE label track over every row, so the marks land
            in one column the eye can run down, and its `max-w-(--reading-measure)` caps the block so the
            pair stops being pane-sized. It is also the SAME mechanism this era's library-row fix uses:
            the void was a placement, never a spacing value. */}
        <SettingRowGroup>
          {EXPORTABLE_KINDS.map((kind) => (
            // `SettingTrackRow` is the chain's MIDDLE LINK, and it is not optional off the config surface:
            // a `track` Field spans two of the group's four tracks, so consecutive Fields AUTO-PLACE two
            // per line — measured here as controls in TWO columns (x=210 and x=495) the first time this
            // group was mounted without it, i.e. the shared track was never shared.
            <SettingTrackRow key={kind}>
              <SettingCheckboxRow
                label={PORTABLE_KIND_LABELS[kind]}
                checked={selected.has(kind)}
                tone={INCLUDE_GROUP_TONE}
                onChange={(next): void => toggle(kind, next)}
              />
            </SettingTrackRow>
          ))}
        </SettingRowGroup>
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
