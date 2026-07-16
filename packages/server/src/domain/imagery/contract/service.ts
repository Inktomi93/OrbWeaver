// The typed API surface: the structural infra-op types the domain declares for the sealed `generateImage`
// executor (imagery never imports `#infra/*`), ImageryContext (the DI bundle), and ImageryService (the
// 1-verb interface). Every cross-feature dependency is a declared op type; the runtime value is wired at
// the composition root.

import type { AssetKind, StoredAsset } from "@orb/contracts/assets";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { ImageryGenerationId, ModelId } from "@orb/kit/ids";
import type { GeneratePictureParams } from "./params";
import type { GeneratedPicture } from "./results";

/** One returned image — the provider decides between a URL and inline base64 (mirrors the infra shape). */
export interface GeneratedImage {
  readonly url?: string | undefined;
  readonly base64?: string | undefined;
  readonly mediaType?: string | undefined;
}

/** The text→image request the domain hands the sealed executor. P5 free mode fills
 *  `{credential, model, prompt, n}`; `systemPrompt` is the optional prepend. Structural over contract/kit
 *  types (no `#infra`). */
export interface ImageGenerateRequest {
  readonly credential: ResolvedCredential;
  readonly model: ModelId;
  readonly prompt: string;
  readonly n?: number | undefined;
  readonly systemPrompt?: string | undefined;
}

/** The settled cost of one generation call (null when the provider did not report it). */
export interface ImageGenerateUsage {
  readonly costUsd: number | null;
}

/** The executor's result — the returned images + the model provenance + the economics. */
export interface ImageGenerateResult {
  readonly images: readonly GeneratedImage[];
  readonly model: string;
  readonly usage: ImageGenerateUsage;
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
  readonly recordStats: (delta: StatsDelta) => Promise<void>;
}

/** The imagery surface — exposes only `generatePicture` (free mode). */
export interface ImageryService {
  /** The orchestrator: resolve role → generate → store → provenance → blocks. Never posts to chat — the
   *  caller owns message authorship. */
  readonly generatePicture: (p: GeneratePictureParams) => Promise<GeneratedPicture>;
}
