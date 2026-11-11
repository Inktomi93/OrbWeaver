// import-library-section — the Backup & Restore pane's import half: a dropzone that accepts a .zip
// portability backup or a bare character card, and a folder picker for an unzipped backup or a SillyTavern
// profile. A .zip or a folder runs as background workloads; a bare card imports synchronously. On success
// the library is already blanket-invalidated; the report renders below, with the memory-build offer for the
// chats the import wrote (an import enqueues no paid model run on its own).
//
// THE PREFLIGHT IS THE POINT. The pane described what it ACCEPTS and never what it DOES: a drop began
// uploading on the spot, so a reader restoring a backup over a library they had already built learned the
// collision rule from the report of an import that had already happened. A pick now STAGES
// (`use-library-import.ts` — nothing is imported), and this preflight states the consequence in the words the
// server verbs actually implement, then asks. The consequence copy is DERIVED, not reassuring:
//   · `import-character.ts` — identity is the parsed content (`cardImportHash`), never the name, so an equal
//     card is skipped and two "Eleni" cards stay two characters.
//   · the world-book, theme and preset imports — equal content is reused; a same-named DIFFERENT row keeps
//     its row and the file lands under a numbered name. Nothing is edited in place.
//   · `import-personas.ts` — an equal persona is reused; a DIFFERENT persona under a taken name in a
//     SillyTavern folder is listed here as a COLLISION, and the reader chooses per persona: merge into the
//     existing one (preselected) or keep both. A backup's personas land beside it under a numbered name.
//   · `import-user-settings.ts` — a backup's share-safe settings namespaces deep-MERGE into the owner's.
// Nothing in any wave deletes, and seed rows (`ownerId IS NULL`) are structurally unreachable — so "adds,
// never deletes; a backup's settings merge into yours" is the whole true statement. A folder pick also shows
// its PLAN (`planNotes`): what the browser leaves out before uploading (and why), and how many uploads the
// folder takes. A SillyTavern folder also shows its dry run (`import-preview-summary.tsx`): what is in it, by
// kind, and what a real run would skip.

import type { PersonaCollision, PersonaCollisionChoice, PersonaCollisionChoices } from "@orb/contracts/import";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { FileDropzone, FolderPicker } from "@orb/ui/file-dropzone";
import { Row, Stack } from "@orb/ui/layout";
import { Progress } from "@orb/ui/progress";
import { Text } from "@orb/ui/text";
import type { ReactElement, Ref } from "react";
import { useEffect, useRef } from "react";
import { ImportedChatsMemoryOffer } from "#components";
import type { TreeImportPlan } from "#data";
import { useUploadCaps } from "#data";
import { DIALOG_VERBS, testId } from "#lib";
import type { ImportPreviewState, LibraryImport } from "../hooks/use-library-import.ts";
import { useLibraryImport } from "../hooks/use-library-import.ts";
import { IMPORT_FOLDER_NAME, IMPORT_PROGRESS_NAME, IMPORT_RESULT_NAME } from "../lib/import-library-names.ts";
import { IMPORT_CONFIRM_NAMES, IMPORT_CONSEQUENCE, IMPORT_NOTHING_FOUND_NOTE, planNotes, previewIsEmpty } from "../lib/portability-model.ts";
import { BundleWorkloadTracker } from "./bundle-workload-tracker.tsx";
import { ImportPreviewSummary } from "./import-preview-summary.tsx";
import { ImportReportSummary } from "./import-report-summary.tsx";
import { PersonaCollisionReview } from "./persona-collision-review.tsx";

const NOTHING_TO_SEND_ID = "import-preflight-nothing-to-send";
const EVERYTHING_LEFT_OUT_NOTE = "Every file in this folder is being left out, so there is nothing to import. The reasons are listed above.";

/** Why Import is off, or null when there is something to send. */
function nothingToSendNote(plan: TreeImportPlan | null, preview: ImportPreviewState): string | null {
  if (plan !== null && plan.batches.length === 0 && plan.skipped.length > 0) {
    return EVERYTHING_LEFT_OUT_NOTE;
  }
  return preview.status === "ready" && previewIsEmpty(preview.preview) ? IMPORT_NOTHING_FOUND_NOTE : null;
}

/** Said only when the folder's personas are listed above, so a zip or card import never points at a list that
 *  is not there. */
const PERSONA_QUESTION_NOTE = "A persona in this SillyTavern folder that shares a name with one of yours asks you instead, above.";

/** The confirm button's name for what was picked. */
function confirmName(files: readonly File[], plan: TreeImportPlan | null): string {
  if (plan !== null) {
    return IMPORT_CONFIRM_NAMES.folder;
  }
  return files.length === 1 ? IMPORT_CONFIRM_NAMES.file : IMPORT_CONFIRM_NAMES.files;
}

/** What was picked, in words — the folder arm counts the files the plan will send, the file arm names the
 *  single file it is about to send. */
