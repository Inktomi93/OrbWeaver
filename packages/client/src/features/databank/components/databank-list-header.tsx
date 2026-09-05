// The Databank LIST chrome-band header (north-star §4 N2, D66 A1/A2) — the content the section definition's
// `listHeader` slot feeds into `.shell-panel-header`: "DATABANK" · the live document count · the pane's ONE
// primary (Add) · a maintenance kebab.
//
// EXACTLY ONE PRIMARY: Add, which opens the three-mode ingest dialog (upload · paste · link).
//
// D-6 — the owner-wide sweeps ride the BAND'S KEBAB, never a primary: `reindex({kind:'owner'})` in both
// modes. `chunk-embed` re-chunks and re-embeds every document the caller owns (what you run after a chunk-
// param or embed-model change); `re-extract` additionally re-runs extraction over every stored CAS blob (an
// extractor-upgrade sweep), so it is the expensive arm and it rewrites every document's canon. Both are
// maintenance over the WHOLE bank, i.e. exactly the class of verb A2 keeps out of the band's primary slot —
// and both confirm (2026-08-19): the scope is what earns the dialog, not the runtime.
//
// The confirm is a `primary` ConfirmDialog, NOT the kebab's `destructive` arm: re-extract deletes nothing
// (every document, junction and chunk survives — the canon is re-derived from bytes we still hold), and a
// red confirm on a maintenance sweep teaches the wrong thing about the one control here that IS destructive.
//
// ONE VISIBLE CENSUS *PER REGIME* (#1676, the #1670 class). On a phone the ONE-NAME rule (shell.css) sheds
// this band's title and the census travels INSIDE it (`list-pane-header.tsx`: "THE COUNT TRAVELS WITH THE
// TITLE"), so the bank's size was printed NOWHERE there. It now also rides the topbar's screen title
// (`lib/databank-selection-title.ts`), the noun that survives — and the read below moved to
// `hooks/use-databank-census.ts` so both readers share one query and one spelling of the number.
//
// THE COUNT IS THE SERVER'S CENSUS (`databank.bankHealth.total`, 2026-08-14) — a non-suspending `useQuery`,
// so the title + actions render immediately and stay put while it settles. A COUNT read for a count: it
// fetches no rows at all, where the band used to ask for a hundred documents to measure the length of the
// list. It is deliberately not the pane's own read — the pane's rows live in an infinite query keyed per page
// size, and a band count that grew as you scrolled would report how far you have got, not how big your bank is.
//
// It used to print `cappedCount(page.items.length, DATABANK_LIST_DEFAULT_LIMIT)` — "100+" — because a full
// first page was the only number the client had, and reporting a page as a census was the lie that reading
// made visible (side-eye 2026-08-08 P2-d).

import { Button } from "@orb/ui/button";
import { Icon, Plus, RefreshCw } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { MenuGroup, MenuGroupLabel, MenuItem } from "@orb/ui/menu";
import { useToastManager } from "@orb/ui/toast";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, ListPaneHeader, RowActionsMenu } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { openModal } from "#state";
import { useDatabankBankHealth, useDatabankCensus } from "../hooks/use-databank-census.ts";
import { useReindexDocuments } from "../hooks/use-databank-mutations.ts";
import { DATABANK_SECTION_LABEL } from "../lib/databank-section-label.ts";

