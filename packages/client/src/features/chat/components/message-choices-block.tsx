// P5 CYOA (§5.2-5.3) — the `:::choices` render block's CLICKABLE arm: the model's offered options as
// numbered send-affordances. A click sends the option TEXT as the user's next turn through the room's
// choice-send capability (`ChoiceSendProvider` → `useSendMessage` — a choice IS a user turn; zero new
// turn machinery). Buttons disable while a turn is in flight (the existing send-in-flight state) and in
// a provider-less mount (a CT story / read-only preview) — same surface, inert affordance, with the
// hover reason naming the unlock (owner: "when it's disabled on hover tell why"). Info-blue voice per
// the panel-redesign choice grammar (border-info) — theme tokens only, never hex.

import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { CHOICE_NEEDS_LIVE_CHAT, CHOICE_WAIT_FOR_TURN, testId } from "#lib";
import { useChoiceSend } from "../hooks/choice-send-context";

export interface MessageChoicesBlockProps {
  readonly options: readonly string[];
}

/** Suppression-free keys for an id-less immutable option list ([array-key-suppression-free-patterns]):
 *  the option TEXT is the identity; a verbatim repeat gets an occurrence suffix. */
function withKeys(options: readonly string[]): readonly { readonly option: string; readonly key: string }[] {
  const seen = new Map<string, number>();
  return options.map((option) => {
    const n = seen.get(option) ?? 0;
    seen.set(option, n + 1);
    return { option, key: n === 0 ? option : `${option}·${n}` };
  });
}

/** The choice set — numbered clickable options (§5.2). TEXT is the datum; the number is part of it. */
export function MessageChoicesBlock({ options }: MessageChoicesBlockProps): ReactElement {
  const choiceSend = useChoiceSend();
  const disabled = choiceSend === null || choiceSend.busy;
  let reason: string | undefined;
  if (choiceSend === null) {
    reason = CHOICE_NEEDS_LIVE_CHAT;
  } else if (choiceSend.busy) {
    reason = CHOICE_WAIT_FOR_TURN;
  }
  return (
    <Stack gap="field" data-slot="message-choices" className="rounded-card border border-info bg-card px-block py-row">
      <Text size="label" transform="caps" className="tracking-micro text-info">
        Your move
      </Text>
      {withKeys(options).map(({ option, key }, index) => (
        <Button
          key={key}
          intent="secondary"
          size="sm"
          focusableWhenDisabled={true}
          disabled={disabled}
          title={reason}
          data-testid={testId("messageChoiceOption")}
          className="h-auto justify-start whitespace-normal py-field text-left"
          onClick={(): void => {
            if (choiceSend !== null && !choiceSend.busy) {
              choiceSend.send(option);
            }
          }}
        >
          {index + 1}. {option}
        </Button>
      ))}
    </Stack>
  );
}
