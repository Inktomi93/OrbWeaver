// ui-audit in-page walker — segment: the COMPOSITOR HIT-EXTENT PROBE (what a control's real tap target is).
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the
// segments IN ORDER into COLLECT_SAMPLES_JS, so scope/hoisting behavior is byte-identical to the
// pre-split monolith. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
//
// SPLIT OUT of census-interactive.ts (#797) because that segment reached the 450-line tooling cap. The
// ownership vocabulary (ownsPoint / the ancestor-credit shapes / the composite walk / the probe frame)
// is one subject and reads as one file; the census that CONSUMES it is another.
//
// THE ONE INVARIANT THIS FILE EXISTS TO HOLD (#797 — the defect that made design-audit's tap-target
// count untrustworthy for a whole UX review):
//
//   `document.elementFromPoint` answers `null` for any coordinate OUTSIDE the viewport, and null reads
//   as "nothing there" — never as "I could not look". So a probe point off the edge of the screen is an
//   UNMEASURABLE point, and treating it as an un-owned one converts a 44x44 ring into a bare-box P1.
//
// Measured: on the Settings→Plugins pane the reveal sweep left a checkbox straddling the viewport's
// bottom edge; every outward probe fell past `innerHeight`, the extent collapsed to the 18x18 border box
// and the run minted a P1 — while the same page at `--viewport 1280x2200` produced p1=0 from an
// IDENTICAL element census, and the four-cardinal +/-21px `elementFromPoint` ground truth showed the
// checkbox owning the full 44x44. A number that changes with the window height is not a fact about the
// design. So the probe now declares its FRAME (`probeFrameFits`): the census re-centres a control whose
// ring does not fit and, where no scroll can produce one, REFUSES to publish an extent rather than
// publishing the box. A refusal is counted and printed (censusReach.frameTruncated); a fabricated 18x18
// is not recoverable by any downstream reader.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_HIT_EXTENT = `  // ── the compositor hit-extent probe ────────────────────────────────────────────────────────────
  // THE HIT AREA IS NOT THE BOX (2026-08-16 — 10 of 13 "sub-target" findings in one audit were this).
  // @orb/ui Button's size="inline"/size="glyph-*" variants carry a pointer-conditional touch-target
  // ::before (packages/ui/src/primitives/button/variants.ts glyphBox + the inline arm; it was an ::after
  // until #1843 moved it off the CTA ring's layer — this probe reads BOTH), so a 25x15 border box can own
  // a 45x45 hit area. Probe what the COMPOSITOR says: sample points on the ring the pseudo would cover
  // and ask elementFromPoint whether this control still owns them. The measured extent is what WCAG
  // 2.5.5/2.5.8 are about — "target size", not "border-box size".
  // THE LADDER MUST BE ABLE TO CONFIRM EVERY FLOOR THIS RULE JUDGES (#1067). The walk publishes
  // \`2 x radius\`, so the rungs ARE the vocabulary of answers — and the floors in lib/checks-a11y.ts are
  // 24 (TAP_FINE_MIN_PX), 32 (TAP_COARSE_FAIL_PX) and 44 (TAP_COARSE_WARN_PX). The ladder was
  // [11, 16, 22] = 22 / 32 / 44: the fine floor was NOT expressible, so a control owning 24-31px could
  // only ever be published as 22 and failed a rule it already satisfied — for the whole @orb/ui selection
  // family, whose hit area is an 18px box under a 28px \`::before size-touch-target\` at pointer:fine
  // (packages/ui/src/lib/selection-control.ts + the @media(pointer:fine) override in styles/theme.css).
  // Measured on the character library's bulk mode: 10 of 10 rows "short side 22px", on a compositor ring
  // that answers \`self\` out to +/-13px. 11 stays as the rung BELOW the floor — it is what keeps a genuine
  // 22px control reporting 22 rather than rounding down to its box.
  var HIT_PROBE_RADII = [11, 12, 16, 22]; // half-extents probed outward: 12 → 24px (AA), 16 → 32, 22 → 44
  var HIT_PROBE_MAX = HIT_PROBE_RADII[HIT_PROBE_RADII.length - 1];
  // THE RING IS SAMPLED ONE PIXEL INSIDE ITSELF, AND THE HALF-PIXEL IS THE WHOLE POINT (#1829, measured
  // 2026-09-06 in the CT browser on a real @orb/ui Checkbox, both pointer arms + a real mouse click).
  // A target of extent exactly \`2r\` centred at \`c\` occupies [c - r, c + r) — the coordinate \`c + r\` is the
  // FIRST PIXEL OF THE NEIGHBOUR, not the last pixel of the target. Probing AT the radius therefore asks a
  // question the target can never answer yes to, so the ladder's own top rungs were unreachable BY
  // CONSTRUCTION: an 18px checkbox under a 44x44 coarse \`::before\` answers \`self\` on all four cardinals at
  // +/-21.5 and answers \`[data-slot=field-label]\` at +/-22, so it published 32 and filed a \`tap-target\` P2
  // against TAP_COARSE_WARN_PX = 44 — a finding no design change could ever clear, on eleven Backup rows
  // (#980 F13's coarse arm, side-eye 2026-09-06). Same shape one rung down: a 28px fine pseudo can never
  // publish 28. The real click agrees with the inset and not with the boundary: at a coarse pointer a
  // \`page.mouse.click\` 21.5px from centre TOGGLES the checkbox and one at 22px is a no-op.
  // A control that owns 43px still fails: its own boundary moves in with it, so the inset credits nothing
  // it did not already own — it stops MISSING the last owned pixel.
  var HIT_PROBE_INSET = 0.5;
  // THE PROBE FRAME (#797). Every point the widest probe needs must EXIST in the viewport, or the
  // measurement is not a measurement — see the file header. This is a question about the frame, not
  // about the control: the same control one scroll later is fully measurable, which is exactly why the
  // census re-centres before it refuses.
  function probeFrameFits(rect) {
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    return cx - HIT_PROBE_MAX >= 0 && cy - HIT_PROBE_MAX >= 0 && cx + HIT_PROBE_MAX < window.innerWidth && cy + HIT_PROBE_MAX < window.innerHeight;
  }
  // OWNERSHIP IS PER COMPOSITE, NOT PER ELEMENT (2026-08-16). A Base UI Slider's real pointer target is
  // the whole Control row (h-control-sm — 44px coarse / 32px fine; a mouse press at the row's top edge
  // 60px from the thumb moved the value 60 to 73), but the outward probe lands on
  // [data-slot=slider-indicator], a SIBLING of the thumb inside the same control. The identity/containment
  // test alone stalled the walk there and printed a fine-pointer P1 at 22px on a 32px row.
  // A hit is now ALSO owned when the nearest ancestor el and hit share offers exactly ONE control and that
  // control is el — a neighbouring button IS another offered control, so a genuine sub-target still fires.
  var COMPOSITE_WALK_MAX = 4;
  // The same "is this an offered target" filter the tap-target census itself applies (aria-hidden Base UI
  // twins, dev chrome, 1-2px plumbing) — two vocabularies here would let a phantom control veto a real
  // composite.
  function isOfferedControl(el) {
    if (!isVisible(el) || isDevChrome(el)) return false;
    if (el.closest("[aria-hidden='true']")) return false;
    var r = el.getBoundingClientRect();
    return Math.min(r.width, r.height) > 2;
  }
  // BOX- vs NOT-BOX-CARRIED ANCESTOR CREDIT (#662/#665 — fixed from an unconditional hit.contains(el)
  // that made a short control alone in a padded wrapper UN-FAILABLE: it measured 44 no matter how short,
  // because walking off its own box always landed back on the wrapper). Ancestor credit — via EITHER the
  // plain containment clause below OR sharedCompositeOwns — is legitimate for exactly two shapes, both of
  // which have NO paintable box of their own at the probed point, so the ancestor is the only thing that
  // CAN answer (and #807 then narrows WHICH hit may answer — see hitForwards):
  //   · PSEUDO-CARRIED: an overflowing ::before/::after touch-target pseudo (the @orb/ui Button glyph
  //     ramp — packages/ui/src/primitives/button/variants.ts glyphBox, content-[''] + absolute
  //     positioning) has no DOM node at all, so where an ancestor's overflow CLIPS its outward edge the
  //     box painting underneath is the only thing that can answer for it.
  //   · VISUALLY-HIDDEN: Base UI's native range input inside a Slider Thumb (isVisuallyHidden, core.ts —
  //     a collapsed clip-path) paints nothing; elementFromPoint on its own centre already resolves to
  //     the Thumb div that visually represents it (verified live: the input's own rect sits UNDER the
  //     Thumb, and even the probe at its own centre hits the Thumb, not the input).
  // A control with NEITHER — a plain, visible, appropriately-sized button — carries its floor on its OWN
  // border box (a real height/min-height, e.g. the CONTROL_SIZE ramp), so an ancestor is never evidence
  // of ownership for it: this is the #662/#665 hole, and it is refused before either ancestor path runs.
  // (A FORWARDING LABEL is the third shape and is deliberately NOT in this predicate — see
  // forwardingLabelOwns: it is not ancestor credit, it is a per-element activation fact.)
  //
  // THE CREDIT IS GEOMETRY-SCOPED, AND THE 2026-09-06 MEASUREMENT THAT USED TO SIT HERE WAS THE DEFECT
  // REPORT, NOT THE RATIONALE (#2300). This comment recorded — as a reason to KEEP an existence-only
  // predicate — that a \`data-cta\` glyph "answers \`div\` (the wrapper) 11px out" while its ghost twin
  // "answers \`button\` out to 13.5px", i.e. that the two intents of ONE control measured differently
  // because a CTA gradient ring (globals.css \`[data-slot=button][data-cta]::after\`) had eaten the hit
  // area and set \`pointer-events: none\` on it. That divergence was #1843, and crediting the wrapper for
  // it did not measure a target — it MANUFACTURED one. Replayed through the CT kit's twin of this
  // predicate, the pre-#1843 shape published 161x161 in an isolated stage for a control whose real target
  // was 26x26, and published the SAME 161x161 after the fix, when the truth was 56x56.
  // So the two clauses stay and the credit is now BOUNDED BY THE PSEUDO'S OWN MEASURED RECT: a pseudo
  // must be able to take a pointer at all (pointer-events), must resolve to a rect that reaches PAST the
  // border box (the ring's \`inset: 0\` reaches nowhere), and credit is granted only at points INSIDE that
  // rect. The identical clauses are mirrored in the CT kit (tests/support/iso/hit-extent-walk.ts), which
  // cannot be shared with this file in either direction — this is raw JS inside a template literal, above
  // the test tree in the layer cake.
  //
  // WHAT HOLDS THE TWO SPELLINGS TOGETHER, STATED AS WHAT IT ACTUALLY IS (rewritten 2026-09-13 after
  // cb-v-hit-geometry REFUTED the sentence that stood here). This comment used to end "the two are pinned
  // EQUAL … change one and that proof reds", and that was false: reverting this function to the
  // existence-only predicate, deleting the pointer-events clause, or disabling the kit's credit each left
  // the instrument proof 10/10 GREEN, because its fixture's hit pseudos SELF-REPORT and clause 2 never ran
  // on it at all. A fixture that cannot reach the code it names is a fence, not a proof.
  // The pins that exist now, all in tests/tooling/ui-audit/ops/walker/hit-extent.int.test.ts:
  //   · CREDIT_DOCUMENT — four stages where ancestor credit is the ONLY thing that can answer at the
  //     probed rungs (a capped pseudo, one CLIPPED by an ancestor's overflow, an untappable one, and a
  //     self-reporting counter-control). Reverting this function to existence-only reds it; deleting the
  //     pointer-events clause reds it. Measured, both directions, 2026-09-13.
  //   · the ENVELOPE arm — this file's own pseudoHitEnvelope, evaluated from this very source string,
  //     beside the kit's, on the same elements in the same page, required EXACTLY equal. That is the one
  //     thing the two homes must answer identically; their published EXTENTS cannot be compared (a
  //     rung-quantised ring against a 1px walk — "the numbers differ by design" since #1678), so each
  //     home's numbers are pinned to their own measured values instead.
  // Change either home's arithmetic and the envelope arm reds; change either home's clause 2 and its own
  // fixture arm reds.
  var PURE_TRANSLATE = "matrix(1, 0, 0, 1, ";
  function translateAlong(token, basis) {
    if (token === undefined) return 0;
    return token.charAt(token.length - 1) === "%" ? (parseFloat(token) / 100) * basis : parseFloat(token);
  }
  // ONE pseudo's outward hit rect in viewport px, or null when it carries no tap surface. The rect needs
  // no width: for an absolutely positioned box the resolved left/right ARE the used distances from the
  // containing block's padding edges (measured in Chrome 2026-09-13: a 25px glyph box under a 55px
  // ::before answers left 12.5px / right -42.5px), so an \`auto\` inset makes the rect unmeasurable rather
  // than needing a fallback. A \`fixed\` pseudo and a STATIC element are refused for the same class of
  // reason — the containing block is then something this arithmetic cannot name — and refusing
  // under-reports, which is the safe direction (see the declared limits below).
  function pseudoHitRect(el, own, border, which) {
    var s = getComputedStyle(el, which);
    if (s.content === "none" || s.content === "normal") return null;
    if (s.position !== "absolute" || own.position === "static") return null;
    if (s.pointerEvents === "none" || s.visibility === "hidden" || s.visibility === "collapse") return null;
    if (s.display === "none" || s.display === "contents") return null;
    if (s.rotate !== "none" || s.scale !== "none") return null;
    // TWO COORDINATE SPACES, AND MIXING THEM OVER-CREDITS (cb-v-hit-geometry, 2026-09-13). \`border\` is
    // POST-transform (getBoundingClientRect) while the resolved insets below are LOCAL CSS px, so under a
    // 0.5-scaled ancestor the band ran ~14px past the pseudo's real reach — the over-credit direction this
    // probe must never take. The layout box is transform-free, so its disagreement with the border rect is
    // the tell (any ancestor, any depth, scale or rotation alike), and the answer is a REFUSAL, not a
    // conversion: the scale would have to be recovered from a rounded integer, which puts approximation
    // inside the one number that must stay conservative. No offset box to ask = cannot tell = refuse.
    if (typeof el.offsetWidth !== "number" || typeof el.offsetHeight !== "number") return null;
    if (Math.abs(border.width - el.offsetWidth) > 0.5 || Math.abs(border.height - el.offsetHeight) > 0.5) return null;
    if (s.transform !== "none" && s.transform.indexOf(PURE_TRANSLATE) !== 0) return null;
    var matrix = s.transform === "none" ? [] : s.transform.slice(PURE_TRANSLATE.length, -1).split(", ");
    var moved = s.translate === "none" ? [] : s.translate.split(" ");
    var left = border.left + parseFloat(own.borderLeftWidth) + parseFloat(s.left);
    var right = border.right - parseFloat(own.borderRightWidth) - parseFloat(s.right);
    var top = border.top + parseFloat(own.borderTopWidth) + parseFloat(s.top);
    var bottom = border.bottom - parseFloat(own.borderBottomWidth) - parseFloat(s.bottom);
    var dx = translateAlong(moved[0], right - left) + (matrix.length === 0 ? 0 : parseFloat(matrix[0]));
    var dy = translateAlong(moved[1], bottom - top) + (matrix.length === 0 ? 0 : parseFloat(matrix[1]));
    var rect = { left: left + dx, top: top + dy, right: right + dx, bottom: bottom + dy };
    if (!isFinite(rect.left + rect.top + rect.right + rect.bottom)) return null;
    var outward = rect.left < border.left - 0.5 || rect.top < border.top - 0.5 || rect.right > border.right + 0.5 || rect.bottom > border.bottom + 0.5;
    return outward ? rect : null;
  }
  function pseudoHitEnvelope(el) {
    var own = getComputedStyle(el);
    var border = el.getBoundingClientRect();
    var before = pseudoHitRect(el, own, border, "::before");
    var after = pseudoHitRect(el, own, border, "::after");
    if (before === null) return after;
    if (after === null) return before;
    return {
      left: Math.min(before.left, after.left),
      top: Math.min(before.top, after.top),
      right: Math.max(before.right, after.right),
      bottom: Math.max(before.bottom, after.bottom),
    };
  }
  function ancestorCreditAt(el, x, y) {
    if (isVisuallyHidden(el)) return true;
    var env = pseudoHitEnvelope(el);
    return env !== null && x >= env.left && x < env.right && y >= env.top && y < env.bottom;
  }
  // ANOTHER ELEMENT'S TEXT IS NOT THIS CONTROL'S TARGET (owner ruling 2026-08-30, #807: credit only a
  // FORWARDING ancestor). Measured live on Settings→Plugins at --mobile, the capability control's ring is
  // ["self", "other:p.font-sans", "self", "ANCESTOR:div.relative"] — and the composite clause credited
  // that PARAGRAPH, because the control is the row's only offered control. So design-audit published a
  // 44x44 target for a row that does not toggle, on the one surface where the tap-target lens matters.
  //
  // The discriminator that survives contact with BOTH shapes is what the hit is MADE OF. The composite
  // clause exists for a Slider's decorative track pieces ([data-slot=slider-indicator] — a sibling of the
  // thumb, rendering no text, and a press on it genuinely moves the value): those forward. A run of PROSE
  // in a layout row forwards nothing — clicking a capability's sentence does not grant it — and it is
  // exactly what the plugins row put under the probe. A hit CONTAINING the control keeps its credit
  // regardless: that is the wrapper whose box the control's own pseudo sits over, and refusing it undoes
  // #662/#665 (measured: the isolated glyph collapses 44 → 22 the moment ancestors are refused, which is
  // how this comment came to be written twice).
  //
  // NOT IMPLEMENTED, and why (the un-provable half of the ruling): "an ancestor carrying a click handler
  // that toggles the control" needs the handler to be dispatched to, and React handlers are invisible to
  // the DOM. The only proof is a real click — and this tool's contract is "read-only, never touches app
  // settings" (cli.ts), which on the surface that named this issue means granting a plugin capability.
  // Under-crediting such a hit is the safe direction: too small is a finding to dismiss, too large is a
  // defect that never gets reported.
  function hitForwards(el, hit) {
    return hit.contains(el) || String(hit.textContent || "").trim().length === 0;
  }
  function sharedCompositeOwns(el, hit) {
    var scope = el.parentElement;
    for (var d = 0; d < COMPOSITE_WALK_MAX && scope !== null; d += 1) {
      if (scope.contains(hit)) {
        var controls = scope.querySelectorAll(INTERACTIVE_SELECTOR);
        for (var c = 0; c < controls.length; c += 1) {
          var other = controls[c];
          if (other !== el && !el.contains(other) && isOfferedControl(other)) return false;
        }
        return true;
      }
      scope = scope.parentElement;
    }
    return false;
  }
  // A FORWARDING LABEL IS PART OF THE TARGET (#797, the census's second lie). The checkbox-leading
  // consent row — a 16px native checkbox whose 44px hit area is the <label for=...> wrapping the whole
  // row — is the house pattern, and a click anywhere in that label ACTIVATES the control: that is what
  // "target size" means in WCAG 2.5.5/2.5.8. The probe credited self / pseudo / composite hits only, so
  // it read the bare 16px box and under-credited the pattern everywhere it is used.
  //
  // The association is read from \`el.labels\` (the DOM's own answer — it covers the explicit \`for\`
  // spelling AND an implicit wrapping label, and it is EMPTY for a checkbox sitting inside a label whose
  // \`for\` names some other control, which is the widening this must not do). The inner walk is the other
  // half: a pixel inside the label that belongs to ANOTHER offered control belongs to that control's
  // target, not to this one — a label containing both a checkbox and a "Manage" button must not credit
  // the checkbox with the button's pixels.
  function forwardingLabelOwns(el, hit) {
    var labels = el.labels;
    if (!labels || labels.length === 0) return false;
    for (var li = 0; li < labels.length; li += 1) {
      var lab = labels[li];
      if (lab !== hit && !lab.contains(hit)) continue;
      var blocked = false;
      for (var node = hit; node !== null && node !== lab; node = node.parentElement) {
        if (node !== el && !el.contains(node) && node.matches(INTERACTIVE_SELECTOR) && isOfferedControl(node)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return true;
    }
    return false;
  }
  // DECLARED LIMIT (narrowed by #807, then BOUNDED by #2300): a lone pseudo-carried or visually-hidden
  // control inside a larger non-interactive wrapper within COMPOSITE_WALK_MAX levels is still credited
  // with that wrapper's extent — the wrapper has no content of its own at the probed point, so nothing
  // else can answer, and that direction is the accepted trade against the FP class this probe exists for.
  // #807 removed the credit for a hit that is another element's TEXT; #2300 stopped it at the pseudo's own
  // measured rect, so "the wrapper's extent" now means "the wrapper, where the pseudo actually reaches".
  // The VISUALLY-HIDDEN arm keeps the unbounded form: it has no pseudo to measure, its whole shape is a
  // collapsed clip-path standing in for the box that represents it, and the Slider thumb it exists for is
  // the one control whose real target genuinely IS the ancestor's row.
  //
  // DECLARED LIMIT (#807, the un-provable half of the ruling): an ancestor that forwards through a JS
  // click handler rather than a <label> reads as UN-OWNED. React handlers are invisible to the DOM, the
  // only proof is to dispatch a click and watch the control activate, and this tool is "read-only, never
  // touches app settings" (cli.ts) — on the surface that named this issue such a click grants a plugin
  // capability. Under-crediting a handler-forwarded row is the safe direction: it reports a target
  // smaller than the truth, never larger.
  //
  // The coordinate guard is a FRAME guard, not an ownership verdict: callers must have cleared
  // probeFrameFits first, so a false here means "the compositor says another element owns this point",
  // never "the point was off screen" (#797).
  function ownsPoint(el, x, y) {
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
    var hit = document.elementFromPoint(x, y);
    if (hit === null) return false;
    if (hit === el || el.contains(hit)) return true;
    if (forwardingLabelOwns(el, hit)) return true;
    if (!ancestorCreditAt(el, x, y)) return false;
    if (!hitForwards(el, hit)) return false;
    if (hit.contains(el)) return true;
    return sharedCompositeOwns(el, hit);
  }
  // Can this point be ASKED at all — does it exist in the viewport elementFromPoint answers for?
  function pointInFrame(x, y) {
    return x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
  }
  // Grow outward from the centre while the control still answers on all four cardinal offsets, and report
  // whether the walk ran out of SCREEN rather than out of ownership:
  //   { half: <effective half-extent in px, >= the box's own>, truncated: <the answer is a LOWER BOUND> }
  //
  // TRUNCATED IS NOT THE SAME AS UNOWNED (#797). A radius whose ring falls off the viewport cannot be
  // asked — elementFromPoint answers null there, and null reads as "another element owns this" — so
  // counting it as a failure is what collapsed a 44x44 ring to an 18x18 P1 on the Settings→Plugins pane.
  //
  // The discrimination is PER POINT, not per ring, and both halves were paid for:
  //   · a point that WAS asked and answered "someone else" CAPS the extent — ownership needs all four
  //     cardinals, so that radius genuinely failed and the number is a real measurement. This is what
  //     keeps an ordinary 20px control 10px from the left edge (the app-shell skip-link stage) FAILING:
  //     its left probe is unaskable, but its right probe lands on the wrapper and settles the question.
  //   · a ring whose asked points were ALL owned while others fell off the screen answers nothing about
  //     the radius: the control may well own it. That, and only that, makes the result a lower bound.
  function measureHitExtent(el, rect) {
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var box = Math.min(rect.width, rect.height) / 2;
    // The centre itself is off screen: nothing was measured at all, so the box is a floor, not a finding.
    if (!pointInFrame(cx, cy)) return { half: box, truncated: true };
    if (!ownsPoint(el, cx, cy)) return { half: box, truncated: false }; // occluded centre: trust the box
    var best = box;
    var unframed = false;
    for (var hp = 0; hp < HIT_PROBE_RADII.length; hp += 1) {
      var r = HIT_PROBE_RADII[hp];
      if (r <= best) continue;
      // Inset by half a pixel: the last coordinate a \`2r\` target owns is \`c + r - 0.5\`, never \`c + r\`
      // (HIT_PROBE_INSET above). \`best\` still records the RUNG, so the published extent is unchanged for
      // every control that already cleared it — only the controls sitting exactly ON a rung change verdict.
      var p = r - HIT_PROBE_INSET;
      var ring = [[cx - p, cy], [cx + p, cy], [cx, cy - p], [cx, cy + p]];
      var missing = 0;
      var capped = false;
      for (var pi = 0; pi < ring.length; pi += 1) {
        if (!pointInFrame(ring[pi][0], ring[pi][1])) {
          missing += 1;
        } else if (!ownsPoint(el, ring[pi][0], ring[pi][1])) {
          capped = true;
          break;
        }
      }
      if (capped) continue; // asked, and answered no: a genuine cap, not a frame limit
      if (missing > 0) unframed = true;
      else best = r;
    }
    return { half: best, truncated: unframed };
  }
  // A control whose HOST sits outside the visual viewport is a phantom (2026-08-16: an off-canvas detail
  // panel at x=431 on a 430px viewport supplied a whole census of "failures" nobody could touch).
  // It answers the OFFERED question, never the PAINT question — see the class table in
  // ops/walker/census-interactive.ts.
  function inVisualViewport(rect) {
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

`;
