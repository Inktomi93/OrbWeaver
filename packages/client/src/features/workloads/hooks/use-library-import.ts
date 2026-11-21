// use-library-import — the Backup & Restore import-upload driver. A surface-local state machine over three
// seams: a `.zip` goes through the workload-backed bundle route (progress streams over the workloads room's
// live tail); a picked folder is PLANNED (`planServedFolderImport`: `planServedTreeImport` against the served
// caps, the persona review, then a replan that charges each upload its collision answers) and sent as one or
// more sequential uploads through the tree route, each its own workload; a bare character card goes through
// the synchronous card route. On finish it blanket-invalidates the user's cache, surfaces the normalized summary. The result is said once, in the
// report the person is looking at, never by a toast (a success they can see in place tells itself).
//
// SELECTION IS STAGED, NEVER FIRED. Picking a file used to BE the import: the drop handler uploaded
// immediately, so the first thing that told you what an import does to a library you already own was the
// report of what it had just done. A pick now lands in `staged` — a pure client state, zero requests — and
// the surface states the consequence and asks. `confirm()` is the only caller that imports;
// `cancel()` returns to the resting dropzone having touched nothing. The staged files are held in state
// deliberately: re-deriving them from the input after a confirm is impossible (a `FileList` does not
// survive the re-render that clears the picker). A folder pick stages its PLAN beside the files, so the
// preflight can say what will be left out and how many uploads the folder takes. It also stages the persona
// REVIEW: the same-name, different-content personas the profile carries, each with a Merge / Keep both choice
// (Merge preselected). The choices ride every upload of the folder, so the whole run honors them.
//
// A SillyTavern folder also runs a DRY RUN the moment it is staged: every upload goes through the tree route as an
// import-st workload that writes nothing, and their merged preview names what a real run would bring and skip.
// The real import still re-sends the folder on confirm, so a dropped preview strands no staged upload.
//
// The dry run carries the owner's persona answers, and a changed answer judges the personas again without sending the
// folder again: the persona files alone (`settings.json` and its avatars) go up as a second, small dry run, and its
// persona counts replace the folder preview's. The preview is held back (`reading`) until that answer lands, so a
// count judged under an old answer is never shown beside the answers on screen.
//
// A `.zip` pick dry-runs through the profile zip door the moment it is staged. A SillyTavern profile zip previews and
// imports as its folder would, its personas listed from the dry run's answer; a changed answer sends the zip again,
// because only the server reads inside it. An Orbweaver backup zip is answered with no content and imports through the
// bundle door, as before. A zip the door refuses ends the preview as `refused`: the file cannot be imported, so the
// preflight offers no import and no retry, only a way to pick another file.
//
// The `.zip` subscription itself lives in <BundleWorkloadTracker>, mounted only while running; this hook
// owns the state transitions and hands the tracker its terminal/progress callbacks via `track`.

import type { ImportPreview, PersonaCollision, PersonaCollisionChoice, PersonaCollisionChoices } from "@orb/contracts/import";
import { DEFAULT_PERSONA_COLLISION_CHOICE, mergeImportPreviews, personaCollisionChoiceFor } from "@orb/contracts/import";
import type { WorkloadId } from "@orb/kit/ids";
import { useEffect, useRef, useState } from "react";
import type { ProfileZipOutcome, TreeImportCaps, TreeImportPlan } from "#data";
import {
  HttpError,
  importBundle,
  importCharacters,
  importTree,
  importTreeZip,
  ProfileZipRefusedError,
  personaFilesOf,
  plannedFiles,
  planServedFolderImport,
  relativePathOf,
  UnsupportedFolderLayoutError,
  useInvalidation,
  useTRPC,
  useUploadCaps,
} from "#data";
import { IMPORT_FOLDER_WRONG_FOLDER } from "../lib/import-folder-copy.ts";
import { IMPORT_PREVIEW_FAILURE, IMPORT_ZIP_REFUSAL } from "../lib/import-library-names.ts";
import type { BundleCounts, ImportSummary } from "../lib/portability-model.ts";
import { planNotes, sumBundleCounts, summarizeBundleCounts, summarizeCardImport, withPersonaCounts } from "../lib/portability-model.ts";
import type { WorkloadProgressView } from "../lib/workloads-model.ts";
import { useCancelWorkload } from "./use-workload-mutations.ts";

