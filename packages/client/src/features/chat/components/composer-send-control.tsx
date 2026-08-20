// The composer's terminal Send/turn-Stop slot, owned by the row-1 `Attach and send` group because it commits
// the composed message or aborts that live turn. Extracted from `Composer` (component-size cap) so the
// honest-refusal gate's props (#54) don't inflate that file. Stop wins while a turn is live; otherwise Send,
// which disables-with-reason when the chat's connection can't serve (title + `focusableWhenDisabled` →
// aria-disabled but hoverable, [[base-ui-disabled-menuitem-title]]). Only the PERSISTENT unavailable gate
// carries a reason; the transient pending/empty disablements do not.

import { Button } from "@orb/ui/button";
import { Icon, Send, Square } from "@orb/ui/icons";
import { WebSpinner } from "@orb/ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { testId } from "#lib";

export interface ComposerSendControlProps {
  readonly showStop: boolean;
  readonly stopping: boolean;
  readonly onStop: () => void;
  readonly onSend: () => void;
  readonly sendDisabled: boolean;
  readonly sendPending: boolean;
  readonly unavailable: boolean;
  readonly unavailableReason: string | undefined;
}

export function ComposerSendControl(props: ComposerSendControlProps): ReactElement {
  if (props.showStop) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              intent="secondary"
              size="icon"
              loading={props.stopping}
              disabled={props.stopping}
              aria-label={props.stopping ? "Stopping…" : "Stop generating"}
              onClick={props.onStop}
              shape="pill"
            >
              {props.stopping ? <WebSpinner size="sm" label="Stopping…" /> : <Icon icon={Square} size="sm" />}
            </Button>
          }
        />
        <TooltipPopup side="top">{props.stopping ? "Stopping generation" : "Stop generating"}</TooltipPopup>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            intent="primary"
            size="icon"
            data-testid={testId("composerSend")}
            disabled={props.sendDisabled}
            focusableWhenDisabled={props.unavailable}
            {...(props.unavailableReason !== undefined ? { title: props.unavailableReason } : {})}
            loading={props.sendPending}
            aria-label="Send message"
            onClick={props.onSend}
            shape="pill"
            className="data-disabled:pointer-events-auto"
          >
            <Icon icon={Send} size="sm" />
          </Button>
        }
      />
      <TooltipPopup side="top">{props.unavailableReason ?? "Send message"}</TooltipPopup>
    </Tooltip>
  );
}
