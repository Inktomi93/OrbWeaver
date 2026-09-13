// THE ONE CT-SIDE DEFINITION of "how far out from its centre does this control still answer a tap" — the
// `elementFromPoint` walk the touch-floor kit runs (`tests/support/browser/touch-floor.ts`) and the
// ui-audit instrument proof replays inside the page it is auditing
// (`tests/tooling/ui-audit/ops/walker/hit-extent.int.test.ts`).
//
// ── WHY THE PIECES ARE SHAPED LIKE THIS ───────────────────────────────────────────────────────────────
// THE ISOMORPHIC HELPER WORLD is the only home both consumers can reach: the kit is the DOM world, the
// instrument proof is the NODE world, and the node world has no `dom` lib (tsconfig.world-node.json). So
// nothing here may touch a `document`/`window` GLOBAL or a DOM TYPE — every browser fact is reached
// THROUGH the element (`el.ownerDocument`, `.defaultView.getComputedStyle`) against the minimal structural
// interfaces below, which `HTMLElement`/`Element`/`CSSStyleDeclaration` satisfy by shape.
//
// THE PAGE-SIDE HALVES ARE DUMB ON PURPOSE. {@link readPseudoGeometry} only READS resolved strings and
// {@link walkFrom} only WALKS; all of the arithmetic is {@link pseudoHitRect}/{@link pseudoHitEnvelope},
// which are pure functions of plain data and are therefore pinned by an ordinary NODE test
// (`tests/support/iso/hit-extent-walk.test.ts`) instead of only by a browser run. That split is also what
// keeps each function inside the cognitive-complexity budget without a suppression: a function handed to
// `locator.evaluate` is serialised as SOURCE TEXT into a page that has none of this module's scope, so it
// may not call a module-level helper, and one self-contained function carrying the whole algorithm scores
// 79 against a budget of 15.
//
// A SOURCE STRING CANNOT BE THE HOME. `locator.evaluate(<string>)` sends `isFunction: false`
// (playwright-core `coreBundle.js`: with `false` the evaluated value is RETURNED, never called), so a
// string spelling can never receive the element handle. The functions are the home;
// {@link HIT_EXTENT_WALK_SOURCE} is composed from their own `toString()` for the one consumer that must
// ship the rule INTO a page as text. Derived, never hand-copied — the hand copy is what let the instrument
// proof's "the two arms agree" pin agree with a predicate the kit no longer had.
//
// ── THE OWNERSHIP RULE (#2300, and the defect it replaces) ────────────────────────────────────────────
// Ancestor credit used to be granted on the EXISTENCE of an absolutely-positioned pseudo —
// `content !== none && (position === absolute || fixed)` — after which ANY ancestor containing the control
// owned every probed point. That predicate never measured the pseudo, so it could not tell a 55px hit area
// from a decoration, and the credit it granted was UNBOUNDED: it ran to the wrapper's own edges. Replayed
// on the shape #1843 fixed (a `data-cta` glyph button whose only pseudo was the CTA gradient ring —
// `inset: 0`, `pointer-events: none`, a mark no tap can land on) it reported 161x161 in an isolated 400px
// stage for a control whose real target was 26x26, and reported the SAME 161x161 after the fix, when the
// truth was 56x56. A number that is 161 whether the answer is 26 or 56 is not a measurement.
//
// So credit is GEOMETRY-SCOPED: a pseudo carries a hit area only where its RESOLVED RECT extends past the
// element's border box, and the credit reaches exactly that far and no further. The same clauses are
// mirrored — deliberately, with the reason recorded in both headers — in the product walker
// (`tooling/src/ui-audit/ops/walker/hit-extent.ts`), which is a raw-JS template-literal segment ABOVE the
// test tree in the layer cake and so can neither import this nor be imported by it. The two are pinned
// EQUAL on shared fixtures by the instrument proof named above; that pin is the only thing keeping them
// from drifting apart again.

/** The resolved-style reader — `CSSStyleDeclaration` satisfies it structurally. */
interface HitStyle {
  getPropertyValue: (property: string) => string;
}

/** A viewport-coordinate rectangle — `DOMRect` satisfies it, and the page-side reader returns a plain
 *  object of the same shape so it survives serialisation. */
export interface HitRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The hit-testable node the walk compares against — `Element` satisfies it.
 *  METHOD-STYLE ON PURPOSE (and the two below likewise): a property-style `contains` would be checked
 *  CONTRAVARIANTLY under `strictFunctionTypes`, which asks whether `HitNode` is assignable to `Node` — it
 *  is not, and the DOM-free structural typing this module depends on would be impossible. */
