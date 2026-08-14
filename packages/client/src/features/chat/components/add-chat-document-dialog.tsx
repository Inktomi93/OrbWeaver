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
//
// IT SEARCHES THE WHOLE BANK, ON THE SERVER (2026-08-14, the owner's paged-list-lens ruling applied to a
// picker — the character `new-chat-picker` took the same treatment the same night). The read is ONE page of
// `databank.list`, so a bank past that page could offer a document the picker had no way to reach: with no
// search box the only recourse was scrolling a list that ended at the page. The box hands the term to the
// verb, so the candidate the host is looking for arrives on the first page of the SEARCHED read however deep
// it sits. The active-set subtraction stays client-side — it is a set operation over ids the rack already
// holds, not a lens over rows nobody fetched.

import type { ChatId, DocumentId } from "@orb/kit/ids";
import { formatBytes } from "@orb/kit/strings";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { EmptyState } from "@orb/ui/empty-state";
import { FileText, Icon, Search } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog } from "#components";
import { SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useDebouncedValue } from "#lib";
import { useAttachDocumentToChat } from "../hooks/use-chat-document-mutations.ts";
import { attachableDocuments } from "../lib/chat-documents-model.ts";

/** The candidate list's shape-matched loading skeleton (house loading law — never a spinner/text void). */
const PICKER_SKELETON_ROWS = 3;

/** Keystroke→request damper — the library pane's value, so a picker and the pane behave alike. */
const SEARCH_DEBOUNCE_MS = 250;

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
  const [query, setQuery] = useState("");
  const needle = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const bank = useQuery(trpc.databank.list.queryOptions(needle === "" ? {} : { search: needle }));
  const documents = bank.data?.items ?? [];
  const candidates = attachableDocuments(documents, activeIds);

  return (
    <Stack gap="row">
      {/* The box stays mounted through every body state — including "No matches", whose only way out is to
          edit or clear the term that produced it. */}
      <Input aria-label="Search your documents" onValueChange={setQuery} placeholder="Search your documents" value={query} />
      <PickerCandidates
        candidates={candidates}
        chatId={chatId}
        isPending={bank.isPending}
        needle={needle}
        onAttached={onAttached}
        onClearSearch={(): void => setQuery("")}
        bankIsEmpty={documents.length === 0}
      />
    </Stack>
  );
}

function PickerCandidates({
  candidates,
  chatId,
  isPending,
  needle,
  onAttached,
  onClearSearch,
  bankIsEmpty,
}: {
  readonly candidates: readonly { readonly id: DocumentId; readonly name: string; readonly byteSize: number }[];
  readonly chatId: ChatId;
  readonly isPending: boolean;
  readonly needle: string;
  readonly onAttached: () => void;
  readonly onClearSearch: () => void;
  readonly bankIsEmpty: boolean;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attach = useAttachDocumentToChat({ trpc, invalidation });

  if (isPending) {
    return <SkeletonRows count={PICKER_SKELETON_ROWS} shape="line" />;
  }

  // THREE different nothings, said differently (empty states are load-bearing): a search that matched
  // nothing is about the TERM (and the server searched the whole bank, so the sentence is honest), an empty
  // BANK is "go make one", and a bank whose every document already reaches this room is a success state.
  if (candidates.length === 0) {
    if (needle !== "") {
      return (
        <EmptyState
          action={
            <Button intent="secondary" onClick={onClearSearch} size="sm">
              Clear search
            </Button>
          }
          description={`No document you can add matches "${needle}".`}
          icon={<Icon icon={Search} size="lg" />}
          title="No matches"
        />
      );
    }
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
