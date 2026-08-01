// The CHARACTER-owned frame around the injected chats projection (list-pane-projection §3.2/§3.4): the
// pinned identity row (face → history → play) and the pane container the swap focuses. The ROWS are chat's
// (`ChatsWithCharacterPane`, threaded in at the door); everything here is character identity, read off the
// same `character.get` cache the editor beside it already holds.
//
// Instrument tier (§6): `p-row` pad, `rounded-base`, NO border box — the identity row is a read-only
// kicker-weight header, not a card (CD1).
//
// A11y: entering the projection is a pane SWAP, so focus moves to this container (`tabIndex={-1}` +
// `useFocusOnMount`) — a swap that drops focus to `<body>` is a defect, not a polish item. The first Tab
// from here lands on the band's back affordance.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import { useTRPC } from "#data";
import type { CharacterChatsProjectionView } from "#lib";
import { chatsWithCharacter, timeLib, useFocusOnMount } from "#lib";
import { CHARACTER_CHATS_PROJECTION_SLOT, startChatWithCharacter } from "../lib/character-chat-intents";

export interface CharacterChatsProjectionShellProps {
  readonly characterId: CharacterId;
  /** The door-injected chat-owned body (§3.2) — character never imports chat to render it. */
  readonly chatsProjection: (view: CharacterChatsProjectionView) => ReactNode;
}

export function CharacterChatsProjectionShell({ characterId, chatsProjection }: CharacterChatsProjectionShellProps): ReactElement {
  const paneRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(paneRef);
  const trpc = useTRPC();
  const { data } = useQuery(trpc.character.get.queryOptions({ characterId }));
  const name = data?.name ?? "";

  return (
    <Stack
      aria-label={name === "" ? "Chats" : `Chats with ${name}`}
      className="h-full min-h-0 outline-none"
      data-slot={CHARACTER_CHATS_PROJECTION_SLOT}
      gap="block"
      ref={paneRef}
      tabIndex={-1}
    >
      <IdentityRow avatarHash={data?.avatarHash ?? null} characterId={characterId} name={name} />
      <Stack className="min-h-0 flex-1">
        {chatsProjection({ characterId, characterName: name, onNewChat: (): void => startChatWithCharacter(characterId) })}
      </Stack>
    </Stack>
  );
}

/** Portrait · name · the gloss census (`7 chats · last 2h ago`). The count rides the ONE projection
 *  predicate, so the gloss, the hero's "N chats" and the rows below can never disagree. */
function IdentityRow({
  characterId,
  name,
  avatarHash,
}: {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
}): ReactElement {
  const trpc = useTRPC();
  const { data: chats } = useQuery(trpc.chat.listChats.queryOptions({}));
  const projected = chatsWithCharacter(chats ?? [], characterId);
  const newest = projected[0];
  const gloss =
    projected.length === 0
      ? "no chats yet"
      : `${projected.length} ${projected.length === 1 ? "chat" : "chats"} · last ${timeLib.formatRelative(newest?.lastMessageAt ?? newest?.updatedAt ?? 0)}`;
  const avatarSrc = avatarHash === null ? {} : { src: blobUrl(avatarHash) };

  return (
    <Row align="center" gap="block" padding="row">
      <Avatar fallbackDelay={0} hueSeed={characterId} shape="square" size="md" {...avatarSrc}>
        {initialsFor(name)}
      </Avatar>
      <Stack className="min-w-0">
        <Text className="truncate" size="label" weight="semibold">
          {name}
        </Text>
        <Text className="font-mono" size="micro" tone="muted">
          {gloss}
        </Text>
      </Stack>
    </Row>
  );
}
