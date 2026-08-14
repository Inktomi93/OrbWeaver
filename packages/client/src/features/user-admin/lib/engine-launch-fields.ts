// The vLLM launch-config editor's FIELD SET (#14) — the `engineLaunch` leaves the Engines section actually
// writes. Homed in lib/ (not beside the editor) because TWO consumers need it and they are in different
// tiers: the editor renders it, and the Engines section's contribution def derives its `owns` claim from it
// (`useComponentExportOnlyModules` bars a components/ module from exporting a non-component).
//
// Deriving the claim is the point (SET-SEAMS §2.3, stage 4): `engineLaunch` is co-owned — this editor owns
// these leaves, and `admin-system-tuning` owns the per-request `genPresencePenalty` leaf — so a hand-copied
// claim list would drift the moment a field is added here, and the partition assertion would go quietly
// wrong instead of RED.

import type { ResolvedEngineLaunch } from "@orb/contracts/settings";
import type { AppSettingsClaimPath } from "#state";

/** The numeric launch knobs the editor exposes (a subset kept focused; the rest ride the env floor). Each
 *  maps 1:1 to a ResolvedEngineLaunch field. */
export const ENGINE_LAUNCH_NUMERIC_FIELDS = [
  {
    key: "genMaxModelLen",
    label: "Gen context window (tokens)",
    step: 1024,
    hint: "The gen engine's --max-model-len. The engine's own /v1/models report still wins for capability math.",
  },
  { key: "embedMaxModelLen", label: "Embed window (tokens)", step: 512 },
  { key: "rerankMaxModelLen", label: "Rerank window (tokens)", step: 512 },
  {
    key: "genGpuUtilMulti",
    label: "Gen GPU-util (multi-GPU)",
    step: 0.01,
    hint: "0<u≤1 fraction of each card's VRAM. Leave headroom for a co-tenant image-gen process.",
  },
  { key: "genGpuUtilSingle", label: "Gen GPU-util (single-GPU)", step: 0.01 },
  { key: "embedGpuUtil", label: "Embed GPU-util", step: 0.01 },
  { key: "genMaxPixels", label: "Gen vision max_pixels", step: 65_536 },
  { key: "poolingMaxPixels", label: "Embed/rerank vision max_pixels", step: 65_536 },
  // genRepetitionPenalty does NOT live here: unlike the argv flags above, it is a per-request default (the
  // vLLM chat surface's `repetition_penalty`, sent fresh on every call) that applies live with no restart —
  // its home is `admin-system-tuning`, beside its hot twin `genPresencePenalty`.
] as const satisfies readonly { key: keyof ResolvedEngineLaunch; label: string; step: number; hint?: string }[];

/** The model-id launch fields, edited as text. */
export const ENGINE_LAUNCH_TEXT_FIELDS = [
  { key: "genModel", label: "Gen model id" },
  { key: "embedModel", label: "Embed model id" },
  { key: "rerankModel", label: "Rerank model id" },
] as const satisfies readonly { key: keyof ResolvedEngineLaunch; label: string }[];

/** One editor field as its APP-tier claim path. The return annotation contextually types the template so
 *  the path stays a literal type rather than widening to `string`. */
function claimPath(key: keyof ResolvedEngineLaunch): AppSettingsClaimPath {
  return `engineLaunch.${key}`;
}

/** The Engines section's `owns` claim — exactly the leaves this editor patches, never the parent key (whose
 *  other leaves belong to the System-tuning section). */
export const ENGINE_LAUNCH_CLAIM_KEYS: readonly AppSettingsClaimPath[] = [...ENGINE_LAUNCH_NUMERIC_FIELDS, ...ENGINE_LAUNCH_TEXT_FIELDS].map((field) =>
  claimPath(field.key),
);
