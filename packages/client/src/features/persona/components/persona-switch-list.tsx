// The switcher's SWITCH ROWS (#866 S4 — the rail persona slot's frequency law: only what travels with a
// switch). Lean radio-style rows: avatar · name · edit · pin — NO rename, NO avatar upload, NO kebab,
// NO inline editor (all of that lives in Config → Personas now; Edit is the door into it). The
// row body is ONE stretched button that switches under the caller's SCOPE (Everywhere = the seed pointer,
// This chat = the per-participant slot — the parent owns the routing); the pin is the one layered sibling.
//
// The #443/#458 grammar carries over: two personas may share a name, so the surface resolves qualifiers
// with the whole list in hand and every named control embeds the row's SUBJECT — spent only on collision,
// exactly the list's "spent, not sprayed" arm (a switcher row shows no timestamp either).

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Check, Icon, IdCard, Pencil } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { PopoverClose } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { PIN_REVEAL } from "#components";
import type { Trpc } from "#data";
import { cn, rowActionSubject, rowQualifiers, timeLib } from "#lib";
import type { ChromePresentation } from "#state";
import { closeModal, openPersonaEditor } from "#state";
import { PersonaPin } from "./persona-pin.tsx";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

export interface PersonaSwitchListProps {
  readonly personas: readonly PersonaListItem[];
  /** The row rendered as current — under a chat scope this is the CHAT's active persona, not the seed.
   *  Structurally string ids (the settings seed pointers and the chat read both project them unbranded);
   *  the rows only ever COMPARE against them. */
  readonly currentId: string | null;
  readonly defaultId: string | null;
  /** The persona pinned to THIS chat — the card's `{{user}}` — while a room is open; `null` otherwise. */
  readonly cardPinId: string | null;
  /** Switch to this persona under the caller's scope. Also fired for the marked row: the scope may write a
   *  different pointer than the one the mark reads, so the caller decides whether it is a no-op. */
  readonly onSwitch: (persona: PersonaListItem) => void;
  /** Write `seeds.defaultPersonaId` to this persona (the pin). */
  readonly onPin: (persona: PersonaListItem) => void;
  /** Which lens hosts the rows: Edit dismisses the popover (bar) or the You modal (sheet) before it lands. */
  readonly presentation: ChromePresentation;
}

/** The switch rows — qualifiers resolved once with the whole list in hand (#458). */
export function PersonaSwitchList({ personas, currentId, defaultId, cardPinId, onSwitch, onPin, presentation }: PersonaSwitchListProps): ReactElement {
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
          persona={persona}
          presentation={presentation}
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
  presentation,
}: {
  readonly persona: PersonaListItem;
  readonly subject: string;
  readonly isCardPin: boolean;
  readonly isCurrent: boolean;
  readonly isDefault: boolean;
  readonly onSwitch: () => void;
  readonly onPin: () => void;
  readonly presentation: ChromePresentation;
}): ReactElement {
  const avatarSrc = persona.avatarHash === null ? {} : { src: blobUrl(persona.avatarHash) };
  return (
    <Row
      align="center"
      className="group relative min-h-control-md rounded-control transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent data-selected:bg-accent"
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
      {/* Three states, one marker each: playing as (check), the chat's card pin (card), default (the pin). */}
      {isCurrent ? <RowMarker hint="Your lines and preset text use this persona." icon={Check} label="Playing as" /> : null}
      {isCardPin ? <RowMarker hint="{{user}} in this character's card" icon={IdCard} label="Pinned to this chat" /> : null}
      <EditDoor presentation={presentation} personaId={persona.id} subject={subject} />
      <PersonaPin className="relative shrink-0" isDefault={isDefault} onPin={onPin} subject={subject} toggle={true} />
    </Row>
  );
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
      className={cn(PIN_REVEAL, "relative shrink-0") ?? ""}
      intent="ghost"
      onClick={(): void => {
        openPersonaEditor(personaId);
        // The sheet rides the You MODAL; the bar lens closes through the wrapping PopoverClose.
        if (presentation === "sheet") {
          closeModal();
        }
      }}
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

/** A state glyph with its short tooltip. Not a control: the row's one button already switches. */
function RowMarker({ icon, label, hint }: { readonly icon: LucideIcon; readonly label: string; readonly hint: string }): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Text as="span" aria-label={label} className="relative shrink-0 text-muted-foreground" role="img">
            <Icon icon={icon} size="sm" />
          </Text>
        }
      />
      <TooltipPopup side="top">{hint}</TooltipPopup>
    </Tooltip>
  );
}
