// The persona SWITCHER — the PLAY surface (Settings → Personas is the MANAGE surface). ONE widget, TWO lenses:
// `presentation:"bar"` is the desktop rail avatar chip + popover; `presentation:"sheet"` inlines the same stack
// into the mobile You sheet. Top to bottom: the WHO-HEAD (who you play, and their description), the ROWS
// (switch with a room open; the crown and Edit always), the ROOM block while a room is open (the card pin's
// line, the host's re-pin, Restamp), and the door to Settings. All server state via trpc.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { CircleUser, Icon, SlidersHorizontal } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverClose, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import type { Trpc } from "#data";
import { useGatedQuery, useTRPC } from "#data";
import type { ChromePresentation } from "#state";
import { closeModal, openConfigTo } from "#state";
import { PersonaAccountFoot } from "../components/persona-account-foot.tsx";
import { PersonaRoomBlock } from "../components/persona-room-block.tsx";
import type { SwitchRoom } from "../components/persona-switch-list.tsx";
import { PersonaSwitchList } from "../components/persona-switch-list.tsx";
import type { PlayingPersonaState } from "../hooks/use-playing-persona.ts";
import { useCardPin, useDefaultPersona, usePlayingPersona, useSwitchPersona } from "../hooks/use-playing-persona.ts";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];
type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;

const LOAD_ERROR_LABEL = "Couldn't load your personas";

export interface PersonaPanelSurfaceProps {
  readonly presentation: ChromePresentation;
}

/** The Identity widget's render, keyed to the lens `personaChrome.body(presentation)` asks for. */
export function PersonaPanelSurface({ presentation }: PersonaPanelSurfaceProps): ReactElement {
  return (
    // DELIBERATELY UNRESERVED (#1098): both lenses are floating bodies, so nothing in page flow sits below
    // this to shift. The quiet fixed Avatar is the considered wait, and it never resizes.
    <QueryBoundary
      fallback={
        <Avatar fallbackDelay={0} size="md">
          <Icon icon={CircleUser} size="md" />
        </Avatar>
      }
      renderError={(): ReactElement => (
        <Tooltip>
          <TooltipTrigger
            render={
              <Text as="span" aria-label={LOAD_ERROR_LABEL} role="img">
                <Avatar fallbackDelay={0} size="md">
                  <Icon icon={CircleUser} size="md" />
                </Avatar>
              </Text>
            }
          />
          <TooltipPopup side="right">{LOAD_ERROR_LABEL}</TooltipPopup>
        </Tooltip>
      )}
    >
      <PanelBody presentation={presentation} />
    </QueryBoundary>
  );
}

function PanelBody({ presentation }: PersonaPanelSurfaceProps): ReactElement {
  const state = usePlayingPersona();
  const { personas, seeds, playing, chat } = state;
  const crown = useDefaultPersona(state.notifyOnChange);
  const room = useSwitchRoom(state);

  const sections: ReactNode = (
    <Stack gap="row">
      <WhoHead state={state} />
      <Separator />
      <Stack gap="field">
        <Text voice="kicker">{chat === null ? "Your personas" : "Switch persona"}</Text>
        <PersonaSwitchList
          defaultId={seeds.defaultPersonaId}
          onClearDefault={crown.clear}
          onSetDefault={crown.set}
          personas={personas}
          presentation={presentation}
          room={room}
        />
      </Stack>
      {chat === null || room === null ? null : <PersonaRoomBlock chat={chat} onCardPin={room.onCardPin} personas={personas} />}
      <ManageDoor presentation={presentation} />
      <Separator />
      <PersonaAccountFoot />
    </Stack>
  );

  if (presentation === "sheet") {
    return sections;
  }
  return (
    <Popover>
      <PanelTrigger current={playing} />
      {/* aria-label names the popup dialog: it has no visible title element (the body opens with the head). */}
      <PopoverPopup
        aria-label="Account & personas"
        align="end"
        className="relative max-h-(--available-height) w-(--container-cq-sm) overflow-y-auto overscroll-contain"
        side="right"
      >
        <Container size="md">{sections}</Container>
      </PopoverPopup>
    </Popover>
  );
}

/** The room facts the rows read, or `null` with no room open (rows are then not switches). */
function useSwitchRoom(state: PlayingPersonaState): SwitchRoom | null {
  const onSwitch = useSwitchPersona(state);
  const onCardPin = useCardPin(state);
  const connected = useConnectedToRoomCharacter(state.chat);
  const { chat, seatBindsPresets } = state;
  if (chat === null) {
    return null;
  }
  return {
    seatId: chat.viewerActivePersonaId,
    cardPinId: chat.anchorPersonaId,
    viewerIsHost: chat.viewerIsHost,
    connected,
    seatBindsPresets,
    onSwitch,
    onCardPin,
  };
}

