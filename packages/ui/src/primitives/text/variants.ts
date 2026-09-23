import { tv } from "#lib";

// Shared by both <Text> and <Heading>. `weight` rides Tailwind's built-in font-weight utilities — no
// DTCG weight token exists today. `code` rides `leading-label-relaxed` — the 13px continuous-reading box
// (docs/law/integer-line-boxes.md: leadings are fixed integer line boxes, never unitless ratios).
export const textVariants = tv({
  base: "font-sans",
  variants: {
    size: {
      display: "text-display leading-display",
      headline: "text-headline leading-headline",
      title: "text-title leading-title",
      body: "text-body leading-body",
      label: "text-label leading-label",
      code: "font-mono text-code leading-label-relaxed",
      // micro-caps section-label voice: 10.5px + micro tracking. Pair with weight="semibold" transform="caps".
      micro: "text-micro leading-micro tracking-micro",
    },
    weight: {
      regular: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      accent: "text-primary",
      destructive: "text-destructive",
      success: "text-success",
      warning: "text-warning",
    },
    transform: {
      none: "",
      caps: "uppercase",
    },
    // THE VOICE GRAMMAR (UI-Density-Law.md §2.3) — the closed axis that replaces choosing
    // size×weight×tone×transform per call site by taste (336 legal combinations, which is the mechanism by
    // which nothing recedes). A voice is an INTENT: what this text IS on the surface, not how it looks.
    // THIS TUPLE IS THE TRUTH, not any doc table — §2.3 rules that a new arm enters only with its
    // discriminator against the nearest existing voice stated beside its class string, as below.
    //
    // DECLARED LAST ON PURPOSE: tv() emits variant classes in key order and `defaultVariants` always
    // supplies size/weight/tone/transform, so every conflicting axis a voice sets must come AFTER them for
    // tailwind-merge to keep it. Each voice therefore re-spells EVERY axis it needs to win (family, size,
    // leading, tracking, weight, color) — an under-spelled voice silently inherits a default. Pinned by
    // computed value in tests/ui/density-tier.suite.ct.tsx, never by reading this file.
    voice: {
      // A section's NAME — never a datum. The mocks' `.kicker` (9.5px caps, .09em, 650); pair with
      // <Section kicker> for the hairline rule that completes the CD1 "a grouping is not a box" swap.
      kicker: "font-sans text-micro leading-micro tracking-micro font-semibold uppercase text-muted-foreground",
      // A kicker that is itself the visible label of a control. Interactive copy needs the readable label
      // step (13px) while retaining the compact, tracked instrument register of the band it belongs to.
      //
      // IT GIVES BACK ITS TRAILING TRACKING COLUMN (#1106, 2026-09-02). `letter-spacing` is added AFTER the
      // last glyph too, so a tracked label's inline box reserves one `--tracking-micro` (1.04px at this
      // step) of space that paints nothing — and this voice's label is a CONTROL label inside a `truncate`
      // box competing for width with siblings, so that dead column is charged against the text. MEASURED on
      // the config LIST band at the 271px both-panels pane: "Regex scripts" needs 115.53px of a 115.109px
      // content box — a real 0.42px clip, i.e. an ellipsis on a group NAME. The term that grew is this
      // label's own: the same string measures 115.52px in Geist against 110.06px in the pre-`ed55bf193`
      // fallback stack, so the font pass cost it 5.5px and the compression debt is the tracking's, not a
      // sibling's (memory: label-compression-must-be-remeasured-after — name which term grew).
      // Returning the 1.04px is font-INDEPENDENT and typographically correct; it is scoped to THIS voice
      // because only here is the tracked label a control's own name in a width-contended flex row (the
      // `kicker` twin sits in a Section heading row and has the identical dead column with no reported
      // symptom — flagged, deliberately not swept here).
      interactiveKicker: "font-sans text-label leading-label tracking-micro -me-(--tracking-micro) font-semibold uppercase text-muted-foreground",
      // The name of ONE datum (the mocks' `.meter .mline` label half).
      label: "font-sans text-label leading-label tracking-normal font-medium text-foreground",
      // The VALUE — the thing you came to read. mono + tabular so columns of numbers align and digits stop
      // jittering as they tick; rides `text-label` rather than a new 11px step (D5).
      datum: "font-mono text-label leading-label tracking-normal tabular-nums font-normal text-foreground",
      // The quiet explanatory second line (the mocks' `.truth`/`.beat`/`.orb .vals`).
      gloss: "font-sans text-micro leading-micro tracking-normal font-normal text-muted-foreground",
      // THE ONE NUMBER A SURFACE EXISTS TO PRODUCE (added 2026-08-09, side-eye P1-13). `datum` is the
      // voice for A value; `hero` is the voice for THE value — a run's overall score, a headline count —
      // the figure the user opened the surface to read. It was being spelled `voice="datum"`, which set
      // the refinery's whole reason-for-being at 13px, the same step as every field label beside it (the
      // review's words: "13px mono ... one change fixes hierarchy, type scale, accent budget").
      //
      // A feature CANNOT express this without a voice: `size="display"` is an @orb/ui-internal axis the
      // density gate's A3 arm reds at any feature call site, by design. So the choice is a voice or a
      // gate exemption, and a exemption for "this number is important" would be the first of many.
      // `tabular-nums` is load-bearing, not polish: these numerals COUNT UP on settle, and proportional
      // digits make the figure jitter horizontally while it ticks.
      hero: "font-mono text-display leading-display tracking-normal tabular-nums font-semibold text-foreground",
      // THE CONTENT ITSELF (added 2026-08-16, program #102). Every voice above names a piece of CHROME —
      // a section's name, a datum's label, a value, a quiet second line. None of them is the prose the
      // user actually came to read, and a feature reaching for it had exactly one spelling left,
      // `size="body"`, which is an @orb/ui-internal axis the density A3 arm reds at any feature call site.
      // So the reading step had no route and surfaces reached for `gloss` instead, which is how a room's
      // last spoken line ends up set at the same 10.5px as a footnote. Rides `--color-prose-body` (the
      // per-theme reading ink, warmer than `foreground` and dimmer than pure white on a dark backdrop) and
      // the body leading. Pair it with `max-w-(--reading-measure-prose)` — the TEACHING/BODY measure, not
      // the transcript's wider one (#1145): a reading line is capped on the PARAGRAPH, never on the page.
      // Only the chat transcript itself takes `--reading-measure`; see the token's own $description for
      // why one CSS `ch` is ~1.5 of the characters the design law counts.
      reading: "font-sans text-body leading-body tracking-normal font-normal text-prose-body",
      // THE SURFACE'S ONE OPENING STATEMENT (added 2026-08-16, program #102 — the home hearth build). A
      // landing surface opens on a SENTENCE about your own state ("Six rooms, still warm."), and the two
      // largest steps of the ramp had no sans route to a feature: `hero` is the display step for THE
      // NUMBER (mono + tabular, built to stop a counting figure jittering), which is exactly wrong for
      // prose — a sentence in tabular mono reads as a serial. So this is `hero`'s prose twin: same step,
      // sans, the tracking a display line needs, and no tabular figures. ONE per surface, like `hero`.
      masthead: "font-sans text-display leading-display tracking-tight font-semibold text-foreground",
      // THE ATTRIBUTION LINE UNDER A FOCAL ITEM (added 2026-08-16, program #102 review): who is in this
      // thing and how long ago — a film credit, not prose and not a datum you compare. The mock draws it
      // mono + UPPERCASE + tracked + muted (`home-c-hearth.html .fire .foot .meta`), and a feature has no
      // route to that register: `transform` is one of the four @orb/ui-internal axes the density A3 arm
      // reds at any feature call site, so the choice was a voice or a gate exemption.
      //
      // IT RIDES THE `label` STEP, NOT `micro`, AND THAT IS THE POINT. The mock sets it at 10.5px, which is
      // correct for a static footnote and wrong here: this line sits INSIDE the hero's own button, so it is
      // interactive text, and 10.5px interactive text was the review's #15 (seven nodes under the readable
      // floor). Caps + tracking + mono carry the register; the step carries the legibility. Muted because a
      // credit stands behind the title it credits.
      credit: "font-mono text-label leading-label tracking-micro font-medium uppercase text-muted-foreground",
      // THE ONE ITEM PROMOTED ABOVE ITS SIBLINGS (added 2026-08-16, program #102). The headline step —
      // between the masthead and the `title` its siblings run at — for the single entry a surface has
      // decided you came for: home's resume-room hero. It is the type half of the CD3 focal (the other
      // half is the stripe + the rationed ::before glow); a surface with two of these has no focal at all.
      focal: "font-sans text-headline leading-headline tracking-tight font-semibold text-foreground",
      // THE NAME OF ONE ITEM IN A SHELF OF ITEMS (added 2026-08-17, side-eye rail sweep P2-9/P3-18). The
      // `title` step (16px), semibold, which no CONTENT voice reached: `label` is the step for the name of
      // a datum and `focal` is the headline step reserved for the ONE entry a surface promotes above its
      // siblings — so a grid of character cells, each with a name over a gloss, had only `label` left and
      // rendered its name and its caption as two identical 13px lines. It is the same step `ListRow`
      // resolves for `titleStep="promoted"`, which is exactly the relation this names: a row/cell whose
      // title IS a surface's content rather than a directory entry. A feature cannot spell it otherwise —
      // `size="title"` is one of the four @orb/ui-internal axes the density A3 arm reds at a feature call
      // site — so the choice was a voice or an exemption.
      promoted: "font-sans text-title leading-title tracking-normal font-semibold text-foreground",
      // THE MUTED BODY LINE (added 2026-08-23, owner ruling on #573). The most common near-miss the density
      // burn-down kept hitting: a plain `<Text tone="muted">` — an empty-state line, a "Loading…", a
      // deferred-state sentence — which is body-step regular text that has RECEDED. No voice reached it:
      // `gloss` is the muted MICRO step (a footnote under a datum) and drops the line two steps to 10.5px;
      // `reading` is the body step but rides `--color-prose-body`, the reading ink, which is exactly what
      // a receded line is not. So the only spelling left was the raw `tone="muted"` the density A3 arm reds
      // at every feature call site, and ~10 of tranche 1's residuals were this one shape.
      //
      // It resolves the SAME step the `tone="muted"` default pair produced (byte-identical but for the
      // no-op `tracking-normal` every voice spells) — this is a VOCABULARY fix, not a visual change.
      quiet: "font-sans text-body leading-body tracking-normal font-normal text-muted-foreground",
      // THE MONO READOUT AT THE CODE STEP (added 2026-08-23, owner ruling on #573). An id, a hash, a byte
      // count, a raw payload — machine text a human reads but does not compare in a column. `datum` is the
      // voice for a value you DO compare (label step, tabular, foreground); this is its receded twin at the
      // dedicated `code` step, which is the one type step no voice reached at all: `size="code"` is an
      // @orb/ui-internal axis the A3 arm reds at a feature call site, so a mono readout in a feature had no
      // legal spelling.
      //
      // NO `tabular-nums`, deliberately — that is `datum`'s column-alignment property and it is wrong here
      // (a hash is not a column of numbers). Resolves the same step the `size="code" tone="muted"` pair
      // produced; call sites that carried `className="tabular-nums"` beside the old pair keep it.
      datumMono: "font-mono text-code leading-label-relaxed tracking-normal font-normal text-muted-foreground",
      // The DECORATIVE DISPLAY GLYPH (added S6): a single-letter mark an immersive chat row skin paints on
      // its own band/tile fill — aria-hidden ornament, not prose. None of the four CONTENT voices fits it
      // (each would shrink a glyph whose entire job is to BE large), and the alternative at the call site
      // was spelling `size`/`weight` through className — a dodge the density gate structurally cannot see.
      // Deliberately sets NO COLOR: the skin that owns the band owns the ink, so the `tone` default survives
      // here and one className on the call site still beats it. Callers that need a bigger mark than the
      // title step override `font-size` (the echo tile rides `--spacing-avatar-hero` inline).
      monogram: "font-sans text-title leading-title tracking-normal font-semibold",
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
    // THE ROW-ALIGNMENT MODIFIER (side-eye home re-score 2026-08-18, #216). `line-clamp-N` CAPS a run at N
    // lines; it does not RESERVE them — so in a grid of cells, a one-line name and a two-line name push
    // their captions to different baselines and the shelf reads as loose objects instead of one rank
    // (measured: `descTop` 359 vs 380 in the same row, a 21px drift, on the home face shelf at 1920).
    // `lines` is the pair: clamp at N AND reserve N lines of the element's OWN leading (`lh` resolves
    // against the computed line-height, so it follows the voice instead of hardcoding a pixel step), plus
    // the `whitespace-normal` that makes a clamp wrap at word boundaries rather than overflow (the Button
    // base is `whitespace-nowrap`, and a nowrap line inside a `-webkit-box` clamp escapes its cell with no
    // ellipsis at all).
    //
    // It is a LAYOUT statement about a run of text in a repeated cell, not a taste knob — the `prose`
    // precedent — which is why it is not one of the four internal axes the density gate ratchets. Use it
    // where cells must share a baseline; a lone clamp with nothing to align to stays a `line-clamp-*`
    // className.
    //
    // ONE ARM, because one shape needs it: the reservation is only ever right where cells must share a
    // baseline, and each arm costs a `.orb-lines-N` rule in globals.css (the reservation cannot be a
    // Tailwind utility — see that rule's comment). A second arm arrives with its second consumer.
    lines: {
      2: "line-clamp-2 orb-lines-2 whitespace-normal",
    },
    // THE INHERITED-INK MODIFIER (side-eye 2026-08-09 P1-1). Every voice re-spells its own COLOR — which
    // is correct on a surface and actively wrong inside a FILLED control, where the control already
    // decided the ink. Measured on the refinery stage stepper: `voice="label"`/`"gloss"` inside
    // `<Button intent="primary">` painted `text-foreground`/`text-muted-foreground` on `bg-primary` at
    // **1.14:1 and 2.30:1** — a WCAG failure produced entirely by the two layers each being individually
    // correct. `tone` cannot express the fix: it is declared BEFORE `voice`, so a voice's own color wins
    // the merge (the ordering law in the `voice` comment above).
    //
    // `ink="inherit"` hands the color back to whatever set `currentColor` — the button's
    // `text-primary-foreground`, a tinted banner, an inverted band. It is a CONTEXT statement, not a
    // taste knob, which is why it is not one of the four internal axes the density gate ratchets (the
    // `prose` precedent). Declared LAST so it wins the color merge against both `tone` and `voice`.
    ink: {
      /** Take the surrounding control's ink. The ONLY correct value for text inside a filled control. */
      inherit: "text-current",
      /** Keep the voice's own color — the default everywhere text sits on a plain surface. */
      voice: "",
    },
  },
  defaultVariants: { size: "body", weight: "regular", tone: "default", transform: "none", prose: false, ink: "voice" },
});
