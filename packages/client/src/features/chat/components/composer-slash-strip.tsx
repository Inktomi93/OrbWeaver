// The composer's SLASH affordance strip — the completion offer for a command-in-progress draft, plus the
// refusal notice for a send that was blocked. Renders IN FLOW directly above the composer row (the
// pending-attachments strip precedent), so it needs no popover positioning and no hand-rolled combobox
// ARIA: every offer is a real <Button>, which is why the composer keeps the one tab stop it always had.
//
// Unavailable commands are SHOWN, disabled, with the reason on hover — never omitted (the one-real-surface
// rule): a user must be able to see that `/x` exists and learn what unlocks it.

import { Button } from "@orb/ui/button";
import { Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { SlashCommandContribution } from "#lib";

export interface ComposerSlashStripProps {
  /** The commands matching the in-progress token, in registry order. Empty ⇒ no completion offer. */
  readonly matches: readonly SlashCommandContribution[];
  /** The reason the last send was refused (unknown command / unavailable command), or null. */
  readonly notice: string | null;
  readonly unavailableFor: (command: SlashCommandContribution) => string | null;
  /** Completes the draft to `/<id> ` and returns focus to the textarea. */
  readonly onPick: (command: SlashCommandContribution) => void;
}

export function ComposerSlashStrip({ matches, notice, unavailableFor, onPick }: ComposerSlashStripProps): ReactElement | null {
  if (notice === null && matches.length === 0) {
    return null;
  }
  return (
    <Stack gap="field" data-slot="composer-slash-strip" className="mx-auto w-full max-w-(--width-shell-content)">
      {notice === null ? null : (
        <Text size="label" tone="destructive" role="alert">
          {notice}
        </Text>
      )}
      {matches.map((command) => {
        const reason = unavailableFor(command);
        return (
          <Button
            key={command.id}
            type="button"
            intent="ghost"
            // aria-disabled (not native `disabled`) so the row stays hoverable and its reason surfaces.
            disabled={reason !== null}
            focusableWhenDisabled={true}
            title={reason ?? undefined}
            // Keeps the caret in the textarea across the click (the macro-textarea autocomplete's trick) —
            // completing a command must never cost the user their focus position.
            onMouseDown={(event): void => event.preventDefault()}
            onClick={(): void => onPick(command)}
            className="justify-start"
          >
            <Row gap="field" align="center">
              {command.icon === undefined ? null : <Icon icon={command.icon} size="sm" />}
              <Text as="span" size="code">
                {command.usage === undefined ? `/${command.id}` : `/${command.id} ${command.usage}`}
              </Text>
              <Text as="span" size="label" tone="muted">
                {command.describe}
              </Text>
            </Row>
          </Button>
        );
      })}
    </Stack>
  );
}
