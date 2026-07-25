// The command-palette body. THREE kinds of row, and the distinction is the whole design:
//   • Threads — ENTITY navigation, derived from `chat.listChats` (unbounded, data-driven: a row per thread
//     is not a declarable command, it is a query result).
//   • Go to   — SECTION navigation, derived from the section registry (already one source of truth, handed
//     down by `command-modal.tsx`).
//   • Commands — the SLASH-COMMAND registry (client-architecture-lockdown.md §6c): the same registry the
//     chat composer dispatches `/<id>` against, so a command is DECLARED ONCE and is automatically both
//     typeable and discoverable. "New chat"/"New character" used to be hardcoded rows here; they are now
//     ordinary contributions owned by their features, which is what makes this list extensible at all.
// Lives in features/chat because the palette is chat-led (recent threads are its primary group). cmdk owns
// search/filtering/keyboard nav — do not reimplement.

import type { ChatId } from "@orb/kit/ids";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@orb/ui/command";
import { Icon, MessagesSquare } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef } from "react";

import type { Trpc } from "#data";
import { QueryBoundary, useTRPC } from "#data";
import type { SlashCommandContribution, SlashCommandGroup } from "#lib";
import { SLASH_COMMAND_GROUP_LABELS, SLASH_COMMAND_GROUPS, useFocusOnMount } from "#lib";
import type { SectionId } from "#state";
import { closeModal, selectChat, setActiveSection, useActiveChatId } from "#state";
import { useSlashCommands } from "../hooks/use-slash-commands";
import { chatSummaryRowView } from "../lib/chat-summary-row";

type ChatSummaryItem = inferOutput<Trpc["chat"]["listChats"]>[number];

/** A command's declared bucket, defaulted — the contribution's `group` is optional by design. */
function groupOf(command: SlashCommandContribution): SlashCommandGroup {
  return command.group ?? "commands";
}

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
  // The palette can be opened from anywhere, so the projection is the ACTIVE chat (null outside one) — a
  // command that needs a room says so through `unavailableReason` and renders disabled, never hidden.
  const slash = useSlashCommands(useActiveChatId());

  const jumpToChat = (chatId: ChatId): void => {
    selectChat(chatId);
    closeModal();
  };
  const jumpToSection = (id: SectionId): void => {
    setActiveSection(id);
    closeModal();
  };
  // Close BEFORE running: a command whose runner opens another modal (`/new-chat`) would otherwise have
  // its modal closed right back by this dismissal.
  const runCommand = (id: string): void => {
    closeModal();
    slash.run(id);
  };

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none h-full">
      {/* The registered commands' invisible runner mounts — the palette is a slash-command host too. */}
      {slash.mounts}
      <Command className="rounded-card border shadow-overlay h-full flex flex-col" label="Command palette" onEscape={closeModal}>
        <CommandInput aria-label="Search commands" placeholder="Jump to a thread, section, or action…" />
        <CommandList className="max-h-96">
          <CommandEmpty>No matches.</CommandEmpty>

          <QueryBoundary fallback={null} renderError={(): null => null}>
            <ThreadsGroup onJump={jumpToChat} />
          </QueryBoundary>

          <CommandGroup heading="Go to">
            {goToSections.map((section) => (
              <CommandItem key={section.id} keywords={[section.label]} onSelect={(): void => jumpToSection(section.id)} value={`goto:${section.id}`}>
                {section.label}
              </CommandItem>
            ))}
          </CommandGroup>

          {SLASH_COMMAND_GROUPS.map((group) => (
            <CommandsGroup
              commands={slash.commands.filter((c) => groupOf(c) === group)}
              group={group}
              key={group}
              onRun={runCommand}
              unavailableFor={slash.unavailableFor}
            />
          ))}
        </CommandList>
      </Command>
    </Stack>
  );
}

interface CommandsGroupProps {
  readonly commands: readonly SlashCommandContribution[];
  readonly group: SlashCommandGroup;
  readonly onRun: (id: string) => void;
  readonly unavailableFor: (command: SlashCommandContribution) => string | null;
}

/** One slash-command bucket. Renders nothing when the bucket is empty, so a zero-registrant build shows
 *  exactly the navigation groups. */
function CommandsGroup({ commands, group, onRun, unavailableFor }: CommandsGroupProps): ReactElement | null {
  if (commands.length === 0) {
    return null;
  }
  return (
    <CommandGroup heading={SLASH_COMMAND_GROUP_LABELS[group]}>
      {commands.map((command) => {
        const reason = unavailableFor(command);
        return (
          <CommandItem
            disabled={reason !== null}
            key={command.id}
            keywords={[command.label, command.describe, `/${command.id}`, ...(command.keywords ?? [])]}
            onSelect={(): void => onRun(command.id)}
            title={reason ?? undefined}
            value={`command:${command.id}`}
          >
            {command.icon === undefined ? null : <Icon icon={command.icon} size="sm" />}
            {command.label}
          </CommandItem>
        );
      })}
    </CommandGroup>
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
  const { title } = chatSummaryRowView(chat);
  return (
    <CommandItem keywords={[title, ...chat.participantNames]} onSelect={(): void => onJump(chat.id)} value={chat.id}>
      <Icon icon={MessagesSquare} size="sm" />
      {title}
    </CommandItem>
  );
}
