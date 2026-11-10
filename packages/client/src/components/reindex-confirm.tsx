// The embedder-change confirm. A change that moves the owner to a new embedding generation deletes their index
// at once and rebuilds it, so the pane asks the server what the change would rebuild before writing it, and asks
// the user only when something stored would be rebuilt. Cancel writes nothing.

import type { EmbedSpaceChangePreview, EmbedTargetRefusal } from "@orb/contracts/inference";
import { Text } from "@orb/ui/text";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import type { Trpc } from "#data";
import { useTRPCClient } from "#data";
import { embedRefusalText, REINDEX_CONFIRM_COPY, reindexConfirmDescription, reindexNeedsConfirm } from "#lib";
import type { ConfirmDialogProps } from "./confirm-dialog.tsx";
import { ConfirmDialog } from "./confirm-dialog.tsx";

type EmbedSpaceChange = inferInput<Trpc["connection"]["embedSpaceChangePreview"]>["change"];

/** Makes the write. `checksEmbedder`: the server will check the new embedder before the write lands, because the write
 *  moves the index (or the preview could not tell), so the caller can say it is checking. */
type GuardedWrite = (checksEmbedder: boolean) => void;

interface PendingWrite {
  /** `null` when the preview could not be read: the confirm still asks, without counts. */
  readonly preview: EmbedSpaceChangePreview | null;
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
export function useReindexConfirm(finalFocus?: ConfirmDialogProps["finalFocus"]): ReindexConfirm {
  const client = useTRPCClient();
  const latest = useRef(0);
  const [refusal, setRefusal] = useState<EmbedTargetRefusal | null>(null);
  const [pending, setPending] = useState<PendingWrite | null>(null);
  const [asking, setAsking] = useState(false);
  useEffect(
    () => (): void => {
      latest.current += 1;
    },
    [],
  );

  const guard = (change: EmbedSpaceChange, write: GuardedWrite): void => {
    const request = ++latest.current;
    setPending(null);
    setRefusal(null);
    setAsking(true);
    void client.connection.embedSpaceChangePreview
      .mutate({ change })
      .then((preview): void => {
        if (request !== latest.current) {
          return;
        }
        if (preview.refusal !== null) {
          setRefusal(preview.refusal);
        } else if (reindexNeedsConfirm(preview)) {
          setPending({ preview, write });
        } else {
          write(preview.reindex);
        }
      })
      // An unreadable preview cannot establish that writing is safe; retain the unknown-cost confirmation.
      .catch((): void => {
        if (request === latest.current) {
          setPending({ preview: null, write });
        }
      })
      .finally((): void => {
        if (request === latest.current) {
          setAsking(false);
        }
      });
  };

  const dialog =
    refusal !== null ? (
      <Text role="alert" tone="destructive" voice="gloss">
        {embedRefusalText(refusal)}
      </Text>
    ) : (
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
