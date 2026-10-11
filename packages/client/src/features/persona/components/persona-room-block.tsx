// The switcher's ROOM block (a room is open, either lens): who the card's {{user}} is, the host's re-pin to
// another player's persona, and the restamp. Pinning one of your own personas is the 📌 on its row; this block
// covers what a row cannot: another player's persona, clearing the pin, and a pin whose player left.

import type { PersonaId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { History, Icon, IdCard } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useReattributePersona, useTRPC } from "#data";
import { deriveChatTitle, notify } from "#lib";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];
type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;

/** A persona id → its display name. The room's identity producer covers every persona the room references,
 *  the pin included even after its player left; the viewer's own list is the second source. */
function personaLabel(chat: ChatDetail, personas: readonly PersonaListItem[], id: string | null): string {
  if (id === null) {
    return "None";
  }
  return chat.identities.find((e) => e.kind === "persona" && e.id === id)?.name ?? personas.find((p) => p.id === id)?.name ?? "Unknown persona";
}

/** The other present players' seat personas — what the host can pin besides their own. */
function memberPins(chat: ChatDetail): readonly { readonly personaId: PersonaId; readonly label: string }[] {
  return chat.participants.flatMap((p) =>
    p.kind === "human" && p.userId !== chat.viewerUserId && p.activePersonaId !== null
      ? [{ personaId: p.activePersonaId, label: `${personaLabel(chat, [], p.activePersonaId)} (${p.displayName})` }]
      : [],
  );
}

function hasOtherHumans(chat: ChatDetail): boolean {
  return chat.participants.some((p) => p.kind === "human" && p.userId !== chat.viewerUserId);
}

/** The room's name in the kicker. */
function roomLabel(chat: ChatDetail): string {
  return deriveChatTitle(
    chat.title,
    chat.participants.filter((p) => p.kind === "character").map((p) => p.displayName),
  );
}

// Who the card's {{user}} is, in words. A held pin never says why its player is gone.
function anchorLine(chat: ChatDetail, personas: readonly PersonaListItem[]): string {
  if (chat.anchorPersonaId === null) {
    return hasOtherHumans(chat) ? "Card follows the host's persona" : "Card follows your persona";
  }
  const name = personaLabel(chat, personas, chat.anchorPersonaId);
  if (chat.anchorState === "held") {
    return `${name} is no longer in the room. The card still means ${name}.`;
  }
  if (personas.some((p) => p.id === chat.anchorPersonaId)) {
    return `Card sees you as ${name}`;
  }
  const owner = chat.participants.find((p) => p.kind === "human" && p.activePersonaId === chat.anchorPersonaId);
  return owner === undefined ? `Card's persona: ${name}` : `Card's persona: ${name} (${owner.displayName})`;
}

export interface PersonaRoomBlockProps {
  readonly chat: ChatDetail;
  readonly personas: readonly PersonaListItem[];
  /** Pins the card to a persona, or unpins with `null` (the switcher's `useCardPin`). */
  readonly onCardPin: (persona: { readonly id: PersonaId; readonly name: string } | null) => void;
}

export function PersonaRoomBlock({ chat, personas, onCardPin }: PersonaRoomBlockProps): ReactElement {
  return (
    <Stack gap="field" data-slot="persona-chat-scope">
      <Text className="truncate" voice="kicker">
        In {roomLabel(chat)}
      </Text>
      <ChatAnchorRow chat={chat} onCardPin={onCardPin} personas={personas} />
      <ChatRestamp chat={chat} personas={personas} />
    </Stack>
  );
}

/** The card-pin line, with the host's re-pin when the row 📌 cannot do the job: another player is here to
 *  pin, or the pinned player left. */
function ChatAnchorRow({ chat, personas, onCardPin }: PersonaRoomBlockProps): ReactElement {
  const members = memberPins(chat);
  const offersRepin = chat.viewerIsHost && (members.length > 0 || chat.anchorState === "held");
  return (
    <Row gap="row" align="center" className="justify-between" data-slot="persona-anchor-line" data-anchor-state={chat.anchorState}>
      <Row gap="field" align="center" className="min-w-0">
        <Icon icon={IdCard} size="xs" />
        <Text size="label" tone="muted">
          {anchorLine(chat, personas)}
        </Text>
      </Row>
      {offersRepin ? (
        <Menu>
          <MenuTrigger
            render={
              <Button className="shrink-0" intent="ghost" size="sm">
                Re-pin…
              </Button>
            }
          />
          <MenuPopup>
            {members.length > 0 ? (
              <MenuGroup>
                <MenuGroupLabel>Members' personas</MenuGroupLabel>
                {members.map((option) => (
                  <MenuItem key={option.personaId} onClick={(): void => onCardPin({ id: option.personaId, name: option.label })}>
                    {option.label}
                  </MenuItem>
                ))}
              </MenuGroup>
            ) : null}
            {members.length > 0 ? <MenuSeparator /> : null}
            <MenuItem onClick={(): void => onCardPin(null)}>Clear pin</MenuItem>
          </MenuPopup>
        </Menu>
      ) : null}
    </Row>
  );
}

/** The restamp verb and its visible scope sentence. */
function ChatRestamp({ chat, personas }: { readonly chat: ChatDetail; readonly personas: readonly PersonaListItem[] }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const notifyOnChange = settings.config.persona.showNotifications;
  const reattribute = useReattributePersona({ trpc, invalidation });
  const scopeId = useId();
  const chatId = chat.id;
  // One call, no pre-read: the server resolves "every user row I authored in this chat" itself, and the
  // notice fires on the server's ACK so it never claims a restamp the write didn't land.
  const onReattribute = (): void => {
    const targetPersonaId = chat.viewerActivePersonaId;
    if (targetPersonaId === null) {
      return;
    }
    reattribute.mutate(
      { chatId, scope: { kind: "mine" }, personaId: targetPersonaId },
      {
        onSuccess: (): void => {
          if (notifyOnChange) {
            notify.info(`Your messages in this chat now read as ${personaLabel(chat, personas, targetPersonaId)}.`);
          }
        },
      },
    );
  };
  // The blast radius is visible copy, bound by `aria-describedby`: a tooltip is unreadable on a phone (#2443).
  return (
    <Stack gap="field">
      <Button
        aria-describedby={scopeId}
        disabled={chat.viewerActivePersonaId === null || reattribute.isPending}
        intent="ghost"
        onClick={onReattribute}
        size="sm"
      >
        <Icon icon={History} size="xs" />
        Restamp my messages to this persona
      </Button>
      <Text as="span" data-slot="restamp-scope" id={scopeId} voice="gloss">
        Restamps every one of your own lines in this chat to "{personaLabel(chat, personas, chat.viewerActivePersonaId)}" — however far back they go. What you
        wrote is untouched; replies keep the names they were written with.
      </Text>
    </Stack>
  );
}
