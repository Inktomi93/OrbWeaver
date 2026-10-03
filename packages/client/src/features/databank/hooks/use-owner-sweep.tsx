// The owner-wide sweep (`reindex({kind:'owner'})`) behind its confirm: one home for each mode's consequence
// copy and the started toast, shared by the maintenance kebab and the re-extract banner. Both confirms are
// `primary`, never destructive: neither mode deletes anything, the canon is re-derived from bytes we hold.

import type { ReindexMode } from "@orb/contracts/databank";
import { useToastManager } from "@orb/ui/toast";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useReindexDocuments } from "./use-databank-mutations.ts";

interface SweepCopy {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly started: string;
}

const SWEEP_COPY: Record<ReindexMode, SweepCopy> = {
  "chunk-embed": {
    title: "Reindex every document?",
    description:
      "Every document you own is re-chunked and re-embedded. Nothing is deleted — this is the sweep you run after a chunking or embedding-model change, and it can take a while on a large bank.",
    confirmLabel: "Reindex",
    started: "Reindexing every document…",
  },
  "re-extract": {
    title: "Re-extract every document?",
    description:
      "Extraction runs again over every source file you uploaded, then everything is re-chunked and re-embedded. Nothing is deleted — this is the slow sweep you run after an extractor upgrade.",
    confirmLabel: "Re-extract",
    started: "Re-extracting every document…",
  },
};

export interface OwnerSweep {
  /** A sweep request is in flight; the doors that start one stay closed meanwhile. */
  readonly pending: boolean;
  /** Open the confirm for `mode`. Nothing is sent until the confirm is accepted. */
  readonly ask: (mode: ReindexMode) => void;
  /** The one confirm dialog, rendered once by the caller beside its doors (a menu item cannot host it). */
  readonly confirm: ReactElement;
}

export function useOwnerSweep(): OwnerSweep {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const toast = useToastManager();
  const reindex = useReindexDocuments({ trpc, invalidation });
  const [open, setOpen] = useState(false);
  // Held apart from `open` so the dialog keeps its words through the close animation.
  const [mode, setMode] = useState<ReindexMode>("chunk-embed");
  const copy = SWEEP_COPY[mode];

  const run = (): void => {
    reindex.mutate({ scope: { kind: "owner" }, mode }, { onSuccess: (): void => void toast.add({ title: copy.started }) });
  };

  return {
    pending: reindex.isPending,
    ask: (next: ReindexMode): void => {
      setMode(next);
      setOpen(true);
    },
    confirm: (
      <ConfirmDialog
        confirmIntent="primary"
        confirmLabel={copy.confirmLabel}
        description={copy.description}
        onConfirm={run}
        onOpenChange={setOpen}
        open={open}
        title={copy.title}
      />
    ),
  };
}
