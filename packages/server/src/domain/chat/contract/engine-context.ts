// The engine's actual capabilities: frozen turn inputs and execution, never request authorization.
import type { DurableChatBusEvent, PromptTransformPoint, PromptTransformResult, ToolCallRecord } from "@orb/contracts/chat";
import type { ChatMembership } from "@orb/contracts/identity";
import type { AttachmentQuality } from "@orb/contracts/inference";
import type { ChatToolDefinition, GeneratedImage, Resolved, ToolCallInput } from "@orb/inference";
import type { ContentImageRef } from "@orb/kit/content";
import type {
  AssetId,
  CharacterId,
  ChatId,
  ChatStreamEventId,
  ChatStreamGenerationId,
  ChatTurnId,
  MessageAssetId,
  MessageId,
  MessageVariantId,
  UserId,
} from "@orb/kit/ids";
import type { RegexReplacer } from "@orb/kit/regex";
import type { TimerScheduler } from "@orb/kit/time";
import type { Logger, WireOutcome } from "#foundation/observability";
import type { ChatAccountingContext } from "./accounting-context.ts";
import type { BuildTurnMemoryArgs, MemoryRecallResult, RecallMemoryArgs, WitnessInterval } from "./memory.ts";
import type { CompactResult, ResolvedMediaRef, TurnRequest, TurnStreamChunk } from "./results.ts";
import type { RpgTurnOps } from "./rpg-turn.ts";

/** The Node regex watchdog owns execution time outside the pure regex library. */
export type ApplyRegexReplaceOp = (text: string, regex: RegExp, replacer: RegexReplacer) => string;

// Detail changes the room row; extra recipients include members just removed from its roster.
interface EmitChatChangedOptions {
  readonly detail?: boolean;
  readonly extraUserIds?: readonly UserId[];
}
/** Best-effort chat-list fan to every present member, never a turn failure. */
export type EmitChatChanged = (chatId: ChatId, options?: EmitChatChangedOptions) => Promise<void>;
/** Runs the already-resolved turn route without accepting request authorization. */
export type RunChatTurnOp = (req: TurnRequest) => AsyncIterable<TurnStreamChunk>;

/** Execution carries the frozen host and initiator, not a request Principal. */
export interface ChatToolExecFrame {
  readonly runAsUserId: UserId;
  readonly triggeredBy: UserId;
  readonly chatId: ChatId;
  readonly membership: ChatMembership | null;
  readonly turnId: ChatTurnId;
  readonly signal?: AbortSignal | undefined;
}

/** Bound to one turn; individual tool failures remain ordered errors-as-data. */
export type BoundToolExecution = (calls: readonly ToolCallInput[]) => Promise<readonly ToolCallRecord[]>;

/** Set identity remains private to its owning registry. */
export interface ChatToolSet {
  readonly toToolDefinitions: () => readonly ChatToolDefinition[];
  readonly prepareExecution: (frame: ChatToolExecFrame) => Promise<BoundToolExecution>;
}

export interface ChatToolOps {
  /** Resolve on the frozen host's shelf: identical names can belong to different installers. */
  readonly resolveTools: (driverUserId: UserId, names: readonly string[]) => ChatToolSet;
}

/** A failed transform skips; a deliberate refusal remains distinct in the typed result. */
export type ApplyPromptTransformsOp = (
  point: PromptTransformPoint,
  chatId: ChatId,
  draft: string,
  vars: Record<string, string>,
) => Promise<PromptTransformResult>;

// Null omits a gone or policy-blocked attachment instead of sending an unauthorized reference.
type ResolveImageUrlOp = (params: {
  readonly ownerId: UserId;
  readonly chatId: ChatId;
  readonly ref: ContentImageRef;
  readonly quality?: AttachmentQuality | undefined;
  readonly signal?: AbortSignal | undefined;
}) => Promise<ResolvedMediaRef | null>;

// Store in the frozen host's CAS so every room member can read it; compose owns SSRF and byte validation.
// Null drops only the refused picture, never the model's prose or a dangling canon asset reference.
type StoreInlineReplyImageOp = (ownerId: UserId, image: GeneratedImage) => Promise<{ readonly assetId: AssetId } | null>;

export interface EngineContext extends Pick<ChatAccountingContext, "db" | "now" | "applyStatsDelta" | "resolveRetainedChatAccountingScope"> {
  readonly logger: Logger;
  readonly timers: TimerScheduler;
  readonly backgroundSignal?: AbortSignal;
  readonly trackBackground?: (settled: Promise<void>, chatId: ChatId) => void;
  /** The wire-capture outcome recorder; compose wires it only when wire capture is on. */
  readonly recordTurnOutcome?: (outcome: WireOutcome) => void;
  readonly newMessageId: () => MessageId;
  readonly newMessageVariantId: () => MessageVariantId;
  readonly newMessageAssetId: () => MessageAssetId;
  readonly newStreamEventId: () => ChatStreamEventId;
  readonly newStreamGenerationId: () => ChatStreamGenerationId;
  readonly newChatTurnId: () => ChatTurnId;
  readonly emitChatChanged: EmitChatChanged;
  readonly applyRegexReplace: ApplyRegexReplaceOp;
  /** The service PRNG the turn-stage macro context draws `{{random}}`/`{{roll}}`/`{{pick}}` from. */
  readonly prng: () => number;
  readonly runChatTurn: RunChatTurnOp;
  readonly tools: ChatToolOps | null;
  readonly resolveImageUrl: ResolveImageUrlOp;
  readonly storeInlineReplyImage: StoreInlineReplyImageOp;
  readonly promptTransforms: ApplyPromptTransformsOp | null;
  readonly rpg: RpgTurnOps | null;
}

// Collect forbidden keys before intersecting so a narrow union member cannot hide a wider one.
type EngineContextAuthorityKeys<Context extends EngineContext> = Context extends EngineContext ? Exclude<keyof Context, keyof EngineContext> : never;
type EngineRpgAuthorityKeys<Ops extends RpgTurnOps | null> = Ops extends RpgTurnOps ? Exclude<keyof Ops, keyof RpgTurnOps> : never;

/** Reject extra authority on every inferred producer alternative, including its nested RPG port. */
export type EngineContextInput<Context extends EngineContext> = Context &
  Record<EngineContextAuthorityKeys<Context>, never> & {
    readonly rpg: (NonNullable<Context["rpg"]> & Record<EngineRpgAuthorityKeys<Context["rpg"]>, never>) | null;
  };

/** Composition binds memory and compaction outside the engine; no callback accepts a chat context. */
export interface EngineDeps {
  readonly emit: (event: DurableChatBusEvent) => Promise<void>;
  readonly holder: string;
  readonly lockTtlMs: number;
  readonly generateMemory: (args: BuildTurnMemoryArgs) => Promise<void>;
  readonly loadWitnessHorizons: (chatId: ChatId, characterId: CharacterId) => Promise<WitnessInterval[]>;
  readonly recallMemory: (args: RecallMemoryArgs) => Promise<MemoryRecallResult>;
  readonly runCompaction: (args: {
    readonly chatId: ChatId;
    readonly connection: Resolved<"chat">;
    readonly ownerId: UserId;
    readonly coveragePoint?: number | undefined;
    readonly instructions?: string | undefined;
    readonly signal?: AbortSignal | undefined;
  }) => Promise<CompactResult>;
}
