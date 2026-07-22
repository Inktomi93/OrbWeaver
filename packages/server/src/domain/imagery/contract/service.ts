// The typed API surface: the structural infra-op types the domain declares for the sealed `generateImage`
// executor (imagery never imports `#infra/*`), ImageryContext (the DI bundle), and ImageryService (the
// 1-verb interface). Every cross-feature dependency is a declared op type; the runtime value is wired at
// the composition root.

import type { AssetKind, StoredAsset } from "@orb/contracts/assets";
import type { CharacterCard } from "@orb/contracts/character";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { ImageDiffusionParams, PromptTemplateMode } from "@orb/contracts/imagery";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { AssetId, CharacterId, ChatId, ImageryGenerationId, ModelId, UserId } from "@orb/kit/ids";
import type { EditImageParams, ExtractPromptParams, GeneratePictureParams, MultimodalMode, ReadProvenanceParams } from "./params";
import type { ExtractedPrompt, GeneratedPicture, GenerationProvenance, ImageryWarning } from "./results";

// ── Internal verb-wiring op types (verb-to-verb factory injection, wired at service.ts) ──

/** The resolved keyword prompt + the caption's side-LLM spend, or null when there is no avatar to caption. */
interface CaptionResult {
  readonly prompt: string;
  readonly costUsd: number | null;
}
interface CaptionAvatarArgs {
  readonly caller: Principal;
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
  readonly caller: Principal;
  readonly chatId: ChatId;
  readonly mode: Exclude<PromptTemplateMode, "free">;
  readonly subjectCharacterId: CharacterId | undefined;
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
  /** OPTIONAL init/img2img source — a pose-only ControlNet drive (comfyui-control §4.12, C6d) carries just
   *  `poseControl` and no init (the ComfyUI arch builders fall back to an empty latent). */
  readonly image?: Uint8Array | string | undefined;
  readonly mask?: Uint8Array | string | undefined;
  readonly references?: readonly (Uint8Array | string)[] | undefined;
  /** An OpenPose SKELETON control map the ComfyUI curated arm feeds into the family's ControlNet (§4.12, C6d).
   *  The widened twin of the infra `ImageEditInput.poseControl`; the generatePicture verb resolves a pose
   *  selection (curated id / BYO assetId) to these bytes. Runners without controlnet drop it with a warning. */
  readonly poseControl?: Uint8Array | string | undefined;
}

/** The text→image request the domain hands the sealed executor. Free mode fills the credential/model/prompt/
 *  negativePrompt/size/n fields; `edit` rides B3/editImage (I4). `systemPrompt` is the optional prepend.
 *  Structural over contract/kit types (no `#infra`) — the widened twin of the infra `ImageGenerateRequest`
 *  (imagery-design/01 §4; two spellings of one request must not drift). */
export interface ImageGenerateRequest {
  readonly credential: ResolvedCredential;
  readonly model: ModelId;
  readonly prompt: string;
  /** The generation owner (the caller's user id) — the widened twin of the infra `ImageGenerateRequest.owner`.
   *  Threaded so the sealed ComfyUI BYO arm can owner-scope a `byo:<name>` workflow load (comfyui-control §4.11);
   *  every other runner ignores it. */
  readonly owner?: UserId | undefined;
  readonly n?: number | undefined;
  readonly systemPrompt?: string | undefined;
  /** Folded into the prompt text by runners whose wire has no native negative field. */
  readonly negativePrompt?: string | undefined;
  /** A hint (same posture as `n`) — passed where the wire supports it. */
  readonly size?: { readonly width: number; readonly height: number } | undefined;
  readonly edit?: ImageEditInput | undefined;
  /** The optional diffusion knobs (MA-8/D96) — honored by a local engine (ComfyUI), ignored-with-honesty by
   *  hosted sources. The widened twin of the infra `ImageGenerateRequest.imageParams`. */
  readonly imageParams?: ImageDiffusionParams | undefined;
  /** The resolved model capability the runner's edit-strip belt reads (imagery-design/03 §1): an `edit` payload
   *  whose model lacks `input.imageEdit` is stripped + warned, never sent. The domain resolves this at every
   *  verb (the same model the edit gate reads), so it is REQUIRED here — a request build that omits it fails
   *  `tsc`, closing the "belt strips every edit because capability was never forwarded" seam. The widened twin
   *  of the infra `ImageGenerateRequest.capability` (optional there — the belt treats absent as no-edit). */
  readonly capability: ModelCapability;
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
  readonly model: string;
  readonly usage: ImageGenerateUsage;
  readonly warnings: readonly ImageryWarning[];
}

