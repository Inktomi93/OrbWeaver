// `useMessageAppearance` — the per-message DISPLAY chrome knobs from the synced appearance blob (D44
// §12.1): avatar size + shape + whether in-chat avatars show. Read ONCE in the message-list surface
// and threaded to each `MessageRow` as props (rows stay prop-driven + Compiler-memoized — never a
// per-row query subscription). Shares the `getUserSettings` cache with `useChatStyle`, so the whole
// row appearance re-renders live when the appearance panel saves. Plain query + fallback to the
// §12.1 defaults (never suspends/throws; chat reads `trpc.settings.*` directly, §11.0).

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";

/** The row-display subset of the appearance prefs (the knobs `MessageRow` consumes). */
export interface MessageAppearance {
  readonly avatarSize: AppearanceSettings["avatarSize"];
  readonly avatarShape: AppearanceSettings["avatarShape"];
  readonly showInChatAvatars: AppearanceSettings["showInChatAvatars"];
  /** ST `auto_fix_generated_markdown` parity — apply the incomplete-markdown repair to SETTLED bodies
   *  too (default OFF; streaming always repairs regardless). Threaded to `MessageContent`'s markdown seal. */
  readonly autoFixMarkdown: AppearanceSettings["autoFixMarkdown"];
}

export function useMessageAppearance(): MessageAppearance {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const appearance = data?.config.appearance ?? DEFAULT_APPEARANCE_SETTINGS;
  return {
    avatarSize: appearance.avatarSize,
    avatarShape: appearance.avatarShape,
    showInChatAvatars: appearance.showInChatAvatars,
    autoFixMarkdown: appearance.autoFixMarkdown,
  };
}
