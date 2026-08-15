// P5 CYOA (§5.2-5.4) — the `:::choices` render block's CLICKABLE arm: the model's offered options as
// numbered choice-affordances. A click routes the option TEXT through the room's choice capability
// (`ChoiceSendProvider` → `choose`), whose behavior the game's `cyoaChoiceBehavior` knob gates: `send`
// fires it as the user's next turn immediately; `compose` (the default) drops it into the composer draft +
// focuses it. The block is behavior-agnostic — the provider owns the branch. Buttons disable while a turn
// is in flight (the existing send-in-flight state) and in a provider-less mount (a CT story / read-only
// preview) — same surface, inert affordance, with the hover reason naming the unlock (owner: "when it's
// disabled on hover tell why"). Info-blue voice per the choice grammar (border-info) —
// theme tokens only, never hex.

import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { CHOICE_NEEDS_LIVE_CHAT, CHOICE_WAIT_FOR_TURN, testId } from "#lib";
import { useChoiceSend } from "../hooks/choice-send-context.tsx";

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
    // DENSITY S6: the choice set is an INTERACTIVE ISLAND (CD1 — you operate it), so it keeps its box, but
    // the box is now a `<Card>`: inside the room's `<Surface tier="instrument">` the tier map resolves its
    // padding (D6 demoted `--radius-card` to the floating step, which here is the bubble this island sits
    // in).
    //
    // ONE BOX, DEMOTED CHROME (CD2 as ruled by side-eye 2026-08-03). This card renders INSIDE the message
    // bubble (`message-content.tsx`), which is itself border + radius + fill — so the full Card treatment
    // PLUS an accent `border-info` on top of the bubble's own border was two complete boxes with two border
    // colors, the A2/CD2 violation by the letter. The island must still be distinguishable (a user has to
    // see that those are pressable — the case CD2's "maximum" clause permits), so the separation demotes to
    // ONE axis: `nested` drops the border and steps the radius one below the bubble's, and the info tint
    // that the border was carrying moves into the FILL, where it does the same job without a second edge.
    <Card className="bg-info/10" nested={true}>
      <Stack gap="field" data-slot="message-choices">
        <Text voice="kicker" className="text-info">
          Your move
        </Text>
        {withKeys(options).map(({ option, key }, index) => (
          <Button
            key={key}
            intent="secondary"
            size="wrap"
            focusableWhenDisabled={true}
            disabled={disabled}
            title={reason}
            data-testid={testId("messageChoiceOption")}
            className="justify-start text-left"
            onClick={(): void => {
              if (choiceSend !== null && !choiceSend.busy) {
                choiceSend.choose(option);
              }
            }}
          >
            {index + 1}. {option}
          </Button>
        ))}
      </Stack>
    </Card>
  );
}
