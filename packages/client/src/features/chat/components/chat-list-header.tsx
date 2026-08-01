// The chat-LIST chrome-band header (north-star §4 N2, D66 A1/A2) — the content the `.shell-panel-header`
// band wraps for the LIST panel: the "CHATS" micro-caps section title + a live count on the left, and the
// panel's ONE primary action (New) on the right. Flows into the band through the section definition's
// `listHeader` slot (`chats-section.tsx`), the same definition-owned seam the topbar `header` rides — the
// domain-agnostic shell never names a feature.
//
// The band CLUSTER is the shared `ListPaneHeader` composite (§11.2) — this file owns only the chat DATA
// (the count read + what New does). The count is a non-suspending `useQuery` (shares the `listChats` cache
// with the list surface below, so no extra fetch): the title + New render immediately and stay put while the
// count settles, instead of the whole band suspending. New opens the `newChat` modal — the same handler the
// surface's empty-state News use.

import { Button } from "@orb/ui/button";
import { Icon, Plus } from "@orb/ui/icons";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ListPaneHeader } from "#components";
import { useTRPC } from "#data";
import { openModal } from "#state";

export function ChatListHeader(): ReactElement {
  const trpc = useTRPC();
  const { data: chats } = useQuery(trpc.chat.listChats.queryOptions({}));

  return (
    <ListPaneHeader
      action={
        <Button intent="primary" onClick={(): void => openModal("newChat")} size="sm">
          <Icon icon={Plus} size="sm" />
          New
        </Button>
      }
      count={chats?.length ?? 0}
      title="Chats"
    />
  );
}
