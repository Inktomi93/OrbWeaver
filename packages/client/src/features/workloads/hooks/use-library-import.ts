// use-library-import — the Backup & Restore import-upload driver. A surface-local state machine over two
// seams: a `.zip` goes through the workload-backed bundle route (progress streams over
// the workloads room's live tail); a bare character card goes through the synchronous card route. On finish it
// blanket-invalidates the user's cache, surfaces the normalized summary, and toasts a tally that matches
// the real outcome (never a fabricated success on a failed import).
//
// The `.zip` subscription itself lives in <BundleWorkloadTracker>, mounted only while running; this hook
// owns the state transitions and hands the tracker its terminal/progress callbacks via `track`.

import type { WorkloadId } from "@orb/kit/ids";
import { useRef, useState } from "react";
import { importBundle, importCharacters, importTree, relativePathOf, useInvalidation } from "#data";
import { notify } from "#lib";
import type { BundleCounts, ImportSummary } from "../lib/portability-model.ts";
import { summarizeBundleCounts, summarizeCardImport, summaryCaption } from "../lib/portability-model.ts";
import type { WorkloadProgressView } from "../lib/workloads-model.ts";

const ZIP_EXTENSION = ".zip";

type LibraryImportState =
  | { readonly status: "idle" }
  | { readonly status: "uploading"; readonly filename: string }
  | {
      readonly status: "running";
      readonly epoch: number;
      readonly workloadId: WorkloadId;
      readonly progress: WorkloadProgressView;
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
  /** Upload a picked batch (a single `.zip` bundle, or one-or-many bare card files). */
  readonly importFiles: (files: readonly File[]) => void;
  /** Upload a picked FOLDER (each file carries its `webkitRelativePath`) — the tree-import workload arm. */
  readonly importFolder: (files: readonly File[]) => void;
  /** Return to the resting dropzone (clears a prior report / error). */
  readonly reset: () => void;
  /** Wired into the workload tracker while `state.status === "running"`. */
  readonly track: LibraryImportTrack;
}

function isZip(file: File): boolean {
  return file.name.toLowerCase().endsWith(ZIP_EXTENSION);
}

export function useLibraryImport(): LibraryImport {
  const invalidation = useInvalidation();
  const [state, setState] = useState<LibraryImportState>({ status: "idle" });
  const requestEpoch = useRef(0);

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

  const importFiles = (files: readonly File[]): void => {
    const [first] = files;
    if (first === undefined) {
      return;
    }
    const epoch = ++requestEpoch.current;
    setState({ status: "uploading", filename: first.name });
    if (isZip(first)) {
      // @orb-gate-ignore caught-failure-ownership(promise:importBundle): the .catch below calls fail(), which
      // sets an error state and toasts — a rendered failure surface. Ends if fail() stops writing that state.
      importBundle(first)
        .then(({ workloadId }) => {
          if (epoch === requestEpoch.current) {
            setState({ status: "running", epoch, workloadId, progress: { pct: null, label: null } });
          }
        })
        .catch((error: unknown) => fail(epoch, errorMessage(error)));
      return;
    }
    // @orb-gate-ignore caught-failure-ownership(promise:importCharacters): the .catch below calls fail(), which
    // sets an error state and toasts — a rendered failure surface. Ends if fail() stops writing that state.
    importCharacters(files)
      .then((result) => finish(epoch, summarizeCardImport(result)))
      .catch((error: unknown) => fail(epoch, errorMessage(error)));
  };

  const importFolder = (files: readonly File[]): void => {
    const [first] = files;
    if (first === undefined) {
      return;
    }
    const epoch = ++requestEpoch.current;
    setState({ status: "uploading", filename: relativePathOf(first) });
    // @orb-gate-ignore caught-failure-ownership(promise:importTree): the .catch below calls fail(), which sets
    // an error state and toasts — a rendered failure surface. Ends if fail() stops writing that state.
    importTree(files)
      .then(({ workloadId }) => {
        if (epoch === requestEpoch.current) {
          setState({ status: "running", epoch, workloadId, progress: { pct: null, label: null } });
        }
      })
      .catch((error: unknown) => fail(epoch, errorMessage(error)));
  };

  const trackEpoch = state.status === "running" ? state.epoch : null;
  const track: LibraryImportTrack = {
    onProgress: (progress) => {
      if (trackEpoch !== null && trackEpoch === requestEpoch.current) {
        setState((prev) => (prev.status === "running" && prev.epoch === trackEpoch ? { ...prev, progress } : prev));
      }
    },
    onSucceeded: (counts) => {
      if (trackEpoch !== null) {
        finish(trackEpoch, summarizeBundleCounts(counts));
      }
    },
    onFailed: (message) => {
      if (trackEpoch !== null) {
        fail(trackEpoch, message);
      }
    },
  };

  const reset = (): void => {
    requestEpoch.current += 1;
    setState({ status: "idle" });
  };
  return { state, importFiles, importFolder, reset, track };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
