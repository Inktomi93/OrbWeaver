// The chat-LIST chrome-band header (north-star §4 N2, D66 A1/A2) — the content the `.shell-panel-header`
// band wraps for the LIST panel: the "CHATS" micro-caps section title + a live count on the left, and the
// panel's ONE primary action (New) on the right. Flows into the band through the section definition's
// `useListHeader` data slot (`chats-section.tsx`), the same definition-owned seam the topbar `header` rides — the
// domain-agnostic shell never names a feature.
//
// The band CLUSTER is the shared `ListPaneHeader` composite (§11.2) — this file owns only what New does. The
// count is a non-suspending `useQuery` (`hooks/use-chat-census.ts`): the title + New render immediately and
// stay put while the count settles, instead of the whole band suspending. New opens the `newChat` modal —
// the same handler the surface's empty-state News use.
//
// THE COUNT IS THE SERVER'S CENSUS, not a row tally (2026-08-09) — and it MOVED OUT of this file (#1676).
// `listChats` is keyset-paged, so `items.length` would be "loaded so far"; the census read that fixes that,
// with the #490 lens rules it grew, is now `useChatCensus`, because the phone topbar reads it too.
//
// ONE VISIBLE CENSUS *PER REGIME* (#1676, the #1670 class). On a phone the ONE-NAME rule (shell.css) sheds
// this band's title and the census travels INSIDE it (`list-pane-header.tsx`: "THE COUNT TRAVELS WITH THE
// TITLE"), so the roster's size was printed NOWHERE there. It now rides the topbar's screen title
// (`lib/chats-selection-title.ts`), the noun that survives — still exactly one visible census, in both
// regimes, and both readers call the one hook so the lens rules are not re-derived.
//
// NEW STAYS HERE *AND* IN THE PANE'S EMPTY STATE (#1361 item 2, owner-ruled 2026-09-05) — the ONE ruled
// exception to "never two doors at once". This one is the band's chrome affordance and its kicker supplies
// the noun ("New", the #864 band idiom); the other is the only thing on an otherwise empty pane. The full
// ruling, and the receipt for why NEITHER enforcement half of the `duplicate-action-door` family can carry
// an allowance row for it, is stated once at `surfaces/chat-list-surface.tsx`'s header. Recorded at BOTH
// doors so neither reads as the odd one out.
//
// Import sits beside New as a GHOST icon — the ratified band anatomy (the presets band's landed precedent):
// a secondary entry into the same "get a chat" job, and the ONE home for transcript // The hook supplies view data; the shell owns the band renderer. Actions and overlays retain their existing behavior.

import { Button } from "@orb/ui/button";
import { Icon, Plus, Upload } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { useState } from "react";
import type { ListPaneHeaderView } from "#lib";
import { openNewChatPicker } from "#state";
import { ChatImportDialog } from "../components/chat-import-dialog.tsx";
import { useChatCensus } from "../hooks/use-chat-census.ts";
import { CHATS_SECTION_LABEL } from "../lib/chats-section-label.ts";

const IMPORT_CHAT_LABEL = "Import a chat transcript";

export function useChatListHeader(): ListPaneHeaderView {
  const count = useChatCensus();
  const [importOpen, setImportOpen] = useState(false);

  return {
    action: (
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
    ),
    count: count ?? 0,
    title: CHATS_SECTION_LABEL,
    overlay: (
      <>
        <ChatImportDialog onOpenChange={setImportOpen} open={importOpen} />
      </>
    ),
  };
}
