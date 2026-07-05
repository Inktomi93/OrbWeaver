// The ⌘K COMMAND PALETTE (ux-flow-revamp J4 · UIP-403) — the quick-jump surface the route composes over
// the app-shell `command` modal slot (home-page.tsx `modals={{command: <CommandPaletteSurface/>}}`).
// ⌘K / the topbar chip already open the slot (L2); this is the BODY.
//
// HOME (why here, not app-shell): the palette is chat-LED (recent threads are its primary group), and a
// chat-listing surface in app-shell would put domain knowledge in the one directory every paint gate
// exempts (§11.0 rot pattern). So it lives in `features/chat`; its non-chat rows are pure `#state` writes
// (`setActiveSection` / `openModal`) — the sanctioned leaf-writer shape — and its thread rows read via
// `trpc.*` (the cross-feature contract, not a feature import). The route composes it.
//
// SECTIONS: Threads (`chat.listChats` → `selectChat`) · Go to (the rail sections → `setActiveSection`) ·
// Create (New chat → the J2 picker; New character → the Characters section). Zero new server reads —
// `chat.listChats` is the already-cached list read. The "Go to" section metadata arrives as the
// `goToSections` PROP from the route (which already holds `RAIL_SECTIONS` to compose the shell): the
// route is the §5.1 composition seam that bridges app-shell's section registry → this chat-feature
// surface, so the user-facing section labels keep ONE home and the palette stays cross-feature-clean.
//
// cmdk owns the search box + client-side filtering + the roving-listbox keyboard nav (R1) — do not
// reimplement. `onEscape` clears/closes via the shell store; Esc also bubbles to the enclosing Dialog.

import type { ChatId } from "@orb/kit/ids";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@orb/ui/command";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the chat-list-surface.tsx precedent).
import { Icon, MessagesSquare, Plus, Users } from "@orb/ui/icons";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, useTRPC } from "#data";
import type { SectionId } from "#state";
import { closeModal, openModal, selectChat, setActiveSection } from "#state";

type ChatSummaryItem = inferOutput<Trpc["chat"]["listChats"]>[number];

/** One "Go to" target — the section id + its user-facing label, threaded from the route (which owns the
 *  RAIL_SECTIONS registry). Kept minimal (id + label) so the palette never re-homes app-shell metadata. */
export interface GoToSection {
  readonly id: SectionId;
  readonly label: string;
}

export interface CommandPaletteSurfaceProps {
  /** The rail sections to offer as "Go to" jumps — route-composed from RAIL_SECTIONS (§5.1 seam). */
  readonly goToSections: readonly GoToSection[];
}

/** The ⌘K palette body — Threads · Go to · Create, over the cmdk seal. */
export function CommandPaletteSurface({ goToSections }: CommandPaletteSurfaceProps): ReactElement {
  // Jump to an existing chat + close (the ONE action path — `selectChat` is the same landing the
  // chat-list select + fork-nav terminate at).
  const jumpToChat = (chatId: ChatId): void => {
    selectChat(chatId);
    closeModal();
  };
  const jumpToSection = (id: SectionId): void => {
    setActiveSection(id);
    closeModal();
  };
  const newChat = (): void => {
    // Hand off to the J2 picker (openModal replaces this palette in the shell's single dialog host).
    openModal("newChat");
  };
  const newCharacter = (): void => {
    // No dedicated create-character flow exists yet — land in the Characters section (its create
    // affordance is a later lane). TODO(character-lane): route straight to the create form when it lands.
    setActiveSection("characters");
    closeModal();
  };

  return (
    <Command label="Command palette" onEscape={closeModal} className="min-h-0">
      <CommandInput
        aria-label="Search commands"
        placeholder="Jump to a thread, section, or action…"
      />
      <CommandList className="max-h-96">
        <CommandEmpty>No matches.</CommandEmpty>

        <QueryBoundary fallback={null} renderError={(): ReactElement => <></>}>
          <ThreadsGroup onJump={jumpToChat} />
        </QueryBoundary>

        <CommandGroup heading="Go to">
          {goToSections.map((section) => (
            <CommandItem
              key={section.id}
              keywords={[section.label]}
              onSelect={(): void => jumpToSection(section.id)}
              value={`goto:${section.id}`}
            >
              {section.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Create">
          <CommandItem keywords={["new", "chat", "thread"]} onSelect={newChat} value="create:chat">
            <Icon icon={Plus} size="sm" />
            New chat
          </CommandItem>
          <CommandItem
            keywords={["new", "character"]}
            onSelect={newCharacter}
            value="create:character"
          >
            <Icon icon={Users} size="sm" />
            New character
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

interface ThreadsGroupProps {
  readonly onJump: (chatId: ChatId) => void;
}

/** The Threads group — the already-cached `chat.listChats` read (zero new server work). Suspends inside
 *  the palette's own boundary so a cold cache doesn't blank the whole palette. */
function ThreadsGroup({ onJump }: ThreadsGroupProps): ReactElement | null {
  const trpc = useTRPC();
  const { data: chats } = useSuspenseQuery(trpc.chat.listChats.queryOptions({}));
  if (chats.length === 0) {
    return null;
  }
  return (
    <CommandGroup heading="Threads">
      {chats.map((chat) => (
        <ThreadRow chat={chat} key={chat.id} onJump={onJump} />
      ))}
    </CommandGroup>
  );
}

interface ThreadRowProps {
  readonly chat: ChatSummaryItem;
  readonly onJump: (chatId: ChatId) => void;
}

/** One thread row — id-based `value` with the title + participants as `keywords` so search matches the
 *  visible text (the CommandItem R6 footgun: cmdk scores `value`/`keywords`, never the children). */
function ThreadRow({ chat, onJump }: ThreadRowProps): ReactElement {
  const title = chat.title ?? "Untitled chat";
  return (
    <CommandItem
      keywords={[title, ...chat.participantNames]}
      onSelect={(): void => onJump(chat.id)}
      value={chat.id}
    >
      <Icon icon={MessagesSquare} size="sm" />
      {title}
    </CommandItem>
  );
}