interface HitNode {
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style keeps the parameter bivariant, which is what lets `Element` satisfy this DOM-free interface (see the doc comment).
  contains(other: HitNode | null): boolean;
}

/** The measured element — `HTMLElement`/`SVGElement` satisfy it. */
interface HitElement extends HitNode {
  getBoundingClientRect: () => HitRect & { readonly width: number; readonly height: number };
  readonly ownerDocument: {
    elementFromPoint: (x: number, y: number) => HitNode | null;
    readonly defaultView: {
      // biome-ignore lint/style/useConsistentMethodSignatures: method-style keeps `element` bivariant, so the DOM's `getComputedStyle(elt: Element, …)` satisfies this DOM-free interface.
      getComputedStyle(element: HitElement, pseudoElement?: string | null): HitStyle;
    } | null;
  };
}

/** One pseudo's resolved geometry, as the strings the browser answers with. Deliberately UNPARSED: the
 *  page half reads, the node half decides, and the decision is unit-testable without a browser. */
export interface PseudoStyleFacts {
  readonly content: string;
  readonly position: string;
  readonly pointerEvents: string;
  readonly visibility: string;
  readonly display: string;
  readonly left: string;
  readonly right: string;
  readonly top: string;
  readonly bottom: string;
  readonly translate: string;
  readonly transform: string;
  readonly rotate: string;
  readonly scale: string;
}

/** Everything the envelope arithmetic needs about one control, read in a single page round trip. */
export interface HitGeometry {
  readonly border: HitRect;
  readonly ownPosition: string;
  readonly borderLeftWidth: string;
  readonly borderTopWidth: string;
  readonly borderRightWidth: string;
  readonly borderBottomWidth: string;
  readonly before: PseudoStyleFacts;
  readonly after: PseudoStyleFacts;
}

/** THE PAGE-SIDE READER — branchless by design (see the header). Serialised into the page by playwright,
 *  so it may not reference anything in this module's scope. */
export const readPseudoGeometry = (el: HitElement): HitGeometry => {
  const view = el.ownerDocument.defaultView;
  if (view === null) {
    // A detached document cannot be hit-tested at all. Refuse loudly: a fabricated zero here would read as
    // "a control with no target", which is a FINDING, and this is the absence of a measurement.
    throw new Error("readPseudoGeometry: the element's document has no view — nothing can be measured");
  }
  const own = view.getComputedStyle(el);
  const box = el.getBoundingClientRect();
  const facts = (pseudo: string): PseudoStyleFacts => {
    const style = view.getComputedStyle(el, pseudo);
    const read = (property: string): string => style.getPropertyValue(property);
    return {
      content: read("content"),
      position: read("position"),
      pointerEvents: read("pointer-events"),
      visibility: read("visibility"),
      display: read("display"),
      left: read("left"),
      right: read("right"),
      top: read("top"),
      bottom: read("bottom"),
      translate: read("translate"),
      transform: read("transform"),
      rotate: read("rotate"),
      scale: read("scale"),
    };
  };
  return {
    border: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
    ownPosition: own.getPropertyValue("position"),
    borderLeftWidth: own.getPropertyValue("border-left-width"),
    borderTopWidth: own.getPropertyValue("border-top-width"),
    borderRightWidth: own.getPropertyValue("border-right-width"),
    borderBottomWidth: own.getPropertyValue("border-bottom-width"),
    before: facts("::before"),
    after: facts("::after"),
  };
};

/**
 * ONE pseudo's outward hit rect in viewport px, or `null` when it carries no tap surface.
 *
 * HIT-ELIGIBLE means: generated (`content`), out of flow (`position: absolute`), paintable
 * (`visibility`/`display`), and ABLE TO TAKE A POINTER (`pointer-events !== none`). That last clause is
 * not a refinement of the geometry test but an independent fact about it — the pre-#1843 `data-cta` ring
 * kept the hit area's own `width`/`height`/`translate` utilities (the unlayered rule only overrode the
 * properties it declares), so it still describes an OUTWARD rect, and geometry alone would credit a brand
 * mark that no tap can ever reach.
 *
 * THE RECT NEEDS NO `width`: for an absolutely positioned box the resolved `left`/`right` are the USED
 * distances from the containing block's padding edges (measured in Chrome 2026-09-13 on the real shapes:
 * a 25px `size-glyph-sm` box under a 55px `::before` answers `left: 12.5px`, `right: -42.5px`), so the
 * two insets already carry the width — which also means an `auto` inset simply makes the rect
 * unmeasurable rather than needing a fallback branch.
 *
 * A `fixed` pseudo is refused: its containing block is the viewport, whose extent is not reachable from
 * the element, and no shipped hit area uses one. An element that is not itself positioned is refused for
 * the same class of reason — the pseudo's containing block is then some ancestor this arithmetic cannot
 * name. Every hit-area pseudo on this tree qualifies (`TOUCH_TARGET_PSEUDO`, Button's `glyphBox` and
 * `inline` arms all set `relative`).
 */
