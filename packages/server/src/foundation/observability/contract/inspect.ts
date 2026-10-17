// Consumer-owned projections derive the actual service or database row; no parallel shape is declared.

import type { AutomationFireOutcome } from "@orb/contracts/automation";
import type { CardTrust, DeploymentRenderPolicy, RenderPolicy, RenderPolicyOverride } from "@orb/contracts/chat";
import type { automationFires, characters, chatParticipants, chats, personas, presets, rpgGames, userSettings } from "@orb/db";
import type { AutomationRuleId, ChatId } from "@orb/kit/ids";

/** The characters table has no updated_at column (D28), so this projection uses createdAt for recency. */
export type CharacterListRow = Pick<typeof characters.$inferSelect, "id" | "name" | "handle" | "createdAt">;

/** Raw stored config is diagnostic evidence, not a successful application parse. */
export interface UserSettingsRow extends Pick<typeof userSettings.$inferSelect, "userId" | "schemaVersion" | "updatedAt"> {
  config: unknown;
}

export interface RpgGameRow
  extends Pick<typeof rpgGames.$inferSelect, "id" | "chatId" | "mode" | "status" | "sessionNumber" | "gmUserId" | "gmPresetId" | "createdAt" | "updatedAt"> {
  config: unknown;
}

export interface RenderPolicyVerdict {
  stored: RenderPolicyOverride;
  deployment: DeploymentRenderPolicy | null;
  resolved: RenderPolicy | null;
  cardTier: CardTrust | null;
}

export interface CharacterDetailRow
  extends Pick<typeof characters.$inferSelect, "id" | "name" | "handle" | "ownerId" | "starred" | "archived" | "synthetic" | "avatarAssetId" | "createdAt"> {
  renderPolicy: RenderPolicyVerdict;
  themeOverride: unknown;
  backgroundOverride: unknown;
  card: Pick<
    typeof characters.$inferSelect,
    | "description"
    | "personality"
    | "scenario"
    | "greetings"
    | "exampleMessages"
    | "systemPrompt"
    | "postHistoryInstructions"
    | "depthPrompt"
    | "creatorNotes"
    | "creator"
    | "cardVersion"
    | "nickname"
  >;
  provenance: Pick<typeof characters.$inferSelect, "importedFrom" | "importHash" | "contentHash" | "tokenSize" | "creationDate" | "modificationDate"> & {
    source: unknown;
  };
  extensions: unknown;
  residualData: unknown;
  refinery: unknown;
}

export interface PresetRow
  extends Pick<typeof presets.$inferSelect, "id" | "ownerId" | "name" | "kind" | "schemaVersion" | "forkedFrom" | "createdAt" | "updatedAt"> {
  config: unknown;
}

export interface PersonaRow
  extends Pick<typeof personas.$inferSelect, "id" | "ownerId" | "name" | "title" | "description" | "starred" | "avatarAssetId" | "createdAt" | "updatedAt"> {
  metadata: unknown;
}

export interface ChatConfigRow
  extends Pick<
    typeof chats.$inferSelect,
    | "id"
    | "title"
    | "starred"
    | "archived"
    | "temporary"
    | "anchorPersonaId"
    | "pendingHostUserId"
    | "parentChatId"
    | "forkedAt"
    | "compactedAtSeq"
    | "compactSummary"
    | "importedFrom"
    | "importHash"
    | "createdAt"
    | "updatedAt"
  > {
  pendingHandoffOffer: unknown;
  metadata: unknown;
  variableValues: unknown;
  userMacroValues: unknown;
  runtimeVariables: unknown;
  standaloneVariableDeltas: unknown;
  participants: ChatParticipantRow[];
}

export type ChatParticipantRow = Pick<typeof chatParticipants.$inferSelect, "kind" | "userId" | "characterId" | "activePersonaId" | "role">;

export interface CharacterPolicyRow extends Pick<typeof characters.$inferSelect, "id" | "name" | "handle" | "ownerId" | "synthetic"> {
  renderPolicy: RenderPolicyVerdict;
}

export interface ChatListRow extends Pick<typeof chats.$inferSelect, "id" | "title" | "updatedAt"> {
  participantCount: number;
  messageCount: number;
}

export interface IntegrityReport {
  ok: boolean;
  foreignKeyViolations: Record<string, unknown>[];
  integrityCheck: string[];
}

export interface AutomationFireRow
  extends Readonly<Pick<typeof automationFires.$inferSelect, "id" | "ruleId" | "chatId" | "triggerType" | "detail" | "automationDepth" | "firedAt">> {
  readonly outcome: AutomationFireOutcome;
}

export interface AutomationFireFilter {
  readonly chatId?: ChatId;
  readonly ruleId?: AutomationRuleId;
  readonly limit: number;
}
