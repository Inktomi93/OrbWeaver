// import-library-section — the Backup & Restore pane's import half: a dropzone that accepts a .zip
// portability backup or a bare character card. A .zip uploads then runs as a background workload; a bare
// card imports synchronously. On success the library is already blanket-invalidated; the report renders below.

import { Button } from "@orb/ui/button";
import { FileDropzone, FolderPicker } from "@orb/ui/file-dropzone";
import { Row, Stack } from "@orb/ui/layout";
import { Progress } from "@orb/ui/progress";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useUploadCaps } from "#data";
import { testId } from "#lib";
import { useLibraryImport } from "../hooks/use-library-import";
import { BundleWorkloadTracker } from "./bundle-workload-tracker";
import { ImportReportSummary } from "./import-report-summary";

/** The import controls: dropzone → busy + live progress → summary (or error) → reset. */
export function ImportLibrarySection(): ReactElement {
  // The per-request body cap, SERVED from the deployment config (never a hand-kept mirror) so an over-cap
  // file is rejected inline, not after a wasted round-trip.
  const importMaxBytes = useUploadCaps().importTotal;
  const { state, importFiles, importFolder, reset, track } = useLibraryImport();
  const busy = state.status === "uploading" || state.status === "running";
  const done = state.status === "done";
  const succeeded = done && state.summary.failed === 0;

  return (
    <Stack gap="block">
      <Text className="text-muted-foreground">
        Restore a backup, or bring your SillyTavern library over. Drop a full .zip export (characters, chats, personas, lorebooks — everything) or a single
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
        onFilesSelected={({ accepted }): void => {
          if (accepted.length > 0) {
            importFiles(accepted);
          }
        }}
      />
      <Row justify="start" align="center" gap="field">
        <FolderPicker
          maxSizeBytes={importMaxBytes}
          loading={busy}
          onFilesSelected={({ accepted }): void => {
            if (accepted.length > 0) {
              importFolder(accepted);
            }
          }}
        >
          Import a folder…
        </FolderPicker>
        <Text voice="gloss">An unzipped Orbweaver backup or a SillyTavern profile folder</Text>
      </Row>
      {state.status === "running" ? (
        <>
          <BundleWorkloadTracker workloadId={state.workloadId} onProgress={track.onProgress} onSucceeded={track.onSucceeded} onFailed={track.onFailed} />
          <Progress value={state.progress.pct} label={state.progress.label ?? "Importing your library…"} />
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
