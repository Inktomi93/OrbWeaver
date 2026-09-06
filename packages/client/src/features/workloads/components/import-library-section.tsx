// import-library-section — the Backup & Restore pane's import half: a dropzone that accepts a .zip
// portability backup or a bare character card. A .zip uploads then runs as a background workload; a bare
// card imports synchronously. On success the library is already blanket-invalidated; the report renders below.
//
// THE PREFLIGHT IS THE POINT (#1099 F36). The pane described what it ACCEPTS and never what it DOES: a drop
// began uploading on the spot, so a reader restoring a backup over a library they had already built learned
// the merge rule from the report of a merge that had already happened. A pick now STAGES
// (`use-library-import.ts` — zero requests), and this preflight states the consequence in the words the
// server verbs actually implement, then asks. The consequence copy is DERIVED, not reassuring:
//   · `import-character.ts` — dedup is the same FILE (`importHash`) and NEVER the name, so two "Emily"
//     cards stay two characters and a re-dropped file is skipped.
//   · `import-themes.ts` / `import-presets.ts` — the settings/preset domain's import is idempotent on
//     (ownerId, name) and MERGES a same-named row IN PLACE.
//   · `import-personas.ts` — a name collision REUSES the first existing persona (skipped, never duplicated).
// Nothing in either wave deletes, and seed rows (`ownerId IS NULL`) are structurally unreachable — so
// "adds, never deletes; a matching identity is updated in place" is the whole true statement.

import { Button } from "@orb/ui/button";
import { FileDropzone, FolderPicker } from "@orb/ui/file-dropzone";
import { Row, Stack } from "@orb/ui/layout";
import { Progress } from "@orb/ui/progress";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useUploadCaps } from "#data";
import { testId } from "#lib";
import { useLibraryImport } from "../hooks/use-library-import.ts";
import { BundleWorkloadTracker } from "./bundle-workload-tracker.tsx";
import { ImportReportSummary } from "./import-report-summary.tsx";

/** What an import DOES to a library that already has things in it — the sentence the reader needs BEFORE
 *  the request, not in the report afterwards. One home: the preflight is the only place it is spoken. */
const IMPORT_CONSEQUENCE = [
  "Importing ADDS to your library — nothing you already have is deleted.",
  "A character card you have already imported is skipped, so running the same backup twice is not a duplicate. Two different cards that share a name stay two characters.",
  "A theme or preset whose NAME matches one of yours is updated in place, and a persona whose name matches is reused rather than added again.",
] as const;

/** What was picked, in words — the folder arm counts files (a folder pick is always a batch), the file arm
 *  names the single file it is about to send. */
function stagedTitle(files: readonly File[], folder: boolean): string {
  const first = files[0];
  if (folder) {
    return `Import ${String(files.length)} file${files.length === 1 ? "" : "s"} from the folder you picked?`;
  }
  return files.length === 1 && first !== undefined ? `Import “${first.name}”?` : `Import ${String(files.length)} files?`;
}

/** The staged selection, its consequence, and the two answers. Its own component so the title is computed
 *  ONCE and used twice — as the visible heading and as the group's accessible name, which is what makes a
 *  bare "Import" button unambiguous to a screen reader that jumped straight to it. */
function ImportPreflight({
  files,
  folder,
  onConfirm,
  onCancel,
}: {
  readonly files: readonly File[];
  readonly folder: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const title = stagedTitle(files, folder);
  return (
    // A named GROUP, not an alert: nothing has happened yet and nothing is being interrupted.
    <Stack aria-label={title} className="rounded-control border border-input p-field" data-slot="import-preflight" gap="field" role="group">
      <Text voice="label">{title}</Text>
      <Stack gap="tight">
        {IMPORT_CONSEQUENCE.map((line) => (
          <Text key={line} voice="reading">
            {line}
          </Text>
        ))}
      </Stack>
      <Row justify="start" align="center" gap="field">
        <Button intent="primary" onClick={onConfirm}>
          Import
        </Button>
        <Button intent="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </Row>
    </Stack>
  );
}

/** The import controls: dropzone → PREFLIGHT → busy + live progress → summary (or error) → reset. */
export function ImportLibrarySection(): ReactElement {
  // The per-request body cap, SERVED from the deployment config (never a hand-kept mirror) so an over-cap
  // file is rejected inline, not after a wasted round-trip.
  const importMaxBytes = useUploadCaps().importTotal;
  const { state, stageFiles, stageFolder, confirm, cancel, reset, track } = useLibraryImport();
  const staged = state.status === "staged" ? state : null;
  const busy = state.status === "uploading" || state.status === "running";
  const done = state.status === "done";
  const succeeded = done && state.summary.failed === 0;

  return (
    <Stack gap="block">
      <Text className="text-muted-foreground">
        Restore a backup, or bring your SillyTavern library over. Drop a full .zip export (characters, chats, personas, world books — everything) or a single
        character card — or pick an unzipped backup / SillyTavern profile folder.
      </Text>
      <FileDropzone
        accept=".zip,.png,.json"
        aria-label="Import a backup or card file"
        data-testid={testId("backupImportDropzone")}
        instructions="Drop a .zip backup or a character card"
        hint="A .zip carries your whole library; a .png / .json is a single card"
        loading={busy}
        success={succeeded}
        maxSizeBytes={importMaxBytes}
        onFilesSelected={({ accepted }): void => stageFiles(accepted)}
      />
      <Row justify="start" align="center" gap="field">
        <FolderPicker maxSizeBytes={importMaxBytes} loading={busy} onFilesSelected={({ accepted }): void => stageFolder(accepted)}>
          Import a folder…
        </FolderPicker>
        <Text voice="gloss">An unzipped Orbweaver backup or a SillyTavern profile folder</Text>
      </Row>
      {staged === null ? null : <ImportPreflight files={staged.files} folder={staged.folder} onCancel={cancel} onConfirm={confirm} />}
      {state.status === "running" ? (
        <>
          <BundleWorkloadTracker workloadId={state.workloadId} onProgress={track.onProgress} onSucceeded={track.onSucceeded} onFailed={track.onFailed} />
          {/* `showValue` like every other live workload bar (`workload-row.tsx` — side-eye 2026-08-06 P3):
              the same run, watched from two panes, printed its percentage in one of them and not the other. */}
          <Progress showValue={true} value={state.progress.pct} label={state.progress.label ?? "Importing your library…"} />
        </>
      ) : null}
      {state.status === "error" ? (
        <Text role="alert" className="text-destructive">
          {state.message}
        </Text>
      ) : null}
      {done ? (
        <Stack gap="block">
          <ImportReportSummary summary={state.summary} />
          <Row justify="start">
            <Button intent="secondary" onClick={reset}>
              Import another
            </Button>
          </Row>
        </Stack>
      ) : null}
    </Stack>
  );
}
