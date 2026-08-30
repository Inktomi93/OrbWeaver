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

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

export const WALKER_HIT_EXTENT = `  // ── the compositor hit-extent probe ────────────────────────────────────────────────────────────
  // THE HIT AREA IS NOT THE BOX (2026-08-16 — 10 of 13 "sub-target" findings in one audit were this).
  // @orb/ui Button's size="inline"/size="glyph-*" variants carry a pointer-conditional touch-target
  // ::after (packages/ui/src/primitives/button/variants.ts:16-20, :76-82), so a 25x15 border box can own
  // a 45x45 hit area. Probe what the COMPOSITOR says: sample points on the ring the ::after would cover
  // and ask elementFromPoint whether this control still owns them. The measured extent is what WCAG
  // 2.5.5/2.5.8 are about — "target size", not "border-box size".
  var HIT_PROBE_RADII = [11, 16, 22]; // half-extents probed outward: 22 → a 44px target
  var HIT_PROBE_MAX = HIT_PROBE_RADII[HIT_PROBE_RADII.length - 1];
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
  // CAN answer:
  //   · PSEUDO-CARRIED: an overflowing ::after/::before touch-target pseudo (the @orb/ui Button glyph
  //     ramp — packages/ui/src/primitives/button/variants.ts glyphBox, content-[''] + absolute
  //     positioning) has no DOM node at all.
  //   · VISUALLY-HIDDEN: Base UI's native range input inside a Slider Thumb (isVisuallyHidden, core.ts —
  //     a collapsed clip-path) paints nothing; elementFromPoint on its own centre already resolves to
  //     the Thumb div that visually represents it (verified live: the input's own rect sits UNDER the
  //     Thumb, and even the probe at its own centre hits the Thumb, not the input).
  // A control with NEITHER — a plain, visible, appropriately-sized button — carries its floor on its OWN
  // border box (a real height/min-height, e.g. the CONTROL_SIZE ramp), so an ancestor is never evidence
  // of ownership for it: this is the #662/#665 hole, and it is refused before either ancestor path runs.
  // (A FORWARDING LABEL is the third shape and is deliberately NOT in this predicate — see
  // forwardingLabelOwns: it is not ancestor credit, it is a per-element activation fact.)
  function pseudoCarriesFloor(el) {
    function extendsOutward(style) {
      return style.content !== "none" && style.content !== "normal" && (style.position === "absolute" || style.position === "fixed");
    }
    return extendsOutward(getComputedStyle(el, "::after")) || extendsOutward(getComputedStyle(el, "::before"));
  }
  function ancestorCreditAllowed(el) {
    return pseudoCarriesFloor(el) || isVisuallyHidden(el);
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
  // DECLARED LIMIT: a lone control inside a larger non-interactive wrapper within COMPOSITE_WALK_MAX
  // levels is STILL credited with the wrapper's extent when the control itself is pseudo-carried or
  // visually-hidden (e.g. a glyph Button with no genuine composite siblings at all). That direction
  // (crediting a control that is, rarely, genuinely alone) is the accepted trade against the measured FP
  // class this file's probe exists to avoid — see THE HIT AREA IS NOT THE BOX above.
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
    if (!ancestorCreditAllowed(el)) return false;
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
      var ring = [[cx - r, cy], [cx + r, cy], [cx, cy - r], [cx, cy + r]];
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
