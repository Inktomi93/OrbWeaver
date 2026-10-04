// The embedder-change confirm. A change that moves the owner to a new embedding generation deletes their index
// at once and rebuilds it, so the pane asks the server what the change would rebuild before writing it, and asks
// the user only when something stored would be rebuilt. Cancel writes nothing.

import { useQueryClient } from "@tanstack/react-query";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import type { ReindexPreview } from "#lib";
import { REINDEX_CONFIRM_COPY, reindexConfirmDescription, reindexNeedsConfirm } from "#lib";
import type { ConfirmDialogProps } from "./confirm-dialog.tsx";
import { ConfirmDialog } from "./confirm-dialog.tsx";

type EmbedSpaceChange = inferInput<Trpc["connection"]["embedSpaceChangePreview"]>["change"];

/** Makes the write. `checksEmbedder`: the server will check the new embedder before the write lands, because the write
 *  moves the index (or the preview could not tell), so the caller can say it is checking. */
type GuardedWrite = (checksEmbedder: boolean) => void;

interface PendingWrite {
  /** `null` when the preview could not be read: the confirm still asks, without counts. */
  readonly preview: ReindexPreview | null;
  readonly write: GuardedWrite;
}

export interface ReindexConfirm {
  /** Write `change` through `write`, after the user confirms when it would rebuild a non-empty index. */
  readonly guard: (change: EmbedSpaceChange, write: GuardedWrite) => void;
  /** The server is still answering what a guarded change would rebuild; the caller says it is checking meanwhile. */
  readonly asking: boolean;
  readonly dialog: ReactElement;
}

/** `finalFocus`: where focus lands when the confirm closes, because the control that opened it may be gone. */
export function useReindexConfirm(trpc: Trpc, finalFocus?: ConfirmDialogProps["finalFocus"]): ReindexConfirm {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingWrite | null>(null);
  const [asking, setAsking] = useState(false);

  const guard = (change: EmbedSpaceChange, write: GuardedWrite): void => {
    setAsking(true);
    // `staleTime: 0`: the answer depends on rows that change between asks, so a cached one could skip the confirm.
    void queryClient
      .fetchQuery({ ...trpc.connection.embedSpaceChangePreview.queryOptions({ change }), staleTime: 0 })
      .then((preview): void => {
        if (reindexNeedsConfirm(preview)) {
          setPending({ preview, write });
        } else {
          write(preview.reindex);
        }
      })
      // An unreadable preview still asks: writing straight through could delete an index the user never weighed.
      .catch((): void => setPending({ preview: null, write }))
      .finally((): void => setAsking(false));
  };

  const dialog = (
    <ConfirmDialog
      title={REINDEX_CONFIRM_COPY.title}
      description={reindexConfirmDescription(pending?.preview ?? null)}
      confirmLabel={REINDEX_CONFIRM_COPY.confirmLabel}
      {...(finalFocus === undefined ? {} : { finalFocus })}
      open={pending !== null}
      onOpenChange={(open): void => {
        if (!open) {
          setPending(null);
        }
      }}
      onConfirm={(): void => {
        pending?.write(pending.preview?.reindex ?? true);
      }}
    />
  );
  return { guard, asking, dialog };
}
