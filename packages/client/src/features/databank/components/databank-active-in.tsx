// The Databank CONTEXT panel's ACTIVE IN block — its server-confirmed scope plus owner-character controls.
//
// ── THE COUNT-VS-LIST FORK, AND WHY IT REOPENED (#276, 2026-08-19) ──────────────────────────────────
// This block shipped as two integer Badges, and `databank-context-body.tsx`'s header recorded the ruling
// behind them: chats carry no `ownerId` (D18) and `attachToChat` is host-gated, so a `chat_documents` row
// OUTLIVES the attacher's seat and naming rooms straight off that wire would tell an ex-host that a room
// they can no longer open still feeds on their document. That ruling is PRESERVED, not reversed — the same
// note said the list was "not refused, it is UNBUILT: it needs `listAttachments` to return names, which
// needs the leak-safe read chat already exposes to regex". That read is now shared
// (`entry/compose/visible-rooms.ts` → `@orb/contracts/chat`'s `ResolveVisibleRoomsOp`) and injected into
// databank, so the wire hands over PRESENT rooms only, already filtered. The names on this pane are
// therefore exactly the rooms the reader can still open.
//
// AN UNRESOLVABLE ROOM LEAVES NO RESIDUE. There is no "…and 2 rooms you're no longer in": that sentence is
// the same leak one integer smaller (it still tells an ex-member the room exists and still holds their
// document). The regex list's ruling — absent, not counted — is the one this matches, so the number the
// reader sees IS the number of rooms they can act on.
//
// A ROW IS A DOOR because there is somewhere to land. This is the difference from the regex CONTEXT pane,
// whose own header records "a list row is a NAME, not a link" — that pane's lists are presets and
// characters and rooms, and its rooms had no door because its rows are `openConfigTo` targets and a room
// is not a config collection. Databank's two scopes both have a real destination (`openChat` /
// `openCharacter`, the corpus omnibox's drill-door idiom, spelled section-then-selection exactly as the
// notification bell spells it), and a thing becomes a door when there is somewhere to land.
//
// THE ROOM IS NAMED BY THE ONE CHAIN. `deriveChatTitle` (authored title → present characters → "Untitled chat")
// is the client's single home for that rule, and `rowQualifiers` disambiguates the rooms that legitimately
// share a title — the same pairing the regex list and the chats list use.

import type { VisibleRoomRef } from "@orb/contracts/chat";
import type { ChatId, DocumentId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, MessagesSquare } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useSuspenseQuery, useTRPC } from "#data";
import { deriveChatTitle, rowQualifiers, timeLib } from "#lib";
import { selectChat, setActiveSection } from "#state";
import { CharacterAttachments } from "./databank-character-attachments.tsx";

/**
 * Server-confirmed provenance: WHERE this document is switched on, plus owner-character writes.
 *
 * The read suspends under the block's own boundary, so a slow junction read blanks only this block and never
 * the Everywhere toggle above it. "Nowhere yet" is a claim about the junction table, so a failed read shows
 * the shared error with a re-read and never that sentence.
 */
export function ActiveInSection({ documentId, documentName }: { readonly documentId: DocumentId; readonly documentName: string }): ReactElement {
  return (
    <Section kicker="Active in">
      <QueryBoundary
        resetKeys={[documentId]}
        fallback={<SkeletonRows count={2} shape="line" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="where this document is active" onRetry={retry} />}
      >
        <ActiveInBody documentId={documentId} documentName={documentName} />
      </QueryBoundary>
    </Section>
  );
}

function ActiveInBody({ documentId, documentName }: { readonly documentId: DocumentId; readonly documentName: string }): ReactElement {
  const trpc = useTRPC();
  const { data: attachments } = useSuspenseQuery(trpc.databank.listAttachments.queryOptions({ id: documentId }));
  const nowhere = !attachments.global && attachments.chats.length === 0 && attachments.characters.length === 0;

  return (
    <Stack gap="row">
      {attachments.global ? (
        <Row>
          <Badge tone="success" size="sm">
            Everywhere
          </Badge>
        </Row>
      ) : null}
      <RoomDoors rooms={attachments.chats} />
      <CharacterAttachments characters={attachments.characters} documentId={documentId} documentName={documentName} />
      {/* Never render nothing: "no attachments" is a real, common state and a blank block reads as a
          failed load. */}
      {nowhere ? <Text voice="gloss">Nowhere yet — attach it to one of your characters, or from a chat's Databank panel.</Text> : null}
    </Stack>
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
    <Button className="justify-start inline-full" variant="ghost" onClick={(): void => openChat(room.id)} size="sm" type="button">
      <Icon icon={MessagesSquare} size="xs" />
      <Text ink="inherit" as="span" truncate={true} voice="label">
        {title}
      </Text>
      <Text ink="inherit" as="span" className="shrink-0" voice="datum">
        {stamp}
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
