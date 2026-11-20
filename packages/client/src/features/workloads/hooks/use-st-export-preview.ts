// The SillyTavern export's preflight: open reads the dry run, the download fetches the zip the preview described, and
// closing drops a read still in flight.

import type { StExportReport } from "@orb/contracts/import";
import { stProfileExportPath } from "@orb/contracts/import";
import { useEffect, useRef, useState } from "react";
import { fetchStExportPreview, isHttpFailure } from "#data";
import { downloadUrl } from "#lib";

export type StExportPreviewState =
  | { readonly status: "off" }
  | { readonly status: "reading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly report: StExportReport };

export interface StExportPreview {
  readonly state: StExportPreviewState;
  readonly open: () => void;
  readonly close: () => void;
  readonly download: () => void;
}

export function useStExportPreview(): StExportPreview {
  const [state, setState] = useState<StExportPreviewState>({ status: "off" });
  const reading = useRef<AbortController | null>(null);
  useEffect(
    () => (): void => {
      reading.current?.abort();
    },
    [],
  );

  const close = (): void => {
    reading.current?.abort();
    reading.current = null;
    setState({ status: "off" });
  };

  const open = (): void => {
    reading.current?.abort();
    const controller = new AbortController();
    reading.current = controller;
    setState({ status: "reading" });
    fetchStExportPreview(controller.signal)
      .then(
        (report) => {
          if (!controller.signal.aborted) {
            setState({ status: "ready", report });
          }
        },
        (error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          if (!isHttpFailure(error)) {
            throw error;
          }
          setState({ status: "failed" });
        },
      )
      .catch(globalThis.reportError);
  };

  const download = (): void => {
    downloadUrl(stProfileExportPath(false));
    close();
  };

  return { state, open, close, download };
}
