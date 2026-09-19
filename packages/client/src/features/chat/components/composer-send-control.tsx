// The composer's terminal Send/turn-Stop slot, owned by the row-1 `Attach and send` group because it commits
// the composed message or aborts that live turn. Extracted from `Composer` (component-size cap) so the
// honest-refusal gate's props (#54) don't inflate that file. Stop wins while a turn is live; otherwise Send,
// which disables-with-reason when the chat's connection can't serve (`focusableWhenDisabled` -> aria-disabled
// but hoverable). Only the PERSISTENT unavailable gate carries a reason; the transient pending/empty
// disablements do not.
//
// THE UNAVAILABLE REASON HAS ONE HOME (#2443, side-eye 2026-09-19). It used to sit in a native `title` AND
// in the tooltip while `aria-label` stayed the constant "Send message" — two homes for one concept, and
// NEITHER reaches a phone: a `title` is invisible on touch and only a description to AT, and Base UI 1.7.0's
// tooltip is `mouseOnly: true` with a `:focus-visible`-gated focus fallback, so a tap opens nothing
// (#863's title-attribute lesson, and the same mechanism `composer-guided-buttons.tsx` documents). The
// `title` is gone; the reason is the control's DESCRIPTION via an `sr-only` line (so AT reads it at rest,
// on any pointer, without displacing the name a voice-control user says), and the SIGHTED touch user reads
// the same string as visible copy under the guided cluster, which renders it once for the whole band.

import { Button } from "@orb/ui/button";
import { Icon, Send, Square } from "@orb/ui/icons";
import { WebSpinner } from "@orb/ui/spinner";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useId } from "react";
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
  const reasonId = useId();
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
  // `describesTrigger={false}`: this control already owns the reason's ONE description home (the `sr-only`
  // line below) and the tooltip is its visible twin. #2455 made the seal describe every trigger with its
  // own text; taking it here would restore the "two homes for one concept" this control's header records
  // as the #2443 defect — and with no reason the tooltip is the bare name "Send message".
  return (
    <Tooltip describesTrigger={false}>
      <TooltipTrigger
        {...(props.unavailableReason === undefined ? {} : { "aria-describedby": reasonId })}
        render={
          <Button
            type="button"
            intent="primary"
            size="icon"
            data-testid={testId("composerSend")}
            disabled={props.sendDisabled}
            focusableWhenDisabled={props.unavailable}
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
      {props.unavailableReason === undefined ? null : (
        <Text as="span" className="sr-only" id={reasonId}>
          {props.unavailableReason}
        </Text>
      )}
    </Tooltip>
  );
}
