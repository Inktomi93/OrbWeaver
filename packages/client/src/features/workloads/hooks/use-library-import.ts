// use-library-import — the Backup & Restore import-upload driver. A surface-local state machine over two
// seams: a `.zip` goes through the workload-backed bundle route (progress streams over
// the workloads room's live tail); a bare character card goes through the synchronous card route. On finish it
// blanket-invalidates the user's cache, surfaces the normalized summary, and toasts a tally that matches
// the real outcome (never a fabricated success on a failed import).
//
// SELECTION IS STAGED, NEVER FIRED (#1099 F36). Picking a file used to BE the import: the drop handler
// uploaded immediately, so the first thing that told you what an import does to a library you already own
// was the report of what it had just done. A pick now lands in `staged` — a pure client state, zero
// requests — and the surface states the consequence and asks. `confirm()` is the only caller of the two
// upload seams; `cancel()` returns to the resting dropzone having touched nothing. The staged files are
// held in state deliberately: re-deriving them from the input after a confirm is impossible (a
// `FileList` does not survive the re-render that clears the picker).
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
  /** PICKED, NOT SENT — the preflight arm. `folder` picks the seam `confirm()` will use. */
  | { readonly status: "staged"; readonly files: readonly File[]; readonly folder: boolean }
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
  /** STAGE a picked batch (a single `.zip` bundle, or one-or-many bare card files) — no request. */
  readonly stageFiles: (files: readonly File[]) => void;
  /** STAGE a picked FOLDER (each file carries its `webkitRelativePath`) — the tree-import arm, no request. */
  readonly stageFolder: (files: readonly File[]) => void;
  /** Send the staged selection — the ONE caller of either upload seam. */
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

  const stageFiles = (files: readonly File[]): void => {
    if (files.length > 0) {
      setState({ status: "staged", files: [...files], folder: false });
    }
  };
  const stageFolder = (files: readonly File[]): void => {
    if (files.length > 0) {
      setState({ status: "staged", files: [...files], folder: true });
    }
  };
  const cancel = (): void => {
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
            setState({ status: "running", epoch, workloadId, progress: { pct: null, label: null } });
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

  const importFolder = (files: readonly File[]): void => {
    const [first] = files;
    if (first === undefined) {
      return;
    }
    const epoch = ++requestEpoch.current;
    setState({ status: "uploading", filename: relativePathOf(first) });
    // @orb-waive caught-failure-ownership(importTree): the .catch below calls fail(), which sets
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

  const confirm = (): void => {
    if (state.status !== "staged") {
      return;
    }
    if (state.folder) {
      importFolder(state.files);
      return;
    }
    importFiles(state.files);
  };

  const reset = (): void => {
    requestEpoch.current += 1;
    setState({ status: "idle" });
  };
  return { state, stageFiles, stageFolder, confirm, cancel, reset, track };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
