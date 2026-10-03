// import-library-section — the Backup & Restore pane's import half: a dropzone that accepts a .zip
// portability backup or a bare character card, and a folder picker for an unzipped backup or a SillyTavern
// profile. A .zip or a folder runs as background workloads; a bare card imports synchronously. On success
// the library is already blanket-invalidated; the report renders below, with the memory-build offer for the
// chats the import wrote (an import enqueues no paid model run on its own).
//
// THE PREFLIGHT IS THE POINT. The pane described what it ACCEPTS and never what it DOES: a drop began
// uploading on the spot, so a reader restoring a backup over a library they had already built learned the
// collision rule from the report of an import that had already happened. A pick now STAGES
// (`use-library-import.ts` — zero requests), and this preflight states the consequence in the words the
// server verbs actually implement, then asks. The consequence copy is DERIVED, not reassuring:
//   · `import-character.ts` — identity is the parsed content (`cardImportHash`), never the name, so an equal
//     card is skipped and two "Eleni" cards stay two characters.
//   · the world-book, theme and preset imports — equal content is reused; a same-named DIFFERENT row keeps
//     its row and the file lands under a numbered name. Nothing is edited in place.
//   · `import-personas.ts` — an equal persona is reused; a DIFFERENT persona under a taken name lands beside
//     it under a numbered name.
//   · `import-user-settings.ts` — a backup's share-safe settings namespaces deep-MERGE into the owner's.
// Nothing in any wave deletes, and seed rows (`ownerId IS NULL`) are structurally unreachable — so "adds,
// never deletes; a backup's settings merge into yours" is the whole true statement. A folder pick also shows
// its PLAN (`planNotes`): what the browser leaves out before uploading (and why), and how many uploads the
// folder takes.

import { Button } from "@orb/ui/button";
import { FileDropzone, FolderPicker } from "@orb/ui/file-dropzone";
import { Row, Stack } from "@orb/ui/layout";
import { Progress } from "@orb/ui/progress";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { ImportedChatsMemoryOffer } from "#components";
import type { TreeImportPlan } from "#data";
import { useUploadCaps } from "#data";
import { testId } from "#lib";
import { useLibraryImport } from "../hooks/use-library-import.ts";
import { planNotes } from "../lib/portability-model.ts";
import { BundleWorkloadTracker } from "./bundle-workload-tracker.tsx";
import { ImportReportSummary } from "./import-report-summary.tsx";

/** What an import DOES to a library that already has things in it — the sentence the reader needs BEFORE
 *  the request, not in the report afterwards. One home: the preflight is the only place it is spoken. */
const IMPORT_CONSEQUENCE = [
  "Importing ADDS to your library — nothing you already have is deleted. Settings in an Orbweaver backup merge into yours.",
  "Anything already in your library — the same card, world book, theme or preset — is skipped, so running the same import twice is not a duplicate.",
  "A world book, theme, preset or persona that shares a name with a DIFFERENT one of yours is imported under a numbered name. Two different cards that share a name stay two characters.",
] as const;

/** What was picked, in words — the folder arm counts the files the plan will send, the file arm names the
 *  single file it is about to send. */
function stagedTitle(files: readonly File[], plan: TreeImportPlan | null): string {
  const first = files[0];
  if (plan !== null) {
    return `Import ${String(plan.files)} file${plan.files === 1 ? "" : "s"} from the folder you picked?`;
  }
  return files.length === 1 && first !== undefined ? `Import “${first.name}”?` : `Import ${String(files.length)} files?`;
}

/** The staged selection, its consequence, and the two answers. Its own component so the title is computed
 *  ONCE and used twice — as the visible heading and as the group's accessible name, which is what makes a
 *  bare "Import" button unambiguous to a screen reader that jumped straight to it. */
function ImportPreflight({
  files,
  plan,
  onConfirm,
  onCancel,
}: {
  readonly files: readonly File[];
  readonly plan: TreeImportPlan | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const title = stagedTitle(files, plan);
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
        {plan === null
          ? null
          : planNotes(plan).map((line) => (
              <Text key={line} voice="gloss">
                {line}
              </Text>
            ))}
      </Stack>
      <Row justify="start" align="center" gap="field">
        <Button intent="primary" onClick={onConfirm} disabled={plan !== null && plan.batches.length === 0 && plan.skipped.length > 0}>
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
  // file is rejected inline, not after a wasted round-trip. The folder picker carries NO cap of its own: the
  // plan decides per file against the served folder caps and says why a file stays behind.
  const importMaxBytes = useUploadCaps().importTotal;
  const { state, stageFiles, stageFolder, confirm, cancel, reset, track } = useLibraryImport();
  const staged = state.status === "staged" ? state : null;
  const busy = state.status === "uploading" || state.status === "running";
  const done = state.status === "done";
  const succeeded = done && state.summary.failed === 0;
  const batchLabel =
    state.status === "running" && state.batch !== null && state.batch.total > 1
      ? `Upload ${String(state.batch.index + 1)} of ${String(state.batch.total)} — `
      : "";

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
        <FolderPicker loading={busy} onFilesSelected={({ accepted }): void => stageFolder(accepted)}>
          Import a folder…
        </FolderPicker>
        <Text voice="gloss">An unzipped Orbweaver backup or a SillyTavern profile folder. Your API keys (secrets.json) never leave this browser.</Text>
      </Row>
      {staged === null ? null : <ImportPreflight files={staged.files} plan={staged.plan} onCancel={cancel} onConfirm={confirm} />}
      {state.status === "running" ? (
        <>
          <BundleWorkloadTracker workloadId={state.workloadId} onProgress={track.onProgress} onSucceeded={track.onSucceeded} onFailed={track.onFailed} />
          {/* `showValue` like every other live workload bar (`workload-row.tsx`): the same run, watched from
              two panes, printed its percentage in one of them and not the other. */}
          <Progress showValue={true} value={state.progress.pct} label={`${batchLabel}${state.progress.label ?? "Importing your library…"}`} />
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
          <ImportedChatsMemoryOffer scope={state.summary.memoryScope} />
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