const ZIP_EXTENSION = ".zip";

/** Where a folder's sequential uploads stand: the upload now running of the total. */
interface BatchProgress {
  readonly index: number;
  readonly total: number;
}

const NO_PROGRESS: WorkloadProgressView = { pct: null, label: null };
const NO_PREVIEW = { status: "off" } as const;
const UNREADABLE_PREVIEW = "The server returned no preview.";
const HTTP_CONFLICT = 409;
const HTTP_TOO_LARGE = 413;
const HTTP_SERVER_ERROR = 500;
/** A cancelled dry run holds the account's import slot until it settles, so the next upload is refused for a
 *  moment. The dry run waits that out instead of failing. */
const CONFLICT_RETRY_MS = 1000;
const CONFLICT_RETRY_LIMIT = 30;

/** What the reader is told when the dry run could not start. The status and the server's text stay out of it. */
function previewFailureMessage(error: unknown): string {
  if (!(error instanceof HttpError)) {
    return IMPORT_PREVIEW_FAILURE.unreachable;
  }
  if (error.status === HTTP_CONFLICT) {
    return IMPORT_PREVIEW_FAILURE.busy;
  }
  if (error.status === HTTP_TOO_LARGE) {
    return IMPORT_PREVIEW_FAILURE.tooLarge;
  }
  return error.status >= HTTP_SERVER_ERROR ? IMPORT_PREVIEW_FAILURE.serverFailed : IMPORT_PREVIEW_FAILURE.refused;
}

/** The staged pick's dry run. A pick with no preview sits at `off`; a failed preview leaves the import available; a refused
 *  zip cannot be imported at all, and its `message` is the plain reason. */
export type ImportPreviewState =
  | typeof NO_PREVIEW
  /** `workloadId` is null while the upload is still being sent. */
  | { readonly status: "reading"; readonly workloadId: WorkloadId | null; readonly progress: WorkloadProgressView; readonly batch: BatchProgress }
  | { readonly status: "ready"; readonly preview: ImportPreview }
  | { readonly status: "failed"; readonly message: string }
  | { readonly status: "refused"; readonly message: string };

type LibraryImportState =
  | { readonly status: "idle" }
  /** PICKED, NOT SENT — the preflight arm. `plan` is present for a folder pick (`folder: true`). `choices`
   *  holds one answer per entry of `collisions`, keyed by the persona's folded name. */
  | {
      readonly status: "staged";
      readonly files: readonly File[];
      readonly folder: boolean;
      readonly plan: TreeImportPlan | null;
      /** A `.zip` pick the profile zip door took as a SillyTavern profile: it imports there, not through the bundle door. */
      readonly profileZip: boolean;
      readonly collisions: readonly PersonaCollision[];
      readonly choices: PersonaCollisionChoices;
      readonly preview: ImportPreviewState;
    }
  | { readonly status: "uploading"; readonly filename: string }
  | {
      readonly status: "running";
      readonly epoch: number;
      readonly workloadId: WorkloadId;
      readonly progress: WorkloadProgressView;
      /** Present for a planned folder import; absent for a `.zip`. */
      readonly batch: BatchProgress | null;
    }
  | { readonly status: "done"; readonly summary: ImportSummary }
  | { readonly status: "error"; readonly message: string };

/** The progress + terminal callbacks the section wires into <BundleWorkloadTracker> while running. */
interface LibraryImportTrack {
  readonly onProgress: (progress: WorkloadProgressView) => void;
  readonly onSucceeded: (counts: BundleCounts, preview: ImportPreview | null) => void;
  readonly onFailed: (message: string) => void;
}

