// The params deck's GHOST model (preset-surface-redesign.md §4.1/§4.2/§4.3) — the pure half that turns the
// server's effective profile into what a KnobRow renders when a knob is left INHERITED.
//
// The values here are the funnel's own (`preset.resolveEffective`, D5) — the exact `resolveChat(params,
// capability)` a turn runs, labelled server-side by rung. This file re-derives NOTHING: it maps a
// provenance label onto its display gloss and picks which number the ghost thumb sits at. A client
// re-derivation of quality→knob defaults is the drift `capability-panel-model.ts` already bans (a
// `QUALITY_SAMPLING` import in `features/preset` is the review flag, §12).
//
// The row shapes below are the MINIMAL structural mirror of the tRPC read (the `PresetForkRow` idiom —
// tRPC-inferred at the call site, never a re-declared contract): the effective view lives in
// `domain/preset/contract/views.ts`, which the client cannot import across the cake.

/** One resolved knob as the read returns it: the value the wire would carry + which rung produced it. */
export interface EffectiveKnobRow {
  readonly value: number | string;
  readonly provenance: string;
}

/** The effective profile the deck reads (`preset.resolveEffective`). `knobs` is keyed by the server's
 *  `EffectiveKnob` names — the same spelling as the capability's sampling keys, which is why a knob spec
 *  can look itself up by its own capability key. */
export interface EffectiveProfileRow {
  readonly model: string;
  readonly knobs: Readonly<Record<string, EffectiveKnobRow | undefined>>;
  readonly stale: readonly { readonly knob: string; readonly value: number | string }[];
}

/** What a KnobRow needs to paint its inherited state: the number to ghost at + the provenance gloss. */
export interface KnobGhost {
  /** The effective value the ghost thumb sits at (and the twin shows as its placeholder). */
  readonly value: number;
  /** The terse provenance line under the track — `null` when there is nothing non-obvious to say. */
  readonly gloss: string | null;
}

/** The clamp gloss for an EXPLICIT knob the capability moved — decision-load-bearing, so it stays VISIBLE
 *  (never behind a hover hint, §4.1). `null` when the stored value survived the funnel intact. */
export function clampGloss(effective: EffectiveKnobRow | undefined, bounds: { readonly min: number; readonly max: number }): string | null {
  if (effective === undefined || effective.provenance !== "clamped" || typeof effective.value !== "number") {
    return null;
  }
  const at = effective.value;
  if (at === bounds.max) {
    return `clamped to ${at} — this model's max`;
  }
  if (at === bounds.min) {
    return `clamped to ${at} — this model's min`;
  }
  return `clamped to ${at}`;
}

/** The ghost for an UNSET knob: the funnel's own value + the rung that produced it, in the deck's terse
 *  vocabulary. `null` when the funnel emits nothing for this knob on this model — the honest empty (there
 *  is no default to show, so the row simply carries no ghost rather than inventing one). */
export function knobGhost(effective: EffectiveKnobRow | undefined, quality: string | undefined): KnobGhost | null {
  if (effective === undefined || typeof effective.value !== "number") {
    return null;
  }
  return { value: effective.value, gloss: ghostGloss(effective.provenance, quality) };
}

/** The provenance line, keyed by the server's rung vocabulary. An unknown rung reads as no gloss rather
 *  than a fabricated one (the read is the authority on its own labels). */
function ghostGloss(provenance: string, quality: string | undefined): string | null {
  if (provenance === "quality") {
    return quality === undefined ? "← quality" : `← quality (${quality})`;
  }
  if (provenance === "modelDefault") {
    return "model default";
  }
  if (provenance === "floor") {
    return "default";
  }
  // The ONE client-supplied rung (`params-limits.tsx`): `maxContextTokens` is OUR history soft-cap, not a
  // wire knob — it never enters `resolveChat`, so the funnel reports nothing for it and the honest ghost is
  // the model's own window off the capability descriptor. Named as its own rung so it can never be read as
  // a funnel claim.
  if (provenance === "window") {
    return "full window";
  }
  // `explicit`/`clamped` on an UNSET row means the profile is one debounce behind the edit that cleared it
  // (the §4.4 settle-live lag). Ghost the value it still resolves to, but claim no rung for it.
  return null;
}

/** The QUALITY cluster's mapping gloss (§4 cluster 1) — what the dial is CURRENTLY feeding, read straight
 *  off the resolver's provenance labels rather than a client re-mapping of quality→axes. `null` with no
 *  dial set; the "everything overridden" case says so instead of rendering an empty arrow. */
export function qualityMappingGloss(profile: EffectiveProfileRow | undefined, quality: string | undefined, labelOf: (knob: string) => string): string | null {
  if (quality === undefined) {
    return null;
  }
  if (profile === undefined) {
    return `${quality} — connect a chat model to see what it maps onto`;
  }
  const dialed = Object.entries(profile.knobs).filter(([, reading]) => reading?.provenance === "quality");
  if (dialed.length === 0) {
    return `${quality} — every knob the dial feeds is overridden explicitly below`;
  }
  const parts = dialed.map(([knob, reading]) => `${labelOf(knob)} ${String(reading?.value)}`);
  return `${quality} → ${parts.join(" · ")} — explicit knobs below override this`;
}
