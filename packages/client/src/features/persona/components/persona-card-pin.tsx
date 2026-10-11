// The PERSONA PIN on a switcher row — who this chat's card calls {{user}}. Room only. The host gets a toggle
// (pressed on the pinned row, where pressing unpins; faint elsewhere until the row is hovered or focused, and
// standing down into the row menu at a coarse pointer). A member gets the state alone, on the pinned row: the
// host chooses who the card means.

import { Button } from "@orb/ui/button";
import { Icon, Pin } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { HIDE_AT_COARSE, PIN_REVEAL } from "#components";
import { cn } from "#lib";

export interface PersonaCardPinProps {
  readonly isPinned: boolean;
  readonly isHost: boolean;
  /** The persona's own name — the tooltip sentence speaks it. */
  readonly name: string;
  /** The row's announced identity (`rowActionSubject`). */
  readonly subject: string;
  readonly onPin: () => void;
  readonly onUnpin: () => void;
  readonly tabIndex?: -1;
}

export function PersonaCardPin({ isPinned, isHost, name, subject, onPin, onUnpin, tabIndex }: PersonaCardPinProps): ReactElement | null {
  const hint = `This chat's card calls you ${name} ({{user}}).`;
  if (!isHost) {
    return isPinned ? (
      <Tooltip>
        <TooltipTrigger
          render={
            <Text as="span" aria-label="Card's persona in this chat" className="relative shrink-0 text-muted-foreground" role="img">
              <Icon icon={Pin} size="sm" />
            </Text>
          }
        />
        <TooltipPopup side="top">{`${hint} The host chooses who the card means.`}</TooltipPopup>
      </Tooltip>
    ) : null;
  }
  return (
    <Tooltip describesTrigger={false}>
      <TooltipTrigger
        render={
          <Button
            aria-label={isPinned ? `Card is pinned to ${subject} — press to unpin` : `Pin the card to ${subject}`}
            aria-pressed={isPinned}
            className={cn("relative shrink-0", isPinned ? "text-primary" : cn(PIN_REVEAL, HIDE_AT_COARSE)) ?? ""}
            data-slot="persona-card-pin"
            intent="ghost"
            onClick={isPinned ? onUnpin : onPin}
            size={isPinned ? "inline" : "icon"}
            {...(tabIndex === undefined ? {} : { tabIndex })}
          >
            <Icon icon={Pin} size="sm" />
          </Button>
        }
      />
      <TooltipPopup side="top">{hint}</TooltipPopup>
    </Tooltip>
  );
}