/** The viewer's personas connected to the room's one character — only when exactly one character sits and
 *  the viewer owns it (connections are made against your own cards). */
function useConnectedToRoomCharacter(chat: ChatDetail | null): SwitchRoom["connected"] {
  const trpc = useTRPC();
  const characters = chat?.participants.filter((p) => p.kind === "character") ?? [];
  const only = characters.length === 1 ? characters[0] : undefined;
  const characterId: CharacterId | null =
    only?.characterId !== undefined && only.characterId !== null && chat?.viewerOwnedCharacterIds.includes(only.characterId) === true ? only.characterId : null;
  const { data } = useGatedQuery(characterId, (id) => trpc.persona.listConnectedToCharacter.queryOptions({ characterId: id }));
  if (only === undefined || data === undefined) {
    return null;
  }
  return { characterName: only.displayName, personaIds: new Set(data.map((persona) => persona.id)) };
}

/** The rail avatar button that opens the panel — shows the persona playing now. */
function PanelTrigger({ current }: { readonly current: PersonaListItem | null }): ReactElement {
  const avatarSrc = current === null || current.avatarHash === null ? {} : { src: blobUrl(current.avatarHash) };
  const label = current === null ? "Account & personas" : `Playing as ${current.name}`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <PopoverTrigger
            render={
              <Button intent="ghost" size="icon" aria-label={label}>
                <Avatar fallbackDelay={0} hueSeed={current?.id ?? "none"} size="md" {...avatarSrc}>
                  {current === null ? <Icon icon={CircleUser} size="md" /> : initialsFor(current.name)}
                </Avatar>
              </Button>
            }
          />
        }
      />
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}

function headGloss(state: PlayingPersonaState): string {
  if (state.chat !== null) {
    return state.playing === null ? "No persona set — pick one below." : "Playing as";
  }
  return state.newChat?.source === "default" ? "New chats start as (your default)" : "New chats start as (last played)";
}

/** WHO you play: in a room the seat (an empty seat says so rather than borrowing a persona the room never
 *  stamps); with no room, who a new chat starts you as. Below it, that persona's description, read-only. */
function WhoHead({ state }: { readonly state: PlayingPersonaState }): ReactElement {
  const current = state.playing;
  const avatarSrc = current === null || current.avatarHash === null ? {} : { src: blobUrl(current.avatarHash) };
  return (
    <Stack gap="field" data-slot="persona-who-head">
      <Row gap="row" align="center" className="min-w-0">
        <Avatar fallbackDelay={0} hueSeed={current?.id ?? "none"} size="md" {...avatarSrc}>
          {current === null ? <Icon icon={CircleUser} size="md" /> : initialsFor(current.name)}
        </Avatar>
        <Stack className="min-w-0 flex-1">
          <Text className="truncate" voice="label">
            {current?.name ?? "No persona set"}
          </Text>
          <Text className="truncate" voice="gloss">
            {headGloss(state)}
          </Text>
        </Stack>
      </Row>
      {current === null || current.description.trim() === "" ? null : <ClampedDescription key={current.id} text={current.description} />}
    </Stack>
  );
}

/** Three lines of the description, with "More" only when the text is actually clamped. */
function ClampedDescription({ text }: { readonly text: string }): ReactElement {
  const [clamped, setClamped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Measured on the clamped paint only: expanded, the text always fits and More must stay to collapse it.
  const measure = (node: HTMLParagraphElement | null): void => {
    if (node !== null && !expanded) {
      setClamped(node.scrollHeight > node.clientHeight);
    }
  };
  return (
    <Stack gap="field" align="start">
      <Text className={expanded ? "whitespace-pre-wrap" : "line-clamp-3 whitespace-pre-wrap"} data-slot="persona-who-description" ref={measure} voice="gloss">
        {text}
      </Text>
      {clamped ? (
        <Button aria-expanded={expanded} intent="ghost" onClick={(): void => setExpanded(!expanded)} size="sm">
          {expanded ? "Less" : "More"}
        </Button>
      ) : null}
    </Stack>
  );
}

/** The one door out to the full list — Settings → Personas (management is not a switch). */
function ManageDoor({ presentation }: { readonly presentation: ChromePresentation }): ReactElement {
  const door = (
    <Button
      className="justify-start"
      intent="ghost"
      size="sm"
      onClick={(): void => {
        openConfigTo("personas");
        // The sheet lens rides the You MODAL — a section navigation under it must also dismiss it.
        if (presentation === "sheet") {
          closeModal();
        }
      }}
    >
      <Icon icon={SlidersHorizontal} size="sm" />
      Manage personas in Settings
    </Button>
  );
  return presentation === "bar" ? <PopoverClose render={door} /> : door;
}
