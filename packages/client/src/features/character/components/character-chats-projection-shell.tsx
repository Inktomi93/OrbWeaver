// The CHARACTER-owned frame around the injected chats projection (list-pane-projection §3.2/§3.4): the
// pinned identity row (face → history → play) and the pane container the swap focuses. The ROWS are chat's
// (`ChatsWithCharacterPane`, threaded in at the door); everything here is character identity, read off the
// same `character.get` cache the editor beside it already holds.
//
// Instrument tier (§6): `p-row` pad, `rounded-base`, NO border box — the identity row is a read-only
// kicker-weight header, not a card (CD1).
//
// A11y: entering the projection FROM THE PICKER is a pane SWAP, so focus moves to this container
// (`tabIndex={-1}`) — a swap that drops focus to `<body>` is a defect, not a polish item. The first Tab from
// here lands on the band's back affordance.
//
// The owner is a DECISION, not a race (side-eye P1, round 2). `useFocusOnMount` can't decide it: the click
// that selects a character unmounts the picker row the user pressed, so `document.activeElement` is already
// `<body>` and the hook's cold-load guard skips. But focusing UNCONDITIONALLY (round 1) was an own-goal — it
// un-jams the CONTENT editor's copy of that same guard, and the editor, mounting after its query lands,
// takes the focus straight back. So the INTENT that wrote the selection carries the owner
// (`listProjectionOwnsFocus`, state/character-selection-store.ts): a pick from the LIST PICKER lands here; a
// deep link / agent nav / fresh create leaves focus with the editor, which keeps its own behavior.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useTRPC } from "#data";
import type { CharacterChatsProjectionView } from "#lib";
import { chatsWithCharacter, timeLib } from "#lib";
import { listProjectionOwnsFocus } from "#state";
import { CHARACTER_CHATS_PROJECTION_SLOT, startChatWithCharacter } from "../lib/character-chat-intents";

export interface CharacterChatsProjectionShellProps {
  readonly characterId: CharacterId;
  /** The door-injected chat-owned body (§3.2) — character never imports chat to render it. */
  readonly chatsProjection: (view: CharacterChatsProjectionView) => ReactNode;
}

export function CharacterChatsProjectionShell({ characterId, chatsProjection }: CharacterChatsProjectionShellProps): ReactElement {
  const paneRef = useRef<HTMLDivElement>(null);
  // The swap's focus owner, decided by the selection intent (see the header) — read once, at mount.
  useEffect(() => {
    if (listProjectionOwnsFocus(characterId)) {
      paneRef.current?.focus();
    }
  }, [characterId]);
  const trpc = useTRPC();
  const { data } = useQuery(trpc.character.get.queryOptions({ characterId }));
  const name = data?.name ?? "";

  return (
    <Stack
      aria-label={name === "" ? "Chats" : `Chats with ${name}`}
      className="h-full min-h-0 outline-none"
      data-slot={CHARACTER_CHATS_PROJECTION_SLOT}
      gap="row"
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

/** Portrait · name · the RECENCY gloss (`last 2h ago`).
 *
 *  NOT a census (side-eye NR5/NR2): the pane directly below this row IS the census — printing "7 chats"
 *  over seven visible rows, or "no chats yet" over an empty state that says exactly that, is the same
 *  statement twice. Recency is the one thing the rows don't state at a glance, so it is what survives; the
 *  editor hero's "N chats ›" keeps the count, which is CONTENT tier and has no list under it. */
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
  const gloss = newest === undefined ? null : `last ${timeLib.formatRelative(newest.lastMessageAt ?? newest.updatedAt)}`;
  const avatarSrc = avatarHash === null ? {} : { src: blobUrl(avatarHash) };

  return (
    // HIERARCHY (side-eye P2e): this row is the pane's header — it must outrank the chat rows under it, so
    // the portrait steps up one display token (40px `lg` vs the rows' 24px) and the name carries the row
    // titles' weight at the next size up. Everything else stays instrument-tier (no border box, CD1).
    <Row align="center" gap="block" padding="row">
      <Avatar fallbackDelay={0} hueSeed={characterId} shape="square" size="lg" {...avatarSrc}>
        {initialsFor(name)}
      </Avatar>
      <Stack className="min-w-0">
        <Text className="truncate" size="title" weight="semibold">
          {name}
        </Text>
        {gloss === null ? null : (
          // The `gloss` VOICE (density-pass §2.3), kept mono — a recency stamp is a quiet reading of the
          // clock, so it stays on the tabular face the row stamps below it use.
          <Text className="font-mono" voice="gloss">
            {gloss}
          </Text>
        )}
      </Stack>
    </Row>
  );
}
