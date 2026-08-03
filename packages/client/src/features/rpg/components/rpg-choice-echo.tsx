// The Scene "CHOICE ON THE TABLE" block (panel-redesign DESIGN.md §4 "Scene" + §6 P5 — CYOA's
// MOMENT-scale home; campaign scale is Quests' act rail; never both in one place). It ECHOES the
// transcript's LIVE `:::choices` fence — the newest message, when it is an assistant turn carrying a
// parseable choice set (a later user reply settles the choice; the echo disappears). The wand/transcript
// still owns the send: this block routes a pick through the SAME behavior the transcript block obeys —
// the game's `cyoaChoiceBehavior` knob (`send` fires the pick as the user turn via `chat.send` directly,
// a cross-feature ride on the other domain's tRPC procedure directly, never its client (lockdown §12 —
// see this file's own `trpc.chat.listMessages` read below, the live precedent); `compose` seeds the composer draft +
// focuses it via the shared #state channel). Info-blue voice (§3 — the story asking YOU), tokens only.
//
// Cross-domain read rides `trpc.chat.listMessages` DIRECTLY (lockdown §12 — the transcript surface shares
// this exact cache key, so this is a cache read; the P4 card archive is the precedent). Buttons disable
// while a turn is in flight (the shared turn phase), with the reason on title — never hidden.

import type { RpgCyoaChoiceBehavior } from "@orb/contracts/rpg";
import { tokenizeContent } from "@orb/kit/content";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { isLiveTurnPhase, requestComposerFocus, setComposerDraft, useTurnPhase } from "#state";
import type { RpgPanelState } from "../hooks/use-rpg-context-state.ts";
import { useSendChoice } from "../hooks/use-rpg-mutations.ts";

/** The per-behavior header sub-line — the honest consequence of a pick (the mock's "picks send as your
 *  turn"), keyed by the closed `cyoaChoiceBehavior` vocab. */
const BEHAVIOR_LINE: Readonly<Record<RpgCyoaChoiceBehavior, string>> = {
  compose: "picks drop into the composer",
  send: "picks send as your turn",
};

const TURN_IN_FLIGHT = "Wait for the current turn to finish.";

/** The newest message's choice options — `null` unless the LAST transcript message is an assistant turn
 *  carrying a parseable `:::choices` fence (the LIVE choice; anything older is settled history). */
function liveChoices(messages: readonly { readonly role: string; readonly content: string }[]): readonly string[] | null {
  const last = messages.at(-1);
  if (last === undefined || last.role !== "assistant") {
    return null;
  }
  for (const span of tokenizeContent(last.content, { committed: true })) {
    if (span.kind === "choices") {
      return span.options;
    }
  }
  return null;
}

export interface RpgChoiceEchoProps {
  readonly state: RpgPanelState;
}

/** The Scene tab's live-choice echo. Renders NOTHING without a live choice set (the honest empty plane). */
export function RpgChoiceEcho({ state }: RpgChoiceEchoProps): ReactElement | null {
  const { chatId, game } = state;
  const enabled = game.publicConfig.cyoa;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const sendChoice = useSendChoice({ trpc, invalidation });
  const busy = isLiveTurnPhase(useTurnPhase(chatId)) || sendChoice.isPending;
  const messagesQuery = useQuery({ ...trpc.chat.listMessages.queryOptions({ chatId }), enabled });
  if (!enabled) {
    return null;
  }
  const options = liveChoices(messagesQuery.data?.messages ?? []);
  if (options === null || options.length === 0) {
    return null;
  }
  const behavior = game.publicConfig.cyoaChoiceBehavior;

  const pick = (text: string): void => {
    if (behavior === "send") {
      sendChoice.mutate({ chatId, content: text });
      return;
    }
    setComposerDraft(chatId, text);
    requestComposerFocus(chatId);
  };

  return (
    <Stack gap="field" data-slot="rpg-choice-echo" className="rounded-base border border-info bg-card px-block py-row">
      <Text voice="kicker" className="text-info">
        Choice on the table{" "}
        <Text as="span" voice="gloss" className="tracking-normal">
          · {BEHAVIOR_LINE[behavior]}
        </Text>
      </Text>
      {options.map((option, index) => (
        <Button
          // The option TEXT is the identity (an id-less immutable model-authored list — the
          // message-choices-block keying precedent; a verbatim repeat is the same choice).
          key={option}
          intent="secondary"
          size="wrap"
          focusableWhenDisabled={true}
          disabled={busy}
          {...(busy ? { title: TURN_IN_FLIGHT } : {})}
          className="justify-start text-left"
          onClick={(): void => {
            if (!busy) {
              pick(option);
            }
          }}
        >
          {index + 1}. {option}
        </Button>
      ))}
    </Stack>
  );
}
