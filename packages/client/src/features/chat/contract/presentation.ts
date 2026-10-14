// Client-owned projections derive their production wire/input homes; computed presentation data stays local.

import type { ConnectionView } from "@orb/contracts/inference";
import type { AppearanceSettings, UserSettings } from "@orb/contracts/settings";
import type { ChatId, MessageId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import type { RowAttribution } from "../lib/attribution.ts";

export type MessageMetadataVisibility = Pick<
  AppearanceSettings,
  "showTimestamps" | "showMessageId" | "showModelIcon" | "showTokenCount" | "showGenerationTimer" | "showGenerationCost"
>;

export type ArtToView = Readonly<{ hash: NonNullable<RowAttribution["avatarHash"]>; name: NonNullable<RowAttribution["name"]> }>;

export type EmptySendInput = Pick<UserSettings["chat"], "continueOnSend" | "generateOnEmptySend"> & {
  readonly tailRole: MessageRole | null;
  /** True when the composer has sendable text — a non-empty send is a normal send, never continue/generate. */
  readonly hasText: boolean;
  readonly chatId: ChatId | null;
  readonly tailAssistantMessageId: MessageId | null;
};

export type ToggleReactionVars = inferInput<Trpc["chat"]["toggleReaction"]>;

export type CreditConnectionRow = Pick<ConnectionView, "id" | "label" | "providerLabel" | "tasks">;
