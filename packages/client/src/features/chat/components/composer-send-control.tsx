// The composer's right-side Send/Stop control (row 2). Extracted from `Composer` (component-size cap) so the
// honest-refusal gate's props (#54) don't inflate that file. Stop wins while a turn is live; otherwise Send,
// which disables-with-reason when the chat's connection can't serve (title + `focusableWhenDisabled` →
// aria-disabled but hoverable, [[base-ui-disabled-menuitem-title]]). Only the PERSISTENT unavailable gate
// carries a reason; the transient pending/empty disablements do not.

import { Button } from "@orb/ui/button";
import { Icon, Send, Square } from "@orb/ui/icons";
import { WebSpinner } from "@orb/ui/spinner";
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
      <Button
        type="button"
        intent="secondary"
        size="icon"
        loading={props.stopping}
        disabled={props.stopping}
        aria-label={props.stopping ? "Stopping…" : "Stop generating"}
        onClick={props.onStop}
        className="rounded-full"
      >
        {props.stopping ? <WebSpinner size="sm" label="Stopping…" /> : <Icon icon={Square} size="sm" />}
      </Button>
    );
  }
  return (
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
      className="rounded-full"
    >
      <Icon icon={Send} size="sm" />
    </Button>
  );
}
