// domain/imagery/contract/params — every verb's *Params, declared ONCE (§7.4 — one type home). The wire
// input (`generatePictureRequestSchema`) lives in `@orb/contracts/imagery`; the verb params WRAP it with the
// acting `caller` Principal (resolved at the entry seam — the verb gates on the principal it is handed) and
// the branded chat id. P5 drives `mode:"free"` with a required `prompt`; the extraction modes are Phase 7.

import type { Principal } from "@orb/contracts/identity";
import type { ExtractionMode as CatalogExtractionMode, MultimodalCaptionMode, PromptTemplateMode, SizePresetName } from "@orb/contracts/imagery";
import type { BindingActor } from "@orb/inference";
import type { AssetId, CharacterId, ChatId } from "@orb/kit/ids";

// The mode SUBSETS home in `@orb/contracts/imagery` (the canonical `EXTRACTION_MODES`/`MULTIMODAL_MODES`
// tuples the default catalog keys on, Phase B ⑫) — re-exported here under the domain's local names so the
// substrate guards + params keep their type-home import path (no re-spell — the `no-inline-union-redecl` law).
/** The multimodal caption modes (doc 02 §3). */
export type MultimodalMode = MultimodalCaptionMode;
/** The four text-extraction modes — NOT "free", NOT multimodal (doc 02 §2). */
export type ExtractionMode = CatalogExtractionMode;
/** The subject-bearing "portrait" modes the reuse gate scopes to (doc 03 §4.4) — character/face + their
 *  multimodal variants. Scenario/background/free are moment art, never reuse-matched. */
export type PortraitMode = Extract<PromptTemplateMode, "character" | "face" | MultimodalMode>;

/** The reuse-gate policy (doc 03 §4.4): `"prefer"` (default) short-circuits to a matching prior portrait;
 *  `"never"` is the regenerate affordance (always a fresh generation). */
export type ReusePolicy = "prefer" | "never";

/** `generatePicture` — the orchestrator's params. `caller` is the triggeredBy for
 *  spend + the CAS owner; `chatId` is provenance + the extraction-shaper's history scope (REQUIRED unless
 *  `mode:"free"` with a `prompt`); `prompt` present OR `mode:"free"` skips extraction (used verbatim);
 *  `subjectCharacterId` focuses the char macro / picks the avatar for character/face + multimodal modes.
 *  (`negative`/`size`/`useAvatarReference`/`reuse` land with I2/I3 — doc 05 FORK 2 + the reuse gate.) */
export interface GeneratePictureParams {
  readonly caller: Principal;
  /** The binding actor whose own generateImage binding is folded before the caller's (an automation rule's). */
  readonly actor?: BindingActor | undefined;
  readonly chatId?: ChatId | undefined;
  readonly mode: PromptTemplateMode;
  readonly prompt?: string | undefined;
  readonly n?: number | undefined;
  readonly subjectCharacterId?: CharacterId | undefined;
  /** Appended to `DEFAULT_NEGATIVE` (doc 02 §6), never replaces it. */
  readonly negative?: string | undefined;
  /** Overrides `defaultSizeFor(mode)` (doc 02 §6). */
  readonly size?: SizePresetName | undefined;
  /** B2 reuse gate (doc 03 §4.4); default `"prefer"`. Portrait modes only; `"never"` = regenerate. */
  readonly reuse?: ReusePolicy | undefined;
  /** B3 avatar-reference conditioning (doc 03 §3); default false. Portrait modes only: conditions the
   *  generation on the subject's avatar for identity consistency. Drops-with-warning (never throws) when the
   *  resolved model lacks `input.imageEdit` — the asymmetric posture vs `editImage` (doc 01 §3.4). */
  readonly useAvatarReference?: boolean | undefined;

  /** An EXTERNALLY-computed reuse hash a non-character consumer stores on this generation's provenance so its
   *  OWN reuse gate can short-circuit later (docs/plans/rpg/design.md — NPC portraits are content-addressed by the
   *  npc identity tuple; rpg computes it via imagery's `identityHashFor`, never a second hash derivation).
   *  Honored ONLY in `mode:"free"` (the subject-character portrait modes own the internal reuse gate, which
   *  supersedes this). Absent ⇒ the provenance `identityHash` stays null (the additive-only guarantee — the
   *  existing free/scenario/edit paths are byte-identical). rpg reads it back via `readProvenance`. */
  readonly identityHash?: string | undefined;
}

/** `readProvenance` — read a generated image's durable provenance by its asset (owner-scoped through the
 *  `assets` join). The gallery detail + the regenerate affordance (doc 04 §3). */
export interface ReadProvenanceParams {
  readonly caller: Principal;
  readonly assetId: AssetId;
}

/** `extractPrompt` — the standalone step-1 preview surface (review the prompt before spending on a
 *  generation). `free` is excluded at the type level (nothing to extract); multimodal modes caption. */
export interface ExtractPromptParams {
  readonly caller: Principal;
  readonly chatId: ChatId;
  readonly mode: Exclude<PromptTemplateMode, "free">;
  readonly subjectCharacterId?: CharacterId | undefined;
}

/** The edit source (doc 01 §3.2): an OWNED asset (owner-gated by `readAsset`) or uploaded bytes the transport
 *  already size-capped — never a URL (the SSRF surface, doc 04 §7; v1 has no need). */
export type EditImageSource = { readonly assetId: AssetId } | { readonly bytes: Uint8Array; readonly mime: string };

/** `editImage` — explicit edit of an existing owned image (doc 02 §4). `instruction` is the edit prompt used
 *  VERBATIM (no template, no extraction — an edit instruction is not keyword soup); `chatId` is provenance
 *  only. Throws `ImageEditUnsupportedError` when the resolved model lacks `input.imageEdit` (the asymmetric
 *  posture — doc 01 §3.4). Edits are never reuse-gated (mode recorded `"free"`, `identityHash` null). */
export interface EditImageParams {
  readonly caller: Principal;
  readonly chatId?: ChatId | undefined;
  readonly source: EditImageSource;
  readonly instruction: string;
  /** Inpaint region — transparent = editable. Dropped-with-warning by a wire without a mask channel (doc 03 §2.3). */
  readonly mask?: { readonly bytes: Uint8Array; readonly mime: string } | undefined;
  readonly n?: number | undefined;
  /** Omit to preserve the source dimensions (forcing a preset onto an edit crops/distorts the subject — doc 02 §4). */
  readonly size?: SizePresetName | undefined;
}
