// The Chats-section LANDING surface (UI-Arch §4.1 CONTENT · ux-flow-revamp J1 · D62 P4) — the CONTENT
// hero the route renders when the active-chat handle is `{kind:"landing"}` (nothing selected). The app
// NEVER opens on an empty room: this is a welcome hero + "Recent chats" (up to ~8 `ListRow`s from
// `chat.listChats`, newest-first) + a "Start a chat" quick-pick row (the first ~6 characters). Pure
// read + write-INTENT (§5.1): selecting a recent → `onSelect`(→`selectChat`); a quick-pick →
// `onStartChat`(→`startNewChat({characterIds:[id]})`); the hero's primary → `onNewChat`(→ the J2 picker
// modal) or, on an empty DB, → `onBrowseCharacters`(→`setActiveSection("characters")`). This surface
// only WRITES intent out via callbacks — it holds no active-chat state and reads none (no `this_chid`
// chase); the route owns the store.
//
// READ SHAPE: two suspense reads (`chat.listChats` UNPAGED `ChatSummary[]`; `character.list` FIRST PAGE
// — a plain `.queryOptions({limit})`, NOT the infinite machine — the landing shows one small fixed slice,
// never scrolls) fetched in parallel via ONE `useSuspenseQueries`, wrapped in `<QueryBoundary>` (the
// §13.2 bounded-read battery). `data/invalidation.ts` already refreshes `chat.listChats` on chat events,
// so a new chat appears here for free.
//
// FIELD NOTE (ChatSummary): the summary carries no per-participant avatar/id and no last-message preview
// (participantNames is names-only) — recents render the initials fallback + participant names, the same
// honest shape the chat-list rows use. First-run persona ask (the zero-personas onboarding the wider J1
// spec folds into this hero) is OWNED ELSEWHERE: persona shipped, and the ask lives in the AppShell-
// sibling `<FirstRunPersonaDialog>` (routes/home-page.tsx), not this surface.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the chat-list-surface.tsx precedent).
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
import { initialsForAttribution } from "../lib/attribution";

/** How many recents / character quick-picks the landing shows (a small fixed slice — never a scroll). */
const RECENTS_LIMIT = 8;
const QUICK_PICKS_LIMIT = 6;
const SKELETON_ROW_COUNT = 4;

type ChatSummaryItem = inferOutput<Trpc["chat"]["listChats"]>[number];
type CharacterListItem = inferOutput<Trpc["character"]["list"]>["items"][number];

export interface ChatLandingSurfaceProps {
  /** Open an existing chat (the route maps this to `selectChat`). */
  readonly onSelect: (chatId: ChatId) => void;
  /** Start a fresh chat seeded with one character (the route maps this to `startNewChat`). */
  readonly onStartChat: (characterId: CharacterId) => void;
  /** Open the new-chat character picker (the J2 modal) — the hero's primary when characters exist. */
  readonly onNewChat: () => void;
  /** Jump to the Characters section (the "All characters →" link + the empty-DB primary). */
  readonly onBrowseCharacters: () => void;
  /** Show the "Recent chats" block. The route passes `false` when the Chats LIST is DOCKED — that panel
   *  IS the recents finder (§4.3 rule 5: LIST finds, CONTENT does), so repeating recents here is the
   *  duplicate (#13). Defaults `true` (list collapsed/overlay, mobile, or a standalone mount). */
  readonly showRecents?: boolean;
}

/** The Chats landing hero: welcome + recents + character quick-picks. */
export function ChatLandingSurface(props: ChatLandingSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack
      ref={surfaceRef}
      tabIndex={-1}
      className="h-full min-h-0 overflow-y-auto outline-none"
      align="center"
      padding="section"
    >
      <Stack className="w-full max-w-(--width-shell-content)" gap="section">
        <QueryBoundary
          fallback={<LandingSkeleton />}
          renderError={(_error, retry): ReactElement => (
            <QueryErrorState label="your landing" onRetry={retry} />
          )}
        >
          <LandingBody {...props} />
        </QueryBoundary>
      </Stack>
    </Stack>
  );
}

/** The suspending body — parallel recents + quick-picks reads, then the hero + the two sections. */
function LandingBody({
  onSelect,
  onStartChat,
  onNewChat,
  onBrowseCharacters,
  showRecents = true,
}: ChatLandingSurfaceProps): ReactElement {
  const trpc = useTRPC();
  const [{ data: chats }, { data: characterPage }] = useSuspenseQueries({
    queries: [
      trpc.chat.listChats.queryOptions({}),
      trpc.character.list.queryOptions({ limit: QUICK_PICKS_LIMIT }),
    ],
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

/** One recent-chat row — avatar (initials) · title · participants · right-aligned relative time. */
function RecentRow({ chat, onSelect }: RecentRowProps): ReactElement {
  const title = chat.title ?? "Untitled chat";
  const subtitle =
    chat.participantNames.length > 0 ? chat.participantNames.join(", ") : "No characters";
  // ChatSummary carries no last-message preview text on the wire — TODO(server): add a preview field to
  // `ChatSummary` for a real last-line; today the participant names are the honest subtitle.
  const when = chat.lastMessageAt ?? chat.updatedAt;
  return (
    <ListRow
      clickable={true}
      leading={
        <Avatar size="sm" hueSeed={chat.id} fallbackDelay={0}>
          {initialsForAttribution(title)}
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

/** One character quick-pick — avatar · name; a click founds a fresh chat seeded with that character. */
function QuickPickRow({ character, onStartChat }: QuickPickRowProps): ReactElement {
  const avatarSrc = character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) };
  return (
    <ListRow
      clickable={true}
      leading={
        <Avatar shape="square" size="sm" hueSeed={character.id} fallbackDelay={0} {...avatarSrc}>
          {initialsForAttribution(character.name)}
        </Avatar>
      }
      title={character.name}
      onClick={(): void => onStartChat(castId<CharacterId>(character.id))}
    />
  );
}

/** The suspense-free loading skeleton (a hero block + a few placeholder rows, never a spinner flash). */
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
