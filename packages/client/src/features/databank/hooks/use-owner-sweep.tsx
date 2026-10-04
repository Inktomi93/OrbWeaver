// The owner-wide sweep (`reindex({kind:'owner'})`) behind its confirm: one home for each mode's consequence
// copy and the started toast, shared by the maintenance kebab and the re-extract banner. Both confirms are
// `primary`, never destructive: neither mode deletes anything, the canon is re-derived from bytes we hold.

import type { ReindexMode } from "@orb/contracts/databank";
import { reindexScopeSchema } from "@orb/contracts/databank";
import { useToastManager } from "@orb/ui/toast";
import { useMutationState } from "@tanstack/react-query";
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
    title: "Rebuild all documents?",
    description:
      "Every document you own gets its search index rebuilt. Nothing is deleted. Use this after changing how documents are split or which search model you use. It can take a while on a large bank.",
    confirmLabel: "Rebuild",
    started: "Rebuilding all documents…",
  },
  "re-extract": {
    title: "Re-read all documents?",
    description:
      "Orbweaver reads every file you uploaded again, then rebuilds each document's search index. Nothing is deleted. Use this after an update that improves how files are read. It is slow on a large bank.",
    confirmLabel: "Re-read",
    started: "Re-reading all documents…",
  },
};

// The mutation cache types variables as `unknown`; a single-document reindex is not an owner-wide sweep.
function isOwnerSweep(variables: unknown): boolean {
  return typeof variables === "object" && variables !== null && "scope" in variables && reindexScopeSchema.safeParse(variables.scope).data?.kind === "owner";
}

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

  // Every door holds its own mutation instance, so "a sweep is starting" is read from the shared mutation cache:
  // the kebab and the banner both close while either one's owner-wide request is in flight.
  const ownerSweepsInFlight = useMutationState({
    filters: { mutationKey: trpc.databank.reindex.mutationKey(), status: "pending" },
    select: (mutation) => isOwnerSweep(mutation.state.variables),
  }).filter(Boolean).length;

  return {
    pending: ownerSweepsInFlight > 0,
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
