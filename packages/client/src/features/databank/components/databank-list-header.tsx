// The Databank LIST chrome-band header (north-star §4 N2, D66 A1/A2) — the content the section definition's
// `listHeader` slot feeds into `.shell-panel-header`: "DATABANK" · the live document count · the pane's ONE
// primary (Add) · a maintenance kebab.
//
// EXACTLY ONE PRIMARY (A2): Add, which opens the three-mode ingest dialog (upload · paste · link).
//
// D-6 — the owner-wide sweeps ride the BAND'S KEBAB, never a primary: `reindex({kind:'owner'})` in both
// modes. `chunk-embed` re-chunks and re-embeds every document the caller owns (what you run after a chunk-
// param or embed-model change); `re-extract` additionally re-runs extraction over every stored CAS blob (an
// extractor-upgrade sweep), which is why it sits behind a confirm — it is the expensive arm and it rewrites
// every document's canon. Both are maintenance over the WHOLE bank, i.e. exactly the class of verb A2 keeps
// out of the band's primary slot.
//
// The confirm is a `primary` ConfirmDialog, NOT the kebab's `destructive` arm: re-extract deletes nothing
// (every document, junction and chunk survives — the canon is re-derived from bytes we still hold), and a
// red confirm on a maintenance sweep teaches the wrong thing about the one control here that IS destructive.
//
// The count is a non-suspending `useQuery` sharing the `databank.list` cache with the suspending list below,
// so it costs no extra fetch: the title + actions render immediately and stay put while the count settles.

import { Button } from "@orb/ui/button";
import { Icon, Plus, RefreshCw } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { useToastManager } from "@orb/ui/toast";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, ListPaneHeader, RowActionsMenu } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { openModal } from "#state";
import { useReindexDocuments } from "../hooks/use-databank-mutations.ts";

export function DatabankListHeader(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const toast = useToastManager();
  const { data: documents } = useQuery(trpc.databank.list.queryOptions({}));
  const reindex = useReindexDocuments({ trpc, invalidation });
  const [reExtractOpen, setReExtractOpen] = useState(false);

  const sweep = (mode: "chunk-embed" | "re-extract"): void => {
    reindex.mutate(
      { scope: { kind: "owner" }, mode },
      {
        onSuccess: (): void => {
          toast.add({ title: mode === "re-extract" ? "Re-extracting every document…" : "Reindexing every document…" });
        },
      },
    );
  };

  return (
    <>
      <ListPaneHeader
        action={
          // ONE flex child, so the band's space-between keeps the cluster hard against the trailing edge.
          <Row align="center" gap="field">
            <RowActionsMenu label="Databank maintenance">
              <MenuItem disabled={reindex.isPending} onClick={(): void => sweep("chunk-embed")}>
                <Icon icon={RefreshCw} size="sm" />
                Reindex everything
              </MenuItem>
              <MenuItem disabled={reindex.isPending} onClick={(): void => setReExtractOpen(true)}>
                <Icon icon={RefreshCw} size="sm" />
                Re-extract everything
              </MenuItem>
            </RowActionsMenu>
            <Button intent="primary" onClick={(): void => openModal("addDocument")} size="sm">
              <Icon icon={Plus} size="sm" />
              Add
            </Button>
          </Row>
        }
        count={documents?.length ?? 0}
        title="Databank"
      />
      <ConfirmDialog
        confirmIntent="primary"
        confirmLabel="Re-extract"
        description="Extraction runs again over every source file you uploaded, then everything is re-chunked and re-embedded. Nothing is deleted — this is the slow sweep you run after an extractor upgrade."
        onConfirm={(): void => sweep("re-extract")}
        onOpenChange={setReExtractOpen}
        open={reExtractOpen}
        title="Re-extract every document?"
      />
    </>
  );
}
