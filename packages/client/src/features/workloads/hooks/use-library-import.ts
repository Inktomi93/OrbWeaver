// use-library-import — the Backup & Restore import-upload driver. A surface-local state machine over three
// seams: a `.zip` goes through the workload-backed bundle route (progress streams over the workloads room's
// live tail); a picked folder is PLANNED (`planServedFolderImport`: `planServedTreeImport` against the served
// caps, the persona review, then a replan that charges each upload its collision answers) and sent as one or
// more sequential uploads through the tree route, each its own workload; a bare character card goes through
// the synchronous card route. On finish it blanket-invalidates the user's cache, surfaces the normalized summary, and toasts a
// tally that matches the real outcome (never a fabricated success on a failed import).
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
// The `.zip` subscription itself lives in <BundleWorkloadTracker>, mounted only while running; this hook
// owns the state transitions and hands the tracker its terminal/progress callbacks via `track`.

import type { ImportPreview, PersonaCollision, PersonaCollisionChoice, PersonaCollisionChoices } from "@orb/contracts/import";
import { DEFAULT_PERSONA_COLLISION_CHOICE, mergeImportPreviews } from "@orb/contracts/import";
import type { WorkloadId } from "@orb/kit/ids";
import { useEffect, useRef, useState } from "react";
import type { TreeImportCaps, TreeImportPlan } from "#data";
import { HttpError, importBundle, importCharacters, importTree, planServedFolderImport, relativePathOf, useInvalidation, useTRPC, useUploadCaps } from "#data";
import { notify } from "#lib";
import type { BundleCounts, ImportSummary } from "../lib/portability-model.ts";
import { planNotes, sumBundleCounts, summarizeBundleCounts, summarizeCardImport, summaryCaption } from "../lib/portability-model.ts";
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
    return "Could not reach the server.";
  }
  if (error.status === HTTP_CONFLICT) {
    return "Another import is still finishing.";
  }
  if (error.status === HTTP_TOO_LARGE) {
    return "This folder is too large to preview.";
  }
  return error.status >= HTTP_SERVER_ERROR ? "The server could not read this folder." : "The server did not accept this folder for a preview.";
}

/** The staged folder's dry run. A pick with no preview sits at `off`; a failed preview leaves the import available. */
export type ImportPreviewState =
  | typeof NO_PREVIEW
  /** `workloadId` is null while the upload is still being sent. */
  | { readonly status: "reading"; readonly workloadId: WorkloadId | null; readonly progress: WorkloadProgressView; readonly batch: BatchProgress }
  | { readonly status: "ready"; readonly preview: ImportPreview }
  | { readonly status: "failed"; readonly message: string };

