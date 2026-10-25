// The CROWN — the default persona, the one new chats start you as. One component on both persona surfaces
// (the switcher's rows and the Settings list), one meaning. Pressed on the default row, where pressing clears
// it; every other row's crown is "make this my default", faint until its row is hovered or focused. At a
// coarse pointer the toggle stands down into the row's actions menu and the default row keeps a quiet,
// non-interactive marker, so the default is never the one thing a phone cannot see.

import { Button } from "@orb/ui/button";
import { Crown, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";

const CROWN_HINT = "Your default persona for new chats.";
const DEFAULT_MARKER_LABEL = "Your default persona";

export interface PersonaCrownProps {
  /** True on the row `seeds.defaultPersonaId` names — the pressed state. */
  readonly isDefault: boolean;
  /** The row's announced identity (`rowActionSubject`). */
  readonly subject: string;
  readonly onSet: () => void;
  readonly onClear: () => void;
  /** Roving focus: `-1` takes the crown out of the tab order while its row is not the list's tab stop. */
  readonly tabIndex?: -1;
}

export function PersonaCrown({ isDefault, subject, onSet, onClear, tabIndex }: PersonaCrownProps): ReactElement {
  return (
    <>
      <Row className="relative shrink-0" hiddenAt="coarse" reveal={isDefault ? undefined : "faint"}>
        <Tooltip describesTrigger={false}>
          <TooltipTrigger
            render={
              <Button
                aria-label={isDefault ? `${subject} is your default — press to clear` : `Make ${subject} your default`}
                aria-pressed={isDefault}
                data-slot="persona-crown"
                intent="ghost"
                onClick={isDefault ? onClear : onSet}
                size={isDefault ? "inline" : "icon"}
                tone={isDefault ? "primary" : "default"}
                {...(tabIndex === undefined ? {} : { tabIndex })}
              >
                <Icon icon={Crown} size="sm" />
              </Button>
            }
          />
          <TooltipPopup side="top">{CROWN_HINT}</TooltipPopup>
        </Tooltip>
      </Row>
      {isDefault ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Text as="span" aria-label={DEFAULT_MARKER_LABEL} className="relative shrink-0" hiddenAt="fine" role="img" tone="accent">
                <Icon icon={Crown} size="sm" />
              </Text>
            }
          />
          <TooltipPopup side="top">{CROWN_HINT}</TooltipPopup>
        </Tooltip>
      ) : null}
    </>
  );
}
