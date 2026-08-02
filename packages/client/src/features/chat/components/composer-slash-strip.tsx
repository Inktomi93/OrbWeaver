// The composer's SLASH affordance strip — the completion offer for a command-in-progress draft, plus the
// refusal notice for a send that was blocked. Renders IN FLOW directly above the composer row (the
// pending-attachments strip precedent), so it needs no popover positioning.
//
// COMBOBOX SEMANTICS (P2 a11y, side-eye 2026-07-25): the offers form an @orb/ui <OptionStrip> — an inline
// listbox of `option`s the textarea DRIVES via aria-activedescendant. Arrow keys move a highlight while
// focus STAYS in the textarea (the composer owns the key handling + the `activeId`); the primitive owns the
// ARIA shape + the highlight/hover skin. This file keeps only the slash DOMAIN: which commands match, their
// availability, and the `/id usage` + describe formatting. A mouse click completes the offer directly.
//
// Unavailable commands are SHOWN, disabled, with the reason on hover — never omitted (the one-real-surface
// rule): a user must be able to see that `/x` exists and learn what unlocks it. The keyboard highlight can
// still LAND on a disabled row (recognition parity), but activation is refused with the reason (the
// composer's pick re-checks availability), matching the click path's disabled-affordance law.

import { Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import type { OptionStripItem } from "@orb/ui/option-strip";
import { OptionStrip } from "@orb/ui/option-strip";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { SlashCommandContribution } from "#lib";
import { SLASH_LISTBOX_ID, slashOptionId } from "../lib/slash-command";

export interface ComposerSlashStripProps {
  /** The commands matching the in-progress token, in registry order. Empty ⇒ no completion offer. */
  readonly matches: readonly SlashCommandContribution[];
  /** The reason the last send was refused (unknown command / unavailable command), or null. */
  readonly notice: string | null;
  readonly unavailableFor: (command: SlashCommandContribution) => string | null;
  /** The index of the keyboard-highlighted offer, or -1 when none is highlighted (the passive-open state). */
  readonly highlightIndex: number;
  /** Completes the draft to `/<id> ` and returns focus to the textarea. */
  readonly onPick: (command: SlashCommandContribution) => void;
}

/** The offer label: `/id` alone, or `/id usage` when the command declares an argument grammar. */
function offerLabel(command: SlashCommandContribution): string {
  return command.usage === undefined ? `/${command.id}` : `/${command.id} ${command.usage}`;
}

export function ComposerSlashStrip({ matches, notice, unavailableFor, highlightIndex, onPick }: ComposerSlashStripProps): ReactElement | null {
  if (notice === null && matches.length === 0) {
    return null;
  }
  // Map the slash DOMAIN onto the primitive's slots; the option id is the shared handle the textarea's
  // aria-activedescendant names. onSelect maps back by id — the pointer path only reaches an AVAILABLE row
  // (the item's `disabled` blocks the click); the composer's keyboard pick re-checks availability itself.
  const items: readonly OptionStripItem[] = matches.map((command, index) => {
    const reason = unavailableFor(command);
    return {
      id: slashOptionId(command.id),
      label: offerLabel(command),
      description: command.describe,
      leading: command.icon === undefined ? undefined : <Icon icon={command.icon} size="sm" />,
      disabled: reason !== null,
      title: reason ?? undefined,
      highlighted: index === highlightIndex,
    };
  });
  const pick = (item: OptionStripItem): void => {
    const command = matches.find((c) => slashOptionId(c.id) === item.id);
    if (command !== undefined) {
      onPick(command);
    }
  };
  return (
    <Stack gap="field" data-slot="composer-slash-strip" className="mx-auto w-full max-w-(--width-shell-content)">
      {/* A refusal names one thing that just failed — the `label` voice; destructive is the SKIN the
          notice needs on top of it (no voice carries a colour role, by design). */}
      {notice === null ? null : (
        <Text voice="label" className="text-destructive" role="alert">
          {notice}
        </Text>
      )}
      {items.length === 0 ? null : <OptionStrip aria-label="Slash commands" id={SLASH_LISTBOX_ID} items={items} onSelect={pick} />}
    </Stack>
  );
}
