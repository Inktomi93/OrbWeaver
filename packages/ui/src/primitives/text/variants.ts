import {
  CAP,
  FLOOR,
  GROW,
  HIDDEN_AT,
  HOVER_CUE,
  INKS,
  MAX_HEIGHT,
  PASS_THROUGH,
  PULSE,
  PUSH,
  RECEDED,
  RUN_INSET,
  SCROLLER_Y,
  SELF,
  SR_ONLY_AT,
  TEXT_ALIGN,
  TONE_TEXT,
  tv,
  WIDTH,
} from "#lib";

// Shared by both <Text> and <Heading>. `weight` rides Tailwind's built-in font-weight utilities — no
// DTCG weight token exists today. `code` rides `leading-label-relaxed` — the 13px continuous-reading box
// (docs/law/integer-line-boxes.md: leadings are fixed integer line boxes, never unitless ratios).
export const textVariants = tv({
  base: "font-sans text-foreground",
  variants: {
    size: {
      headline: "text-headline leading-headline",
      title: "text-title leading-title",
      body: "text-body leading-body",
      label: "text-label leading-label",
    },
    weight: {
      regular: "font-normal",
      semibold: "font-semibold",
    },
    // THE VOICE GRAMMAR (UI-Density-Law.md §2.3) — the closed axis that replaces choosing
    // size×weight×tone×transform per call site by taste (336 legal combinations, which is the mechanism by
    // which nothing recedes). A voice is an INTENT: what this text IS on the surface, not how it looks.
    // THIS TUPLE IS THE TRUTH, not any doc table — §2.3 rules that a new arm enters only with its
    // discriminator against the nearest existing voice stated beside its class string, as below.
    //
    // Voices override typography defaults; an explicit status tone overrides the voice colour.
    voice: {
      // A section's NAME — never a datum. The mocks' `.kicker` (9.5px caps, .09em, 650); pair with
      // <Section kicker> for the hairline rule that completes the CD1 "a grouping is not a box" swap.
      kicker: "font-sans text-micro leading-micro font-semibold tracking-micro text-muted-foreground uppercase",
      // A kicker that is itself the visible label of a control. Interactive copy needs the readable label
      // step (13px) while retaining the compact, tracked instrument register of the band it belongs to.
      //
      // IT GIVES BACK ITS TRAILING TRACKING COLUMN (#1106, 2026-09-02). `letter-spacing` is added AFTER the
      // last glyph too, so a tracked label's inline box reserves one `--tracking-micro` (1.04px at this
      // step) of space that paints nothing — and this voice's label is a CONTROL label inside a `truncate`
      // box competing for width with siblings, so that dead column is charged against the text. MEASURED on
      // the config LIST band at the 271px both-panels pane: "Regex scripts" needs 115.53px of a 115.109px
      // content box — a real 0.42px clip, i.e. an ellipsis on a group NAME. The term that grew is this
      // label's own: the same string measures 115.52px in Geist against 110.06px in the pre-`77e07912eb`
      // fallback stack, so the font pass cost it 5.5px and the compression debt is the tracking's, not a
      // sibling's (memory: label-compression-must-be-remeasured-after — name which term grew).
      // Returning the 1.04px is font-INDEPENDENT and typographically correct; it is scoped to THIS voice
      // because only here is the tracked label a control's own name in a width-contended flex row (the
      // `kicker` twin sits in a Section heading row and has the identical dead column with no reported
      // symptom — flagged, deliberately not swept here).
      interactiveKicker: "-me-(--tracking-micro) font-sans text-label leading-label font-semibold tracking-micro text-muted-foreground uppercase",
      // The name of ONE datum (the mocks' `.meter .mline` label half).
      label: "font-sans text-label leading-label font-medium tracking-normal text-foreground",
      // The VALUE — a numeric readout, a count, a timer. Tabular figures in the body face at the gloss step (D5), so
      // columns of numbers align and digits stop jittering as they tick. Its nearest neighbour is `gloss`: the same face
      // and step, but a datum is the value itself, so it keeps the foreground ink and the fixed-width figures.
      // Machine text (an id, a payload, a tool name) is `code`, never this voice.
      datum: "font-sans text-micro leading-micro font-normal tracking-normal text-foreground tabular-nums",
      // The quiet explanatory second line (the mocks' `.truth`/`.beat`/`.orb .vals`).
      gloss: "font-sans text-micro leading-micro font-normal tracking-normal text-muted-foreground",
      // THE ONE NUMBER A SURFACE EXISTS TO PRODUCE (added 2026-08-09, side-eye P1-13). `datum` is the
      // voice for A value; `hero` is the voice for THE value — a run's overall score, a headline count —
      // the figure the user opened the surface to read. It was being spelled `voice="datum"`, which set
      // the refinery's whole reason-for-being at 13px, the same step as every field label beside it (the
      // review's words: "13px mono ... one change fixes hierarchy, type scale, accent budget").
      //
      // A feature CANNOT express this without a voice: the display step is not a `size` arm, and the density
      // gate's A3 arm reds a feature's own size choice, by design. So the choice is a voice or a
      // gate exemption, and an exemption for "this number is important" would be the first of many.
      // `tabular-nums` is load-bearing, not polish: these numerals COUNT UP on settle, and proportional
      // digits make the figure jitter horizontally while it ticks.
      hero: "font-mono text-display leading-display font-semibold tracking-normal text-foreground tabular-nums",
      // THE CONTENT ITSELF (added 2026-08-16, program #102). Every voice above names a piece of CHROME —
      // a section's name, a datum's label, a value, a quiet second line. None of them is the prose the
      // user actually came to read, and a feature reaching for it had exactly one spelling left,
      // `size="body"`, which is an @orb/ui-internal axis the density A3 arm reds at any feature call site.
      // So the reading step had no route and surfaces reached for `gloss` instead, which is how a room's
      // last spoken line ends up set at the same 10.5px as a footnote. Rides `--color-prose-body` (the
      // per-theme reading ink, warmer than `foreground` and dimmer than pure white on a dark backdrop) and
      // the body leading. Pair it with `cap="prose"` — the TEACHING/BODY measure, not
      // the transcript's wider one (#1145): a reading line is capped on the PARAGRAPH, never on the page.
      // Only the chat transcript itself takes `--reading-measure`; see the token's own $description for
      // why one CSS `ch` is ~1.5 of the characters the design law counts.
      reading: "font-sans text-body leading-body font-normal tracking-normal text-prose-body",
      // THE SURFACE'S ONE OPENING STATEMENT (added 2026-08-16, program #102 — the home hearth build). A
      // landing surface opens on a SENTENCE about your own state ("Six rooms, still warm."), and the two
      // largest steps of the ramp had no sans route to a feature: `hero` is the display step for THE
      // NUMBER (mono + tabular, built to stop a counting figure jittering), which is exactly wrong for
      // prose — a sentence in tabular mono reads as a serial. So this is `hero`'s prose twin: same step,
      // sans, the tracking a display line needs, and no tabular figures. ONE per surface, like `hero`.
      masthead: "font-sans text-display leading-display font-semibold tracking-display text-foreground",
      // THE ATTRIBUTION LINE UNDER A FOCAL ITEM (added 2026-08-16, program #102 review): who is in this
      // thing and how long ago — a film credit, not prose and not a datum you compare. The mock draws it
      // mono + UPPERCASE + tracked + muted (`home-c-hearth.html .fire .foot .meta`), and a feature has no
      // route to that register: caps is a voice, not a feature axis, so the choice was a voice or a gate exemption.
      //
      // IT RIDES THE `label` STEP, NOT `micro`, AND THAT IS THE POINT. The mock sets it at 10.5px, which is
      // correct for a static footnote and wrong here: this line sits INSIDE the hero's own button, so it is
      // interactive text, and 10.5px interactive text was the review's #15 (seven nodes under the readable
      // floor). Caps + tracking + mono carry the register; the step carries the legibility. Muted because a
      // credit stands behind the title it credits.
      credit: "font-mono text-label leading-label font-medium tracking-micro text-muted-foreground uppercase",
      // THE ONE ITEM PROMOTED ABOVE ITS SIBLINGS (added 2026-08-16, program #102). The headline step —
      // between the masthead and the `title` its siblings run at — for the single entry a surface has
      // decided you came for: home's resume-room hero. It is the type half of the CD3 focal (the other
      // half is the stripe + the rationed ::before glow); a surface with two of these has no focal at all.
      focal: "font-sans text-headline leading-headline font-semibold tracking-display text-foreground",
      // THE NAME OF ONE ITEM IN A SHELF OF ITEMS (added 2026-08-17, side-eye rail sweep P2-9/P3-18). The
      // `title` step (16px), semibold, which no CONTENT voice reached: `label` is the step for the name of
      // a datum and `focal` is the headline step reserved for the ONE entry a surface promotes above its
      // siblings — so a grid of character cells, each with a name over a gloss, had only `label` left and
      // rendered its name and its caption as two identical 13px lines. It is the same step `ListRow`
      // resolves for `titleStep="promoted"`, which is exactly the relation this names: a row/cell whose
      // title IS a surface's content rather than a directory entry. A feature cannot spell it otherwise —
      // `size="title"` is one of the four @orb/ui-internal axes the density A3 arm reds at a feature call
      // site — so the choice was a voice or an exemption.
      promoted: "font-sans text-title leading-title font-semibold tracking-normal text-foreground",
      // THE MUTED BODY LINE (added 2026-08-23, owner ruling on #573). The most common near-miss the density
      // burn-down kept hitting: a plain `<Text ink="muted">` — an empty-state line, a "Loading…", a
      // deferred-state sentence — which is body-step regular text that has RECEDED. No voice reached it:
      // `gloss` is the muted MICRO step (a footnote under a datum) and drops the line two steps to 10.5px;
      // `reading` is the body step but rides `--color-prose-body`, the reading ink, which is exactly what
      // a receded line is not. So the only spelling left was the raw `ink="muted"` the density A3 arm reds
      // at every feature call site, and ~10 of tranche 1's residuals were this one shape.
      //
      // It resolves the SAME step the `ink="muted"` default pair produced (byte-identical but for the
      // no-op `tracking-normal` every voice spells) — this is a VOCABULARY fix, not a visual change.
      quiet: "font-sans text-body leading-body font-normal tracking-normal text-muted-foreground",
      // THE OUTCOME LINE ABOVE ITS DETAILS: a report's one-sentence tally ("3 imported, 1 skipped") over the list it
      // summarises. Its nearest neighbour is `reading`, the same body step; `lead` is semibold in the foreground ink,
      // because it states the result the rows below explain, where `reading` is prose in the reading ink.
      lead: "font-sans text-body leading-body font-semibold tracking-normal text-foreground",
      // THE MONO READOUT AT THE CODE STEP (added 2026-08-23, owner ruling on #573). An id, a hash, a byte
      // count, a raw payload — machine text a human reads but does not compare in a column. `datum` is the
      // voice for a value you DO compare (micro step, tabular, foreground); this is its receded twin at the
      // dedicated `code` step, which is not a `size` arm: a mono readout in a feature is spelled with a voice.
      //
      // NO `tabular-nums`, deliberately — that is `datum`'s column-alignment property and it is wrong here
      // (a hash is not a column of numbers). A call site that wants column digits adds `className="tabular-nums"`.
      datumMono: "font-mono text-code leading-label-relaxed font-normal tracking-normal text-muted-foreground",
      // MACHINE TEXT YOU READ OR COPY: an id, a hash, a key, an address. Geist Mono at the
      // code step in the foreground ink. Its nearest neighbour is `datumMono`, the same face and step receded to the
      // muted ink for a readout that stands behind its label; `code` is the value itself, so it keeps the foreground.
      code: "font-mono text-code leading-label-relaxed font-normal tracking-normal text-foreground",
      // The DECORATIVE DISPLAY GLYPH (added S6): a single-letter mark an immersive chat row skin paints on
      // its own band/tile fill — aria-hidden ornament, not prose. None of the four CONTENT voices fits it
      // (each would shrink a glyph whose entire job is to BE large), and the alternative at the call site
      // was spelling `size`/`weight` through className — a dodge the density gate structurally cannot see.
      // Deliberately sets NO COLOR: the skin that owns the band owns the ink, so the unset ink survives
      // here and one className on the call site still beats it. Callers that need a bigger mark than the
      // title step override `font-size` (the echo tile rides `--size-avatar-hero` inline).
      monogram: "font-sans text-title leading-title font-semibold tracking-normal",
    },
    // THE READING-LENGTH MODIFIER (side-eye F-31, 2026-08-02). `text-micro` (10.5px, leading-micro) was
    // doing five jobs — kicker, gloss, explainer prose, subtitle, status — and while contrast passes
    // everywhere (7.06–8.66:1), the SCALE is too flat for prose: a three-sentence teach line set at the
    // same step and the same tight leading as a status chip is a wall.
    //
    // `prose` is a LENGTH statement, not a taste knob (which is why it is not one of the four internal axes
    // the density gate ratchets): "this text is sentences, not a label". It lifts the step to `label` and
    // relaxes the leading, and it deliberately changes NOTHING else — the voice still owns family, weight,
    // tracking and color, so a prose gloss is unmistakably the same voice, just readable at length.
    //
    // DECLARED AFTER `voice` so it wins the size/leading merge (the same ordering law `voice` itself needs).
    prose: {
      true: "text-label leading-label-relaxed",
      false: "",
    },
    // A run capped at N lines with an ellipsis. It reserves nothing: a short run takes only the lines it needs. The cap alone
    // is the whole statement; where cells must share a baseline, `lines` caps and reserves.
    clamp: {
      1: "line-clamp-1",
      2: "line-clamp-2",
      3: "line-clamp-3",
      4: "line-clamp-4",
    },
    // THE ROW-ALIGNMENT MODIFIER. `clamp` caps a run at N lines; it does not RESERVE them — so in a grid of cells, a one-line
    // name and a two-line name push their captions to different baselines and the shelf reads as loose objects instead of
    // one rank. `lines` is the pair: clamp at N AND reserve N lines of the element's OWN leading (`lh` resolves
    // against the computed line-height, so it follows the voice instead of hardcoding a pixel step), plus
    // the `whitespace-normal` that makes a clamp wrap at word boundaries rather than overflow (the Button
    // base is `whitespace-nowrap`, and a nowrap line inside a `-webkit-box` clamp escapes its cell with no
    // ellipsis at all).
    //
    // It is a LAYOUT statement about a run of text in a repeated cell, not a taste knob — the `prose`
    // precedent — which is why it is not one of the four internal axes the density gate ratchets.
    //
    // ONE ARM, because one shape needs it: each arm costs a `.orb-lines-N` rule in primitives.css (the reservation cannot be a
    // Tailwind utility — see that rule's comment). A second arm arrives with its second consumer.
    lines: {
      2: "line-clamp-2 whitespace-normal orb-lines-2",
    },
    // ONE LINE, CLIPPED WITH AN ELLIPSIS (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`). The
    // clip makes the box a scroll container, so as a flex or grid child it already shrinks to zero and needs no
    // `min-inline-0`. `fill` is the line that takes the rest of a row and gives way to its siblings.
    truncate: {
      true: "truncate",
      fill: "flex-1 truncate",
      false: "",
    },
    // A run in a flex row that takes the room that is left (`grow`) from a starting width (`floor`). The `min-inline-0` that lets it
    // shrink below its content stays the caller's.
    grow: GROW,
    floor: FLOOR,
    push: PUSH,
    self: SELF,
    // `both` is a preformatted payload that can run past its box on either axis.
    scroll: { y: SCROLLER_Y, both: "relative overflow-auto overscroll-contain" },
    passThrough: PASS_THROUGH,
    maxHeight: { scrollSm: MAX_HEIGHT.scrollSm },
    // The widest the run grows: `prose` is a paragraph's measure, capped on the paragraph and never on the page.
    cap: CAP,
    width: WIDTH,
    textAlign: TEXT_ALIGN,
    inset: RUN_INSET,
    // How the run sits among its neighbours: `block` takes a line of its own; a cluster holds a glyph or a chip beside its words at an atom gap;
    // `lineField` and `baselineRow` are the same on a whole line, the marker beside its words and a heading beside its count.
    flow: {
      block: "block",
      cluster: "inline-flex items-center",
      clusterTight: "inline-flex items-center gap-tight",
      clusterField: "inline-flex items-center gap-field",
      lineField: "flex gap-field",
      baselineRow: "flex items-baseline gap-row",
      // A line of runs that moves a run to the next line when it does not fit, as a button's inner row.
      wrapRow: "flex flex-wrap items-baseline gap-x-field gap-y-tight",
    },
    // Where a run with no space in it may break: `word` only at the end of a line that would overflow, `anywhere` also when
    // the box is sized to its content (a path or an address in a narrow cell).
    wrap: { word: "wrap-break-word", anywhere: "wrap-anywhere", all: "break-all" },
    // `preWrap` keeps line breaks and runs of spaces in the string, for a value shown exactly as written; `nowrap` never breaks the run, `normal` wraps at spaces inside a nowrap host (a button).
    whitespace: { nowrap: "whitespace-nowrap", normal: "whitespace-normal", preWrap: "whitespace-pre-wrap" },
    // Colour by meaning (D336): a feature picks the meaning, never a colour class. Unset keeps each voice's own ink.
    tone: TONE_TEXT,
    // A struck-through line: a cancelled quest, a disabled prompt section. Not colour, so it pairs with any tone.
    strike: {
      true: "line-through",
      false: "",
    },
    // TABULAR FIGURES for a composite that sets its own step and still shows ticking numbers (TrackerValue's
    // `numeric`). A feature readout takes a voice; this is the figures half of one, for a primitive's internals.
    numeric: {
      true: "tabular-nums",
      false: "",
    },
    // A wordmark over live art keeps a dark, theme-derived halo behind its glyphs.
    halo: { true: "text-shadow-wordmark" },
    // The slanted face for words that are not spoken: a character's inner thought, a guide line.
    italic: { true: "italic", false: "" },
    // Machine text a reader copies whole (a source URL, a key fingerprint): one click selects the run.
    selectAll: { true: "select-all", false: "" },
    pulse: { true: PULSE, false: "" },
    hoverCue: HOVER_CUE,
    hiddenAt: HIDDEN_AT,
    srOnlyAt: SR_ONLY_AT,
    receded: { true: RECEDED, false: "" },
    // The run keeps its box, its place in the layout and its place in the accessible name, and paints nothing: a figure the room can seat only
    // cut, which reads as another number.
    unpainted: { true: "opacity-0", false: "" },
    // A named ink (D336), declared after the voice so it wins the colour merge; `inherit` is the ink of text inside a
    // filled control, which owns its ink even when the child supplies a voice.
    ink: INKS,
  },
  defaultVariants: {
    size: "body",
    weight: "regular",
    prose: false,
    strike: false,
    truncate: false,
    numeric: false,
    italic: false,
    selectAll: false,
    pulse: false,
    receded: false,
    unpainted: false,
  },
});
