// use-library-import — the Backup & Restore import-upload driver. A surface-local state machine over three
// seams: a `.zip` goes through the workload-backed bundle route (progress streams over the workloads room's
// live tail); a picked folder is PLANNED (`planTreeImport`) and sent as one or more sequential uploads
// through the tree route, each its own workload; a bare character card goes through the synchronous card
// route. On finish it blanket-invalidates the user's cache, surfaces the normalized summary, and toasts a
// tally that matches the real outcome (never a fabricated success on a failed import).
//
// SELECTION IS STAGED, NEVER FIRED. Picking a file used to BE the import: the drop handler uploaded
// immediately, so the first thing that told you what an import does to a library you already own was the
// report of what it had just done. A pick now lands in `staged` — a pure client state, zero requests — and
// the surface states the consequence and asks. `confirm()` is the only caller of the upload seams;
// `cancel()` returns to the resting dropzone having touched nothing. The staged files are held in state
// deliberately: re-deriving them from the input after a confirm is impossible (a `FileList` does not
// survive the re-render that clears the picker). A folder pick stages its PLAN beside the files, so the
// preflight can say what will be left out and how many uploads the folder takes.
//
// The `.zip` subscription itself lives in <BundleWorkloadTracker>, mounted only while running; this hook
// owns the state transitions and hands the tracker its terminal/progress callbacks via `track`.

import type { WorkloadId } from "@orb/kit/ids";
import { useRef, useState } from "react";
import type { TreeImportCaps, TreeImportPlan } from "#data";
import { importBundle, importCharacters, importTree, planTreeImport, relativePathOf, useInvalidation, useUploadCaps } from "#data";
import { notify } from "#lib";
import type { BundleCounts, ImportSummary } from "../lib/portability-model.ts";
import { planNotes, sumBundleCounts, summarizeBundleCounts, summarizeCardImport, summaryCaption } from "../lib/portability-model.ts";
import type { WorkloadProgressView } from "../lib/workloads-model.ts";

const ZIP_EXTENSION = ".zip";

/** Where a folder's sequential uploads stand: the upload now running and the sum of the finished ones. */
interface BatchProgress {
  readonly index: number;
  readonly total: number;
  readonly done: BundleCounts;
}

type LibraryImportState =
  | { readonly status: "idle" }
  /** PICKED, NOT SENT — the preflight arm. `plan` is present for a folder pick (`folder: true`). */
  | { readonly status: "staged"; readonly files: readonly File[]; readonly folder: boolean; readonly plan: TreeImportPlan | null }
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
  readonly onSucceeded: (counts: BundleCounts) => void;
  readonly onFailed: (message: string) => void;
}

export interface LibraryImport {
  readonly state: LibraryImportState;
  /** STAGE a picked batch (a single `.zip` bundle, or one-or-many bare card files) — no request. */
  readonly stageFiles: (files: readonly File[]) => void;
  /** STAGE a picked FOLDER (each file carries its `webkitRelativePath`) and plan its uploads — no request. */
  readonly stageFolder: (files: readonly File[]) => void;
  /** Send the staged selection — the ONE caller of the upload seams. */
  readonly confirm: () => void;
  /** Drop the staged selection, having sent nothing. */
  readonly cancel: () => void;
  /** Return to the resting dropzone (clears a prior report / error). */
  readonly reset: () => void;
  /** Wired into the workload tracker while `state.status === "running"`. */
  readonly track: LibraryImportTrack;
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
  index: number;
  done: BundleCounts;
}

export function useLibraryImport(): LibraryImport {
  const invalidation = useInvalidation();
  const caps = useUploadCaps();
  const [state, setState] = useState<LibraryImportState>({ status: "idle" });
  const requestEpoch = useRef(0);
  const folderRun = useRef<FolderRun | null>(null);

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
      setState({ status: "staged", files: [...files], folder: false, plan: null });
    }
  };
  const stageFolder = (files: readonly File[]): void => {
    if (files.length === 0) {
      return;
    }
    const epoch = ++requestEpoch.current;
    // The plan reads group definitions, so it is async; the picker's files are staged the moment it lands.
    // @orb-waive caught-failure-ownership(planTreeImport): the .catch below calls fail(), which sets an
    // error state and toasts — a rendered failure surface. Ends if fail() stops writing that state.
    planTreeImport(files, treeCaps(caps))
      .then((plan) => {
        if (epoch === requestEpoch.current) {
          setState({ status: "staged", files: [...files], folder: true, plan });
        }
      })
      .catch((error: unknown) => fail(epoch, errorMessage(error)));
  };
  const cancel = (): void => {
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
      // @orb-waive caught-failure-ownership(importBundle): the .catch below calls fail(), which
      // sets an error state and toasts — a rendered failure surface. Ends if fail() stops writing that state.
      importBundle(first)
        .then(({ workloadId }) => {
          if (epoch === requestEpoch.current) {
            setState({ status: "running", epoch, workloadId, progress: { pct: null, label: null }, batch: null });
          }
        })
        .catch((error: unknown) => fail(epoch, errorMessage(error)));
      return;
    }
    // @orb-waive caught-failure-ownership(importCharacters): the .catch below calls fail(), which
    // sets an error state and toasts — a rendered failure surface. Ends if fail() stops writing that state.
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
    // @orb-waive caught-failure-ownership(importTree): the .catch below calls fail(), which sets
    // an error state and toasts — a rendered failure surface. Ends if fail() stops writing that state.
    importTree(batch)
      .then(({ workloadId }) => {
        if (run.epoch === requestEpoch.current) {
          setState({
            status: "running",
            epoch: run.epoch,
            workloadId,
            progress: { pct: null, label: null },
            batch: { index: run.index, total: run.plan.batches.length, done: run.done },
          });
        }
      })
      .catch((error: unknown) => fail(run.epoch, errorMessage(error)));
  };

  const importFolder = (plan: TreeImportPlan): void => {
    const epoch = ++requestEpoch.current;
    if (plan.batches.length === 0) {
      finish(epoch, { imported: 0, skipped: 0, failed: 0, outcomes: [], notes: planNotes(plan), memoryScope: null });
      return;
    }
    const run: FolderRun = { epoch, plan, index: 0, done: { imported: 0, skipped: 0, failed: 0, notes: [], memoryScope: null } };
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

  const confirm = (): void => {
    if (state.status !== "staged") {
      return;
    }
    if (state.folder && state.plan !== null) {
      importFolder(state.plan);
      return;
    }
    importFiles(state.files);
  };

  const reset = (): void => {
    requestEpoch.current += 1;
    folderRun.current = null;
    setState({ status: "idle" });
  };
  return { state, stageFiles, stageFolder, confirm, cancel, reset, track };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