export interface LibraryImport {
  readonly state: LibraryImportState;
  /** STAGE a picked batch (a single `.zip` bundle, or one-or-many bare card files) — no request. */
  readonly stageFiles: (files: readonly File[]) => void;
  /** STAGE a picked FOLDER (each file carries its `webkitRelativePath`), plan its uploads and start its dry run. */
  readonly stageFolder: (files: readonly File[]) => void;
  /** Answer one persona collision of the staged folder. */
  readonly chooseCollision: (key: string, choice: PersonaCollisionChoice) => void;
  /** Give every collision of the staged folder the same answer (Merge all / Keep all). */
  readonly chooseAllCollisions: (choice: PersonaCollisionChoice) => void;
  /** Send the staged selection — the ONE caller that imports. */
  readonly confirm: () => void;
  /** Drop the staged selection, having imported nothing. */
  readonly cancel: () => void;
  /** Run the staged folder's dry run again after it failed. */
  readonly retryPreview: () => void;
  /** Return to the resting dropzone (clears a prior report / error). */
  readonly reset: () => void;
  /** Wired into the workload tracker while `state.status === "running"`. */
  readonly track: LibraryImportTrack;
  /** Wired into the tracker of one dry-run workload while the staged folder's preview runs; it hears only that workload. */
  readonly previewTrack: (workloadId: WorkloadId) => LibraryImportTrack;
}

function isZip(file: File): boolean {
  return file.name.toLowerCase().endsWith(ZIP_EXTENSION);
}

/** The planner's view of the served caps. */
function treeCaps(caps: ReturnType<typeof useUploadCaps>): TreeImportCaps {
  return { totalBytes: caps.importTreeTotal, fileBytes: caps.importTreeFile, files: caps.importTreeFiles };
}

/** A folder's sequential uploads: the plan, the batch being sent and the finished batches' counts. Held in
 *  a ref because the tracker's terminal callback, not a render, decides to send the next batch. */
interface FolderRun {
  readonly epoch: number;
  readonly plan: TreeImportPlan;
  readonly choices: PersonaCollisionChoices;
  index: number;
  done: BundleCounts;
}

/** What a dry run sends: a folder's planned uploads, or one zip the server reads. */
type PreviewSource = { readonly kind: "folder"; readonly plan: TreeImportPlan } | { readonly kind: "zip"; readonly file: File };

/** A folder's dry run, one upload after another, or a zip's in one upload. Held in a ref for the same reason as
 *  {@link FolderRun}. A run that judges a folder's personas again is the same shape: its one upload is the persona
 *  files, and `base` is the folder preview its persona counts amend. A zip's is judged again whole. */
interface PreviewRun {
  /** Ends the upload in flight when the preview is dropped. */
  readonly upload: AbortController;
  readonly source: PreviewSource;
  /** The persona answers every upload of this run is sent under. */
  readonly choices: PersonaCollisionChoices;
  readonly base: ImportPreview | null;
  index: number;
  workloadId: WorkloadId | null;
  readonly previews: ImportPreview[];
}

type StagedState = Extract<LibraryImportState, { readonly status: "staged" }>;

/** The staged zip pick once the zip door has answered: a backup imports through the bundle door; a profile lists the
 *  personas its dry run was judged under, keeping any answer already given and the default for a new one. */
function withZipOutcome(staged: StagedState, outcome: ProfileZipOutcome): StagedState {
  if (outcome.kind === "backup") {
    return { ...staged, profileZip: false, collisions: [], choices: {} };
  }
  const choices = Object.fromEntries(
    outcome.collisions.map((c): [string, PersonaCollisionChoice] => [c.key, personaCollisionChoiceFor(staged.choices, c.key)]),
  );
  return { ...staged, profileZip: true, collisions: outcome.collisions, choices };
}

/** The folder preview the staged pick last finished, which a changed persona answer amends. */
interface FolderPreview {
  readonly plan: TreeImportPlan;
  readonly preview: ImportPreview;
}

/** Whether two answer sets say the same thing for every collision. An unlisted collision is the default answer. */
function sameAnswers(a: PersonaCollisionChoices, b: PersonaCollisionChoices): boolean {
  return [...Object.keys(a), ...Object.keys(b)].every((key) => personaCollisionChoiceFor(a, key) === personaCollisionChoiceFor(b, key));
}

