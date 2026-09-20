// The TYPOGRAPHY sample shapes — one censused text run's type decision (`TextStyleInput`) and the page's
// own face + size census (`FontFaceInput`/`FontCensusInput`), judged by lib/checks-typography.ts and
// lib/checks-font-census.ts. Split out of contract/samples.ts at #2487: that file was at the 450-line
// `tooling-size` cap with ZERO headroom, which had already cost `RawSamples.documentFrame` its own doc
// comment — the trade Core-Tooling-Law.md §4.3 now names as the one the cap never accepts. These three
// are the largest single FAMILY the composition hub still spelled inline, and they move as a unit
// because `FontCensusInput` is a list of `FontFaceInput`.
// Re-exported from contract/samples.ts, which composes them into `RawSamples`. Provenance: samples.ts.

// ── Typography & copy-surface floors (impeccable quality family, ramp-bound) ─
export interface TextStyleInput {
  readonly selector: string;
  /** Stable authored-decision identity. Optional only for fixture bundles predating #989. */
  readonly authoredTarget?: string;
  /** Position-free structural home paired with `authoredTarget`; optional for historical fixtures. */
  readonly authoredHome?: string;
  readonly tag: string;
  /** Length of the element's OWN text nodes (trimmed, whitespace-collapsed). */
  readonly directTextLen: number;
  /** That same text, capped at 120 chars. Carried for the caveat rule (#652), which needs SHAPE and not
   *  just length: a bounding sentence and a qualifier fragment occupy the same length class, and the
   *  terminal punctuation is the only DOM-visible tell. Optional: absent in older fixture sample sets,
   *  where the rule declines rather than treating a fragment as a sentence. */
  readonly directText?: string;
  /** Length of the whole subtree's text — the line-length estimator's basis. */
  readonly totalTextLen: number;
  readonly fontSizePx: number;
  readonly lineHeightPx: number | null;
  readonly letterSpacingPx: number;
  readonly textTransform: string;
  /** The element's own text RENDERS as caps — typed that way, not just `text-transform: uppercase`.
   *  Optional because this type also describes samples from an older walker string (a CT pinning a
   *  historical sample set); absent reads as "not caps", i.e. the pre-#148 behavior. */
  readonly capsText?: boolean;
  readonly textAlign: string;
  readonly hyphens: string;
  readonly rectWidth: number;
  /** The MEASURED advance of one `0` in this element's own font — the CSS `ch` unit, from an in-page
   *  canvas `measureText` (#464). It replaces a guessed `fontSize × 0.5`: Geist's real ratio is 0.573,
   *  so the guess over-estimated every measure by ~15% and the rule indicted the house's own ratified
   *  `--reading-measure: 75ch`. `0` means the measurement did not happen — read as NO VERDICT, never as
   *  a narrow line. Optional because this type also describes samples from an older walker string. */
  readonly chWidthPx?: number;
  /** The AVERAGE advance of one character of THIS element's own running text, canvas-measured in its own
   *  font (#1183). It is the design law's unit — skill §2 counts "65-75 characters" by average glyph
   *  advance — and it is NOT `chWidthPx`: a `0` is 0.6625em in Geist while running prose averages
   *  0.42-0.46em, so a box holds ~1.5x as many law-characters as CSS `ch` and a ceiling denominated in the
   *  wrong one passes a 117-character paragraph (#1145's ruling). `0` means the measurement did not
   *  happen — read as NO VERDICT. Optional: absent in sample sets from an older walker string. */
  readonly glyphAdvancePx?: number;
  /** This text sits inside the chat TRANSCRIPT (`[data-slot="message-bubble"]`), which takes the wider
   *  `--reading-measure` (75ch) by owner ruling and is therefore judged in CSS `ch` against its own token
   *  rather than against the 65-75 law-character band (#1145). Optional: absent reads as ordinary prose,
   *  i.e. the STRICTER arm — a missing fact never buys a wider ceiling. */
  readonly readingSurface?: boolean;
  /** p/li/td/th/dd/blockquote/figcaption — the prose tags line-length judges. */
  readonly isProseTag: boolean;
  readonly isHeading: boolean;
  /** This text is an interactive control's PRIMARY label (its direct text ≈ the control's whole
   *  text) — not merely text inside an interactive ancestor: a micro-voice caption inside a large
   *  clickable card is the ratified gloss voice and does NOT owe the 11px control floor. */
  readonly interactive: boolean;
  /** Inside pre/code/kbd/samp/var/svg — glyphs that are DATA or GEOMETRY, which the type ramp does not
   *  govern. `aria-hidden` was in this selector until issue #253 and must never return: it is an
   *  accessibility-tree fact, and using it as a type-floor exemption silently excused every
   *  decorative-but-rendered string in the product. */
  readonly codeContext: boolean;
  /** Screen-reader-only text — exempt from everything here (it paints no pixels to judge). Either
   *  shape: a clipped visually-hidden state (`clip-path: inset(50%)` / `clip: rect(0,0,0,0)` over a
   *  clipping overflow — the `sr-only` posture, which keeps a FULL-SIZE box), or a ≤2px plumbing box. */
  readonly srOnly: boolean;
  /** Inside an `aria-hidden="true"` subtree — JUDGED ANYWAY by every rule here (issue #253). This family
   *  is entirely VISUAL (size, leading, tracking, measure, caps, justification): all of it is pixels a
   *  sighted user reads whether or not a screen reader announces it, and the opposite posture cost three
   *  live findings the day their host was correctly marked aria-hidden. Contrast with `srOnly`, which IS
   *  an exemption — clipped text paints no pixels at all. Optional: absent in older fixture sample sets. */
  readonly ariaHidden?: boolean;
  /** The `data-voice` \@orb/ui `<Text>`/`<Heading>` stamped on this element (or the nearest carrier), empty
   *  when the call site set none. A VOICE IS AN AUTHORED CLAIM ABOUT INTENT — "what this text IS on the
   *  surface", the closed axis that replaced picking size×weight×tone×transform by taste — which is why
   *  the caveat rule (#652) anchors on it rather than trying to infer importance from pixels. Optional:
   *  absent in the fixture sample sets that predate it, where it reads as un-voiced. */
  readonly voice?: string;
  /** The `data-voice` stamped on THIS element only — never inherited from a carrier. `line-length` widens
   *  its prose population by voice (#1183) and an inherited voice would drag every nested `<span>` of a
   *  `voice="reading"` paragraph into the census as its own measurable line, each with a wrap-box width
   *  that is not a reading measure. Optional: absent in sample sets that predate it. */
  readonly ownVoice?: string;
  /** Inside `role="alert" | "alertdialog" | "status"` — the platform's own "this bounds what you are about
   *  to do". The second anchor the caveat rule accepts, so a warning written without a voice is still
   *  judged. Optional: absent in older fixture sample sets. */
  readonly alertContext?: boolean;
  /** Per-walk ids of this element's nearest four ancestors, outward. Two samples are IN THE SAME BLOCK
   *  when their paths intersect — the bound that keeps the caveat rule from comparing a caption against
   *  every larger glyph on the page, which is the false-positive machine it must not become. Optional:
   *  absent in older fixture sample sets, where the rule declines rather than comparing globally. */
  readonly blockPath?: readonly number[];
}

// ── Page censuses: fonts + type-scale spread (impeccable adapted, ramp-bound) ──
/** One face the cascade names FIRST on some element, paired with whether this environment can PAINT it.
 *  The pair is required because the two facts fail in opposite directions: the name is a cascade fact a
 *  missing webfont cannot move, and `available` is the only thing that separates a token stack that
 *  renders from one whose brand face was never shipped. Measured by glyph metrics in
 *  ops/walker/census-text.ts — `document.fonts.check` is vacuously TRUE for an unregistered family and
 *  cannot answer it. */
export interface FontFaceInput {
  readonly name: string;
  readonly available: boolean;
}

export interface FontCensusInput {
  readonly faces: readonly FontFaceInput[];
  /** False when the in-page metric probe failed its own two-sided control (no 2d context, a present face
   *  it could not distinguish, or an impossible family reading as present). Then `available` carries no
   *  information and every token face is WITHHELD — absence of measurement is never a clean pass. */
  readonly probeUsable: boolean;
  readonly sizes: readonly number[];
}
