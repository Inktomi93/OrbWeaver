// use-library-import — the Backup & Restore import-upload driver. A surface-local state machine over the
// two seams: a `.zip` → the workload-backed bundle route (`importBundle` → `{ workloadId }`, then the
// import RUNS off-request and its progress + terminal outcome stream over `workloads.subscribe`); a bare
// character card (`.png`/`.json`) → the synchronous card route (`importCharacters`). On a finished import
// it blanket-invalidates the user's cache through the central seam so imported entities appear across the
// app, surfaces the normalized summary, and toasts the tally — the toast VARIANT (and the dropzone's
// success glyph, gated in the section) matching the REAL outcome: success ONLY when nothing failed, an
// error on a total failure (`0 imported · N failed`), an info note on a mixed batch. A completed-but-failed
// import must never wear a fabricated ✓. Transient upload state → surface-local `useState` (nothing
// cross-tree; no persistence).
//
// The `.zip` subscription itself lives in <BundleWorkloadTracker>, mounted by the section only while
// `state.status === "running"` (the "mounted per active row" shape). This hook owns the state transitions;
// it hands the tracker the three terminal/progress callbacks via `track`.

import { useState } from "react";
import { importBundle, importCharacters, useInvalidation } from "#data";
import { notify } from "#lib";
import type { BundleCounts, ImportSummary } from "../lib/portability-model";
import {
  summarizeBundleCounts,
  summarizeCardImport,
  summaryCaption,
} from "../lib/portability-model";
import type { WorkloadProgressView } from "../lib/workloads-model";

const ZIP_EXTENSION = ".zip";

// The upload lifecycle, inlined into the returned handle so no bare `export type` alias leaves this hook
// file (the feature-type-home plugin rule — interfaces are the sanctioned export shape here).
type LibraryImportState =
  | { readonly status: "idle" }
  | { readonly status: "uploading"; readonly filename: string }
  | {
      readonly status: "running";
      readonly workloadId: string;
      readonly progress: WorkloadProgressView;
    }
  | { readonly status: "done"; readonly summary: ImportSummary }
  | { readonly status: "error"; readonly message: string };

/** The progress + terminal callbacks the section wires into <BundleWorkloadTracker> while running. */
export interface LibraryImportTrack {
  readonly onProgress: (progress: WorkloadProgressView) => void;
  readonly onSucceeded: (counts: BundleCounts) => void;
  readonly onFailed: (message: string) => void;
}

export interface LibraryImport {
  readonly state: LibraryImportState;
  /** Upload a picked batch (a single `.zip` bundle, or one-or-many bare card files). */
  readonly importFiles: (files: readonly File[]) => void;
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

  const finish = (summary: ImportSummary): void => {
    // Imported rows span many owned surfaces (characters/chats/personas/…) — blanket-heal via the central
    // seam (the same gap-heal the user-bus reconnect uses), not per-key inline surgery.
    invalidation.invalidateAllUserRoots();
    setState({ status: "done", summary });
    // The toast VARIANT tracks the real tally, never a blanket success: a run that imported nothing but
    // failed (or a mixed batch) is honestly an error / a caveat, not a green "complete" (matches the
    // section's success-glyph gate). `summaryCaption` shows only the non-zero counts.
    const caption = summaryCaption(summary);
    if (summary.failed === 0) {
      notify.success(`Import complete — ${caption}`);
    } else if (summary.imported === 0) {
      notify.error(`Import failed — ${caption}`);
    } else {
      notify.info(`Imported with issues — ${caption}`);
    }
  };

  const fail = (message: string): void => {
    setState({ status: "error", message });
    notify.error("Import failed. Check the file and try again.");
  };

  const importFiles = (files: readonly File[]): void => {
    const [first] = files;
    if (first === undefined) {
      return;
    }
    setState({ status: "uploading", filename: first.name });
    if (isZip(first)) {
      // A `.zip` is the portability bundle: upload → workload id → the tracker drives the rest.
      importBundle(first)
        .then(({ workloadId }) => {
          setState({ status: "running", workloadId, progress: { pct: null, label: null } });
        })
        .catch((error: unknown) => fail(errorMessage(error)));
      return;
    }
    // Anything else is bare character card(s) through the synchronous card route — summarize from the
    // server's REAL per-file result, so a card the server rejected renders as a failure, not a fake ✓.
    importCharacters(files)
      .then((result) => finish(summarizeCardImport(result)))
      .catch((error: unknown) => fail(errorMessage(error)));
  };

  const track: LibraryImportTrack = {
    onProgress: (progress) => {
      setState((prev) => (prev.status === "running" ? { ...prev, progress } : prev));
    },
    onSucceeded: (counts) => finish(summarizeBundleCounts(counts)),
    onFailed: fail,
  };

  const reset = (): void => setState({ status: "idle" });
  return { state, importFiles, reset, track };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