export function useLibraryImport(): LibraryImport {
  const invalidation = useInvalidation();
  const trpc = useTRPC();
  const caps = useUploadCaps();
  const cancelWorkload = useCancelWorkload({ trpc, invalidation });
  const [state, setState] = useState<LibraryImportState>({ status: "idle" });
  const requestEpoch = useRef(0);
  const folderRun = useRef<FolderRun | null>(null);
  const previewRun = useRef<PreviewRun | null>(null);
  const folderPreview = useRef<FolderPreview | null>(null);
  // The staged `.zip` pick, which a changed persona answer sends again.
  const zipPick = useRef<File | null>(null);
  // The answers on screen, kept beside the state because a dry run that ends reads them from a callback, not a render.
  const answers = useRef<PersonaCollisionChoices>({});
  const conflictTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConflictTimer = (): void => {
    if (conflictTimer.current !== null) {
      clearTimeout(conflictTimer.current);
      conflictTimer.current = null;
    }
  };
  useEffect(
    () => (): void => {
      if (conflictTimer.current !== null) {
        clearTimeout(conflictTimer.current);
      }
    },
    [],
  );

  const setPreview = (run: PreviewRun, preview: ImportPreviewState): void => {
    if (previewRun.current === run) {
      setState((prev) => (prev.status === "staged" ? { ...prev, preview } : prev));
    }
  };

  const endPreview = (run: PreviewRun, ended: Extract<ImportPreviewState, { readonly status: "failed" | "refused" }>): void => {
    setPreview(run, ended);
    if (previewRun.current === run) {
      previewRun.current = null;
    }
  };

  const failPreview = (run: PreviewRun, message: string): void => {
    endPreview(run, { status: "failed", message });
  };

  /** Stop the running dry run so a later pick is not refused as a second running import. */
  const stopPreviewRun = (): void => {
    const run = previewRun.current;
    previewRun.current = null;
    clearConflictTimer();
    if (run !== null) {
      run.upload.abort();
      if (run.workloadId !== null) {
        cancelWorkload.mutate({ id: run.workloadId });
      }
    }
  };

  /** Forget the staged pick's preview altogether: its run, and the finished folder preview or the zip a changed answer
   *  would judge again. */
  const dropPreview = (): void => {
    stopPreviewRun();
    folderPreview.current = null;
    zipPick.current = null;
  };

  /** Judge the personas again under the answers now on screen: the persona files go up alone as a dry run, and what it
   *  counts replaces the folder preview's persona counts. Whatever dry run was in flight is superseded. */
  const rejudgePersonas = (): void => {
    const zip = zipPick.current;
    if (zip !== null) {
      startPreview({ kind: "zip", file: zip }, answers.current, null);
      return;
    }
    const held = folderPreview.current;
    if (held === null) {
      return;
    }
    const plan: TreeImportPlan = { ...held.plan, batches: [personaFilesOf(plannedFiles(held.plan))] };
    startPreview({ kind: "folder", plan }, answers.current, held.preview);
  };

  /** Supersede whatever dry run is in flight with a new one over `source`, under `choices`. */
  const startPreview = (source: PreviewSource, choices: PersonaCollisionChoices, base: ImportPreview | null): void => {
    stopPreviewRun();
    const run: PreviewRun = { upload: new AbortController(), source, choices, base, index: 0, workloadId: null, previews: [] };
    previewRun.current = run;
    sendPreviewBatch(run);
  };

  /** Every upload has been judged: show the preview, or judge the personas again if an answer changed while the folder was read. */
  const finishPreview = (run: PreviewRun): void => {
    // The last upload's workload has ended; a run superseded below must not cancel it.
    run.workloadId = null;
    const judged = mergeImportPreviews(run.previews);
    if (run.base !== null) {
      setPreview(run, { status: "ready", preview: withPersonaCounts(run.base, judged) });
      previewRun.current = null;
      return;
    }
    if (run.source.kind === "folder") {
      folderPreview.current = { plan: run.source.plan, preview: judged };
    }
    if (!sameAnswers(run.choices, answers.current)) {
      rejudgePersonas();
      return;
    }
    setPreview(run, { status: "ready", preview: judged });
    previewRun.current = null;
  };

  /** Send upload `run.index` of the run, resolving the dry run's workload; null when the zip is an Orbweaver backup. */
  const sendPreviewUpload = async (run: PreviewRun, index: number): Promise<WorkloadId | null> => {
    const options = { dryRun: true, signal: run.upload.signal };
    if (run.source.kind === "folder") {
      const batch = run.source.plan.batches[index] ?? [];
      return (await importTree(batch, run.choices, run.source.plan.layout, options)).workloadId;
    }
    const outcome = await importTreeZip(run.source.file, run.choices, options);
    if (previewRun.current === run) {
      setState((prev) => (prev.status === "staged" ? withZipOutcome(prev, outcome) : prev));
    }
    return outcome.kind === "started" ? outcome.workloadId : null;
  };

  const sendPreviewBatch = (run: PreviewRun, attempt = 0): void => {
    const total = run.source.kind === "folder" ? run.source.plan.batches.length : 1;
    if (run.index >= total) {
      finishPreview(run);
      return;
    }
    const position = { index: run.index, total };
    run.workloadId = null;
    setPreview(run, { status: "reading", workloadId: null, progress: NO_PROGRESS, batch: position });
    // the .catch below calls failPreview(), which leaves the staged import available and shows why. A refusal
    // for a running import is retried while this run is still the live one.
    sendPreviewUpload(run, run.index)
      .then((workloadId) => {
        if (workloadId === null) {
          // An Orbweaver backup zip has no preview; it imports through the bundle door.
          setPreview(run, NO_PREVIEW);
          if (previewRun.current === run) {
            previewRun.current = null;
          }
          return;
        }
        if (previewRun.current !== run) {
          cancelWorkload.mutate({ id: workloadId });
          return;
        }
        run.workloadId = workloadId;
        setPreview(run, { status: "reading", workloadId, progress: NO_PROGRESS, batch: position });
      })
      .catch((error: unknown) => {
        if (error instanceof HttpError && error.status === HTTP_CONFLICT && attempt < CONFLICT_RETRY_LIMIT && previewRun.current === run) {
          conflictTimer.current = setTimeout(() => {
            conflictTimer.current = null;
            if (previewRun.current === run) {
              sendPreviewBatch(run, attempt + 1);
            }
          }, CONFLICT_RETRY_MS);
          return;
        }
        if (error instanceof ProfileZipRefusedError) {
          endPreview(run, { status: "refused", message: IMPORT_ZIP_REFUSAL[error.reason] });
          return;
        }
        failPreview(run, previewFailureMessage(error));
      });
  };

  const retryPreview = (): void => {
    if (state.status !== "staged" || state.preview.status !== "failed") {
      return;
    }
    // A failed persona judgement leaves the folder's own preview, which is all it amends; a failed folder read has none.
    // A zip is judged again whole.
    if (folderPreview.current !== null || zipPick.current !== null) {
      rejudgePersonas();
      return;
    }
    if (state.plan === null || !state.plan.previewable) {
      return;
    }
    answers.current = state.choices;
    startPreview({ kind: "folder", plan: state.plan }, state.choices, null);
  };

  const finish = (epoch: number, summary: ImportSummary): void => {
    if (epoch !== requestEpoch.current) {
      return;
    }
    invalidation.invalidateAllUserRoots();
    // The report beside the focused Import result says every outcome, a clean one included, so no toast repeats it.
    setState({ status: "done", summary });
  };

  /** A failure is one inline line where the person is looking; a toast beside it would say it twice. */
  const fail = (epoch: number, message: string): void => {
    if (epoch !== requestEpoch.current) {
      return;
    }
    setState({ status: "error", message });
  };

  const stageFiles = (files: readonly File[]): void => {
    const [first] = files;
    if (first === undefined) {
      return;
    }
    dropPreview();
    setState({ status: "staged", files: [...files], folder: false, plan: null, profileZip: false, collisions: [], choices: {}, preview: NO_PREVIEW });
    if (files.length === 1 && isZip(first)) {
      zipPick.current = first;
      answers.current = {};
      startPreview({ kind: "zip", file: first }, {}, null);
    }
  };
  const stageFolder = (files: readonly File[]): void => {
    if (files.length === 0) {
      return;
    }
    dropPreview();
    const epoch = ++requestEpoch.current;
    // The plan reads group definitions, so it is async; the picker's files are staged the moment it lands.
    // the .catch below calls fail(), whose
    // `setState({ status: "error", message })` shows the failure inline (it skips only a superseded epoch). Ends if fail() stops writing that state.
    planServedFolderImport(files, treeCaps(caps))
      .then(({ plan, collisions }) => {
        if (epoch === requestEpoch.current) {
          const choices = Object.fromEntries(collisions.map((c): [string, PersonaCollisionChoice] => [c.key, DEFAULT_PERSONA_COLLISION_CHOICE]));
          setState({ status: "staged", files: [...files], folder: true, plan, profileZip: false, collisions, choices, preview: NO_PREVIEW });
          answers.current = choices;
          if (plan.previewable && plan.batches.length > 0) {
            startPreview({ kind: "folder", plan }, choices, null);
          }
        }
      })
      .catch((error: unknown) => {
        if (error instanceof UnsupportedFolderLayoutError) {
          fail(epoch, IMPORT_FOLDER_WRONG_FOLDER);
          return;
        }
        fail(epoch, error instanceof HttpError ? previewFailureMessage(error) : errorMessage(error));
      });
  };
  const cancel = (): void => {
    dropPreview();
    folderRun.current = null;
    setState({ status: "idle" });
  };

  const importFiles = (files: readonly File[], profileZip: boolean, choices: PersonaCollisionChoices): void => {
    const [first] = files;
    if (first === undefined) {
      return;
    }
    const epoch = ++requestEpoch.current;
    setState({ status: "uploading", filename: first.name });
    if (profileZip) {
      // the .catch below calls fail(), whose
      // `setState({ status: "error", message })` shows the failure inline (it skips only a superseded epoch). Ends if fail() stops writing that state.
      importTreeZip(first, choices)
        .then((outcome) => {
          if (outcome.kind === "backup") {
            importBackupZip(epoch, first);
          } else if (epoch === requestEpoch.current) {
            setState({ status: "running", epoch, workloadId: outcome.workloadId, progress: { pct: null, label: null }, batch: null });
          }
        })
        .catch((error: unknown) => fail(epoch, error instanceof ProfileZipRefusedError ? IMPORT_ZIP_REFUSAL[error.reason] : errorMessage(error)));
      return;
    }
    if (isZip(first)) {
      importBackupZip(epoch, first);
      return;
    }
    // the .catch below calls fail(), whose
    // `setState({ status: "error", message })` shows the failure inline (it skips only a superseded epoch). Ends if fail() stops writing that state.
    importCharacters(files)
      .then((result) => finish(epoch, summarizeCardImport(result)))
      .catch((error: unknown) => fail(epoch, errorMessage(error)));
  };

  const importBackupZip = (epoch: number, first: File): void => {
    // the .catch below calls fail(), whose
    // `setState({ status: "error", message })` shows the failure inline (it skips only a superseded epoch). Ends if fail() stops writing that state.
    importBundle(first)
      .then(({ workloadId }) => {
        if (epoch === requestEpoch.current) {
          setState({ status: "running", epoch, workloadId, progress: { pct: null, label: null }, batch: null });
        }
      })
      .catch((error: unknown) => fail(epoch, errorMessage(error)));
  };

  /** Send batch `run.index`; the tracker's terminal callback sends the next one or finishes the run. */
  const sendBatch = (run: FolderRun): void => {
    const batch = run.plan.batches[run.index];
    const first = batch?.[0];
    if (batch === undefined || first === undefined) {
      finish(run.epoch, { ...summarizeBundleCounts(run.done), notes: [...run.done.notes, ...planNotes(run.plan)] });
      return;
    }
    setState({ status: "uploading", filename: relativePathOf(first) });
    // the .catch below calls fail(), whose
    // `setState({ status: "error", message })` shows the failure inline (it skips only a superseded epoch). Ends if fail() stops writing that state.
    importTree(batch, run.choices, run.plan.layout)
      .then(({ workloadId }) => {
        if (run.epoch === requestEpoch.current) {
          setState({
            status: "running",
            epoch: run.epoch,
            workloadId,
            progress: { pct: null, label: null },
            batch: { index: run.index, total: run.plan.batches.length },
          });
        }
      })
      .catch((error: unknown) => fail(run.epoch, errorMessage(error)));
  };

  const importFolder = (plan: TreeImportPlan, choices: PersonaCollisionChoices): void => {
    const epoch = ++requestEpoch.current;
    if (plan.batches.length === 0) {
      finish(epoch, { imported: 0, inLibrary: 0, skipped: 0, merged: 0, failed: 0, outcomes: [], notes: planNotes(plan), memoryScope: null });
      return;
    }
    const run: FolderRun = {
      epoch,
      plan,
      choices,
      index: 0,
      done: { imported: 0, inLibrary: 0, skipped: 0, mergedKeys: [], failed: 0, notes: [], memoryScope: null },
    };
    folderRun.current = run;
    sendBatch(run);
  };

  const trackEpoch = state.status === "running" ? state.epoch : null;
  const track: LibraryImportTrack = {
    onProgress: (progress) => {
      if (trackEpoch !== null && trackEpoch === requestEpoch.current) {
        setState((prev) => (prev.status === "running" && prev.epoch === trackEpoch ? { ...prev, progress } : prev));
      }
    },
    onSucceeded: (counts) => {
      if (trackEpoch === null) {
        return;
      }
      const run = folderRun.current;
      if (run === null || run.epoch !== trackEpoch) {
        finish(trackEpoch, summarizeBundleCounts(counts));
        return;
      }
      run.done = sumBundleCounts(run.done, counts);
      run.index += 1;
      sendBatch(run);
    },
    onFailed: (message) => {
      if (trackEpoch !== null) {
        folderRun.current = null;
        fail(trackEpoch, message);
      }
    },
  };

  // An event counts only while the live run is still on the workload it came from: a superseded run's tracker stays
  // mounted until its replacement commits, and a finished upload's tracker until the next one's id lands, so a late
  // event from either would otherwise finish or advance the run that replaced it.
  const previewTrack = (workloadId: WorkloadId): LibraryImportTrack => {
    const liveRun = (): PreviewRun | null => {
      const run = previewRun.current;
      return run !== null && run.workloadId === workloadId ? run : null;
    };
    const events: LibraryImportTrack = {
      onProgress: (progress) => {
        if (liveRun() !== null) {
          setState((prev) => (prev.status === "staged" && prev.preview.status === "reading" ? { ...prev, preview: { ...prev.preview, progress } } : prev));
        }
      },
      onSucceeded: (_counts, preview) => {
        const run = liveRun();
        if (run === null) {
          return;
        }
        if (preview === null) {
          failPreview(run, UNREADABLE_PREVIEW);
          return;
        }
        run.previews.push(preview);
        run.index += 1;
        sendPreviewBatch(run);
      },
      onFailed: (message) => {
        const run = liveRun();
        if (run !== null) {
          failPreview(run, message);
        }
      },
    };
    return events;
  };

  const confirm = (): void => {
    if (state.status !== "staged" || state.preview.status === "reading" || state.preview.status === "refused") {
      return;
    }
    if (state.folder && state.plan !== null) {
      importFolder(state.plan, state.choices);
      return;
    }
    importFiles(state.files, state.profileZip, state.choices);
  };

  /** Record the answers now on screen, and judge the personas again when a finished preview was counted under others. */
  const answer = (choices: PersonaCollisionChoices): void => {
    answers.current = choices;
    setState((prev) => (prev.status === "staged" ? { ...prev, choices } : prev));
    rejudgePersonas();
  };

  const chooseCollision = (key: string, choice: PersonaCollisionChoice): void => {
    answer({ ...answers.current, [key]: choice });
  };

  const chooseAllCollisions = (choice: PersonaCollisionChoice): void => {
    if (state.status === "staged") {
      answer(Object.fromEntries(state.collisions.map((c): [string, PersonaCollisionChoice] => [c.key, choice])));
    }
  };

  const reset = (): void => {
    dropPreview();
    requestEpoch.current += 1;
    folderRun.current = null;
    setState({ status: "idle" });
  };
  return { state, stageFiles, stageFolder, chooseCollision, chooseAllCollisions, confirm, cancel, retryPreview, reset, track, previewTrack };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
