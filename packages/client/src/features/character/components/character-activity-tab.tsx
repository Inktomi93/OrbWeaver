// The CONTEXT Activity tab (FINAL-Character §7) — "your history with them" + the branch-aware chat
// manager for one character. A pinned "Start new chat" primary at the top (§7 — never a dead end), a
// glance summary (chat count · last played), then the FORK TREE: every chat with this character rendered
// as a tree by `parentChatId` (D27), not a flat list. Each row jumps into the chat (selectChat +
// setActiveSection) — the ONE-click fix for the buried "composer hamburger → manage chats" path (§7).
//
// §5.1 render-only: the forest + summary derive IN RENDER from the bus-driven `listChats` (never an effect
// on a selection pointer). Degrades to just the Start-new button when the read is empty/pending (§7).

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { useTRPC } from "#data";
import { timeLib } from "#lib";
import { selectChat, setActiveSection, startNewChat } from "#state";
import type { ActivityNode } from "../lib/character-activity-tree";
import { buildActivityForest, summarizeActivity } from "../lib/character-activity-tree";

export interface CharacterActivityTabProps {
  readonly characterId: CharacterId;
}

/** Jump into a chat with this character — the §7 cross-section handoff (one store write, the route reacts). */
function openChat(chatId: ChatId): void {
  selectChat(chatId);
  setActiveSection("chats");
}

export function CharacterActivityTab({ characterId }: CharacterActivityTabProps): ReactElement {
  const trpc = useTRPC();
  // The bus-driven chat list (staleTime:Infinity; user-bus `chatsChanged` is its freshness driver). NOT
  // suspense: the tab degrades to the Start-new button while it loads rather than blocking the panel.
  const chatsQuery = useQuery(trpc.chat.listChats.queryOptions({}));
  // Memoized on the query data so the `?? []` fallback isn't a fresh array each render (would defeat the
  // forest/summary useMemos below — react-hooks/exhaustive-deps).
  const chats = useMemo(() => chatsQuery.data ?? [], [chatsQuery.data]);
  const forest = useMemo(() => buildActivityForest(chats, characterId), [chats, characterId]);
  const summary = useMemo(() => summarizeActivity(chats, characterId), [chats, characterId]);

  const startNew = (): void => {
    startNewChat({ characterIds: [characterId] });
    setActiveSection("chats");
  };

  return (
    <Stack gap="block">
      <Button intent="primary" onClick={startNew}>
        Start new chat
      </Button>

      {summary.chatCount > 0 ? (
        <Text size="micro" tone="muted" className="font-mono">
          {summary.chatCount} {summary.chatCount === 1 ? "chat" : "chats"}
          {summary.lastPlayedAt !== null
            ? ` · last played ${timeLib.formatDate(summary.lastPlayedAt)}`
            : ""}
        </Text>
      ) : (
        <Text tone="muted">No chats with this character yet.</Text>
      )}

      {forest.length > 0 ? (
        <Stack gap="row">
          {forest.map((node) => (
            <ForestNode key={node.chat.id} node={node} />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

/** One fork-tree node + its children (recursively), children indented under a hairline branch line. */
function ForestNode({ node }: { readonly node: ActivityNode }): ReactElement {
  const { chat, children } = node;
  const subtitle =
    chat.parentChatId !== null
      ? `fork · ${chat.messageCount} messages`
      : `${chat.messageCount} messages`;
  return (
    <Stack gap="row">
      <ListRow
        clickable={true}
        title={chat.title ?? "Untitled chat"}
        subtitle={subtitle}
        onClick={(): void => openChat(chat.id)}
      />
      {children.length > 0 ? (
        <Row gap="row">
          <Stack gap="row" className="grow border-border border-s ps-block">
            {children.map((child) => (
              <ForestNode key={child.chat.id} node={child} />
            ))}
          </Stack>
        </Row>
      ) : null}
    </Stack>
  );
}
