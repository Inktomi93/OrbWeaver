// The "Add from your bank" PICKER (host only) — the caller's own documents, minus everything already
// feeding this room, each one a one-shot `attachToChat`.
//
// IT IS A PICKER, NOT A SECOND LIST (databank-surface-spec §2.2). Legacy mounted the whole bank
// permanently UNDER the active list, so a globally-attached document rendered twice in one tab — once as an
// active row, once as a read-only ON switch — and the second list grew with the bank while the first grew
// with the room. One truth, one list; the bank appears only when you ask to add from it.
//
// AND IT COSTS NO EXTRA READ PER ROW. Legacy issued a `listAttachments` round-trip PER OWNED DOCUMENT to
// decide each row's state (40 documents = 40 fetches to paint one rack). The offer set here is derived
// client-side from the reads the rack already made (`attachableDocuments`), so the picker adds exactly ONE
// read: the bank itself.
//
// The dialog closes on the first pick rather than staying open for a multi-select: attach is idempotent and
// instant, the rack behind it repaints, and a stay-open picker would have to re-derive its own offer set
// mid-flight to avoid offering back the document it just attached.

import type { ChatId, DocumentId } from "@orb/kit/ids";
import { formatBytes } from "@orb/kit/strings";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { EmptyState } from "@orb/ui/empty-state";
import { FileText, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { FormDialog } from "#components";
import { SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useAttachDocumentToChat } from "../hooks/use-chat-document-mutations";
import { attachableDocuments } from "../lib/chat-documents-model";

/** The candidate list's shape-matched loading skeleton (house loading law — never a spinner/text void). */
const PICKER_SKELETON_ROWS = 3;

export interface AddChatDocumentDialogProps {
  readonly chatId: ChatId;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The ids already feeding this room — the subtraction operand. Passed IN rather than re-read so the
   *  offer set and the rack behind it are computed from ONE snapshot of the room. */
  readonly activeIds: readonly DocumentId[];
}

export function AddChatDocumentDialog({ chatId, open, onOpenChange, activeIds }: AddChatDocumentDialogProps): ReactElement {
  return (
    <FormDialog
      description="Its indexed passages join what this chat can pull from — for everyone in the room. You can take it back out here at any time."
      onOpenChange={onOpenChange}
      open={open}
      title="Add a document to this chat"
    >
      {/* Non-suspending: the dialog frame paints at once and the candidate list fills in, so opening the
          picker never blanks the panel behind it through a shared suspense boundary. */}
      <PickerBody activeIds={activeIds} chatId={chatId} onAttached={(): void => onOpenChange(false)} />
    </FormDialog>
  );
}

function PickerBody({
  chatId,
  activeIds,
  onAttached,
}: {
  readonly chatId: ChatId;
  readonly activeIds: readonly DocumentId[];
  readonly onAttached: () => void;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attach = useAttachDocumentToChat({ trpc, invalidation });
  const bank = useQuery(trpc.databank.list.queryOptions({}));

  if (bank.isPending) {
    return <SkeletonRows count={PICKER_SKELETON_ROWS} shape="line" />;
  }
  const documents = bank.data ?? [];
  const candidates = attachableDocuments(documents, activeIds);

  // TWO different nothings, said differently (empty states are load-bearing): an empty BANK is "go make
  // one", while a bank whose every document already reaches this room is a success state, not a gap.
  if (candidates.length === 0) {
    const bankIsEmpty = documents.length === 0;
    return (
      <EmptyState
        // The only next action REACHABLE from inside a modal is leaving it — the library lives behind the
        // rail, which this dialog is covering. Naming that honestly beats a CTA that cannot fire.
        action={<DialogClose render={<Button intent="secondary">Close</Button>} />}
        description={
          bankIsEmpty
            ? "Add one in Databank — upload a file, paste text, or pull in a page — and it can feed this chat."
            : "Every document you own already reaches this chat: through this room, a character in it, or your Everywhere switch."
        }
        icon={<Icon icon={FileText} size="lg" />}
        title={bankIsEmpty ? "Your bank is empty" : "Nothing left to add"}
      />
    );
  }

  return (
    <Stack gap="tight">
      {candidates.map((document) => (
        <ListRow
          actions={
            <Button
              aria-label={`Add ${document.name} to this chat`}
              intent="secondary"
              onClick={(): void => {
                attach.mutate({ chatId, documentId: document.id });
                onAttached();
              }}
              size="sm"
              type="button"
            >
              Add
            </Button>
          }
          key={document.id}
          subtitle={formatBytes(document.byteSize)}
          title={document.name}
        />
      ))}
    </Stack>
  );
}
