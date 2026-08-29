// The per-room REACTION toggles (B7) — the CLIENT half of `chat.setReactionsEnabled` +
// `chat.setCharactersCanReact`, side by side in the chat-behavior section of the "This chat" tab (the
// owner's ask: a host manages both reactions knobs in one place, beside the offer-choices switch they
// pattern-match).
//
// TWO knobs, DIFFERENT default directions, and that asymmetry is the design:
//   • "Reactions" (`reactionsEnabled`) defaults ON — B6 shipped; this switch makes the plane disableable.
//     OFF is ENFORCED server-side (`toggleReaction` refuses, `listReactions` answers empty-with-verdict,
//     the react tool refuses); the vanishing pills/doors every member sees are the courtesy over that.
//   • "Characters can react" (`charactersCanReact`) defaults OFF at BOTH tiers (owner requirement: an
//     autonomous AI dropping reactions is opt-in). ON (with the plane on) attaches the `react` tool to
//     this room's turns — PROMPT CONTENT, which is why both switches are host authority.
//
// THE INHERIT SEAM (the `OfferChoicesControl` pattern, verbatim): a never-pinned room reads
// `ChatDetail.<knob> === null` and RESOLVES to the host's own per-user default, so each switch reads that
// default (`useChatBehaviorPrefs`) through the ONE contracts resolver — never an ad-hoc `??`. Host-only
// mount (the §8.1 permission-OMIT); the viewer IS the host, so reading their settings here is exact.

import { resolveCharactersCanReact, resolveReactionsEnabled } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { SettingSwitchRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useChatBehaviorPrefs } from "../hooks/use-chat-behavior-prefs.ts";
import { useSetCharactersCanReact, useSetReactionsEnabled } from "../hooks/use-context-panel-mutations.ts";

export interface ReactionTogglesProps {
  readonly chatId: ChatId;
}

/** The host-only "reactions in this chat" switch — the plane's master. */
export function ReactionsEnabledControl({ chatId }: ReactionTogglesProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const prefs = useChatBehaviorPrefs();
  const setEnabled = useSetReactionsEnabled({ trpc, invalidation });
  return (
    <SettingSwitchRow
      label="Reactions"
      description="Let members react to messages with emoji. Off hides the pills and the picker for everyone here, and the server refuses new reactions. Your default for new chats lives in Settings → Chat behavior."
      checked={resolveReactionsEnabled(chat.reactionsEnabled ?? undefined, prefs.reactionsEnabled)}
      onChange={(next): void => {
        setEnabled.mutate({ chatId, enabled: next });
      }}
    />
  );
}

/** The host-only "characters can react" switch — the `react` tool's opt-in. */
export function CharactersCanReactControl({ chatId }: ReactionTogglesProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const prefs = useChatBehaviorPrefs();
  const setEnabled = useSetCharactersCanReact({ trpc, invalidation });
  return (
    <SettingSwitchRow
      label="Characters can react"
      description="Let this chat's model drop an emoji reaction from a present character while it replies. Needs Reactions on; off by default — turning it on is the opt-in. Your default for new chats lives in Settings → Chat behavior."
      checked={resolveCharactersCanReact(chat.charactersCanReact ?? undefined, prefs.charactersCanReact)}
      onChange={(next): void => {
        setEnabled.mutate({ chatId, enabled: next });
      }}
    />
  );
}
