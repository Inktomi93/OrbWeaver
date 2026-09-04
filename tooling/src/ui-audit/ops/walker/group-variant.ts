// ui-audit in-page walker — segment: THE COMPILED GROUP VARIANT, resolved instead of refused (#1084).
//
// WHAT TAILWIND EMITS. `group-hover:text-foreground` compiles to
// `.group-hover\:text-foreground:is(:where(.group):hover *)`, and `group-data-[checked]:x` to
// `.x:is(:where(.group)[data-checked] *)`. Both spell ONE thing: "paint THIS element while an ANCESTOR
// matching that anchor is in that state". The anchor is a real, rest-resolvable selector — every live
// carrier on this tree is `:where(.group)` or a named `:where(.group\/row)` — and the painted element is
// the selector with the functional pseudo removed.
//
// WHY THIS SEGMENT EXISTS. #1073 stopped the forcer LYING about this shape: it used to hold `:hover` on
// the painted element, see nothing repaint, and publish `excluded(noHoverChange)` — a measurement claim
// about a rule it never engaged. The honest replacement was `withheld(complexStateSelector)`, and the
// design ruling recorded that withholding by name. #1084 is the owner's follow-through and the house
// idiom applies exactly: THE RULING SURVIVES — ITS INPUT CHANGED. The shape was withheld because it was
// unforcible; it is no longer unforcible, so it is judged. What stays withheld is everything this file
// still cannot resolve, and it now says which.
//
// ONE DERIVATION, BOTH MECHANISMS. The `:hover` half and the `data-*` half of the census differ only in
// how the state is applied (CDP `forcePseudoState` vs `setAttribute`); the SUBJECT resolution is
// identical — `painted.closest(anchor)` — so it is spelled once here and consumed by both arms of
// ops/hover-walker.ts. (Routing note, measured 2026-09-02: hover-walker.ts's rule collector sends a rule
// carrying a `:hover` to the HOVER list even when it also carries a state attribute, so the two arms
// never see the same rule; the shared derivation is a symmetry of shape, not a shared call.)
//
// Depends on ops/walker/state-paint.ts's vocabulary (`stateTestAnywhere`, the strippers, `stateAttrScan`)
// and is composed ONLY into the forced-state pass — the main walk builds no pairs and would carry dead
// bytes. Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a
// string, not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_GROUP_VARIANT = `  // ── the compiled group variant: the ANCHOR its state test actually names ──
  // The argument shape this can force, and ONLY this one: \`<anchorCompound><stateTest> *\` — one
  // compound, one state test, a DESCENDANT combinator. A sibling form (\`peer-hover:\` compiles to
  // \`:is(:where(.peer):hover ~ *)\`) has no \`closest()\` answer, a multi-compound argument names an
  // anchor this cannot address, and two state-bearing pseudos in one selector are two subjects the
  // forcer can only hold one of. Each of those returns null and stays WITHHELD by name — refusing a
  // shape is the whole reason this rule is trustworthy on the shapes it accepts.
  var GROUP_VARIANT_DESCENDANT_RE = /\\s\\*$/;
  var GROUP_VARIANT_COMBINATOR_RE = /[>+~]/;
  function groupVariantAnchorSel(sel) {
    var found = null;
    var gi = 0;
    while (gi < sel.length) {
      var gc = sel.charAt(gi);
      if (gc !== ":" || sel.charAt(gi - 1) === "\\\\" || sel.charAt(gi + 1) === ":") { gi += 1; continue; }
      var gni = gi + 1;
      var gname = "";
      while (gni < sel.length && /[a-zA-Z-]/.test(sel.charAt(gni))) { gname += sel.charAt(gni); gni += 1; }
      if (gname === "" || sel.charAt(gni) !== "(") { gi += 1; continue; }
      var gdepth = 1;
      var gend = gni + 1;
      while (gend < sel.length && gdepth > 0) {
        if (sel.charAt(gend) === "(") gdepth += 1;
        else if (sel.charAt(gend) === ")") gdepth -= 1;
        gend += 1;
      }
      var garg = sel.slice(gni + 1, gend - 1);
      if (!stateTestAnywhere(garg)) { gi = gend; continue; }
      if (found !== null) return null;
      if (!GROUP_VARIANT_DESCENDANT_RE.test(garg)) return null;
      var gsubject = garg.replace(GROUP_VARIANT_DESCENDANT_RE, "");
      if (GROUP_VARIANT_COMBINATOR_RE.test(gsubject) || /\\s/.test(gsubject)) return null;
      var ganchor = stripStateAttrs(stripStateHover(gsubject));
      // An anchor that still carries a state test is a nested state the forcer would have to hold as
      // well; an empty one is a bare state compound with nothing to address.
      if (ganchor === "" || stateTestAnywhere(ganchor)) return null;
      found = ganchor;
      gi = gend;
    }
    return found;
  }

  /** What the pass should DO with a selector whose state test is reachable only inside a functional
   *  pseudo. \`pair\` = forcible (hold \`subjectSel\`'s match, read \`paintedSel\`'s); \`pseudo\` = the paint
   *  lands on a pseudo-ELEMENT, which \`resolveBackdrop\` cannot read (withheld as it always was);
   *  \`opaque\` = a shape this file refuses to model (withheld, \`complexStateSelector\`); null = no host
   *  resolvable at all, which is nothing to say rather than a silent exclusion. */
  function groupVariantPairOf(sel) {
    var gvPainted = stripStateFunctionalPseudos(sel);
    if (hasStatePseudoElement(gvPainted)) {
      var gvHost = stripStatePseudoElements(gvPainted);
      return gvHost === "" ? null : { kind: "pseudo", hostSel: gvHost, paintedSel: "", subjectSel: "" };
    }
    if (gvPainted === "") return null;
    var gvAnchor = groupVariantAnchorSel(sel);
    if (gvAnchor === null) return { kind: "opaque", hostSel: gvPainted, paintedSel: "", subjectSel: "" };
    return { kind: "pair", hostSel: gvPainted, paintedSel: gvPainted, subjectSel: gvAnchor };
  }

`;