function stagedTitle(files: readonly File[], plan: TreeImportPlan | null): string {
  const first = files[0];
  if (plan !== null) {
    if (plan.files === 0) {
      return "Nothing in the folder you picked can be imported";
    }
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
  collisions,
  choices,
  preview,
  onChoose,
  onChooseAll,
  onConfirm,
  onCancel,
  onRetryPreview,
  ref,
}: {
  readonly ref: Ref<HTMLDivElement>;
  readonly onRetryPreview: () => void;
  readonly files: readonly File[];
  readonly plan: TreeImportPlan | null;
  readonly collisions: readonly PersonaCollision[];
  readonly choices: PersonaCollisionChoices;
  readonly preview: ImportPreviewState;
  readonly onChoose: (key: string, choice: PersonaCollisionChoice) => void;
  readonly onChooseAll: (choice: PersonaCollisionChoice) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const title = stagedTitle(files, plan);
  const nothingNote = nothingToSendNote(plan, preview);
  return (
    // A named GROUP, not an alert: nothing has happened yet and nothing is being interrupted. It takes focus on a
    // pick (tabIndex -1: focusable by script, not a tab stop) so a screen reader lands on its name. A painted Card draws the house ring
    // when handed focus (`focusable`); the unpainted regions below take `focusTarget` and draw none.
    <Card aria-label={title} data-slot="import-preflight" focusable={true} padding="none" role="group" shape="row" variant="outline" tabIndex={-1} ref={ref}>
      <Stack gap="field" padding="field">
        <Text voice="promoted">{title}</Text>
        <ImportPreviewSummary state={preview} onRetry={onRetryPreview} />
        <PersonaCollisionReview collisions={collisions} choices={choices} onChoose={onChoose} onChooseAll={onChooseAll} />
        <Stack gap="tight">
          {/* This folder's own facts (what stays on disk) lead; the policy that holds for every import follows. */}
          {plan === null
            ? null
            : planNotes(plan).map((line) => (
                <Text key={line} cap="prose" voice="reading">
                  {line}
                </Text>
              ))}
          {[...IMPORT_CONSEQUENCE, ...(collisions.length > 0 ? [PERSONA_QUESTION_NOTE] : [])].map((line) => (
            <Text key={line} cap="prose" voice="reading">
              {line}
            </Text>
          ))}
        </Stack>
        {nothingNote === null ? null : (
          <Text id={NOTHING_TO_SEND_ID} cap="prose" voice="reading">
            {nothingNote}
          </Text>
        )}
        {/* Pinned to the foot of the pane's scroll, so Import and Cancel stay in reach however tall the review grows. */}
        <Row justify="start" align="center" wrap={true} gap="field" ground="card" layer="raised" paddingBlock="field" placed="pinnedEnd">
          <Button
            onClick={onConfirm}
            disabled={preview.status === "reading" || nothingNote !== null}
            aria-describedby={nothingNote === null ? undefined : NOTHING_TO_SEND_ID}
          >
            {confirmName(files, plan)}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {DIALOG_VERBS.cancel}
          </Button>
        </Row>
      </Stack>
    </Card>
  );
}

/** The upload and the running import. It is the focus target once Import is pressed: the preflight that held focus is gone by then. */
function ImportInFlight({
  state,
  track,
  ref,
}: {
  readonly state: LibraryImport["state"];
  readonly track: LibraryImport["track"];
  readonly ref: Ref<HTMLDivElement>;
}): ReactElement | null {
  if (state.status !== "uploading" && state.status !== "running") {
    return null;
  }
  const batchLabel =
    state.status === "running" && state.batch !== null && state.batch.total > 1
      ? `Upload ${String(state.batch.index + 1)} of ${String(state.batch.total)}: `
      : "";
  return (
    <Stack aria-label={IMPORT_PROGRESS_NAME} focusTarget={true} gap="block" ref={ref} role="group" tabIndex={-1}>
      {state.status === "uploading" ? <Text voice="reading">{`Sending ${state.filename}…`}</Text> : null}
      {state.status === "running" ? (
        <>
          <BundleWorkloadTracker workloadId={state.workloadId} onProgress={track.onProgress} onSucceeded={track.onSucceeded} onFailed={track.onFailed} />
          {/* `showValue` like every other live workload bar (`workload-row.tsx`): the same run, watched from
              two panes, printed its percentage in one of them and not the other. */}
          <Progress showValue={true} value={state.progress.pct} label={`${batchLabel}${state.progress.label ?? "Importing your library…"}`} />
        </>
      ) : null}
    </Stack>
  );
}

/** The import controls: dropzone → PREFLIGHT → busy + live progress → summary (or error) → reset. */
export function ImportLibrarySection(): ReactElement {
  // The backup ZIP cap, SERVED from the deployment config (never a hand-kept mirror) so an over-cap file is
  // rejected inline, not after a wasted round-trip. It is the largest file this dropzone takes; a card over the
  // tighter in-memory card cap is refused by its route with that cap's message. The folder picker carries NO cap
  // of its own: the plan decides per file against the served folder caps and says why a file stays behind.
  const importMaxBytes = useUploadCaps().importBundle;
  const { state, stageFiles, stageFolder, chooseCollision, chooseAllCollisions, confirm, cancel, retryPreview, reset, track, previewTrack } =
    useLibraryImport();
  const filePickerRef = useRef<HTMLInputElement>(null);
  const preflightRef = useRef<HTMLDivElement>(null);
  const folderPickerRef = useRef<HTMLElement | null>(null);
  const stagedPickerRef = useRef<HTMLElement | null>(null);
  const staged = state.status === "staged" ? state : null;
  // Each pick stages a fresh files array. The preflight can land below the fold of a long pane, so a pick
  // scrolls it to the top and moves focus onto it; nothing else on the page announces that the pick took.
  const stagedFiles = staged?.files ?? null;
  useEffect(() => {
    if (stagedFiles !== null) {
      preflightRef.current?.focus({ preventScroll: true });
      preflightRef.current?.scrollIntoView({ block: "start" });
    }
  }, [stagedFiles]);
  const busy = state.status === "uploading" || state.status === "running";
  // Confirming unmounts the preflight that held focus; the progress region takes it so it does not fall to the page.
  const outcomeRef = useRef<HTMLDivElement>(null);
  const uploading = state.status === "uploading";
  useEffect(() => {
    if (uploading) {
      outcomeRef.current?.focus({ preventScroll: true });
    }
  }, [uploading]);
  const done = state.status === "done";
  const succeeded = done && state.summary.failed === 0;
  // The outcome, a report or a refusal, takes focus and scrolls into view when it appears: the region that held focus is gone by
  // then, and the pane's last section renders its outcome below the fold of a desktop window.
  const resultRef = useRef<HTMLDivElement>(null);
  // Each outcome is a fresh state object, so a second refusal of the same words takes focus again.
  const outcome = state.status === "done" || state.status === "error" ? state : null;
  useEffect(() => {
    if (outcome !== null) {
      resultRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [outcome]);

  return (
    <Stack gap="block">
      <Text ink="muted" cap="prose">
        Restore a backup, or bring your SillyTavern library over. Drop a full .zip export (characters, chats, personas, world books, everything) or a single
        character card, or pick an unzipped backup / SillyTavern profile folder.
      </Text>
      <FileDropzone
        accept=".zip,.png,.json"
        aria-label="Import a backup or card file"
        data-testid={testId("backupImportDropzone")}
        subject="a .zip backup or a character card"
        hint="A .zip carries your whole library; a .png / .json is a single card"
        loading={busy}
        success={succeeded}
        maxSizeBytes={importMaxBytes}
        ref={filePickerRef}
        onFilesSelected={({ accepted }): void => {
          stagedPickerRef.current = filePickerRef.current;
          stageFiles(accepted);
        }}
      />
      <Row
        justify="start"
        align="center"
        gap="field"
        onFocusCapture={(event): void => {
          folderPickerRef.current = event.target;
        }}
      >
        <FolderPicker
          loading={busy}
          onFilesSelected={({ accepted }): void => {
            stagedPickerRef.current = folderPickerRef.current;
            stageFolder(accepted);
          }}
        >
          {IMPORT_FOLDER_NAME}
        </FolderPicker>
        <Text cap="prose" prose={true} voice="gloss">
          An unzipped Orbweaver backup or a SillyTavern profile folder. Your API keys (secrets.json) never leave this browser.
        </Text>
      </Row>
      {staged === null ? null : (
        <ImportPreflight
          ref={preflightRef}
          onRetryPreview={retryPreview}
          files={staged.files}
          plan={staged.plan}
          collisions={staged.collisions}
          choices={staged.choices}
          preview={staged.preview}
          onChoose={chooseCollision}
          onChooseAll={chooseAllCollisions}
          onCancel={(): void => {
            cancel();
            stagedPickerRef.current?.focus();
          }}
          onConfirm={confirm}
        />
      )}
      {staged?.preview.status === "reading" && staged.preview.workloadId !== null ? (
        <BundleWorkloadTracker
          key={staged.preview.workloadId}
          workloadId={staged.preview.workloadId}
          onProgress={previewTrack.onProgress}
          onSucceeded={previewTrack.onSucceeded}
          onFailed={previewTrack.onFailed}
        />
      ) : null}
      <ImportInFlight ref={outcomeRef} state={state} track={track} />
      {outcome !== null ? (
        <Stack aria-label={IMPORT_RESULT_NAME} focusTarget={true} gap="block" ref={resultRef} role="group" tabIndex={-1}>
          {outcome.status === "error" ? (
            <Text tone="destructive" role="alert">
              {outcome.message}
            </Text>
          ) : null}
          {outcome.status === "done" ? (
            <>
              <ImportReportSummary summary={outcome.summary} />
              <ImportedChatsMemoryOffer scope={outcome.summary.memoryScope} />
              <Row justify="start">
                <Button variant="outline" onClick={reset}>
                  Import another
                </Button>
              </Row>
            </>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
