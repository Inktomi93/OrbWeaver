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
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ListPaneHeader } from "#components";
import { useTRPC } from "#data";
import { useDebouncedValue } from "#lib";
import { openNewChatPicker, useChatListCharacterFilter, useChatListMonth, useChatListSearch } from "#state";
import { CHAT_LIST_SEARCH_DEBOUNCE_MS, monthExclusiveUpperBound } from "../lib/chat-list-scope.ts";
import { ChatImportDialog } from "./chat-import-dialog.tsx";

/** The band wants the CENSUS, not the rows — the smallest page the server will serve still carries it. */
const COUNT_ONLY_PAGE = 1;
const IMPORT_CHAT_LABEL = "Import a chat transcript";

/**
 * THE COUNT NOW ANSWERS THE LIST IN FRONT OF THE READER (#490).
 *
 * It was the library census and nothing else, so it printed `896` unchanged while the pane below showed
 * twelve `Mira` rows — and printed `896` over a "No matches" empty state. A number that ignores the three
 * filters sitting directly beneath it is not a fact about anything visible.
 *
 * The band cannot see the pane's props (it feeds a DIFFERENT shell slot; §11.2), which is exactly why all
 * three narrowing axes live in `chat-list-filter-store` — the store minted for this class of cross-region
 * read. When nothing is narrowed this is byte-identical to before: ONE `{limit:1}` census, printed bare.
 * When something is, a second `{limit:1}` census over the SAME scope the pane queries answers "how many of
 * them", and the band prints `N of TOTAL`. `ListPaneHeader.count` already takes a string for precisely this
 * ("the caller decided the cap, this band just prints what it is handed"), so no shared primitive moves.
 *
 * The search is DAMPED with the pane's own `CHAT_LIST_SEARCH_DEBOUNCE_MS` — one constant, applied by each
 * consumer — so the number and the rows settle on the same keystroke instead of a quarter-second apart.
 */
function useChatCensus(): number | string | undefined {
  const trpc = useTRPC();
  const characterFilter = useChatListCharacterFilter();
  const rawSearch = useChatListSearch();
  const month = useChatListMonth();
  const search = useDebouncedValue(rawSearch.trim(), CHAT_LIST_SEARCH_DEBOUNCE_MS);
  const beforeRecencyAt = monthExclusiveUpperBound(month);
  const narrowed = characterFilter !== null || search !== "" || beforeRecencyAt !== null;

  const { data: all } = useQuery(trpc.chat.listChats.queryOptions({ limit: COUNT_ONLY_PAGE }));
  const { data: scoped } = useQuery({
    ...trpc.chat.listChats.queryOptions({
      limit: COUNT_ONLY_PAGE,
      ...(characterFilter === null ? {} : { characterId: characterFilter.id }),
      ...(search === "" ? {} : { search }),
      ...(beforeRecencyAt === null ? {} : { beforeRecencyAt }),
    }),
    // An unnarrowed pane asks nothing extra: the scoped query IS the unscoped one, already in cache above.
    enabled: narrowed,
  });

  const total = all?.totalCount;
  if (!narrowed || total === undefined) {
    return total;
  }
  // Still settling: keep printing the honest library total rather than flashing a wrong narrowed number.
  return scoped === undefined ? total : `${scoped.totalCount} of ${total}`;
}

export function ChatListHeader(): ReactElement {
  const count = useChatCensus();
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <ListPaneHeader
        action={
          // ONE flex child, so the band's space-between keeps the cluster hard against the trailing edge.
          <Row align="center" gap="field">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button aria-label={IMPORT_CHAT_LABEL} intent="ghost" onClick={(): void => setImportOpen(true)} size="icon-sm">
                    <Icon icon={Upload} size="sm" />
                  </Button>
                }
              />
              <TooltipPopup side="bottom">{IMPORT_CHAT_LABEL}</TooltipPopup>
            </Tooltip>
            <Button intent="primary" onClick={(): void => openNewChatPicker()} size="sm">
              <Icon icon={Plus} size="sm" />
              New
            </Button>
          </Row>
        }
        count={count ?? 0}
        title="Chats"
      />
      <ChatImportDialog onOpenChange={setImportOpen} open={importOpen} />
    </>
  );
}
