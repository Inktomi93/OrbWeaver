// The switcher's SWITCH ROWS (#866 S4 — the rail persona slot's frequency law: only what travels with a
// switch). Lean radio-style rows: avatar · name · state markers · pin · edit — NO rename, NO avatar upload,
// NO inline editor (all of that lives in Config → Personas now; Edit is the door into it). The row body is
// ONE stretched button that switches; the markers, the pin and Edit are the layered siblings. At a coarse
// pointer the pin (unpressed) and Edit stand down into ONE actions menu per row, so an uninvolved row wears
// no faint glyphs; the markers and the pressed pin stay as state.
//
// The #443/#458 grammar carries over: two personas may share a name, so the surface resolves qualifiers
// with the whole list in hand and every named control embeds the row's SUBJECT — spent only on collision,
// exactly the list's "spent, not sprayed" arm (a switcher row shows no timestamp either).

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
import type { ReactElement } from "react";
import { HIDE_AT_COARSE, PIN_REVEAL, ROW_ACTION_OVERFLOW, RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { cn, rowActionSubject, rowQualifiers, timeLib } from "#lib";
import type { ChromePresentation } from "#state";
import { closeModal, openPersonaEditor } from "#state";
import { PersonaPin } from "./persona-pin.tsx";
import { PersonaStateMarkers } from "./persona-state-markers.tsx";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

export interface PersonaSwitchListProps {
  readonly personas: readonly PersonaListItem[];
  /** The row playing now — the room seat when a room is open, else the global pointer. Structurally a
   *  string id (the settings pointers and the chat read both project them unbranded); rows only COMPARE. */
  readonly currentId: string | null;
  readonly defaultId: string | null;
  /** The persona pinned to THIS chat — the card's `{{user}}` — while a room is open; `null` otherwise. */
  readonly cardPinId: string | null;
  /** True when preset text follows the viewer's seat (no room, or the viewer is the anchor human, ADR 0250);
   *  otherwise the seat speaks only the viewer's own lines. */
  readonly seatBindsPresets: boolean;
  /** Switch to this persona. Also fired for the marked row — the caller skips a no-op write. */
  readonly onSwitch: (persona: PersonaListItem) => void;
  /** Write `seeds.defaultPersonaId` to this persona (the pin). */
  readonly onPin: (persona: PersonaListItem) => void;
  /** Clear `seeds.defaultPersonaId` (the pressed pin). */
  readonly onUnpin: () => void;
  /** Which lens hosts the rows: Edit dismisses the popover (bar) or the You modal (sheet) before it lands. */
  readonly presentation: ChromePresentation;
}

/** The switch rows — qualifiers resolved once with the whole list in hand (#458). */
export function PersonaSwitchList({
  personas,
  currentId,
  defaultId,
  cardPinId,
  seatBindsPresets,
  onSwitch,
  onPin,
  onUnpin,
  presentation,
}: PersonaSwitchListProps): ReactElement {
  const nameCounts = new Map<string, number>();
  for (const persona of personas) {
    nameCounts.set(persona.name, (nameCounts.get(persona.name) ?? 0) + 1);
  }
  const qualifiers = rowQualifiers(
    personas.map((persona) => ({ name: persona.name, at: persona.updatedAt })),
    timeLib.formatRelative,
    timeLib.formatDateTime,
  );

  return (
    <Stack gap="field">
      {personas.map((persona, index) => (
        <SwitchRow
          key={persona.id}
          isCardPin={persona.id === cardPinId}
          isCurrent={persona.id === currentId}
          isDefault={persona.id === defaultId}
          onPin={(): void => onPin(persona)}
          onSwitch={(): void => onSwitch(persona)}
          onUnpin={onUnpin}
          persona={persona}
          presentation={presentation}
          seatBindsPresets={seatBindsPresets}
          subject={rowActionSubject(persona.name, (nameCounts.get(persona.name) ?? 0) > 1 ? (qualifiers[index] ?? "") : undefined)}
        />
      ))}
    </Stack>
  );
}

/** One switch row. The current row's stretched button keeps the list's state-aware naming rule
 *  (§13.10 N3/N4): identity leads in both arms, the verb exists only where there is something to do. */
function SwitchRow({
  persona,
  subject,
  isCardPin,
  isCurrent,
  isDefault,
  onSwitch,
  onPin,
  onUnpin,
  presentation,
  seatBindsPresets,
}: {
  readonly persona: PersonaListItem;
  readonly subject: string;
  readonly isCardPin: boolean;
  readonly isCurrent: boolean;
  readonly isDefault: boolean;
  readonly onSwitch: () => void;
  readonly onPin: () => void;
  readonly onUnpin: () => void;
  readonly presentation: ChromePresentation;
  readonly seatBindsPresets: boolean;
}): ReactElement {
  const avatarSrc = persona.avatarHash === null ? {} : { src: blobUrl(persona.avatarHash) };
  return (
    <Row
      align="center"
      className="group relative min-h-control-md rounded-control transition-colors duration-(--motion-fast) ease-out-expo hover:not-data-selected:bg-accent/50 data-selected:bg-accent"
      data-selected={isCurrent ? "" : undefined}
      gap="row"
      padding="field"
    >
      <Button
        aria-current={isCurrent ? "true" : undefined}
        aria-label={isCurrent ? `${subject} — current persona` : `Switch to ${subject}`}
        className="absolute inset-0 rounded-control"
        intent="ghost"
        onClick={onSwitch}
      />
      {/* Ornament over the stretched button (`relative` paints it above the button's hover fill, so the name
          never disappears under it) — the row's one control already names the persona. */}
      <Avatar className="pointer-events-none relative shrink-0" fallbackDelay={0} hueSeed={persona.id} size="sm" {...avatarSrc}>
        {initialsFor(persona.name)}
      </Avatar>
      <Text as="span" className="pointer-events-none relative min-w-0 flex-1 truncate" voice="label">
        {persona.name}
      </Text>
      {/* Three states, one marker each: playing as (check), the chat's card persona (card), default (the pin). */}
      <PersonaStateMarkers isCardPin={isCardPin} isCurrent={isCurrent} name={persona.name} seatBindsPresets={seatBindsPresets} />
      <PersonaPin className="relative shrink-0" isDefault={isDefault} onPin={onPin} onUnpin={onUnpin} subject={subject} toggle={true} />
      <EditDoor personaId={persona.id} presentation={presentation} subject={subject} />
      <Row align="center" className={cn("relative shrink-0", ROW_ACTION_OVERFLOW) ?? ""}>
        <RowActionsMenu label={`Actions for ${subject}`}>
          {presentation === "bar" ? (
            <PopoverClose render={<MenuItem onClick={(): void => openPersonaEditor(persona.id)}>Edit</MenuItem>} />
          ) : (
            <MenuItem onClick={(): void => openEditor(persona.id, presentation)}>Edit</MenuItem>
          )}
          {isDefault ? <MenuItem onClick={onUnpin}>Clear default</MenuItem> : <MenuItem onClick={onPin}>Set as default</MenuItem>}
        </RowActionsMenu>
      </Row>
    </Row>
  );
}

function openEditor(personaId: PersonaListItem["id"], presentation: ChromePresentation): void {
  openPersonaEditor(personaId);
  // The sheet rides the You MODAL; the bar lens closes through its wrapping PopoverClose.
  if (presentation === "sheet") {
    closeModal();
  }
}

/** The row's door into its editor in Config → Personas — the same landing a tag's persona chip uses. */
function EditDoor({
  personaId,
  subject,
  presentation,
}: {
  readonly personaId: PersonaListItem["id"];
  readonly subject: string;
  readonly presentation: ChromePresentation;
}): ReactElement {
  const label = `Edit ${subject}`;
  const door = (
    <Button
      aria-label={label}
      className={cn(PIN_REVEAL, HIDE_AT_COARSE, "relative shrink-0") ?? ""}
      intent="ghost"
      onClick={(): void => openEditor(personaId, presentation)}
      size="icon"
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
