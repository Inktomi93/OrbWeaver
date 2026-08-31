// The switcher's SWITCH ROWS (#866 S4 — the rail persona slot's frequency law: only what travels with a
// switch). Lean radio-style rows: avatar · name · "playing" pill · the pin — NO rename, NO avatar upload,
// NO kebab, NO editor (all of that lives in Config → Personas now; `PersonaRoster` is that mount). The
// row body is ONE stretched button that switches under the caller's SCOPE (Everywhere = the seed pointer,
// This chat = the per-participant slot — the parent owns the routing); the pin is the one layered sibling.
//
// The #443/#458 grammar carries over: two personas may share a name, so the surface resolves qualifiers
// with the whole list in hand and every named control embeds the row's SUBJECT — spent only on collision,
// exactly the roster's "spent, not sprayed" arm (a switcher row shows no timestamp either).

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { rowActionSubject, rowQualifiers, timeLib } from "#lib";
import { PersonaPin } from "./persona-pin.tsx";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

export interface PersonaSwitchListProps {
  readonly personas: readonly PersonaListItem[];
  /** The row rendered as current — under a chat scope this is the CHAT's active persona, not the seed.
   *  Structurally string ids (the settings seed pointers and the chat read both project them unbranded);
   *  the rows only ever COMPARE against them. */
  readonly currentId: string | null;
  readonly defaultId: string | null;
  /** Switch to this persona under the caller's scope. Never fired for the current row (its arm is state). */
  readonly onSwitch: (persona: PersonaListItem) => void;
  /** Write `seeds.defaultPersonaId` to this persona (the pin). */
  readonly onPin: (persona: PersonaListItem) => void;
}

/** The switch rows — qualifiers resolved once with the whole list in hand (#458). */
export function PersonaSwitchList({ personas, currentId, defaultId, onSwitch, onPin }: PersonaSwitchListProps): ReactElement {
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
          isCurrent={persona.id === currentId}
          isDefault={persona.id === defaultId}
          onPin={(): void => onPin(persona)}
          onSwitch={(): void => onSwitch(persona)}
          persona={persona}
          subject={rowActionSubject(persona.name, (nameCounts.get(persona.name) ?? 0) > 1 ? (qualifiers[index] ?? "") : undefined)}
        />
      ))}
    </Stack>
  );
}

/** One switch row. The current row's stretched button keeps the roster's state-aware naming rule
 *  (§13.10 N3/N4): identity leads in both arms, the verb exists only where there is something to do. */
function SwitchRow({
  persona,
  subject,
  isCurrent,
  isDefault,
  onSwitch,
  onPin,
}: {
  readonly persona: PersonaListItem;
  readonly subject: string;
  readonly isCurrent: boolean;
  readonly isDefault: boolean;
  readonly onSwitch: () => void;
  readonly onPin: () => void;
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
        {...(isCurrent ? {} : { onClick: onSwitch })}
      />
      {/* Ornament under the stretched button — the row's one control already names the persona. */}
      <Avatar className="pointer-events-none shrink-0" fallbackDelay={0} hueSeed={persona.id} size="sm" {...avatarSrc}>
        {initialsFor(persona.name)}
      </Avatar>
      <Text as="span" className="pointer-events-none min-w-0 flex-1 truncate" weight="medium">
        {persona.name}
      </Text>
      {/* ONE pill max (the roster row's rule): current wins; "pinned" on a non-current default row only —
          on the current+default row the solid pin beside it already states pinned. */}
      {isCurrent ? (
        <Badge className="pointer-events-none shrink-0" intent="primary" tone="soft">
          playing as
        </Badge>
      ) : null}
      {!isCurrent && isDefault ? (
        <Badge className="pointer-events-none shrink-0" tone="soft">
          pinned · {"{{user}}"}
        </Badge>
      ) : null}
      <PersonaPin className="relative shrink-0" isDefault={isDefault} onPin={onPin} subject={subject} />
    </Row>
  );
}
