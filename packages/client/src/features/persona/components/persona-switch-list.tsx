// The switcher's ROWS: avatar · name · ✓ · 📌 · 🔗 · 👑 · Edit · ⋯. With a room open the row body is ONE
// stretched button that switches who you play there; with no room open a row is not a switch (nothing would
// read it until the default was cleared), so it carries only the crown and the Edit door. The glyph order
// never changes, so a row's width is the same at rest and on hover. At a coarse pointer the faint toggles and
// Edit stand down into ONE actions menu per row; pressed toggles and the state glyphs stay visible.
//
// Two personas may share a name, so the list resolves qualifiers with the whole list in hand and every named
// control embeds the row's SUBJECT — spent only on collision (#443/#458).

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Icon, Pencil } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { PopoverClose } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { KeyboardEvent, ReactElement } from "react";
import { useState } from "react";
import { HIDE_AT_COARSE, PIN_REVEAL, ROW_ACTION_OVERFLOW, RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { cn, rowActionSubject, rowQualifiers, timeLib } from "#lib";
import type { ChromePresentation } from "#state";
import { closeModal, openPersonaEditor } from "#state";
import { PersonaCardPin } from "./persona-card-pin.tsx";
import { PersonaCrown } from "./persona-crown.tsx";
import { ConnectedGlyph, PlayingGlyph } from "./persona-state-markers.tsx";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

/** What a row knows about the open room. Absent ⇒ no room is open. */
export interface SwitchRoom {
  /** The viewer's seat persona — the ✓ row. */
  readonly seatId: string | null;
  /** The card's pin — the pressed 📌 row. */
  readonly cardPinId: string | null;
  readonly viewerIsHost: boolean;
  /** The room's one character and the viewer's personas connected to it; `null` unless exactly one character sits. */
  readonly connected: { readonly characterName: string; readonly personaIds: ReadonlySet<string> } | null;
  /** True when preset text follows the viewer's seat (ADR 0250). */
  readonly seatBindsPresets: boolean;
  readonly onSwitch: (persona: PersonaListItem) => void;
  readonly onCardPin: (persona: Pick<PersonaListItem, "id" | "name"> | null) => void;
}

export interface PersonaSwitchListProps {
  readonly personas: readonly PersonaListItem[];
  readonly defaultId: string | null;
  readonly room: SwitchRoom | null;
  readonly onSetDefault: (persona: PersonaListItem) => void;
  readonly onClearDefault: () => void;
  /** Which lens hosts the rows: Edit dismisses the popover (bar) or the You modal (sheet) before it lands. */
  readonly presentation: ChromePresentation;
}

/** Arrow-key targets for the roving list: the row index a key lands on, given where focus is and how many rows. */
function rovingTarget(key: string, at: number, count: number): number | undefined {
  switch (key) {
    case "ArrowDown":
      return Math.min(at + 1, count - 1);
    case "ArrowUp":
      return Math.max(at - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return;
  }
}

export function PersonaSwitchList({ personas, defaultId, room, onSetDefault, onClearDefault, presentation }: PersonaSwitchListProps): ReactElement {
  const nameCounts = new Map<string, number>();
  for (const persona of personas) {
    nameCounts.set(persona.name, (nameCounts.get(persona.name) ?? 0) + 1);
  }
  const qualifiers = rowQualifiers(
    personas.map((persona) => ({ name: persona.name, at: persona.updatedAt })),
    timeLib.formatRelative,
    timeLib.formatDateTime,
  );

  // ONE TAB STOP in a room (APG composite shape): only the row that last held focus (first load: the playing
  // row) keeps its controls in the tab order; ArrowUp/ArrowDown/Home/End move between the rows' switch buttons.
  // With no room there are no switch buttons, so every row's controls keep their own tab stops.
  const [activeId, setActiveId] = useState<string | null>(null);
  const stopId = personas.some((persona) => persona.id === activeId)
    ? activeId
    : (personas.find((persona) => persona.id === room?.seatId)?.id ?? personas[0]?.id);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-switch-row-button]")];
    const at = rows.indexOf(event.target as HTMLElement);
    const to = rovingTarget(event.key, at, rows.length);
    if (at === -1 || to === undefined) {
      return;
    }
    event.preventDefault();
    rows[to]?.focus();
  };

  return (
    <Stack gap="field" onKeyDown={onKeyDown}>
      {personas.map((persona, index) => (
        <SwitchRow
          key={persona.id}
          isDefault={persona.id === defaultId}
          onClearDefault={onClearDefault}
          onFocusRow={(): void => setActiveId(persona.id)}
          onSetDefault={(): void => onSetDefault(persona)}
          persona={persona}
          presentation={presentation}
          room={room}
          subject={rowActionSubject(persona.name, (nameCounts.get(persona.name) ?? 0) > 1 ? (qualifiers[index] ?? "") : undefined)}
          tabIndex={room === null || persona.id === stopId ? undefined : -1}
        />
      ))}
    </Stack>
  );
}

