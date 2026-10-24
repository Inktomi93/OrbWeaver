import type { AuthConfig } from "@orb/contracts/auth-config";
import type { ArmPreview } from "@orb/contracts/automation";
import type { CharacterSummary } from "@orb/contracts/character";
import type { ChatBusEvent, ChatLivePublish, ChatSummary, MemoryRecallPhase, MessageWindow } from "@orb/contracts/chat";
import type { ChatInspection } from "@orb/contracts/debug";
import type { StoreResult } from "@orb/contracts/embeddings";
import type { ExtractionMeta } from "@orb/contracts/extraction";
import type { AuthConfigShare } from "@orb/contracts/identity";
import type { GenerateImageActionArgs, GeneratePictureParams, generatePictureRequestSchema } from "@orb/contracts/imagery";
import type { CachePolicy, ConnectionBinding, TaskDef } from "@orb/contracts/inference";
import type { InboxView } from "@orb/contracts/notifications";
import type { RegexScriptBehavior } from "@orb/contracts/regex";
import type { CorpusSourceOutcome } from "@orb/contracts/search";
import type { StatsFreshness } from "@orb/contracts/stats";
import type { ChatId, EmbedGenerationId, MessageId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

test("auth capabilities, privacy and relay state are correlated", () => {
  type Fields = Pick<AuthConfig, Exclude<keyof AuthConfig, "mode" | "localEnabled" | "oidcEnabled" | "discreetLogin" | "defaultHandle">>;
  expectTypeOf<Fields & { mode: "oidc"; localEnabled: true; oidcEnabled: true; discreetLogin: false; defaultHandle: null }>().not.toExtend<AuthConfig>();
  expectTypeOf<Fields & { mode: "local"; localEnabled: true; oidcEnabled: false; discreetLogin: true; defaultHandle: string }>().not.toExtend<AuthConfig>();
  expectTypeOf<{ state: "up"; url: null }>().toExtend<AuthConfigShare>();
  expectTypeOf<{ state: "off"; url: string }>().not.toExtend<AuthConfigShare>();
});

test("extraction metadata and task routing require their actual witnesses", () => {
  type Meta = Pick<ExtractionMeta, "extractorVersion" | "charCount">;
  expectTypeOf<Meta & { format: "pdf"; pageCount: number }>().toExtend<ExtractionMeta>();
  expectTypeOf<Meta & { format: "pdf" }>().not.toExtend<ExtractionMeta>();
  expectTypeOf<Meta & { format: "text"; pageCount: number }>().not.toExtend<ExtractionMeta>();
  type TaskFields = Pick<TaskDef, "kind" | "scope" | "spend">;
  expectTypeOf<TaskFields & { routable: false }>().not.toExtend<TaskDef>();
  expectTypeOf<TaskFields & { routable: false; ridesOn: "agent" }>().not.toExtend<TaskDef>();
  expectTypeOf<TaskFields & { routable: false; ridesOn: "chat" }>().toExtend<TaskDef>();
});

test("effective controls, recency and embedding receipts reject partial facts", () => {
  type Prefix = Pick<CachePolicy["prefix"], "ttl" | "cacheSystem" | "historyDepth" | "preservesBlockEnds">;
  expectTypeOf<Prefix & { action: "markers"; format: null }>().not.toExtend<CachePolicy["prefix"]>();
  type Recency = Pick<CharacterSummary, Exclude<keyof CharacterSummary, "lastChattedAt" | "lastChatId">>;
  expectTypeOf<Recency & { lastChattedAt: number; lastChatId: null }>().not.toExtend<CharacterSummary>();
  expectTypeOf<Recency & { lastChattedAt: null; lastChatId: null }>().toExtend<CharacterSummary>();
  expectTypeOf<Recency & { lastChattedAt: number; lastChatId: ChatId }>().toExtend<CharacterSummary>();
  type Store = Pick<StoreResult, "outcome" | "contentHash" | "model">;
  expectTypeOf<Store>().toExtend<StoreResult>();
  expectTypeOf<Store & { generationId: EmbedGenerationId }>().not.toExtend<StoreResult>();
  expectTypeOf<Store & { generationId: EmbedGenerationId; generationEpoch: number; generationVia: "embed" }>().toExtend<StoreResult>();
});

test("chat publication, posture, window and recall retain their existing discriminants", () => {
  expectTypeOf<MessageWindow["outcome"]>().toEqualTypeOf<CorpusSourceOutcome>();
  expectTypeOf<Extract<ChatBusEvent, { type: "memoryRecall" }>["phase"]>().toEqualTypeOf<MemoryRecallPhase>();
  expectTypeOf<{ seq: number; event: { type: "memoryRecall"; chatId: ChatId; phase: "recalled"; count: number } }>().not.toExtend<ChatLivePublish>();
  expectTypeOf<{ seq: null; event: { type: "memoryRecall"; chatId: ChatId; phase: "recalled"; count: number } }>().toExtend<ChatLivePublish>();
  type Summary = Pick<ChatSummary, Exclude<keyof ChatSummary, "isGame" | "gamePaused">>;
  expectTypeOf<Summary & { isGame: true; gamePaused: true }>().not.toExtend<ChatSummary>();
  expectTypeOf<Summary & { isGame: false; gamePaused: true }>().toExtend<ChatSummary>();
  type Window = Pick<MessageWindow, Exclude<keyof MessageWindow, "outcome" | "anchorMessageId" | "anchorSeq" | "endSeq" | "endMessageId">>;
  expectTypeOf<Window & { outcome: "resolved"; anchorMessageId: null; anchorSeq: null; endSeq: null; endMessageId: null }>().not.toExtend<MessageWindow>();
  expectTypeOf<
    Window & { outcome: "resolved"; anchorMessageId: MessageId; anchorSeq: number; endSeq: number; endMessageId: MessageId }
  >().toExtend<MessageWindow>();
  expectTypeOf<{ type: "memoryRecall"; chatId: ChatId; phase: "recalled"; count: null }>().not.toExtend<ChatBusEvent>();
  expectTypeOf<{ type: "memoryRecall"; chatId: ChatId; phase: "recalling"; count: number }>().not.toExtend<ChatBusEvent>();
});

test("freshness and free imagery close impossible states while foreign regex masks stay valid", () => {
  expectTypeOf<{ hasData: true; computedAt: null; stale: false }>().not.toExtend<StatsFreshness>();
  type Regex = Pick<RegexScriptBehavior, Exclude<keyof RegexScriptBehavior, "markdownOnly" | "promptOnly">>;
  expectTypeOf<Regex & { markdownOnly: true; promptOnly: true }>().toExtend<RegexScriptBehavior>();
  expectTypeOf<{ mode: "free" }>().not.toExtend<ReturnType<typeof generatePictureRequestSchema.parse>>();
  type Args = Pick<GenerateImageActionArgs, Exclude<keyof GenerateImageActionArgs, "mode" | "prompt">>;
  expectTypeOf<Args & { mode: "free" }>().not.toExtend<GenerateImageActionArgs>();
  expectTypeOf<Args & { mode: "free"; prompt: string }>().toExtend<GenerateImageActionArgs>();
  type Picture = Pick<GeneratePictureParams, Exclude<keyof GeneratePictureParams, "mode" | "prompt">>;
  expectTypeOf<Picture & { mode: "free" }>().not.toExtend<GeneratePictureParams>();
  expectTypeOf<Picture & { mode: "character_multimodal" }>().toExtend<GeneratePictureParams>();
});

test("debug existence, preview outcomes, inbox tags and actor ids remain coherent", () => {
  type Inspection = Pick<ChatInspection, Exclude<keyof ChatInspection, "found" | "chat">>;
  expectTypeOf<Inspection & { found: true; chat: null }>().not.toExtend<ChatInspection>();
  expectTypeOf<{ type: "set_variable"; renderedPreview: string; error: string }>().not.toExtend<ArmPreview>();
  expectTypeOf<{ type: "set_variable" }>().toExtend<ArmPreview>();
  type Inbox = Pick<InboxView, Exclude<keyof InboxView, "type" | "payload">>;
  type Disabled = Extract<InboxView["payload"], { type: "plugin-disabled" }>;
  expectTypeOf<Inbox & { type: "invite"; payload: Disabled }>().not.toExtend<InboxView>();
  type Binding = Pick<ConnectionBinding, "id" | "task" | "connectionId">;
  expectTypeOf<Binding & { actorKind: "user"; userId: null; ruleId: null; pluginId: null }>().not.toExtend<ConnectionBinding>();
});
