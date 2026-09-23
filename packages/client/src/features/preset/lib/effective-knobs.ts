// The params deck's GHOST model — the pure half that turns the
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

import { modelDisplayName } from "@orb/kit/model-name";

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
  /** What the QUALITY dial feeds, as the dial declares it — the server's own projection (§4 cluster 1).
   *  `null`/absent = no dial set, or nothing it feeds exists on this model. */
  readonly qualityMapping: { readonly quality: string; readonly entries: readonly { readonly knob: string; readonly value: number | string }[] } | null;
}

/** The DISPLAY name for one resolved knob. The read is keyed by SCHEMA names (`maxOutputTokens`), and a
 *  readout that prints those is showing the eye a wire identifier instead of a datum label (side-eye
 *  F-13; the mock reads "max output"). Display only — the read stays the authority on its own keys, and
 *  an unmapped key prints itself rather than being hidden. ONE home: the readout rows, the quality-mapping
 *  gloss and the staleness copy all read it, so the surfaces cannot drift on what a knob is called. */
const KNOB_LABELS: Readonly<Record<string, string>> = {
  temperature: "temperature",
  topP: "top-p",
  topK: "top-k",
  minP: "min-p",
  topA: "top-a",
  frequencyPenalty: "freq. penalty",
  presencePenalty: "presence penalty",
  repetitionPenalty: "rep. penalty",
  seed: "seed",
  effort: "effort",
  thinkingBudgetTokens: "thinking budget",
  thinkingDisplay: "reasoning display",
  maxOutputTokens: "max output",
  maxContextTokens: "context",
  verbosity: "verbosity",
};

