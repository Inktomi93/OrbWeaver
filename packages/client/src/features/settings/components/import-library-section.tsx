// import-library-section — the Backup & Restore pane's import half: a dropzone that accepts a .zip
// portability backup or a bare character card. A .zip uploads then runs as a background workload; a bare
// card imports synchronously. On success the library is already blanket-invalidated; the report renders below.

import { Button } from "@orb/ui/button";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Row, Stack } from "@orb/ui/layout";
import { Progress } from "@orb/ui/progress";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { testId } from "#lib";
import { useLibraryImport } from "../hooks/use-library-import";
import { BundleWorkloadTracker } from "./bundle-workload-tracker";
import { ImportReportSummary } from "./import-report-summary";

// Mirrors the server's per-request body cap so an over-cap file is rejected inline, not after a wasted round-trip.
const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
const IMPORT_MAX_MIB = 256;
const IMPORT_MAX_BYTES = IMPORT_MAX_MIB * BYTES_PER_MIB;

/** The import controls: dropzone → busy + live progress → summary (or error) → reset. */
export function ImportLibrarySection(): ReactElement {
  const { state, importFiles, reset, track } = useLibraryImport();
  const busy = state.status === "uploading" || state.status === "running";
  const done = state.status === "done";
  const succeeded = done && state.summary.failed === 0;

  return (
    <Stack gap="block">
      <Text tone="muted" size="body">
        Restore a backup, or bring your SillyTavern library over. Drop a full .zip export
        (characters, chats, personas, lorebooks — everything) or a single character card.
      </Text>
      <FileDropzone
        accept=".zip,.png,.json"
        aria-label="Import a backup or card file"
        data-testid={testId("backupImportDropzone")}
        instructions="Drop a .zip backup or a character card"
        hint="A .zip carries your whole library; a .png / .json is a single card"
        loading={busy}
        success={succeeded}
        maxSizeBytes={IMPORT_MAX_BYTES}
        onFilesSelected={({ accepted }): void => {
          if (accepted.length > 0) {
            importFiles(accepted);
          }
        }}
      />
      {state.status === "running" ? (
        <>
          <BundleWorkloadTracker
            workloadId={state.workloadId}
            onProgress={track.onProgress}
            onSucceeded={track.onSucceeded}
            onFailed={track.onFailed}
          />
          <Progress
            value={state.progress.pct}
            label={state.progress.label ?? "Importing your library…"}
          />
        </>
      ) : null}
      {state.status === "error" ? (
        <Text tone="destructive" size="body" role="alert">
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