export const pseudoHitRect = (facts: PseudoStyleFacts, geometry: HitGeometry): HitRect | null => {
  // A pure translation matrix, the only `transform` this arithmetic can state; anything else — a
  // rotation, a scale, a skew — makes the rect something four numbers cannot describe, and an unstatable
  // rect is REFUSED rather than approximated. DECLARED IN HERE, not at module scope, because this
  // function is also serialised INTO A PAGE that has none of this module's bindings: a hoisted constant
  // reads perfectly, typechecks, and throws `ReferenceError` in the browser (measured 2026-09-13 — the
  // instrument proof's eval arm caught it in one run).
  const pureTranslatePrefix = "matrix(1, 0, 0, 1, ";
  const eligible =
    facts.content !== "none" &&
    facts.content !== "normal" &&
    facts.position === "absolute" &&
    facts.pointerEvents !== "none" &&
    facts.visibility !== "hidden" &&
    facts.display !== "none" &&
    facts.rotate === "none" &&
    facts.scale === "none" &&
    geometry.ownPosition !== "static";
  if (!eligible) {
    return null;
  }
  const translatable = facts.transform === "none" || facts.transform.startsWith(pureTranslatePrefix);
  if (!translatable) {
    return null;
  }
  const px = (value: string | undefined): number => Number.parseFloat(value ?? "");
  const matrix = facts.transform === "none" ? [] : facts.transform.slice(pureTranslatePrefix.length, -1).split(", ");
  const translate = facts.translate === "none" ? [] : facts.translate.split(" ");
  // The containing block is the element's PADDING box; `left`/`top` are measured from its top-left,
  // `right`/`bottom` from its bottom-right.
  const blockLeft = geometry.border.left + (px(geometry.borderLeftWidth) || 0);
  const blockTop = geometry.border.top + (px(geometry.borderTopWidth) || 0);
  const blockRight = geometry.border.right - (px(geometry.borderRightWidth) || 0);
  const blockBottom = geometry.border.bottom - (px(geometry.borderBottomWidth) || 0);
  const left = blockLeft + px(facts.left);
  const right = blockRight - px(facts.right);
  const top = blockTop + px(facts.top);
  const bottom = blockBottom - px(facts.bottom);
  // The centring shift. Tailwind v4 spells `-translate-x-1/2` as the standalone `translate` property, in
  // PERCENTAGES of the pseudo's own border box; hand-written CSS arrives as a matrix. Both are additive.
  const along = (token: string | undefined, basis: number): number => {
    if (token === undefined) {
      return 0;
    }
    return token.endsWith("%") ? (px(token) / 100) * basis : px(token);
  };
  const shiftX = along(translate[0], right - left) + (matrix.length === 0 ? 0 : px(matrix[0]));
  const shiftY = along(translate[1], bottom - top) + (matrix.length === 0 ? 0 : px(matrix[1]));
  const rect = { left: left + shiftX, top: top + shiftY, right: right + shiftX, bottom: bottom + shiftY };
  if (!Number.isFinite(rect.left + rect.top + rect.right + rect.bottom)) {
    return null;
  }
  // INSIDE the border box it is a decoration, not a hit area: the CTA ring's `inset: 0` grants nothing,
  // and neither does a focus underline. Half a pixel of slack keeps a rasterised edge from reading as
  // outward reach.
  const outward =
    rect.left < geometry.border.left - 0.5 ||
    rect.top < geometry.border.top - 0.5 ||
    rect.right > geometry.border.right + 0.5 ||
    rect.bottom > geometry.border.bottom + 0.5;
  return outward ? rect : null;
};