type LibraryImportState =
  | { readonly status: "idle" }
  /** PICKED, NOT SENT — the preflight arm. `plan` is present for a folder pick (`folder: true`). `choices`
   *  holds one answer per entry of `collisions`, keyed by the persona's folded name. */
  | {
      readonly status: "staged";
      readonly files: readonly File[];
      readonly folder: boolean;
      readonly plan: TreeImportPlan | null;
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
  /** Wired into the workload tracker while the staged folder's preview runs. */
  readonly previewTrack: LibraryImportTrack;
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

/** A folder's dry run, one upload after another. Held in a ref for the same reason as {@link FolderRun}. */
interface PreviewRun {
  readonly plan: TreeImportPlan;
  index: number;
  workloadId: WorkloadId | null;
  readonly previews: ImportPreview[];
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

  const failPreview = (run: PreviewRun, message: string): void => {
    setPreview(run, { status: "failed", message });
    if (previewRun.current === run) {
      previewRun.current = null;
    }
  };

  /** Stop the running dry run so a later pick is not refused as a second running import. */
  const dropPreview = (): void => {
    const run = previewRun.current;
    previewRun.current = null;
    clearConflictTimer();
    if (run !== null && run.workloadId !== null) {
      cancelWorkload.mutate({ id: run.workloadId });
    }
  };

  const sendPreviewBatch = (run: PreviewRun, attempt = 0): void => {
    const batch = run.plan.batches[run.index];
    if (batch === undefined) {
      setPreview(run, { status: "ready", preview: mergeImportPreviews(run.previews) });
      previewRun.current = null;
      return;
    }
    const position = { index: run.index, total: run.plan.batches.length };
    run.workloadId = null;
    setPreview(run, { status: "reading", workloadId: null, progress: NO_PROGRESS, batch: position });
    // the .catch below calls failPreview(), which leaves the staged import available and shows why. A refusal
    // for a running import is retried while this run is still the live one.
    importTree(batch, {}, run.plan.layout, { dryRun: true })
      .then(({ workloadId }) => {
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
        failPreview(run, previewFailureMessage(error));
      });
  };

  const retryPreview = (): void => {
    if (state.status !== "staged" || state.preview.status !== "failed" || state.plan === null || !state.plan.previewable) {
      return;
    }
    dropPreview();
    const run: PreviewRun = { plan: state.plan, index: 0, workloadId: null, previews: [] };
    previewRun.current = run;
    sendPreviewBatch(run);
  };

  const finish = (epoch: number, summary: ImportSummary): void => {
    if (epoch !== requestEpoch.current) {
      return;
    }
    invalidation.invalidateAllUserRoots();
    setState({ status: "done", summary });
    const caption = summaryCaption(summary);
    if (summary.failed === 0) {
      notify.success(`Import complete — ${caption}`);
    } else if (summary.imported === 0) {
      notify.error(`Import failed — ${caption}`);
    } else {
      notify.info(`Imported with issues — ${caption}`);
    }
  };

  const fail = (epoch: number, message: string): void => {
    if (epoch !== requestEpoch.current) {
      return;
    }
    setState({ status: "error", message });
    notify.error("Import failed. Check the file and try again.");
  };

  const stageFiles = (files: readonly File[]): void => {
    if (files.length > 0) {
      dropPreview();
      setState({ status: "staged", files: [...files], folder: false, plan: null, collisions: [], choices: {}, preview: NO_PREVIEW });
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
    // `setState({ status: "error", message })` and `notify.error` surface the failure (it skips only a superseded epoch). Ends if fail() stops writing that state.
    planServedFolderImport(files, treeCaps(caps))
      .then(({ plan, collisions }) => {
        if (epoch === requestEpoch.current) {
          const choices = Object.fromEntries(collisions.map((c): [string, PersonaCollisionChoice] => [c.key, DEFAULT_PERSONA_COLLISION_CHOICE]));
          setState({ status: "staged", files: [...files], folder: true, plan, collisions, choices, preview: NO_PREVIEW });
          if (plan.previewable && plan.batches.length > 0) {
            const run: PreviewRun = { plan, index: 0, workloadId: null, previews: [] };
            previewRun.current = run;
            sendPreviewBatch(run);
          }
        }
      })
      .catch((error: unknown) => fail(epoch, errorMessage(error)));
  };
  const cancel = (): void => {
    dropPreview();
    folderRun.current = null;
    setState({ status: "idle" });
  };

  const importFiles = (files: readonly File[]): void => {
    const [first] = files;
    if (first === undefined) {
      return;
    }
    const epoch = ++requestEpoch.current;
    setState({ status: "uploading", filename: first.name });
    if (isZip(first)) {
      // the .catch below calls fail(), whose
      // `setState({ status: "error", message })` and `notify.error` surface the failure (it skips only a superseded epoch). Ends if fail() stops writing that state.
      importBundle(first)
        .then(({ workloadId }) => {
          if (epoch === requestEpoch.current) {
            setState({ status: "running", epoch, workloadId, progress: { pct: null, label: null }, batch: null });
          }
        })
        .catch((error: unknown) => fail(epoch, errorMessage(error)));
      return;
    }
    // the .catch below calls fail(), whose
    // `setState({ status: "error", message })` and `notify.error` surface the failure (it skips only a superseded epoch). Ends if fail() stops writing that state.
    importCharacters(files)
      .then((result) => finish(epoch, summarizeCardImport(result)))
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
    // `setState({ status: "error", message })` and `notify.error` surface the failure (it skips only a superseded epoch). Ends if fail() stops writing that state.
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
      finish(epoch, { imported: 0, skipped: 0, merged: 0, failed: 0, outcomes: [], notes: planNotes(plan), memoryScope: null });
      return;
    }
    const run: FolderRun = { epoch, plan, choices, index: 0, done: { imported: 0, skipped: 0, mergedKeys: [], failed: 0, notes: [], memoryScope: null } };
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

  const previewTrack: LibraryImportTrack = {
    onProgress: (progress) => {
      setState((prev) => (prev.status === "staged" && prev.preview.status === "reading" ? { ...prev, preview: { ...prev.preview, progress } } : prev));
    },
    onSucceeded: (_counts, preview) => {
      const run = previewRun.current;
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
      if (previewRun.current !== null) {
        failPreview(previewRun.current, message);
      }
    },
  };

  const confirm = (): void => {
    if (state.status !== "staged" || state.preview.status === "reading") {
      return;
    }
    if (state.folder && state.plan !== null) {
      importFolder(state.plan, state.choices);
      return;
    }
    importFiles(state.files);
  };

  const chooseCollision = (key: string, choice: PersonaCollisionChoice): void => {
    setState((prev) => (prev.status === "staged" ? { ...prev, choices: { ...prev.choices, [key]: choice } } : prev));
  };

  const chooseAllCollisions = (choice: PersonaCollisionChoice): void => {
    setState((prev) =>
      prev.status === "staged" ? { ...prev, choices: Object.fromEntries(prev.collisions.map((c): [string, PersonaCollisionChoice] => [c.key, choice])) } : prev,
    );
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
