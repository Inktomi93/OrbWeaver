// The command-palette body: Threads (chat.listChats -> selectChat), Go to (rail sections ->
// setActiveSection), Create (New chat/New character). Lives in features/chat because the palette is
// chat-led (recent threads are its primary group); "Go to" section metadata arrives as a prop from the
// route, which owns the section registry. cmdk owns search/filtering/keyboard nav — do not reimplement.

import type { ChatId } from "@orb/kit/ids";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@orb/ui/command";
import { Icon, MessagesSquare, Plus, Users } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef } from "react";

import type { Trpc } from "#data";
import { QueryBoundary, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import type { SectionId } from "#state";
import { closeModal, openModal, selectChat, setActiveSection } from "#state";

type ChatSummaryItem = inferOutput<Trpc["chat"]["listChats"]>[number];

export interface GoToSection {
  readonly id: SectionId;
  readonly label: string;
}

export interface CommandPaletteSurfaceProps {
  readonly goToSections: readonly GoToSection[];
}

export function CommandPaletteSurface({ goToSections }: CommandPaletteSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  const jumpToChat = (chatId: ChatId): void => {
    selectChat(chatId);
    closeModal();
  };
  const jumpToSection = (id: SectionId): void => {
    setActiveSection(id);
    closeModal();
  };
  const newChat = (): void => {
    openModal("newChat");
  };
  const newCharacter = (): void => {
    // No dedicated create-character flow exists yet — land in the Characters section.
    // TODO(character-lane): route straight to the create form when it lands.
    setActiveSection("characters");
    closeModal();
  };

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none h-full">
      <Command
        className="rounded-card border shadow-overlay h-full flex flex-col"
        label="Command palette"
        onEscape={closeModal}
      >
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
            <CommandItem
              keywords={["new", "chat", "thread"]}
              onSelect={newChat}
              value="create:chat"
            >
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
    </Stack>
  );
}

interface ThreadsGroupProps {
  readonly onJump: (chatId: ChatId) => void;
}

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

// cmdk scores value/keywords, never the children, so keywords carries the visible text.
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
