// The chats-section landing surface: the content hero rendered when nothing is selected. The app never
// opens on an empty room — this is a welcome hero + "Recent chats" + a "Start a chat" quick-pick row.
// Pure read + write-intent: this surface only writes out via callbacks, it holds no active-chat state
// and reads none. Two suspense reads (listChats unpaged, character.list first page) fetched in parallel
// via one useSuspenseQueries.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Plus, Users } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { timeLib, useFocusOnMount, WeaveGlyph } from "#lib";

const RECENTS_LIMIT = 8;
const QUICK_PICKS_LIMIT = 6;
const SKELETON_ROW_COUNT = 4;

type ChatSummaryItem = inferOutput<Trpc["chat"]["listChats"]>[number];
type CharacterListItem = inferOutput<Trpc["character"]["list"]>["items"][number];

export interface ChatLandingSurfaceProps {
  readonly onSelect: (chatId: ChatId) => void;
  readonly onStartChat: (characterId: CharacterId) => void;
  readonly onNewChat: () => void;
  readonly onBrowseCharacters: () => void;
  /** False when the chats list is docked — that panel is the recents finder, so this would duplicate it. */
  readonly showRecents?: boolean;
}

export function ChatLandingSurface(props: ChatLandingSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 overflow-y-auto outline-none" align="center" padding="section">
      <Stack className="w-full max-w-(--width-shell-content)" gap="section">
        <QueryBoundary fallback={<LandingSkeleton />} renderError={(_error, retry): ReactElement => <QueryErrorState label="your landing" onRetry={retry} />}>
          <LandingBody {...props} />
        </QueryBoundary>
      </Stack>
    </Stack>
  );
}

function LandingBody({ onSelect, onStartChat, onNewChat, onBrowseCharacters, showRecents = true }: ChatLandingSurfaceProps): ReactElement {
  const trpc = useTRPC();
  const [{ data: chats }, { data: characterPage }] = useSuspenseQueries({
    queries: [trpc.chat.listChats.queryOptions({}), trpc.character.list.queryOptions({ limit: QUICK_PICKS_LIMIT })],
  });
  const recents = chats.slice(0, RECENTS_LIMIT);
  const quickPicks = characterPage.items.slice(0, QUICK_PICKS_LIMIT);
  const emptyLibrary = quickPicks.length === 0;

  return (
    <>
      <EmptyState
        decoration={<WeaveGlyph size={64} anim={true} />}
        title="Pick up a thread"
        description="Every character is a thread waiting to be woven. Start a new one, or return to a scene."
        action={
          emptyLibrary ? (
            <Button intent="primary" onClick={onBrowseCharacters}>
              <Icon icon={Users} size="sm" />
              Create your first character
            </Button>
          ) : (
            <Button intent="primary" onClick={onNewChat} aria-label="Start a new chat">
              <Icon icon={Plus} size="sm" />
              New chat
            </Button>
          )
        }
      />

      {showRecents && recents.length > 0 ? (
        <Stack gap="row">
          <Text size="micro" weight="semibold" tone="muted" transform="caps">
            Recent chats
          </Text>
          <Stack aria-label="Recent chats" gap="row" role="list">
            {recents.map((chat) => (
              <RecentRow chat={chat} key={chat.id} onSelect={onSelect} />
            ))}
          </Stack>
        </Stack>
      ) : null}

      {emptyLibrary ? null : (
        <Stack gap="row">
          <Row align="center" justify="between">
            <Text size="micro" weight="semibold" tone="muted" transform="caps">
              Start a chat
            </Text>
            <Button intent="ghost" size="sm" onClick={onBrowseCharacters}>
              All characters →
            </Button>
          </Row>
          <Stack aria-label="Character quick-picks" gap="row" role="list">
            {quickPicks.map((character) => (
              <QuickPickRow character={character} key={character.id} onStartChat={onStartChat} />
            ))}
          </Stack>
        </Stack>
      )}
    </>
  );
}

interface RecentRowProps {
  readonly chat: ChatSummaryItem;
  readonly onSelect: (chatId: ChatId) => void;
}

function RecentRow({ chat, onSelect }: RecentRowProps): ReactElement {
  const title = chat.title ?? "Untitled chat";
  const subtitle = chat.participantNames.length > 0 ? chat.participantNames.join(", ") : "No characters";
  const when = chat.lastMessageAt ?? chat.updatedAt;
  return (
    <ListRow
      clickable={true}
      leading={
        <Avatar size="sm" hueSeed={chat.id} fallbackDelay={0}>
          {initialsFor(title)}
        </Avatar>
      }
      title={title}
      subtitle={subtitle}
      actions={
        <Text size="micro" tone="muted" className="whitespace-nowrap font-mono">
          {timeLib.formatRelative(when)}
        </Text>
      }
      onClick={(): void => onSelect(chat.id)}
    />
  );
}

interface QuickPickRowProps {
  readonly character: CharacterListItem;
  readonly onStartChat: (characterId: CharacterId) => void;
}

function QuickPickRow({ character, onStartChat }: QuickPickRowProps): ReactElement {
  const avatarSrc = character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) };
  return (
    <ListRow
      clickable={true}
      leading={
        <Avatar shape="square" size="sm" hueSeed={character.id} fallbackDelay={0} {...avatarSrc}>
          {initialsFor(character.name)}
        </Avatar>
      }
      title={character.name}
      onClick={(): void => onStartChat(castId<CharacterId>(character.id))}
    />
  );
}

function LandingSkeleton(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none h-full min-h-0" gap="section">
      <Stack align="center" gap="row">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-control-md w-full" />
      </Stack>
      <Stack gap="row">
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => i).map((i) => (
          <Skeleton className="h-control-lg w-full" key={i} />
        ))}
      </Stack>
    </Stack>
  );
}
