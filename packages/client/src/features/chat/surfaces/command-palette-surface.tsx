// The command-palette body. THREE kinds of row, and the distinction is the whole design:
//   • Threads — ENTITY navigation, derived from `chat.listChats` (data-driven: a row per thread is not a
//     declarable command, it is a query result). CAPPED at the most-recent `RECENT_THREADS` (2026-08-09):
//     it used to render a `CommandItem` per thread over the caller's ENTIRE membership list, so opening the
//     palette on an 872-chat library mounted 872 scored items.
//     THE CAP IS THE DESIGN, not a shortcut around virtualization: cmdk OWNS filtering and scoring, and it
//     can only score items it has MOUNTED — a `<VirtualList>` inside a `CommandGroup` would windowed-render
//     the rows and silently make the palette's own search blind to everything off-screen, which is worse
//     than a stated cap. So the group is honest about what it is ("Recent threads") and the chats pane's
//     server-side search is where "find any thread" lives.
//   • Go to   — SECTION navigation, derived from the section registry (already one source of truth, handed
//     down by `command-modal.tsx`).
//   • Commands — the SLASH-COMMAND registry (client-architecture-lockdown.md §6c): the same registry the
//     chat composer dispatches `/<id>` against, so a command is DECLARED ONCE and is automatically both
//     typeable and discoverable. "New chat"/"New character" used to be hardcoded rows here; they are now
//     ordinary contributions owned by their features, which is what makes this list extensible at all.
// Lives in features/chat because the palette is chat-led (recent threads are its primary group). cmdk owns
// search/filtering/keyboard nav — do not reimplement.

import type { ChatId } from "@orb/kit/ids";
import { Command, CommandAuxiliaryButton, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@orb/ui/command";
import { Icon, MessagesSquare } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { use, useEffect, useRef } from "react";
import { QueryBoundary } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, useTRPC } from "#data";
import type { CommandPaletteSource, SlashCommandContext, SlashCommandContribution, SlashCommandGroup } from "#lib";
import { SLASH_COMMAND_GROUP_LABELS, SLASH_COMMAND_GROUPS, useFocusOnMount } from "#lib";
import type { SectionId } from "#state";
import { CommandPaletteSourceRegistryContext, closeModal, selectChat, setActiveSection, useActiveChatId } from "#state";
import { useSlashCommands } from "../hooks/use-slash-commands.tsx";
import { chatSummaryRowView } from "../lib/chat-summary-row.ts";

type ChatSummaryItem = inferOutput<Trpc["chat"]["listChats"]>["items"][number];

/** How many threads the palette offers. A jump list is a RECENTS affordance — past the first screenful the
 *  user is searching, not scanning, and cmdk must mount every row it can match. */
const RECENT_THREADS = 20;

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
  // The palette is a search-first surface. Its generic surface focus keeps the initial-page guard shared
  // with every other surface; once this user-opened modal mounts, move to the actual command input.
  useEffect(() => {
    surfaceRef.current?.querySelector<HTMLInputElement>('[data-slot="command-input"]')?.focus();
  }, []);
  // The palette can be opened from anywhere, so the projection is the ACTIVE chat (null outside one) — a
  // command that needs a room says so through `unavailableReason` and renders disabled, never hidden.
  const chatId = useActiveChatId();
  const slash = useSlashCommands(chatId);
  // The dynamic palette sources (plugin commands, U8) share the SAME context projection as the slash commands.
  // Read null-tolerantly: a build/CT with no Provider has zero sources and the palette shows only its native
  // groups (byte-identical to before the seam).
  const context: SlashCommandContext = { chatId };
  const paletteSources = use(CommandPaletteSourceRegistryContext)?.list() ?? [];

  const jumpToChat = (id: ChatId): void => {
    selectChat(id);
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
  // A dynamic-source row (a plugin command) carries its own bound runner; the palette owns the SAME
  // close-before-run discipline the slash rows use (a command whose outcome opens a plugin dialog must not have
  // this modal close it right back).
  const runRow = (run: () => void): void => {
    closeModal();
    run();
  };

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none h-full">
      {/* The registered commands' invisible runner mounts — the palette is a slash-command host too. */}
      {slash.mounts}
      <Command className="rounded-card border shadow-overlay h-full flex flex-col" label="Command palette" onEscape={closeModal}>
        <CommandInput aria-label="Search commands" placeholder="Jump to a thread, section, or action…" />
        <CommandList listSize="compact">
          <CommandEmpty>No matches.</CommandEmpty>

          <QueryBoundary
            fallback={<RecentThreadsLoading />}
            renderError={(_error, retry): ReactElement => (
              <QueryErrorState
                label="recent threads"
                onRetry={retry}
                renderRetry={(onRetry): ReactElement => (
                  <CommandAuxiliaryButton intent="ghost" onClick={onRetry}>
                    Retry
                  </CommandAuxiliaryButton>
                )}
              />
            )}
          >
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

          {/* The DYNAMIC palette sources (plugin commands, U8): each renders as its OWN component so its
              `useRows` hook lives in its own fiber — never a hooks-in-a-loop here. */}
          {paletteSources.map((source) => (
            <PaletteSourceGroup context={context} key={source.id} onRun={runRow} source={source} />
          ))}
        </CommandList>
      </Command>
    </Stack>
  );
}

/** A query still in flight must reserve a visible, named group rather than making recents disappear. */
function RecentThreadsLoading(): ReactElement {
  return <CommandGroup heading="Recent threads">Loading recent threads…</CommandGroup>;
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

interface PaletteSourceGroupProps {
  readonly source: CommandPaletteSource;
  readonly context: SlashCommandContext;
  readonly onRun: (run: () => void) => void;
}

/** One DYNAMIC palette source's rows (a plugin's registered commands, U8). A COMPONENT, not a `.map` callback,
 *  precisely so the source's `useRows` hook lives in its own fiber (the slash `mount` pattern, applied to a
 *  fanned source). Renders nothing when the source has no rows, so a caller with no granted-and-enabled plugin
 *  commands sees exactly the native groups — byte-identical to a build without the source. */
function PaletteSourceGroup({ source, context, onRun }: PaletteSourceGroupProps): ReactElement | null {
  const rows = source.useRows(context);
  if (rows.length === 0) {
    return null;
  }
  return (
    <CommandGroup heading={source.heading}>
      {rows.map((row) => (
        <CommandItem
          key={row.id}
          // cmdk scores value/keywords, never the children — the visible label, the describe, and the plugin
          // name all ride keywords so typing any of them matches the row.
          keywords={[row.label, row.describe, ...(row.badge === undefined ? [] : [row.badge]), ...(row.keywords ?? [])]}
          onSelect={(): void => onRun(row.run)}
          value={row.id}
        >
          {source.icon === undefined ? null : <Icon icon={source.icon} size="sm" />}
          {row.label}
          {row.badge === undefined ? null : (
            <Text as="span" className="ml-auto" voice="gloss">
              {row.badge}
            </Text>
          )}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

interface ThreadsGroupProps {
  readonly onJump: (chatId: ChatId) => void;
}

function ThreadsGroup({ onJump }: ThreadsGroupProps): ReactElement | null {
  const trpc = useTRPC();
  const { data: page } = useSuspenseQuery(trpc.chat.listChats.queryOptions({ limit: RECENT_THREADS }));
  if (page.items.length === 0) {
    return null;
  }
  return (
    <CommandGroup heading="Recent threads">
      {page.items.map((chat) => (
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