/** The role + capability the resolver returns as one resolution — the edit gate and the request build must
 *  read the same model. */
export interface ResolvedGenerateImage {
  readonly connection: ResolvedConnection;
  readonly capability: ModelCapability;
}

/** The injected-op bundle every imagery verb closes over, assembled at the composition root. */
export interface ImageryContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newGenerationId: () => ImageryGenerationId;
  readonly resolveGenerateImage: (caller: Principal) => Promise<ResolvedGenerateImage>;
  /** The sealed `infra/providers` generateImage executor role (bound at compose). */
  readonly generateImage: (req: ImageGenerateRequest) => Promise<ImageGenerateResult>;
  /** Download a provider-returned generated-image URL to bytes through the SSRF-safe egress wrapper. `null`
   *  on any SSRF block/non-2xx/size-cap/network failure — the caller drops that image. */
  readonly fetchImage: (url: string) => Promise<Uint8Array | null>;
  /** `assets.store` — the per-user CAS write. `kind` is always `"generated"` from this domain. */
  readonly storeAsset: (caller: Principal, bytes: Uint8Array, kind: AssetKind, mime: string) => Promise<StoredAsset>;
  /** The chat-owned quiet extraction shaper (over the `summarize` role — doc 02 §2): chat windows its own
   *  recent history + resolves the char/user macros against ITS MacroContext (imagery passes the raw mode
   *  template). Never persisted; spend attributed to `caller` as triggeredBy. Wired at compose to chat. */
  readonly extractQuiet: (p: {
    readonly caller: Principal;
    readonly chatId: ChatId;
    readonly instruction: string;
    readonly subjectCharacterId?: CharacterId | undefined;
  }) => Promise<{ readonly text: string; readonly costUsd: number | null }>;
  /** The D45/D47-6 vision caption op — the ONE captioner (over `summarize`-with-images at compose; a
   *  §9-reject to duplicate). `instruction` is the multimodal template; the image IS the subject. */
  readonly captionImage: (p: {
    readonly caller: Principal;
    readonly bytes: Uint8Array;
    readonly mime: string;
    readonly instruction: string;
  }) => Promise<{ readonly text: string; readonly costUsd: number | null }>;
  /** Owner-gated byte read of the caller's OWN asset (B3 avatar reference + editImage source) — assets'
   *  `readOwnedAssetBytes` (EC-B). Throws assets' not-found on non-owned; imagery does not re-gate. */
  readonly readAsset: (caller: Principal, assetId: AssetId) => Promise<{ readonly bytes: Uint8Array; readonly mime: string }>;
  /** Read one CURATED pose skeleton's BYTES by its library id (comfyui-control §4.12, C6d). Curated poses are
   *  GLOBAL shipped-static content (NOT per-user CAS — the C6b ruling), so this reads the shipped skeleton file
   *  under the client-static pose-library root (path-confined at the adapter; `null` for an unknown/escaping id).
   *  The generatePicture verb threads the bytes into the executor's `edit.poseControl`. BYO poses use `readAsset`. */
  readonly readCuratedPose: (poseRef: string) => Promise<Uint8Array | null>;
  /** `character.get` — the card (avatar lookup, B3) PLUS the row's `contentHash` the identity hash reads
   *  (I3, imagery-design/03 §4.3). `CharacterDetail` satisfies this at compose; imagery never imports the
   *  character DOMAIN view (`CharacterCard` carries no `contentHash` — it lives on the flat row). */
  readonly getCard: (caller: Principal, characterId: CharacterId) => Promise<ImageryCard>;
  readonly recordStats: (delta: StatsDelta) => Promise<void>;
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
