// `useChatBehaviorPrefs` — the client-honored knobs from the synced `UserSettings.chat` blob:
// the composer's `enterSends`/`continueOnSend` send semantics + the streaming ghost's `smoothStream`/
// `smoothStreamCps` pacing. Read as a plain query with a fallback to the contract defaults (never
// suspends/throws; chat reads `trpc.settings.*` directly, §11.0). Shares the `getUserSettings` cache with
// `useMessageAppearance`/`useChatStyle`, so the composer + ghost re-render live when the pane autosaves.

import type { ChatSettings } from "@orb/contracts/settings";
import { DEFAULT_CHAT_SETTINGS } from "@orb/contracts/settings";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";

/** The client-honored subset of the chat prefs (the knobs the composer + ghost + list consume). */
export interface ChatBehaviorPrefs {
  readonly enterSends: ChatSettings["enterSends"];
  readonly continueOnSend: ChatSettings["continueOnSend"];
  /** W-E — bare Enter on an empty composer with a non-assistant tail prompts a reply. */
  readonly generateOnEmptySend: ChatSettings["generateOnEmptySend"];
  readonly smoothStream: ChatSettings["smoothStream"];
  readonly smoothStreamCps: ChatSettings["smoothStreamCps"];
  readonly streamScrollMode: ChatSettings["streamScrollMode"];
  /** Whether the live reasoning disclosure auto-collapses on the first answer token (the ghost's
   *  `<ReasoningBlock>` — a committed row is unaffected). */
  readonly reasoningAutoCollapse: ChatSettings["reasoningAutoCollapse"];
  /** B1 — this user's DEFAULT offer-choices posture for rooms they host. The odd one out in this bundle:
   *  it is SERVER-honored (the turn resolves it as the room's fallback), and the client reads it for exactly
   *  one reason — the host's per-room toggle must show the state a never-pinned room actually resolves to,
   *  which is this value. Combine with `ChatDetail.offerChoices` through `resolveOfferChoices`, never with a
   *  second inline `??`. */
  readonly offerChoices: ChatSettings["offerChoices"];
  /** B7 — this user's DEFAULT "characters can react" posture for rooms they host (the offerChoices twin:
   *  server-honored; read here only to seat the host's per-room toggle through
   *  `resolveCharactersCanReact`). Ships OFF at both tiers. */
  readonly charactersCanReact: ChatSettings["charactersCanReact"];
  /** B7 — this user's DEFAULT reaction-plane posture for rooms they host (ships ON — B6 is a live
   *  feature). Same seat-the-toggle-only role, via `resolveReactionsEnabled`. */
  readonly reactionsEnabled: ChatSettings["reactionsEnabled"];
}

export function useChatBehaviorPrefs(): ChatBehaviorPrefs {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const chat = data?.config.chat ?? DEFAULT_CHAT_SETTINGS;
  return {
    enterSends: chat.enterSends,
    continueOnSend: chat.continueOnSend,
    generateOnEmptySend: chat.generateOnEmptySend,
    smoothStream: chat.smoothStream,
    smoothStreamCps: chat.smoothStreamCps,
    streamScrollMode: chat.streamScrollMode,
    reasoningAutoCollapse: chat.reasoningAutoCollapse,
    offerChoices: chat.offerChoices,
    charactersCanReact: chat.charactersCanReact,
    reactionsEnabled: chat.reactionsEnabled,
  };
}
