// The Identity (persona) chrome widget's render — the rail SWITCHER (#866 S4, the frequency law: the rail
// slot carries only what travels with a switch). ONE widget, TWO lenses:
// `presentation:"bar"` is the desktop rail.end avatar chip + popover; `presentation:"sheet"` inlines the
// same grammar into the mobile You sheet. Both render: the WHO-HEAD (who you are playing as) → the SWITCH rows
// (`PersonaSwitchList` — radio-style, with the inline edit door and pin) → the CONTEXTUAL block while a chat room is open: an Applies scope (`Everywhere | This chat`) — a switch in
// a room always moves the seat, Everywhere also moves the global pointer — plus the restamp escape hatch —
// and the "Manage personas" door into Config (list editing, import/export, lore books and the anchor
// re-pin all live THERE now, not here). All server state via trpc, zero Zustand beyond the shell doors.

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { CircleUser, Icon, SlidersHorizontal } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverClose, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import type { Trpc } from "#data";
import { deriveChatTitle } from "#lib";
import type { ChromePresentation } from "#state";
import { closeModal, openConfigTo } from "#state";
import { PersonaAccountFoot } from "../components/persona-account-foot.tsx";
import { PersonaSwitchList } from "../components/persona-switch-list.tsx";
import { ChatAnchorRow, ChatRestamp } from "../components/persona-this-chat-section.tsx";
import { useDefaultPin, usePlayingPersona, useSwitchPersona } from "../hooks/use-playing-persona.ts";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];
type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;

type SwitchScope = Parameters<typeof useSwitchPersona>[1];

const SCOPE_ITEMS: SelectItems<SwitchScope> = [
  { label: "Everywhere", value: "everywhere" },
  { label: "This chat", value: "chat" },
];

/** The room's name in the kicker. HOOK: the participant-first room title (the chat header's helper) replaces
 *  this one call when it lands on main. */
function roomLabel(chat: ChatDetail): string {
  return deriveChatTitle(
    chat.title,
    chat.participants.filter((p) => p.kind === "character").map((p) => p.displayName),
  );
}

export interface PersonaPanelSurfaceProps {
  readonly presentation: ChromePresentation;
}

/** The Identity widget's render, keyed to the lens `personaChrome.body(presentation)` asks for. */
export function PersonaPanelSurface({ presentation }: PersonaPanelSurfaceProps): ReactElement {
  return (
    // DELIBERATELY UNRESERVED (#1098). Both lenses are FLOATING bodies — a rail popover and a mobile
    // sheet — so nothing in page flow sits below this to shift, which is the whole point of a reserved
    // box. Reserving would instead inflate the popover to a remembered height before its content exists
    // and hand the positioner a phantom box to place against. The quiet fixed Avatar shared by the
    // pending AND error arms is the considered wait here, and it already never resizes.
    <QueryBoundary
      fallback={
        <Avatar fallbackDelay={0} size="md">
          <Icon icon={CircleUser} size="md" />
        </Avatar>
      }
      renderError={(): ReactElement => (
        <Avatar fallbackDelay={0} size="md">
          <Icon icon={CircleUser} size="md" />
        </Avatar>
      )}
    >
      <PanelBody presentation={presentation} />
    </QueryBoundary>
  );
}

