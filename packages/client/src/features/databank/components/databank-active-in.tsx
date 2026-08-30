// The Databank CONTEXT panel's ACTIVE IN block — where this document is switched on, as DOORS.
//
// ── THE COUNT-VS-ROSTER FORK, AND WHY IT REOPENED (#276, 2026-08-19) ──────────────────────────────────
// This block shipped as two integer Badges, and `databank-context-body.tsx`'s header recorded the ruling
// behind them: chats carry no `ownerId` (D18) and `attachToChat` is host-gated, so a `chat_documents` row
// OUTLIVES the attacher's seat and naming rooms straight off that wire would tell an ex-host that a room
// they can no longer open still feeds on their document. That ruling is PRESERVED, not reversed — the same
// note said the roster was "not refused, it is UNBUILT: it needs `listAttachments` to return names, which
// needs the leak-safe read chat already exposes to regex". That read is now shared
// (`entry/compose/visible-rooms.ts` → `@orb/contracts/chat`'s `ResolveVisibleRoomsOp`) and injected into
// databank, so the wire hands over PRESENT rooms only, already filtered. The names on this pane are
// therefore exactly the rooms the reader can still open.
//
// AN UNRESOLVABLE ROOM LEAVES NO RESIDUE. There is no "…and 2 rooms you're no longer in": that sentence is
// the same leak one integer smaller (it still tells an ex-member the room exists and still holds their
// document). The regex roster's ruling — absent, not counted — is the one this matches, so the number the
// reader sees IS the number of rooms they can act on.
//
// A ROW IS A DOOR because there is somewhere to land. This is the difference from the regex CONTEXT pane,
// whose own header records "a roster row is a NAME, not a link" — that pane's rosters are presets and
// characters and rooms, and its rooms had no door because its rows are `openConfigTo` targets and a room
// is not a config collection. Databank's two scopes both have a real destination (`openChat` /
// `openCharacter`, the corpus omnibox's drill-door idiom, spelled section-then-selection exactly as the
// notification bell spells it), and a thing becomes a door when there is somewhere to land.
//
// THE ROOM IS NAMED BY THE ONE CHAIN. `deriveChatTitle` (authored title → present cast → "Untitled chat")
// is the client's single home for that rule, and `rowQualifiers` disambiguates the rooms that legitimately
// share a title — the same pairing the regex roster and the chats list use.

import type { VisibleRoomRef } from "@orb/contracts/chat";
import type { CharacterId, ChatId, DocumentId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, MessagesSquare, Users } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { deriveChatTitle, rowQualifiers, timeLib } from "#lib";
import { selectCharacter, selectChat, setActiveSection } from "#state";

/**
 * Read-only provenance: WHERE this document is switched on, and a way into each of them.
 *
 * Non-suspending — the panel's own two reads already resolved, and a slow junction read must not blank the
 * Everywhere toggle above it.
 */
export function ActiveInSection({ documentId }: { readonly documentId: DocumentId }): ReactElement {
  const trpc = useTRPC();
  const attachments = useQuery(trpc.databank.listAttachments.queryOptions({ id: documentId }));

  const rooms = attachments.data?.chats ?? [];
  const characters = attachments.data?.characters ?? [];
  const everywhere = attachments.data?.global === true;
  const nowhere = !everywhere && rooms.length === 0 && characters.length === 0;

  return (
    <Section kicker="Active in">
      {attachments.isPending ? (
        <Text voice="gloss">Checking…</Text>
      ) : (
        <Stack gap="row">
          {everywhere ? (
            <Row>
              <Badge intent="success" size="sm" tone="soft">
                Every chat
              </Badge>
            </Row>
          ) : null}
          <RoomDoors rooms={rooms} />
          <Stack gap="tight">
            {characters.map((character) => (
              <CharacterDoor id={character.id} key={character.id} name={character.name} />
            ))}
          </Stack>
          {/* Never render nothing: "no attachments" is a real, common state and a blank block reads as a
              failed load (empty states are load-bearing). */}
          {nowhere ? <Text voice="gloss">Nowhere yet — it only feeds chats you attach it to.</Text> : null}
        </Stack>
      )}
    </Section>
  );
}

/** The rooms, named by the ONE chain and stamped only where two of them would otherwise read alike. Split
 *  out because `rowQualifiers` runs over the WHOLE set — a per-row component could not see its siblings. */
function RoomDoors({ rooms }: { readonly rooms: readonly VisibleRoomRef[] }): ReactElement {
  const stamps = rowQualifiers(
    rooms.map((room) => ({ name: deriveChatTitle(room.title, room.participantNames), at: room.at })),
    timeLib.formatRelativeCompact,
    timeLib.formatDateTime,
  );
  return (
    <Stack gap="tight">
      {rooms.map((room, index) => (
        <RoomDoor key={room.id} room={room} stamp={stamps[index] ?? ""} />
      ))}
    </Stack>
  );
}

/** One room, as the door it is. The stamp is `shrink-0` and the title takes the squeeze — this is the
 *  320px CONTEXT rail, so the datum that must never wrap is the short one. */
function RoomDoor({ room, stamp }: { readonly room: VisibleRoomRef; readonly stamp: string }): ReactElement {
  const title = deriveChatTitle(room.title, room.participantNames);
  return (
    <Button className="w-full justify-start" intent="ghost" onClick={(): void => openChat(room.id)} size="sm" type="button">
      <Icon icon={MessagesSquare} size="xs" />
      <Text as="span" className="min-w-0 truncate" voice="label">
        {title}
      </Text>
      <Text as="span" className="shrink-0" voice="datum">
        {stamp}
      </Text>
    </Button>
  );
}

/** One character card that carries this document — its name is its own, so there is no chain to run. */
function CharacterDoor({ id, name }: { readonly id: CharacterId; readonly name: string }): ReactElement {
  return (
    <Button className="w-full justify-start" intent="ghost" onClick={(): void => openCharacter(id)} size="sm" type="button">
      <Icon icon={Users} size="xs" />
      <Text as="span" className="min-w-0 truncate" voice="label">
        {name}
      </Text>
    </Button>
  );
}

/** Open the room this document feeds — section first, then the room, so CONTENT is already showing chats
 *  when the active chat changes (`notification-bell.tsx` / the corpus omnibox spell it identically). */
function openChat(chatId: ChatId): void {
  setActiveSection("chats");
  selectChat(chatId);
}

/** Open the card that carries this document — the same two writes one section over, through the SAME store
 *  action a library-row click calls. */
function openCharacter(characterId: CharacterId): void {
  setActiveSection("characters");
  selectCharacter(characterId);
}
