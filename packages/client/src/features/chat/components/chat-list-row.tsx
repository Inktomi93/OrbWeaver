// One row of a chats LIST PANE — the `ChatSummaryRow` composite wired to the row-action grammar (§12): the
// star STATE TOGGLE over the shared `useStarChat` mutation, plus the kebab that keeps every action (mirror
// parity). Extracted from `chat-list-surface.tsx` when the character screen's projection pane became its
// second consumer: the two panes are the SAME list of the SAME chats, so a forked row would be two truths.

import type { ChatId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { PointerEvent, ReactElement } from "react";
import { useEffect, useRef } from "react";
import type { Trpc } from "#data";
import { deriveChatTitle, timeLib } from "#lib";
import type { ChatListRowActions } from "../hooks/use-chat-row-mutations.ts";
import { useWarmRoomOnIntent } from "../hooks/use-prefetch-room.ts";
import type { ChatRowPortrait } from "../lib/chat-summary-row.ts";
import { chatRowActionName } from "../lib/chat-summary-row.ts";
import { ChatListRowMenu } from "./chat-list-row-menu.tsx";
import { ChatSummaryRow } from "./chat-summary-row.tsx";

type ChatSummaryItem = inferOutput<Trpc["chat"]["listChats"]>["items"][number];

export interface ChatListRowProps {
  readonly chat: ChatSummaryItem;
  readonly selected: boolean;
  readonly onSelect: (chatId: ChatId) => void;
  readonly onDeletedChat?: ((chatId: ChatId) => void) | undefined;
  /** The row's resolved character seats (F7/D3) — 1 paints a portrait, 2+ an AvatarStack, 0 the blob. */
  readonly portraits: readonly ChatRowPortrait[];
  /** The row's DISAMBIGUATOR, resolved by the surface across the whole list (`rowQualifiers`) — the stamp
   *  the row shows, escalated where it collided. Omitted falls back to this row's own stamp, which is right
   *  for a one-off row and wrong for a list (side-eye P2c). */
  readonly qualifier?: string | undefined;
  readonly actions: ChatListRowActions;
}

/** How long a fine pointer must REST on a row before it counts as intent (#1180). The chats pane is a
 *  scroll-and-scan list, so a travel-through must warm nothing — sweeping a 30-row pane would spend the
 *  pane's connection budget on 29 rooms nobody opened, which is the same objection that kept home's
 *  also-open list unwarmed (#1126). `setting-teach-row.tsx`'s 350ms rest is the precedent this borrows;
 *  shorter here because the payload is a passive fetch rather than a visible focus move, and it still
 *  has to land ahead of the click. */
const HOVER_INTENT_DELAY_MS = 120;

export function ChatListRow({ actions, chat, selected, onSelect, onDeletedChat, portraits, qualifier }: ChatListRowProps): ReactElement {
  // THE ROW WARMS THE ROOM IT OPENS (#1180, the chats-list twin of #1126/H13). `ChatCharacterBar` reads
  // `chat.getChat` non-suspending, so on a cold click it renders `null`, then appears once the roster
  // lands and pushes the transcript down by its own 40px plus the room stack's 12px gap — measured on
  // this door at main d8f10cee5: `[cls] shift 0.0225 · div[aria-label=Example — Midnight Run] moved
  // 0px,52px`. The click itself is too late (the room's shell paints a frame later), so the warm-up has
  // to ride the reader's APPROACH. Three modalities, because hover is not universal: a fine pointer
  // resting, any pointer pressing, and keyboard focus. `chat.getChat` ONLY — the owner refused the
  // both-reads arm (`use-prefetch-room.ts` carries the measured trade).
  const warmRoom = useWarmRoomOnIntent();
  const hoverTimer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const clearHoverTimer = (): void => {
    if (hoverTimer.current !== null) {
      globalThis.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  // A row that unmounts mid-rest (the virtualizer recycles aggressively on a fast scroll) must not leave
  // a timer that warms a room the reader has already scrolled past. The cleanup is spelled INLINE rather
  // than as `() => clearHoverTimer`: that form reads the render-scoped helper, so `useExhaustiveDependencies`
  // wants it in the dep array, and a helper re-created every render would re-run this effect every render.
  // Closing over the REF alone gives a genuinely empty dep list (a ref identity is stable), and reading
  // `.current` inside a cleanup is not the banned render-time ref read.
  useEffect(
    () => (): void => {
      if (hoverTimer.current !== null) {
        globalThis.clearTimeout(hoverTimer.current);
      }
    },
    [],
  );
  const onPointerEnter = (event: PointerEvent<HTMLDivElement>): void => {
    // A coarse pointer has no hover to rest on — it gets the press arm instead.
    if (event.pointerType !== "mouse") {
      return;
    }
    clearHoverTimer();
    hoverTimer.current = globalThis.setTimeout((): void => warmRoom(chat.id), HOVER_INTENT_DELAY_MS);
  };
  // ONE name for every action on this row (the kebab AND the star toggle inside the composite) — resolved
  // once here so the two can't spell the subject differently.
  const rowName = chatRowActionName(
    deriveChatTitle(chat.title, chat.participantNames),
    qualifier ?? timeLib.formatRelativeCompact(chat.lastMessageAt ?? chat.updatedAt),
  );
  return (
    // A PASSIVE OBSERVATION WRAPPER, not a layout one — `display:contents`, so it generates no box and the
    // virtualizer measures exactly the height it measured before (the transcript's own settle is #1181's
    // subject and must not move here). Events still reach it: pointer and focus events bubble the DOM
    // ancestor chain whether or not an ancestor generates a box. `Stack` rather than a raw `<div>` because
    // feature code composes from `@orb/ui` primitives, and `setting-teach-row.tsx` is the ratified
    // precedent for hanging exactly this handler set on a layout primitive.
    <Stack
      className="contents"
      onFocusCapture={(): void => warmRoom(chat.id)}
      onPointerDown={(): void => warmRoom(chat.id)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={clearHoverTimer}
    >
      <ChatSummaryRow
        actionName={rowName}
        chat={chat}
        onToggleStar={chat.viewerRole === "host" ? (next): void => actions.star({ chatId: chat.id, starred: next }) : undefined}
        portraits={portraits}
        // `group` roots the row so the kebab's + the star's hover/focus-within reveal fires on row hover
        // (the character-card precedent); the reveal lives on RowActionsMenu's `reveal` / ROW_REVEAL.
        className="group"
        // The DERIVED display title (participant names when unauthored) names the kebab menu ("Chat actions
        // for <title>") so the per-row menus are distinguishable, not N identical "Chat actions" (finding #4).
        // The title alone is NOT enough on a per-character projection (N rows all titled "Azarael"), so the
        // name carries the row's stamp too — the same one the row shows, escalated by the surface where even
        // that collided (side-eye P3a + P2c).
        // `title` (raw, nullable) still seeds the rename input — the empty box for an unnamed chat is intact.
        menu={
          chat.viewerRole === "host" ? (
            <ChatListRowMenu
              actions={actions}
              archived={chat.archived}
              chatId={chat.id}
              onDeleted={onDeletedChat}
              rowName={rowName}
              starred={chat.starred}
              title={chat.title}
            />
          ) : undefined
        }
        onSelect={onSelect}
        selected={selected}
      />
    </Stack>
  );
}