function SwitchRow({
  persona,
  subject,
  room,
  isDefault,
  tabIndex,
  onFocusRow,
  onSetDefault,
  onClearDefault,
  presentation,
}: {
  readonly persona: PersonaListItem;
  readonly subject: string;
  readonly room: SwitchRoom | null;
  readonly isDefault: boolean;
  readonly tabIndex: -1 | undefined;
  readonly onFocusRow: () => void;
  readonly onSetDefault: () => void;
  readonly onClearDefault: () => void;
  readonly presentation: ChromePresentation;
}): ReactElement {
  const avatarSrc = persona.avatarHash === null ? {} : { src: blobUrl(persona.avatarHash) };
  const tabProps = tabIndex === undefined ? {} : { tabIndex };
  const isPlaying = room !== null && persona.id === room.seatId;
  return (
    <Row
      align="center"
      onFocus={onFocusRow}
      className={room === null ? STATIC_ROW : SWITCH_ROW}
      data-selected={isPlaying ? "" : undefined}
      gap="row"
      padding="field"
    >
      {room === null ? null : <SwitchButton isPlaying={isPlaying} onSwitch={(): void => room.onSwitch(persona)} subject={subject} tabIndex={tabIndex} />}
      {/* Ornament over the stretched button (`relative` paints it above the button's hover fill). */}
      <Avatar className="pointer-events-none relative shrink-0" fallbackDelay={0} hueSeed={persona.id} size="sm" {...avatarSrc}>
        {initialsFor(persona.name)}
      </Avatar>
      <Text as="span" className="pointer-events-none relative min-w-0 flex-1 truncate" voice="label">
        {persona.name}
      </Text>
      {room === null ? null : <RoomGlyphs persona={persona} room={room} subject={subject} tabIndex={tabIndex} />}
      <PersonaCrown isDefault={isDefault} onClear={onClearDefault} onSet={onSetDefault} subject={subject} {...tabProps} />
      <EditDoor personaId={persona.id} presentation={presentation} subject={subject} tabIndex={tabIndex} />
      <Row align="center" className={cn("relative shrink-0", ROW_ACTION_OVERFLOW) ?? ""}>
        <RowActionsMenu label={`Actions for ${subject}`} {...(tabIndex === undefined ? {} : { triggerTabIndex: tabIndex })}>
          {presentation === "bar" ? (
            <PopoverClose render={<MenuItem onClick={(): void => openPersonaEditor(persona.id)}>Edit</MenuItem>} />
          ) : (
            <MenuItem onClick={(): void => openEditor(persona.id, presentation)}>Edit</MenuItem>
          )}
          {isDefault ? <MenuItem onClick={onClearDefault}>Clear default</MenuItem> : <MenuItem onClick={onSetDefault}>Set as default</MenuItem>}
          {room?.viewerIsHost === true ? <CardPinMenuItem persona={persona} room={room} /> : null}
        </RowActionsMenu>
      </Row>
    </Row>
  );
}