/** {@link KNOB_LABELS} with the honest fallback. */
export function knobLabel(knob: string): string {
  return KNOB_LABELS[knob] ?? knob;
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

/** The CONTEXT readout's terse provenance suffix for one resolved row (§7 — the `2048 default` /
 *  `high ← quality` column). `null` for an EXPLICIT value: "you set it" is what the absence of a suffix
 *  already says, and a badge on every row you touched is noise. Shares this file's rung vocabulary with
 *  the deck's ghost gloss so the two surfaces cannot drift on what a rung is called. */
export function provenanceSuffix(provenance: string): string | null {
  if (provenance === "explicit") {
    return null;
  }
  if (provenance === "quality") {
    return "← quality";
  }
  if (provenance === "modelDefault") {
    return "model default";
  }
  if (provenance === "floor") {
    return "default";
  }
  if (provenance === "window") {
    return "window";
  }
  if (provenance === "clamped") {
    return "clamped";
  }
  return provenance;
}

/** WHICH MODEL the effective read resolved against, in the ONE grammar both surfaces state it in — the
 *  CONTEXT readout's own line (`EffectiveProfile`, which appends `· chat role`) and the editor header's
 *  provenance chip (G7), whose sanctioned echo exists because the LIST can be a closed sheet and the
 *  CONTEXT panel can be away, so the fact must survive where the preset is named.
 *
 *  It is a FUNCTION, not two literals, because the header's earlier spelling — the bare `for <model>` —
 *  read as a claim about the PRESET ("this preset is for anthropic/…") rather than a statement about the
 *  numbers beside it (crunch-list O-2). "resolved for" is the readout's verb, and a resolution is exactly
 *  what happened: `preset.resolveEffective` ran against the caller's current chat model. Two hand-typed
 *  spellings of one fact is how that misreading got in; one home is how it stays out.
 *
 *  IT NAMES THE MODEL, IT DOES NOT QUOTE ITS PATH (#115). A self-hosted engine reports a 106-character
 *  local weights path, and this line printed it verbatim — twice in one panel, ~100px apart, wrapping the
 *  chip and the gloss. The fix is NEW VOCABULARY, not a dedup: O-2 rules the GRAMMAR ("resolved for X" is a
 *  statement about the numbers, not a claim about the preset) and that grammar is untouched — only the
 *  rendering of X changed, to `@orb/kit/model-name`'s display derivation. Callers keep `effective.model`
 *  and gloss the full identifier where it belongs (a `title`), so nothing is lost. */
export function resolvedForLabel(model: string): string {
  return `resolved for ${modelDisplayName(model)}`;
}

/** The dial's OFF arm, as the deck AND the readout state it (owner ruling O-18). "No quality" is a REAL,
 *  named arm of the dropdown — it is stored as the ABSENCE of `params.quality`, which is the funnel's own
 *  off arm (nothing is fed; see `qualitySelectValue`'s header for why absence and not a fourth enum) — so
 *  the surface that reads the dial must SAY so rather than rendering the mapping row away. A hidden row is
 *  how "off" and "the read hasn't landed" became indistinguishable. */
const QUALITY_OFF_GLOSS = "quality off — knobs are what you set";

/** The QUALITY cluster's MAPPING DATUM (§4 cluster 1, the mock's `deep → effort high · temp 1.0`) — the
 *  server's projection of the dial's own table, formatted. Never a client re-mapping of quality→axes (the
 *  drift `capability-panel-model.ts` bans), and never derived from the funnel's OUTPUT either: the previous
 *  spelling filtered for knobs the funnel attributed to the dial, so a dial whose knobs were all overridden
 *  rendered "every knob the dial feeds is overridden" — an override STATUS where the mock asks for the
 *  mapping (side-eye F-15). What the dial does is a fact about the dial; the override note rides beside it.
 *
 *  `null` with no dial set, or before the read lands — nothing to state, and in particular NOT a claim
 *  about the connection. It used to say "<dial> — connect a chat model to see what it maps onto" whenever
 *  the profile was absent, which (like `CapabilityGate`'s deleted empty state, same F-02 class) was a
 *  PENDING-only flash: `preset.resolveEffective` resolves against whatever chat model the caller has and
 *  THROWS when routing is broken, so an absent profile is a read that has not landed or one that failed —
 *  never the settled fact "you have no chat model". The failure is already stated ONCE, by the gate that
 *  owns it; a second, wronger spelling of it under the dial is exactly the drift this header forbade. */
export function qualityMappingGloss(profile: EffectiveProfileRow | undefined, quality: string | undefined): string | null {
  if (quality === undefined) {
    return QUALITY_OFF_GLOSS;
  }
  const mapping = profile?.qualityMapping;
  if (mapping === undefined || mapping === null) {
    return null;
  }
  const parts = mapping.entries.map((entry) => `${knobLabel(entry.knob)} ${String(entry.value)}`);
  return `${mapping.quality} → ${parts.join(" · ")}`;
}

/** Which of the dial's knobs a stored explicit value currently OVERRIDES — the status half the mapping
 *  gloss deliberately no longer carries. `null` when the dial is unset or nothing overrides it.
 *
 *  FILE-LOCAL: `qualityDeckGloss` below is now its only caller (the deck stopped rendering the two halves
 *  as two lines and reads the joined one instead). It stays a separate derivation — that separation is the
 *  F-15 ruling — but it is no longer part of this module's surface. */
function qualityOverrideGloss(profile: EffectiveProfileRow | undefined): string | null {
  const mapping = profile?.qualityMapping;
  if (mapping === undefined || mapping === null) {
    return null;
  }
  const overridden = mapping.entries.filter((entry) => profile?.knobs[entry.knob]?.provenance === "explicit").map((entry) => knobLabel(entry.knob));
  if (overridden.length === 0) {
    return "explicit knobs below override this";
  }
  return `${overridden.join(" · ")} set explicitly below — the dial no longer feeds ${overridden.length === 1 ? "it" : "them"}`;
}

/** The DECK's quality line — ONE line, the mock's own ("deep → effort high · temp 1.0 — explicit knobs
 *  below override this"), incl. the temperature the mapping defines. The two halves stay SEPARATE
 *  derivations above (the mapping is a fact about the dial, the override note is status — side-eye F-15's
 *  distinction, which is about what each half SAYS, not about how many lines it takes); only the rendering
 *  joins them, because two stacked micro-lines under one control is the "crunchy" the owner named
 *  (crunch-list 5). The readout keeps the halves apart — it has a whole labelled group for the mapping. */
export function qualityDeckGloss(profile: EffectiveProfileRow | undefined, quality: string | undefined): string | null {
  const mapping = qualityMappingGloss(profile, quality);
  const override = qualityOverrideGloss(profile);
  if (mapping === null) {
    return override;
  }
  return override === null ? mapping : `${mapping} — ${override}`;
}
