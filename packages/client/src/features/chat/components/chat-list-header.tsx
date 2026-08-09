// The chat-LIST chrome-band header (north-star §4 N2, D66 A1/A2) — the content the `.shell-panel-header`
// band wraps for the LIST panel: the "CHATS" micro-caps section title + a live count on the left, and the
// panel's ONE primary action (New) on the right. Flows into the band through the section definition's
// `listHeader` slot (`chats-section.tsx`), the same definition-owned seam the topbar `header` rides — the
// domain-agnostic shell never names a feature.
//
// The band CLUSTER is the shared `ListPaneHeader` composite (§11.2) — this file owns only the chat DATA
// (the count read + what New does). The count is a non-suspending `useQuery`: the title + New render
// immediately and stay put while the count settles, instead of the whole band suspending. New opens the
// `newChat` modal — the same handler the surface's empty-state News use.
//
// THE COUNT IS THE SERVER'S CENSUS, not a row tally (2026-08-09). `listChats` is keyset-paged now, so
// `items.length` would be "loaded so far" — the number the characters band had to DELETE rather than print
// when its own list went paged ("a census that silently means something else is worse than none",
// `characters-list-header.tsx`). The page carries a real `COUNT` over the same scope, so this asks for the
// cheapest possible page (`limit: 1`) and reads `totalCount` off it: one honest number, one tiny read.
//
// Import sits beside New as a GHOST icon — the ratified band anatomy (the presets band's landed precedent):
// a secondary entry into the same "get a chat" job, and the ONE home for transcript import (the room's ⋯
// menu carries no lifecycle chrome). Export is its opposite number on the row kebab.

import { Button } from "@orb/ui/button";
import { Icon, Plus, Upload } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ListPaneHeader } from "#components";
import { useTRPC } from "#data";
import { openModal } from "#state";
import { ChatImportDialog } from "./chat-import-dialog.tsx";

/** The band wants the CENSUS, not the rows — the smallest page the server will serve still carries it. */
const COUNT_ONLY_PAGE = 1;

export function ChatListHeader(): ReactElement {
  const trpc = useTRPC();
  const { data: page } = useQuery(trpc.chat.listChats.queryOptions({ limit: COUNT_ONLY_PAGE }));
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <ListPaneHeader
        action={
          // ONE flex child, so the band's space-between keeps the cluster hard against the trailing edge.
          <Row align="center" gap="field">
            <Button aria-label="Import a chat transcript" intent="ghost" onClick={(): void => setImportOpen(true)} size="sm">
              <Icon icon={Upload} size="sm" />
            </Button>
            <Button intent="primary" onClick={(): void => openModal("newChat")} size="sm">
              <Icon icon={Plus} size="sm" />
              New
            </Button>
          </Row>
        }
        count={page?.totalCount ?? 0}
        title="Chats"
      />
      <ChatImportDialog onOpenChange={setImportOpen} open={importOpen} />
    </>
  );
}