export function DatabankListHeader(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const toast = useToastManager();
  const health = useDatabankBankHealth();
  // ONE spelling of the number, shared with the phone topbar's screen title (#1676) — see the hook.
  const census = useDatabankCensus();
  const reindex = useReindexDocuments({ trpc, invalidation });
  const [reExtractOpen, setReExtractOpen] = useState(false);
  const [reindexOpen, setReindexOpen] = useState(false);
  // NEITHER SWEEP IS OFFERED OVER AN EMPTY BANK (side-eye 2026-08-19 P3). Both items were enabled at zero
  // documents — a control whose whole job is "re-run this over everything you have" is a lie when you have
  // nothing, and firing it costs a round trip to be told so. The census the band already prints IS the
  // predicate, so this needs no second read. The sweeps stay closed until the count is KNOWN, which is the
  // safe direction (a disabled control that enables is a beat late; an enabled one that fires into an
  // unknown bank is the defect). N-6: and the closed door SAYS SO — see the group labels below, which is
  // where the reason has to live because a disabled item cannot be hovered.
  //
  // THAT RULING SURVIVES; ITS INPUT CHANGED (#1500). `(census?.total ?? 0) === 0` folded three states into
  // one — settling, empty, and FAILED — so a bank-health failure told a reader with two hundred documents to
  // "add a document first", on the one control whose predicate is how many they have. The closed door is
  // unchanged in all three; what the door SAYS is now derived from which of them it is, and the failed arm
  // carries the re-read rather than a reload.
  const bankIsEmpty = census === 0;
  const countUnknown = census === undefined;
  // The band prints NO number when the count is unknown — same rendered result the old `?? 0` produced (the
  // header renders nothing at 0), but stated as the absence it is. A SPREAD rather than `count={…?.total}`:
  // under `exactOptionalPropertyTypes`, "absent" and "present and undefined" are different types, and absent
  // is what an unread census is.
  const countProp = census === undefined ? {} : { count: census };

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
              {/* A DISABLED CONTROL OWES ITS REASON (side-eye 2026-08-19 N-6). Both items grey out over an
                  empty bank and said nothing about why, which reads as a broken menu rather than a closed
                  door. The reason rides a GROUP LABEL, not a `title=` on the items: a disabled MenuItem
                  takes no pointer events and no focus, so a tooltip on it is a sentence the one reader who
                  needs it can never reach. The group's label is announced with the items it labels. */}
              <MenuGroup>
                {bankIsEmpty ? <MenuGroupLabel>Add a document first — these sweeps run over your whole bank.</MenuGroupLabel> : null}
                {health.isError ? <MenuGroupLabel>Couldn't check your bank, so these sweeps stay closed.</MenuGroupLabel> : null}
                {/* The failed arm's way out. A group label cannot be actioned and a disabled item cannot be
                    hovered, so the re-read is its own item — the same "a read failure is never a dead end"
                    rule `QueryErrorState` carries, spelled in the one grammar a menu has. */}
                {health.isError ? (
                  <MenuItem onClick={(): void => void health.refetch()}>
                    <Icon icon={RefreshCw} size="sm" />
                    Check the bank again
                  </MenuItem>
                ) : null}
                <MenuItem disabled={reindex.isPending || bankIsEmpty || countUnknown} onClick={(): void => setReindexOpen(true)}>
                  <Icon icon={RefreshCw} size="sm" />
                  Reindex everything
                </MenuItem>
                <MenuItem disabled={reindex.isPending || bankIsEmpty || countUnknown} onClick={(): void => setReExtractOpen(true)}>
                  <Icon icon={RefreshCw} size="sm" />
                  Re-extract everything
                </MenuItem>
              </MenuGroup>
            </RowActionsMenu>
            <Button intent="primary" onClick={(): void => openModal("addDocument")} size="sm">
              <Icon icon={Plus} size="sm" />
              Add
            </Button>
          </Row>
        }
        {...countProp}
        title={DATABANK_SECTION_LABEL}
      />
      {/* REINDEX CONFIRMS TOO (side-eye 2026-08-19 P3). It used to fire BARE from the menu while its
          slower sibling sat behind a dialog — so the one owner-wide sweep a mis-aimed click could start was
          the one with no way back, and the pair taught that a confirm means "slow" rather than "this is
          everything you own". Both arms now name their consequence first; `primary`, not destructive, for
          the reason the re-extract confirm records — nothing is deleted. */}
      <ConfirmDialog
        confirmIntent="primary"
        confirmLabel="Reindex"
        description="Every document you own is re-chunked and re-embedded. Nothing is deleted — this is the sweep you run after a chunking or embedding-model change, and it can take a while on a large bank."
        onConfirm={(): void => sweep("chunk-embed")}
        onOpenChange={setReindexOpen}
        open={reindexOpen}
        title="Reindex every document?"
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