function PanelBody({ presentation }: PersonaPanelSurfaceProps): ReactElement {
  // Who is playing, read ONCE for the chip, the head, the rows and (via the hook) the Settings list: a room's
  // SEAT when one is open on either lens, else the global pointer.
  const state = usePlayingPersona();
  const { personas, seeds, playing, chat, seatBindsPresets } = state;

  // Applies only picks what the next switch writes: inside a room a switch always moves the seat, and
  // "Everywhere" also writes the global pointer.
  const [pickedScope, setPickedScope] = useState<SwitchScope>("everywhere");
  const onSwitch = useSwitchPersona(state, pickedScope);
  const defaultPin = useDefaultPin(state);

  const sections: ReactNode = (
    <Stack gap="row">
      <WhoHead current={playing} roomSeatEmpty={chat !== null && playing === null} />
      <Separator />
      <Stack gap="field">
        <Text voice="kicker">Switch persona</Text>
        <PersonaSwitchList
          cardPinId={chat?.anchorPersonaId ?? null}
          currentId={playing?.id ?? null}
          defaultId={seeds.defaultPersonaId}
          onPin={(persona): void => defaultPin.pin(persona.id)}
          onSwitch={onSwitch}
          onUnpin={defaultPin.clear}
          personas={personas}
          presentation={presentation}
          seatBindsPresets={seatBindsPresets}
        />
      </Stack>
      {chat === null ? null : <ChatScopeBlock chat={chat} onScopeChange={setPickedScope} personas={personas} scope={pickedScope} />}
      <ManageDoor presentation={presentation} />
      <Separator />
      <PersonaAccountFoot />
    </Stack>
  );

  // The sheet lens: the same grammar inline in the You bottom sheet (no popover, no trigger) — the
  // drawer provides the containment, so this is the mobile persona switcher.
  if (presentation === "sheet") {
    return sections;
  }

  // The bar lens: the desktop rail.end avatar chip, opening the switcher in a side popover.
  return (
    <Popover>
      <PanelTrigger current={playing} />
      {/* max-h-(--available-height) caps the whole panel to the viewport, not just a nested list peephole. */}
      {/* aria-label names the popup dialog — it has no visible title element (the body opens with the
          who-head), so a bare role=dialog would be nameless to AT. */}
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

/** The rail avatar button that opens the panel — shows the persona playing now (the head's own value). */
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

function headGloss(current: PersonaListItem | null, roomSeatEmpty: boolean): string {
  if (current !== null) {
    return "Playing as";
  }
  return roomSeatEmpty ? "None is playing in this room. Pick one below." : "Create one under Manage personas.";
}

/** WHO you are playing as — the board's head strip. An empty room seat says so rather than borrowing a
 *  persona the room never stamps. */
function WhoHead({ current, roomSeatEmpty }: { readonly current: PersonaListItem | null; readonly roomSeatEmpty: boolean }): ReactElement {
  const avatarSrc = current === null || current.avatarHash === null ? {} : { src: blobUrl(current.avatarHash) };
  return (
    <Row gap="row" align="center" className="min-w-0" data-slot="persona-who-head">
      <Avatar fallbackDelay={0} hueSeed={current?.id ?? "none"} size="md" {...avatarSrc}>
        {current === null ? <Icon icon={CircleUser} size="md" /> : initialsFor(current.name)}
      </Avatar>
      <Stack className="min-w-0 flex-1">
        <Text className="truncate" voice="label">
          {current?.name ?? (roomSeatEmpty ? "No persona set" : "No persona yet")}
        </Text>
        <Text className="truncate" voice="gloss">
          {headGloss(current, roomSeatEmpty)}
        </Text>
      </Stack>
    </Row>
  );
}

/** The contextual in-chat block (a room is open, either lens): the card persona when it has no row here,
 *  where "Everywhere" reaches, and the restamp. */
function ChatScopeBlock({
  chat,
  personas,
  scope,
  onScopeChange,
}: {
  readonly chat: ChatDetail;
  readonly personas: readonly PersonaListItem[];
  readonly scope: SwitchScope;
  readonly onScopeChange: (scope: SwitchScope) => void;
}): ReactElement {
  return (
    <Stack gap="field" data-slot="persona-chat-scope">
      <Text className="truncate" voice="kicker">
        In {roomLabel(chat)}
      </Text>
      {/* The card persona lands on one of YOUR rows when it is yours; a member's persona has no row here, so
          the room line says it (and the host's re-pin) instead. */}
      {chat.anchorPersonaId !== null && !personas.some((p) => p.id === chat.anchorPersonaId) ? <ChatAnchorRow chat={chat} personas={personas} /> : null}
      <Row gap="row" align="center" className="justify-between">
        <Text voice="label">Applies to</Text>
        <Select<SwitchScope>
          aria-label="Where the next switch applies"
          items={SCOPE_ITEMS}
          layout="inline"
          onValueChange={(picked): void => onScopeChange(picked ?? "everywhere")}
          value={scope}
        />
      </Row>
      <ChatRestamp chat={chat} personas={personas} />
    </Stack>
  );
}

/** The one door out to the full list — Config → Personas (frequency law: management is not a switch). */
function ManageDoor({ presentation }: { readonly presentation: ChromePresentation }): ReactElement {
  const door = (
    <Button
      className="justify-start"
      intent="ghost"
      size="sm"
      onClick={(): void => {
        openConfigTo("personas");
        // The sheet lens rides the You MODAL — a section navigation under it must also dismiss it (the
        // you-sheet's own door pattern). The bar lens closes via the wrapping PopoverClose.
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
