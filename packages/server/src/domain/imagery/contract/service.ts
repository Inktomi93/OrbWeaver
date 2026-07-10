// domain/imagery/contract/service — the typed API surface (read THIS to know everything the imagery domain
// does). Holds:
//   • the STRUCTURAL infra-op types (`ImageGenerateRequest`/`ImageGenerateResult`/`GeneratedImage`) the
//     domain declares for the sealed `generateImage` executor — imagery is a DOMAIN and NEVER imports
//     `#infra/*`; it declares the op SHAPE here (built from contract/kit types only) and the composition
//     root binds the real `infra/providers` executor to it. This MIRRORS how `domain/chat` types its turn
//     role (`RunChatTurnOp` over chat-OWNED `TurnRequest`/`TurnStreamChunk`, adapted at compose) — the same
//     "domain declares the port, compose adapts infra" layering, not a new one.
//   • ImageryContext — the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4).
//   • ImageryService — the 1-verb (P5) authoritative interface (the front door re-exports the type).
//
// Imagery sideways-imports NOTHING (domain-no-cross-feature): every cross-feature dependency is a declared op
// type here; the runtime value is wired at the composition root.

import type { AssetKind, StoredAsset } from "@orb/contracts/assets";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { ImageryGenerationId, ModelId } from "@orb/kit/ids";
import type { GeneratePictureParams } from "./params";
import type { GeneratedPicture } from "./results";

// ── The sealed image-generation executor port (structural — the infra `generateImage` role) ───────────────
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

/** The role + capability the resolver returns as ONE resolution (imagery-design/01 §2 — the edit gate and
 *  the request build must read the SAME model; two ops invite a resolve/read race). P5 uses only
 *  `connection`; `capability` is carried for the Phase-7 edit gate. */
export interface ResolvedGenerateImage {
  readonly connection: ResolvedConnection;
  readonly capability: ModelCapability;
}

/**
 * The injected-op bundle every imagery verb closes over (assembled at the entry composition root, handed to
 * `createImageryService`). `db` is the `imagery_generations` handle (persistence/ is its sole user); `now` is
 * the determinism seam (no ambient `Date.now()` — testing §3); `newGenerationId` is the injected id minter.
 * The four ops are the cross-feature/infra seams — connection role resolution, the sealed executor, the CAS
 * write, and the stats delta apply — each declared as a narrow op type (the narrowed-slice discipline).
 */
export interface ImageryContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newGenerationId: () => ImageryGenerationId;
  /** `connection.resolveRole("generateImage")` + the resolved model's capability descriptor. */
  readonly resolveGenerateImage: (caller: Principal) => Promise<ResolvedGenerateImage>;
  /** The sealed `infra/providers` generateImage executor role (bound at compose). */
  readonly generateImage: (req: ImageGenerateRequest) => Promise<ImageGenerateResult>;
  /** Download a provider-returned generated-image URL to bytes through the SSRF-safe egress wrapper
   *  (`infra/network` `fetchImageBytes`, bound at compose). The URL is populated by the CHOSEN
   *  (OpenRouter-marketplace) model provider's response — attacker-influenceable, NEVER fetched raw.
   *  `null` on any SSRF block / non-2xx / size-cap / network failure → the caller DROPS that image
   *  (a poisoned URL is never stored; a zero-image result throws downstream). */
  readonly fetchImage: (url: string) => Promise<Uint8Array | null>;
  /** `assets.store` — the per-user CAS write (D21). `kind` is always `"generated"` from this domain. */
  readonly storeAsset: (
    caller: Principal,
    bytes: Uint8Array,
    kind: AssetKind,
    mime: string,
  ) => Promise<StoredAsset>;
  /** `stats.applyDelta` — the generation's economics row (imagery-design/02 §8). */
  readonly recordStats: (delta: StatsDelta) => Promise<void>;
}

/** The imagery surface — P5 exposes ONLY `generatePicture` (free mode). The Phase-7 verbs (`extractPrompt`/
 *  `editImage`) grow this interface additively (imagery-design/01 §3.1). */
export interface ImageryService {
  /** The orchestrator: resolve role → generate → store → provenance → blocks. Never posts to chat (the
   *  caller owns message authorship — imagery-design/04 §2). */
  readonly generatePicture: (p: GeneratePictureParams) => Promise<GeneratedPicture>;
}
