// `useMessageAppearance` — the per-message DISPLAY chrome knobs from the synced appearance blob (D44
// §12.1): avatar size + shape + whether in-chat avatars show + (WS3) the metadata-chip visibility set
// + messageActions. Read ONCE in the message-list surface and threaded to each `MessageRow` as props
// (rows stay prop-driven + Compiler-memoized — never a per-row query subscription). Shares the
// `getUserSettings` cache with `useChatStyle`, so the whole row appearance re-renders live when the
// appearance panel saves. Plain query + fallback to the §12.1 defaults (never suspends/throws; chat
// reads `trpc.settings.*` directly, §11.0).

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import type { MessageMetadataVisibility } from "../components/message-metadata-row.tsx";

/** The row-display subset of the appearance prefs (the knobs `MessageRow` consumes). */
export interface MessageAppearance {
  readonly avatarSize: AppearanceSettings["avatarSize"];
  readonly avatarShape: AppearanceSettings["avatarShape"];
  /** §B.3 avatar versatility — the 2:3 VN/immersive presence lever. */
  readonly avatarAspect: AppearanceSettings["avatarAspect"];
  /** §B.3 avatar versatility — the accent ring (reuse-ready for a future active-speaker highlight). */
  readonly avatarRing: AppearanceSettings["avatarRing"];
  readonly showInChatAvatars: AppearanceSettings["showInChatAvatars"];
  /** ST `auto_fix_generated_markdown` parity — apply the incomplete-markdown repair to SETTLED bodies
   *  too (default OFF; streaming always repairs regardless). Threaded to `MessageContent`'s markdown seal. */
  readonly autoFixMarkdown: AppearanceSettings["autoFixMarkdown"];
  /** ST quote-color parity — tint `"…"` runs with the scope's `--color-dialogue` (default ON). Threaded to
   *  BOTH body arms: the settled row's `MessageContent` seal and the live ghost's. */
  readonly colorQuotedSpeech: AppearanceSettings["colorQuotedSpeech"];
  /** WS3 metadata-chip visibility — `MessageMetadataRow`'s per-toggle gate (incl.
   *  `showGenerationTimer`, now wired to the `MessageView` gen-window bounds). */
  readonly metadataVisibility: MessageMetadataVisibility;
  /** WS3 — hover-reveal vs always-visible action cluster. */
  readonly messageActions: AppearanceSettings["messageActions"];
  /** Phase 4b §B.5.5 — the reasoning-block metadata-chip icon. Threaded to BOTH `<ReasoningBlock>` mounts:
   *  the live ghost row (`ghost-message-row.tsx`) and the settled committed row (`message-row.tsx`). */
  readonly showLLMReasoningIcon: AppearanceSettings["showLLMReasoningIcon"];
}

export function useMessageAppearance(): MessageAppearance {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const appearance = data?.config.appearance ?? DEFAULT_APPEARANCE_SETTINGS;
  return {
    avatarSize: appearance.avatarSize,
    avatarShape: appearance.avatarShape,
    avatarAspect: appearance.avatarAspect,
    avatarRing: appearance.avatarRing,
    showInChatAvatars: appearance.showInChatAvatars,
    autoFixMarkdown: appearance.autoFixMarkdown,
    colorQuotedSpeech: appearance.colorQuotedSpeech,
    metadataVisibility: {
      showTimestamps: appearance.showTimestamps,
      showMessageId: appearance.showMessageId,
      showModelIcon: appearance.showModelIcon,
      showTokenCount: appearance.showTokenCount,
      showGenerationTimer: appearance.showGenerationTimer,
      showGenerationCost: appearance.showGenerationCost,
    },
    messageActions: appearance.messageActions,
    showLLMReasoningIcon: appearance.showLLMReasoningIcon,
  };
}
