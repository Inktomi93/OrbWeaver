// `useChatBehaviorPrefs` — the client-honored knobs from the synced `UserSettings.chat` blob (PD-146):
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
  readonly smoothStream: ChatSettings["smoothStream"];
  readonly smoothStreamCps: ChatSettings["smoothStreamCps"];
  readonly streamScrollMode: ChatSettings["streamScrollMode"];
}

export function useChatBehaviorPrefs(): ChatBehaviorPrefs {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const chat = data?.config.chat ?? DEFAULT_CHAT_SETTINGS;
  return {
    enterSends: chat.enterSends,
    continueOnSend: chat.continueOnSend,
    smoothStream: chat.smoothStream,
    smoothStreamCps: chat.smoothStreamCps,
    streamScrollMode: chat.streamScrollMode,
  };
}