const STATIC_ROW = "group relative min-h-(--size-control-md) rounded-control";
const SWITCH_ROW = `${STATIC_ROW} transition-colors duration-(--motion-fast) ease-out-expo hover:not-data-selected:bg-accent/50 data-selected:bg-accent`;

/** The row body in a room: one stretched button that switches. The playing row's name says so instead of
 *  offering a no-op verb (§13.10 N3/N4). */
function SwitchButton({
  isPlaying,
  subject,
  onSwitch,
  tabIndex,
}: {
  readonly isPlaying: boolean;
  readonly subject: string;
  readonly onSwitch: () => void;
  readonly tabIndex: -1 | undefined;
}): ReactElement {
  return (
    <Button
      aria-current={isPlaying ? "true" : undefined}
      aria-label={isPlaying ? `${subject} — current persona` : `Switch to ${subject}`}
      className="absolute inset-0 rounded-control"
      data-switch-row-button=""
      intent="ghost"
      onClick={onSwitch}
      {...(tabIndex === undefined ? {} : { tabIndex })}
    />
  );
}

/** ✓ 📌 🔗 — the room's three per-row facts, in their fixed order. */
function RoomGlyphs({
  persona,
  room,
  subject,
  tabIndex,
}: {
  readonly persona: PersonaListItem;
  readonly room: SwitchRoom;
  readonly subject: string;
  readonly tabIndex: -1 | undefined;
}): ReactElement {
  return (
    <>
      {persona.id === room.seatId ? <PlayingGlyph seatBindsPresets={room.seatBindsPresets} /> : null}
      <PersonaCardPin
        isHost={room.viewerIsHost}
        isPinned={persona.id === room.cardPinId}
        name={persona.name}
        onPin={(): void => room.onCardPin(persona)}
        onUnpin={(): void => room.onCardPin(null)}
        subject={subject}
        {...(tabIndex === undefined ? {} : { tabIndex })}
      />
      {room.connected?.personaIds.has(persona.id) === true ? <ConnectedGlyph characterName={room.connected.characterName} /> : null}
    </>
  );
}

/** The coarse-pointer twin of the host's 📌 toggle. */
function CardPinMenuItem({ persona, room }: { readonly persona: PersonaListItem; readonly room: SwitchRoom }): ReactElement {
  return persona.id === room.cardPinId ? (
    <MenuItem onClick={(): void => room.onCardPin(null)}>Unpin card</MenuItem>
  ) : (
    <MenuItem onClick={(): void => room.onCardPin(persona)}>Pin card here</MenuItem>
  );
}

function openEditor(personaId: PersonaListItem["id"], presentation: ChromePresentation): void {
  openPersonaEditor(personaId);
  // The sheet rides the You MODAL; the bar lens closes through its wrapping PopoverClose.
  if (presentation === "sheet") {
    closeModal();
  }
}

/** The row's door into its editor in Settings → Personas — the same landing a tag's persona chip uses. */
function EditDoor({
  personaId,
  subject,
  presentation,
  tabIndex,
}: {
  readonly personaId: PersonaListItem["id"];
  readonly subject: string;
  readonly presentation: ChromePresentation;
  readonly tabIndex: -1 | undefined;
}): ReactElement {
  const label = `Edit ${subject}`;
  const door = (
    <Button
      aria-label={label}
      className={cn(PIN_REVEAL, HIDE_AT_COARSE, "relative shrink-0") ?? ""}
      intent="ghost"
      onClick={(): void => openEditor(personaId, presentation)}
      size="icon"
      {...(tabIndex === undefined ? {} : { tabIndex })}
    >
      <Icon icon={Pencil} size="sm" />
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger render={presentation === "bar" ? <PopoverClose render={door} /> : door} />
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}
