// The typed API surface: the structural infra-op types the domain declares for the sealed `generateImage`
// executor (imagery never imports `#infra/*`), ImageryContext (the DI bundle), and ImageryService (the
// 1-verb interface). Every cross-feature dependency is a declared op type; the runtime value is wired at
// the composition root.

import type { AssetKind, StoredAsset } from "@orb/contracts/assets";
import type { CharacterCard } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { GenerationCapability } from "@orb/contracts/inference";
import type { ApplyStatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { BindingActor, Resolved } from "@orb/inference";
import type { AssetId, CharacterId, ChatId, ImageryCallId, ImageryGenerationId, ModelId, UserId } from "@orb/kit/ids";
import type { IanaTimeZone } from "@orb/kit/time";
import type { EditImageParams, ExtractionMode, ExtractPromptParams, GeneratePictureParams, MultimodalMode, ReadProvenanceParams } from "./params.ts";
import type { ExtractedPrompt, GeneratedPicture, GenerationProvenance, ImageryWarning } from "./results.ts";

// ── Internal verb-wiring op types (verb-to-verb factory injection, wired at service.ts) ──

/** The resolved keyword prompt + the caption's side-LLM spend, or null when there is no avatar to caption. */
interface CaptionResult {
  readonly prompt: string;
  readonly costUsd: number | null;
}
interface CaptionAvatarArgs {
  /** Reads the subject's card and avatar: a caption never reaches a character the caller cannot read. */
  readonly caller: Principal;
  /** Styles and funds the caption (the instruction, the Utility connection). */
  readonly runAs: Principal;
  readonly mode: MultimodalMode;
  readonly subjectCharacterId: CharacterId | undefined;
}
/** The injected caption op resolvePrompt closes over (null ⇒ no avatar to caption ⇒ caller falls back). */
export type CaptionAvatar = (args: CaptionAvatarArgs) => Promise<CaptionResult | null>;

/** The resolved prompt + which lane produced it + that lane's side-LLM spend. */
interface ResolvedPrompt {
  readonly prompt: string;
  readonly source: "extracted" | "captioned";
  readonly costUsd: number | null;
}
interface ResolvePromptArgs {
  /** The requesting human: the extraction viewer and the subject-card reader. */
  readonly caller: Principal;
  /** The principal the prompt is styled and funded as: the room host in a room (D298), else the caller. */
  readonly runAs: Principal;
  /** ABSENT for a chat-less caller (the owner-global automation lane, C5). Only the CAPTION modes can
   *  resolve without one — they read the subject's avatar — and `extractText` refuses typed when an
   *  EXTRACTION mode arrives with no chat, because its prompt comes from chat's quiet shaper reading the
   *  room's recent canon. Optional rather than nullable to match `GeneratePictureParams.chatId`, which this
   *  is threaded from unchanged. */
  readonly chatId?: ChatId | undefined;
  readonly mode: Exclude<PromptTemplateMode, "free">;
  readonly subjectCharacterId: CharacterId | undefined;
  /** The initiating viewer's zone for the extraction template's time macros; absent ⇒ chat reads UTC. */
  readonly timeZone: IanaTimeZone | undefined;
}
/** The shared prompt resolution the extractPrompt verb + generatePicture step 3 both close over. */
export type ResolvePrompt = (args: ResolvePromptArgs) => Promise<ResolvedPrompt>;

/** The card fields imagery reads: `CharacterCard` (avatarAssetId for B3/caption) + the character row's
 *  `contentHash` (the I3 identity hash). `character.get`'s `CharacterDetail` satisfies this structurally at
 *  compose — imagery never imports the character domain view. */
interface ImageryCard extends CharacterCard {
  readonly contentHash: string;
}

/** One returned image — the provider decides between a URL and inline base64 (mirrors the infra shape). */
export interface GeneratedImage {
  readonly url?: string | undefined;
  readonly base64?: string | undefined;
  readonly mediaType?: string | undefined;
}

/** The edit/img2img payload on the request's `edit` field. Structural twin of the infra `ImageEditInput`
 *  (the domain never imports `#infra/*`) — present ⇒ img2img/edit, absent ⇒ text→image. */
interface ImageEditInput {
  /** OPTIONAL init/img2img source. */
  readonly image?: Uint8Array | string | undefined;
  readonly mask?: Uint8Array | string | undefined;
  readonly references?: readonly (Uint8Array | string)[] | undefined;
}

/** The text→image request the domain hands the sealed executor. Free mode fills the credential/model/prompt/
 *  negativePrompt/size/n fields; `edit` rides B3/editImage (I4). `systemPrompt` is the optional prepend.
 *  Structural over contract/kit types (no `#infra`) — the widened twin of the infra `ImageGenerateRequest`
 *  (two spellings of one request must not drift). */
export interface ImageGenerateRequest {
  /** The RESOLVED `generateImage` connection — the runtime dispatches on its wire; credential rides inside. */
  readonly connection: Resolved<"generateImage">;
  readonly model: ModelId;
  readonly prompt: string;
  /** The generation owner (the run-as user id) — the widened twin of the infra `ImageGenerateRequest.owner`. */
  readonly owner?: UserId | undefined;
  readonly n?: number | undefined;
  readonly systemPrompt?: string | undefined;
  /** Folded into the prompt text by runners whose wire has no native negative field. */
  readonly negativePrompt?: string | undefined;
  /** A hint (same posture as `n`) — passed where the wire supports it. */
  readonly size?: { readonly width: number; readonly height: number } | undefined;
  readonly edit?: ImageEditInput | undefined;
  /** The resolved model capability the runner's edit-strip belt reads: an `edit` payload
   *  whose model lacks `input.imageEdit` is stripped + warned, never sent. The domain resolves this at every
   *  verb (the same model the edit gate reads), so it is REQUIRED here — a request build that omits it fails
   *  `tsc`, closing the "belt strips every edit because capability was never forwarded" seam. The widened twin
   *  of the infra `ImageGenerateRequest.capability` (optional there — the belt treats absent as no-edit). */
  readonly capability: GenerationCapability;
}

/** The settled cost of one generation call (null when the provider did not report it). */
export interface ImageGenerateUsage {
  readonly costUsd: number | null;
}

/** The executor's result — the returned images + the model provenance + the economics + the runner's edit-strip
 *  belt warnings (doc 03 §2). Structural twin of the infra `ImageGenerateResult.warnings` (`ResolvedWarning[]`)
 *  mapped to the domain's `ImageryWarning` at compose — two spellings of one result must not drift (doc 01 §4 note). */
export interface ImageGenerateResult {
  readonly images: readonly GeneratedImage[];
  /** Provider-reported foreign id; `runGeneration` validates/brands it before any persistence. */
  readonly model: string;
  readonly usage: ImageGenerateUsage;
  readonly warnings: readonly ImageryWarning[];
}

/** The role + capability the resolver returns as one resolution — the edit gate and the request build must
 *  read the same model. */
export interface ResolvedGenerateImage {
  readonly connection: Resolved<"generateImage">;
  readonly capability: GenerationCapability;
}

/** The injected-op bundle every imagery verb closes over, assembled at the composition root. */
export interface ImageryContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newGenerationId: () => ImageryGenerationId;
  readonly newCallId: () => ImageryCallId;
  /** The `generateImage` connection of the run-as principal (the funder). */
  readonly resolveGenerateImage: (runAs: Principal, actor?: BindingActor) => Promise<ResolvedGenerateImage>;
  /** The run-as Principal for a room picture's `runAsUserId`, read from its row so the role is real. Chat
   *  resolved the id; this op only loads it. */
  readonly resolveRunAs: (runAsUserId: UserId) => Promise<Principal>;
  /** The principal a chat-scoped preview runs as: the room host (D298). Refuses a caller the room does
   *  not admit with the leak-free not-found BEFORE any host read. */
  readonly resolveRoomRunAs: (caller: Principal, chatId: ChatId) => Promise<Principal>;
  /** The sealed `infra/providers` generateImage executor role (bound at compose). */
  readonly generateImage: (req: ImageGenerateRequest) => Promise<ImageGenerateResult>;
  /** Download a provider-returned generated-image URL to bytes through the SSRF-safe egress wrapper. `null`
   *  on any SSRF block/non-2xx/size-cap/network failure — the caller drops that image. */
  readonly fetchImage: (url: string) => Promise<Uint8Array | null>;
  /** `assets.store` — the per-user CAS write under the run-as principal. `kind` is always `"generated"` from this domain. */
  readonly storeAsset: (owner: Principal, bytes: Uint8Array, kind: AssetKind, mime: string) => Promise<StoredAsset>;
  /** The chat-owned quiet extraction shaper (over the `summarize` role — doc 02 §2): chat windows its own
   *  recent history + resolves the char/user macros against ITS MacroContext (imagery passes the raw mode
   *  template). Never persisted. `caller` is the viewer the room gate and history floor apply to;
   *  `funderUserId` is the run-as principal whose Utility connection pays. Wired at compose to chat. */
  readonly extractQuiet: (p: {
    readonly caller: Principal;
    readonly funderUserId: UserId;
    readonly chatId: ChatId;
    readonly instruction: string;
    readonly subjectCharacterId?: CharacterId | undefined;
    readonly timeZone?: IanaTimeZone | undefined;
  }) => Promise<{ readonly text: string; readonly costUsd: number | null }>;
  /** ⑫ — the run-as principal's per-mode EXTRACTION instruction: `UserSettings.imagery.templates[mode]`
   *  override ⊕ the shipped `@orb/contracts/imagery` catalog default (unset ⇒ byte-identical). Wired at compose
   *  off `settings.loadUserSettings` (the FOREIGN-inputs seam — imagery delegates the settings read). */
  readonly resolvePromptTemplate: (runAs: Principal, mode: ExtractionMode) => Promise<string>;
  /** ⑫ — the run-as principal's per-mode MULTIMODAL caption instruction (override ⊕ catalog default). */
  readonly resolveCaptionInstruction: (runAs: Principal, mode: MultimodalMode) => Promise<string>;
  /** PROSE-1 census 88 — the run-as principal's negative-prompt BASE: `UserSettings.prose["imagery.negative.base"]`
   *  override ⊕ the shipped catalog default (unset ⇒ byte-identical). In a room that is the host, like its
   *  `resolvePromptTemplate`/`resolveCaptionInstruction` siblings (D298). */
  readonly resolveNegativeBase: (runAs: Principal) => Promise<string>;
  /** The D45/D47-6 vision caption op — the ONE captioner (over `summarize`-with-images at compose; a
   *  §9-reject to duplicate). `instruction` is the multimodal template; the image IS the subject. */
  readonly captionImage: (p: {
    /** Funds the caption and supplies its sampling preset. */
    readonly runAs: Principal;
    readonly bytes: Uint8Array;
    readonly mime: string;
    readonly instruction: string;
  }) => Promise<{ readonly text: string; readonly costUsd: number | null }>;
  /** Owner-gated byte read of the caller's OWN asset (B3 avatar reference + editImage source) — assets'
   *  `readOwnedAssetBytes` (EC-B). Throws assets' not-found on non-owned; imagery does not re-gate. */
  readonly readAsset: (caller: Principal, assetId: AssetId) => Promise<{ readonly bytes: Uint8Array; readonly mime: string }>;

  /** `character.get` — the card (avatar lookup, B3) PLUS the row's `contentHash` the identity hash reads.
   * `CharacterDetail` satisfies this at compose; imagery never imports the
   *  character DOMAIN view (`CharacterCard` carries no `contentHash` — it lives on the flat row). */
  readonly getCard: (caller: Principal, characterId: CharacterId) => Promise<ImageryCard>;
  /** stats' rollup upsert, pushed into the batch that writes the provenance rows: those rows are the canon the
   *  stats rebuild re-derives image spend from, so the two commit together or neither does. */
  readonly applyStatsDelta: ApplyStatsDelta<BatchStmt[], Db>;
  /** Does `ownerId` own `characterId`? The auto-curation gate, read before any spend so a picture never
   *  targets a character its owner does not hold. Wired to the same owner-scoped `characters` read the
   *  gallery add verb gates on. */
  readonly ownsCharacter: (ownerId: UserId, characterId: CharacterId) => Promise<boolean>;
  /** `assets.addToGallery` under the picture owner's principal: join an owned picture to that owner's
   *  gallery as this character's. Idempotent on `(assetId, subjectCharacterId)`. */
  readonly addToGallery: (owner: Principal, assetId: AssetId, subjectCharacterId: CharacterId) => Promise<void>;
}