/** The union of a control's HIT-ELIGIBLE OUTWARD pseudo rects — the band inside which an ancestor may
 *  answer for it — or `null` when it has none, in which case an ancestor is only the wrapper's padding
 *  (the #662/#665 hole) and is never credited. */
export const pseudoHitEnvelope = (geometry: HitGeometry): HitRect | null => {
  const before = pseudoHitRect(geometry.before, geometry);
  const after = pseudoHitRect(geometry.after, geometry);
  if (before === null || after === null) {
    return before ?? after;
  }
  return {
    left: Math.min(before.left, after.left),
    top: Math.min(before.top, after.top),
    right: Math.max(before.right, after.right),
    bottom: Math.max(before.bottom, after.bottom),
  };
};

/**
 * THE PAGE-SIDE WALK: a control's reachable extent on one axis, in CSS px, walked out from its centre one
 * pixel at a time until the compositor stops answering with this control. Serialised into the page, so it
 * carries its whole algorithm and takes the already-computed {@link pseudoHitEnvelope} as data.
 *
 * OWNERSHIP, in the order the clauses are asked:
 *   1. the hit IS the element or something inside it — INCLUDING its own pseudos, which self-report
 *      (measured 2026-09-06 in the CT browser on a real `@orb/ui` Checkbox at both pointer arms, where a
 *      real mouse click at the same point toggles it). For every hit-eligible pseudo on this tree this is
 *      the clause that answers, and clause 2 never runs.
 *   2. ANCESTOR CREDIT, and only INSIDE the pseudo's own measured rect. It exists for the shape with no
 *      DOM node to answer with — a touch-target pseudo whose outward edge is CLIPPED AWAY by an ancestor's
 *      overflow, where whatever paints underneath answers instead. Outside that rect an ancestor is the
 *      wrapper's padding (#662/#665: a 413x16 trigger measuring 44 by borrowing its `Stack`), and past its
 *      edge it is #2300 (161 for a 26px control).
 *
 * The credited band is half-open — `[left, right)` — for the reason the walker's `HIT_PROBE_INSET` states:
 * a target of extent `2r` centred at `c` occupies `[c - r, c + r)`, so `c + r` is the neighbour's first
 * pixel and not this control's last.
 *
 * DECLARED LIMIT (carried from the kit): no composite-row mechanism (design-audit's `sharedCompositeOwns`)
 * and no visually-hidden arm, so a control whose real target is an ANCESTOR'S BOX — a Base UI Slider's
 * `h-control-sm` row — under-reports here to its own box and is measured with `boundingBox()` instead.
 */
export const walkFrom = (el: HitElement, arg: { readonly axis: "x" | "y"; readonly envelope: HitRect | null }): number => {
  const box = el.getBoundingClientRect();
  const centreX = box.left + box.width / 2;
  const centreY = box.top + box.height / 2;
  const envelope = arg.envelope;
  const owns = (x: number, y: number): boolean => {
    const hit = el.ownerDocument.elementFromPoint(x, y);
    if (hit === null) {
      return false;
    }
    if (hit === el || el.contains(hit)) {
      return true;
    }
    if (envelope === null || x < envelope.left || x >= envelope.right || y < envelope.top || y >= envelope.bottom) {
      return false;
    }
    return hit.contains(el);
  };
  const reach = (stepX: number, stepY: number): number => {
    let steps = 0;
    while (steps < 80 && owns(centreX + stepX * (steps + 1), centreY + stepY * (steps + 1))) {
      steps += 1;
    }
    return steps;
  };
  return arg.axis === "x" ? reach(-1, 0) + reach(1, 0) + 1 : reach(0, -1) + reach(0, 1) + 1;
};

/** The whole rule as ONE in-page expression, `(el, axis) => number`, composed from the functions above so
 *  it cannot drift from them. For the consumer that must ship the rule INTO a page as text: the ui-audit
 *  instrument proof runs it through `snap --eval` so the kit's walk and the product walker judge the same
 *  DOM in the same run. */
export const HIT_EXTENT_WALK_SOURCE: string = [
  "((el, axis) => {",
  `  const readPseudoGeometry = ${readPseudoGeometry.toString()};`,
  `  const pseudoHitRect = ${pseudoHitRect.toString()};`,
  `  const pseudoHitEnvelope = ${pseudoHitEnvelope.toString()};`,
  `  const walkFrom = ${walkFrom.toString()};`,
  "  return walkFrom(el, { axis, envelope: pseudoHitEnvelope(readPseudoGeometry(el)) });",
  "})",
].join("\n");