/** The imagery surface — the orchestrator + the standalone extraction preview. */
export interface ImageryService {
  /** The orchestrator: resolve prompt (user | caption | extract) → resolve role → generate → store →
   *  provenance → blocks. Never posts to chat — the caller owns message authorship. */
  readonly generatePicture: (p: GeneratePictureParams) => Promise<GeneratedPicture>;
  /** Step-1 standalone: the preview-before-spend surface (review the prompt, then generate with it). */
  readonly extractPrompt: (p: ExtractPromptParams) => Promise<ExtractedPrompt>;
  /** Read the durable provenance of a generated image (prompt/model/cost/mode/subject) — the gallery detail +
   *  the regenerate affordance (doc 04 §3). Owner-scoped (the join gates on `assets.ownerId`); `null` when the
   *  asset has no provenance row or isn't the caller's. */
  readonly readProvenance: (p: ReadProvenanceParams) => Promise<GenerationProvenance | null>;
  /** Explicit edit of an existing owned image (doc 02 §4): resolve source bytes → capability gate (throws
   *  `ImageEditUnsupportedError` when the model can't edit — the asymmetric posture, doc 01 §3.4) → generate
   *  with `edit:{image,mask?}` → store + provenance (`edited:true`, `mode:"free"`, never reuse-gated). */
  readonly editImage: (p: EditImageParams) => Promise<GeneratedPicture>;
}
