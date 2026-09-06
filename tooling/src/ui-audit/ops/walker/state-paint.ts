// ui-audit in-page walker — segment: the SHARED interaction-state-paint vocabulary + selector
// machinery. Composed into BOTH page programs (the main walk, ops/walker.ts, and the forced-state
// pass, ops/hover.ts) so the three ex-blind sites — the hover-contrast prefilter, the
// animated-img-hover stylesheet scan, and the glow census — answer "does this selector carry
// interaction-state paint, and via which mechanism" through ONE predicate (design:
// docs/design/state-paint-census.md). This segment DECLARES functions and vocabulary only; all
// census EXECUTION stays in the consuming segments, so its presence in the main walk costs nothing.
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a
// string, not a function). Provenance + attribution: ops/walker.ts.
//
// TWO MECHANISMS, ONE QUESTION. CSS `:hover` is a pseudo-class only CDP can force; Base UI — the
// app's only interactive-primitive vendor — never uses it for its own state, setting JS-driven
// `data-*` attributes instead (docs/vendor/base-ui/handbook/styling.md), which page JS can force
// with a synchronous setAttribute/read/restore. Both spell "paint this element differently while an
// interaction state holds", and a census that sees only one of them publishes FALSE
// `excluded(noHoverPaint)` claims for the other (the pre-2026-09-01 state of hover-walker.ts).
//
// THE ESCAPED-SELECTOR LAW (#24). Tailwind mints class NAMES containing escaped variant colons —
// `.dark\\:hover\\:bg-neutral-700:hover` — and a bare `/:hover/` matches INSIDE the class name
// (the following `\\` fails a `(?![-\\w])` guard), so a strip mangles the selector into one
// querySelectorAll throws on (measured: 25 unparseable selectors on the isolated config stage, 19
// of them this bug). Every `:hover` test and strip goes through the lookbehind forms below; the
// same escape discipline guards the attribute scanner (`\\[` in a class name is not an attribute
// selector) and the pseudo-element detector.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_STATE_PAINT = `  // ── shared interaction-state-paint predicate + selector machinery ────────
  var STATE_HOVER_RE = /(?<!\\\\):hover(?![-\\w])/;
  var STATE_HOVER_STRIP_RE = /(?<!\\\\):hover(?![-\\w])/g;
  var STATE_PSEUDO_ELEMENT_RE = /(?<!\\\\)::[a-zA-Z-]+(\\([^)]*\\))?/;
  var STATE_PSEUDO_ELEMENT_STRIP_RE = /(?<!\\\\)::[a-zA-Z-]+(\\([^)]*\\))?/g;
  function hasStateHover(text) { return STATE_HOVER_RE.test(text); }
  /** WHERE a selector's unescaped \`:hover\` occurrences sit — the depth guard \`stateAttrScan\` has
   *  carried since birth and this side did not (#1073). \`topLevel\`: at the selector's own depth, so
   *  the subject IS the compound and CDP can force it. \`nested\`: inside a functional pseudo —
   *  Tailwind's compiled group variant \`.group-hover\\\\:bg-x:is(:where(.group):hover *)\`, whose true
   *  subject is an ANCESTOR the compound never names. With only \`hasStateHover\`'s one "anywhere"
   *  boolean, that shape built a pair whose subject resolved to the PAINTED element; the forcer held
   *  \`:hover\` there, nothing repainted, and the pass published \`excluded(noHoverChange)\` — a
   *  measurement claim about a rule it never engaged. docs/design/state-paint-census.md, Polarity. */
  function stateHoverScan(text) {
    var depth = 0;
    var quote = "";
    var result = { topLevel: false, nested: false };
    for (var shi = 0; shi < text.length; shi += 1) {
      var shc = text.charAt(shi);
      if (quote !== "") {
        if (shc === quote && text.charAt(shi - 1) !== "\\\\") quote = "";
        continue;
      }
      if (shc === "'" || shc === '"') { quote = shc; continue; }
      if (shc === "(") { depth += 1; continue; }
      if (shc === ")") { depth -= 1; continue; }
      if (shc !== ":" || text.charAt(shi - 1) === "\\\\") continue;
      if (text.slice(shi, shi + 6) !== ":hover") continue;
      if (/[-\\w]/.test(text.charAt(shi + 6))) continue;
      if (depth === 0) result.topLevel = true;
      else result.nested = true;
      shi += 5;
    }
    return result;
  }
  function stripStateHover(sel) { return sel.replace(STATE_HOVER_STRIP_RE, "").trim(); }
  function hasStatePseudoElement(sel) { return STATE_PSEUDO_ELEMENT_RE.test(sel); }
  function stripStatePseudoElements(sel) { return sel.replace(STATE_PSEUDO_ELEMENT_STRIP_RE, "").trim(); }

  // THE CLASSIFIED BASE-UI STATE-ATTRIBUTE VOCABULARY — the one judgment call, made once
  // (docs/design/state-paint-census.md carries the full in/out table with the OUT reasons).
  // IN = a state of the control that user INTERACTION drives, whose paint the app shows while the
  // page structure is otherwise unchanged. Deliberately OUT: data-unchecked (the rest arm of
  // checked — present by default, judged at rest), data-disabled (WCAG 1.4.3 inactive-exempt,
  // judged at rest on genuinely disabled controls), the popup lifecycle set
  // (data-open/closed/popup-open/nested*/has-submenu-open — the state accompanies a mounted popup
  // the forced attribute alone does not produce), the animation hooks
  // (data-starting-style/ending-style — forcing one reads a mid-transition frame), and the
  // positioning/metadata set (data-side/align/orientation/anchor-hidden/uncentered/
  // activation-direction/instant/swipe*/visible/complete/expanded/multiple/focusable/
  // list-empty/empty/trigger-disabled/transitioning/previous). Entries with zero live rules cost
  // nothing at runtime — the census only acts on rules that exist.
  var STATE_PAINT_ATTRS = [
    "data-highlighted", // Base UI's pointer/keyboard rove state on list items — the :hover analogue
    "data-pressed", // trigger/button under active press — the :active analogue
    "data-selected", // selection paint (incl. the ratified ListRow accent, #485, and cmdk's valued form)
    "data-checked", // toggle/radio/switch on-state paint
    "data-indeterminate", // the checkbox third state — same axis as checked
    "data-active", // tabs / nav-link active paint
    "data-current", // nav current-page / viewport current-slot paint
    "data-dragging", // slider thumb under drag — transient pointer state
    "data-scrubbing", // number-field scrub — transient pointer state
    "data-placeholder", // value-emptiness paint (muted placeholder ink is a contrast question)
    "data-filled", // Field value-present paint
    "data-focused", // Field focus paint (the data-attribute channel, distinct from :focus-visible)
    "data-valid", // Field validation paint
    "data-invalid", // Field validation paint (destructive ink on the field surface)
    "data-dirty", // Field interaction-history paint
    "data-touched", // Field interaction-history paint
    "data-readonly", // readonly is NOT WCAG-inactive — its dimmed paint still owes legibility
    "data-required", // requiredness paint on labels/controls
  ];
  var STATE_PAINT_ATTR_SET = {};
  for (var spa = 0; spa < STATE_PAINT_ATTRS.length; spa += 1) STATE_PAINT_ATTR_SET[STATE_PAINT_ATTRS[spa]] = 1;
  // The Tailwind CLASS-name variant form (census-decor's img class arm). group-QUALIFIED too (#1075):
  // \`group-hover:scale-105\` sits on a WRAPPER, never the <img> (media-tile-grid/variants.ts:43).
  var STATE_VARIANT_TRANSFORM_RE = new RegExp("^(?:group-)?(?:hover|" + STATE_PAINT_ATTRS.join("|") + "):(scale|rotate|translate-x|translate-y|skew-x|skew-y)-");

  /** Every state-attribute occurrence in one selector string. An occurrence is an UNESCAPED
   *  \`[data-…]\` whose name is in the vocabulary; \`depth\` says whether it sits at the selector's
   *  top level (forcible: the subject is the element the compound names) or inside a functional
   *  pseudo (\`:is(:where(.group)[data-checked] *)\`, the compiled Tailwind group shape — the true
   *  subject is an ANCESTOR the compound does not name, so forcing the matched element would not
   *  engage the rule and would publish a FALSE noHoverChange; those pairs are withheld by name).
   *  \`value\` is null for presence, the exact string for \`=\` (quoted or bare); any other operator
   *  or a case flag marks the occurrence \`complex\`. */
  function stateAttrScan(text) {
    var found = [];
    var depth = 0;
    var quote = "";
    for (var i = 0; i < text.length; i += 1) {
      var ch = text.charAt(i);
      if (quote !== "") {
        if (ch === quote && text.charAt(i - 1) !== "\\\\") quote = "";
        continue;
      }
      if (ch === "'" || ch === '"') { quote = ch; continue; }
      if (ch === "(") { depth += 1; continue; }
      if (ch === ")") { depth -= 1; continue; }
      if (ch !== "[" || text.charAt(i - 1) === "\\\\") continue;
      var ni = i + 1;
      var name = "";
      while (ni < text.length && /[a-zA-Z0-9-]/.test(text.charAt(ni))) { name += text.charAt(ni); ni += 1; }
      if (STATE_PAINT_ATTR_SET[name] !== 1) continue;
      var occurrence = { attr: name, value: null, complex: false, topLevel: depth === 0, start: i, end: ni + 1 };
      var c2 = text.charAt(ni);
      if (c2 === "]") {
        occurrence.end = ni + 1;
        found.push(occurrence);
        continue;
      }
      if (c2 !== "=") {
        // ^= $= *= ~= |= or whitespace/flags — a shape the forcer does not model.
        occurrence.complex = true;
        var closeAt = text.indexOf("]", ni);
        occurrence.end = closeAt === -1 ? text.length : closeAt + 1;
        found.push(occurrence);
        continue;
      }
      var vi = ni + 1;
      var vquote = "";
      var vch = text.charAt(vi);
      if (vch === '"' || vch === "'") { vquote = vch; vi += 1; }
      var value = "";
      while (vi < text.length) {
        var vc = text.charAt(vi);
        if (vquote !== "" ? vc === vquote : vc === "]") break;
        value += vc;
        vi += 1;
      }
      if (vquote !== "") vi += 1;
      if (text.charAt(vi) !== "]") {
        // trailing case-flag (\` i\`) or unterminated — complex.
        occurrence.complex = true;
        var close2 = text.indexOf("]", vi);
        occurrence.end = close2 === -1 ? text.length : close2 + 1;
        found.push(occurrence);
        continue;
      }
      occurrence.value = value;
      occurrence.end = vi + 1;
      found.push(occurrence);
    }
    return found;
  }
  function stateAttrAnywhere(text) { return stateAttrScan(text).length > 0; }
  /** Does this functional-pseudo ARGUMENT carry an interaction-state test of EITHER mechanism? Both
   *  spellings of the compiled group variant land here — \`:where(.group)[data-checked] *\` and
   *  \`:where(.group):hover *\` — and the \`:hover\` arm was added with #1073: the stripper below is what
   *  resolves such a rule's rest HOST, so a predicate blind to one mechanism left that half with no
   *  host to mark and therefore no way to withhold it. */
  function stateTestAnywhere(text) { return stateAttrAnywhere(text) || hasStateHover(text); }
  /** The selector with every functional pseudo-class whose ARGUMENT carries a state test
   *  removed — the rest-resolvable HOST of a compiled Tailwind group-variant rule
   *  (\`.cls:is(:where(.group)[data-checked] *)\` → \`.cls\`), used only to MARK those hosts withheld
   *  (\`complexStateSelector\`): the true subject is an ancestor the compound does not name, so the
   *  forcer refuses rather than publishing a false noHoverChange. */
  function stripStateFunctionalPseudos(sel) {
    var out = "";
    var i2 = 0;
    while (i2 < sel.length) {
      var c3 = sel.charAt(i2);
      if (c3 === ":" && sel.charAt(i2 - 1) !== "\\\\" && sel.charAt(i2 + 1) !== ":") {
        var ni2 = i2 + 1;
        var pname = "";
        while (ni2 < sel.length && /[a-zA-Z-]/.test(sel.charAt(ni2))) { pname += sel.charAt(ni2); ni2 += 1; }
        if (pname !== "" && sel.charAt(ni2) === "(") {
          var depth2 = 1;
          var end2 = ni2 + 1;
          while (end2 < sel.length && depth2 > 0) {
            if (sel.charAt(end2) === "(") depth2 += 1;
            else if (sel.charAt(end2) === ")") depth2 -= 1;
            end2 += 1;
          }
          if (stateTestAnywhere(sel.slice(ni2 + 1, end2 - 1))) {
            i2 = end2;
            continue;
          }
        }
      }
      out += c3;
      i2 += 1;
    }
    return out.trim();
  }
  /** The selector with every TOP-LEVEL vocabulary attribute selector removed — what the painted
   *  elements look like at REST, resolvable by querySelectorAll before any state is forced. */
  function stripStateAttrs(sel) {
    var occurrences = stateAttrScan(sel);
    var out = "";
    var cursor = 0;
    for (var so = 0; so < occurrences.length; so += 1) {
      if (!occurrences[so].topLevel) continue;
      out += sel.slice(cursor, occurrences[so].start);
      cursor = occurrences[so].end;
    }
    out += sel.slice(cursor);
    return out.trim();
  }

  // ── the glow-layer vocabulary (one home; census-glow + the forced-state glow reads) ──────────
  // THE EXEMPTION IS A DISCIPLINE, NOT A LIST OF PRODUCT NAMES (moved verbatim from census-glow.ts,
  // 2026-09-01, when the forced-state pass became this vocabulary's second consumer — see that
  // file's header for the six-carrier measurement behind the tolerance).
  var PSEUDOS = ["", "::before", "::after"];
  var GLOW_LAYER_INSET_TOLERANCE_PX = 4;
  function glowLayerInsetsToBox(pStyle) {
    var insetSides = [pStyle.top, pStyle.right, pStyle.bottom, pStyle.left];
    for (var gli = 0; gli < insetSides.length; gli += 1) {
      var glv = Number.parseFloat(insetSides[gli]);
      if (Number.isNaN(glv) || Math.abs(glv) > GLOW_LAYER_INSET_TOLERANCE_PX) return false;
    }
    return true;
  }
  function isDedicatedGlowLayer(pStyle) {
    if (pStyle.position !== "absolute" && pStyle.position !== "fixed") return false;
    if (pStyle.pointerEvents !== "none") return false;
    var glz = Number.parseFloat(pStyle.zIndex);
    if (Number.isNaN(glz) || glz > 0) return false;
    if ((pStyle.content || "").replace(/["']/g, "").trim() !== "") return false;
    if ((pStyle.backgroundImage || "none") !== "none") return false;
    var glBg = parseRgb(pStyle.backgroundColor);
    if (glBg !== null && glBg.a > 0.05) return false;
    if (
      Number.parseFloat(pStyle.borderTopWidth) > 0 ||
      Number.parseFloat(pStyle.borderRightWidth) > 0 ||
      Number.parseFloat(pStyle.borderBottomWidth) > 0 ||
      Number.parseFloat(pStyle.borderLeftWidth) > 0
    ) {
      return false;
    }
    return glowLayerInsetsToBox(pStyle);
  }

  // THE RATIFIED CTA-GLOW EXEMPTION (owner, 2026-09-01, ratified with a re-taken composition
  // receipt): a FORCED-STATE element glow whose computed box-shadow equals the value the sanctioned
  // \`--shadow-cta-glow\` token resolves to ON THAT ELEMENT is the deliberate primary-CTA hover
  // treatment (tokens.json \`shadow.cta-glow\`: "the one rationed Ember glow"), not the glow tell. A
  // TOKEN-DERIVATION test, never a component name list: the equality is taken by resolving the token
  // through a probe node appended beside the element (so scoped \`--color-primary\` overrides resolve
  // exactly as they do for the element) and comparing browser-serialized layers, with Tailwind's
  // unset-layer placeholders (\`rgba(0, 0, 0, 0) 0px 0px 0px 0px\`) normalized away on both sides. The
  // ratification premise was RE-MEASURED fresh (2026-09-01, live primary CTA under CDP-forced
  // hover+focus-visible): the computed box-shadow carries the ring pair FIRST and the glow layers
  // after, so the focus ring paints on top and composes — the clobber rationale this exemption would
  // otherwise trip over was retracted in SKILL.md the same day. An element glow that does NOT equal
  // the token — extra layers, a hand-spelled halo, any near-miss — still fires (the two-direction
  // control in tests/tooling/ui-audit/ops/walker/state-paint.int.test.ts).
  // CACHE GRANULARITY IS PER ELEMENT (warm-leg F1, verifier finding 2026-09-01): the first cut
  // keyed this memo on the token's RAW text — one page-global string whenever the raw collides — so
  // a context-dependent resolution (a currentColor/em-carrying token under two colour scopes reads
  // IDENTICAL raw text while the used value differs) reused the FIRST element's serialization for
  // every later one. The failure direction was a FALSE FIRE on the scoped element, never a false
  // exemption — but the promise above ("resolve exactly as they do for the element") must be the
  // mechanism, not a wish: the memo is now keyed on the ELEMENT, and the probe carries the element's
  // OWN raw token text (not a var() re-lookup) so the serialization is taken beside the element it
  // exempts. Pinned by the two-scope currentColor fixture in state-paint.int.test.ts.
  var ctaGlowResolvedCache = new WeakMap();
  function normalizedShadowLayers(text) {
    if (!text || text === "none") return "";
    var layers = splitTopLevelArgs(text);
    var kept = [];
    for (var nl = 0; nl < layers.length; nl += 1) {
      var layer = layers[nl].trim();
      if (layer.indexOf("rgba(0, 0, 0, 0)") === 0 && !/[1-9]/.test(layer)) continue;
      kept.push(layer);
    }
    return kept.join(", ");
  }
  function matchesCtaGlowToken(el, forcedBoxShadow) {
    var raw = getComputedStyle(el).getPropertyValue("--shadow-cta-glow").trim();
    if (raw === "") return false;
    var resolved = ctaGlowResolvedCache.get(el);
    if (resolved === undefined) {
      var host = el.parentElement || document.body;
      var probeEl = document.createElement("div");
      probeEl.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
      probeEl.style.boxShadow = raw;
      host.appendChild(probeEl);
      resolved = normalizedShadowLayers(getComputedStyle(probeEl).boxShadow);
      host.removeChild(probeEl);
      ctaGlowResolvedCache.set(el, resolved);
    }
    return resolved !== "" && resolved === normalizedShadowLayers(forcedBoxShadow);
  }

  /** REST snapshot of everything the forced glow read compares against: per layer (element,
   *  ::before, ::after), the shadow pair and the radial background. Taken at census time so the
   *  forced read can emit ONLY what the state CHANGED — a glow present at rest is the static glow
   *  census's sample, and emitting it again from the forced pass would file one paint twice.
   *  STATED RESIDUAL: a shadow behind a covering \`transition\` reads its rest value at t≈0, so a
   *  transitioned state-gated glow can escape the delta — the same bounded race the contrast side
   *  names \`noHoverChangeButTransitioned\`; glow has no per-sample accounting channel to name it in. */
  function stateGlowSnapshotOf(el) {
    var snap = [];
    for (var gp = 0; gp < PSEUDOS.length; gp += 1) {
      var gs = PSEUDOS[gp] === "" ? getComputedStyle(el) : getComputedStyle(el, PSEUDOS[gp]);
      snap.push({
        boxShadow: gs.boxShadow || "none",
        textShadow: gs.textShadow || "none",
        backgroundImage: gs.backgroundImage || "none",
      });
    }
    return snap;
  }
  /** The rows a forced state ADDS over the rest snapshot, in the exact shapes the static glow
   *  census emits (GlowShadowInput / RadialGlowInput) so lib/checks-decor + lib/checks-ornament
   *  judge them with zero changes. The state rides the selector (\`…[data-selected]::before\`),
   *  the radial census's own pseudo-in-selector spelling one axis up. */
  function stateGlowRowsOf(el, stateSuffix, restSnap) {
    var shadows = [];
    var radials = [];
    for (var gp2 = 0; gp2 < PSEUDOS.length; gp2 += 1) {
      var pStyle = PSEUDOS[gp2] === "" ? getComputedStyle(el) : getComputedStyle(el, PSEUDOS[gp2]);
      if (PSEUDOS[gp2] !== "" && (!pStyle.content || pStyle.content === "none")) continue;
      var bs = pStyle.boxShadow || "none";
      var ts = pStyle.textShadow || "none";
      var rest = restSnap[gp2];
      if ((bs !== "none" || ts !== "none") && (bs !== rest.boxShadow || ts !== rest.textShadow)) {
        var sgBackdrop = resolveBackdrop(el.parentElement || el);
        shadows.push({
          selector: describe(el) + stateSuffix + PSEUDOS[gp2],
          boxShadow: bs === "none" ? "" : bs,
          textShadow: ts === "none" ? "" : ts,
          backdropColor: sgBackdrop.kind === "flat" ? sgBackdrop.color : sgBackdrop.kind === "unresolved" ? sgBackdrop.fallback : null,
          // Three sanctioned forms, one flag: the owner effect carriers, the dedicated pseudo layer,
          // and — element arm only, forced-state only — the token-exact CTA hover glow above.
          sanctioned: !!(
            (el.matches && el.matches(SANCTIONED_GLOW_SEL)) ||
            (PSEUDOS[gp2] !== "" && isDedicatedGlowLayer(pStyle)) ||
            (PSEUDOS[gp2] === "" && matchesCtaGlowToken(el, bs))
          ),
        });
      }
      var rbg = pStyle.backgroundImage || "none";
      if (rbg.indexOf("radial-gradient") !== -1 && rbg !== rest.backgroundImage) {
        var rrect = el.getBoundingClientRect();
        radials.push({
          selector: describe(el) + stateSuffix + PSEUDOS[gp2],
          value: rbg,
          width: rrect.width,
          height: rrect.height,
          sanctioned: !!(el.matches && el.matches(SANCTIONED_GLOW_SEL)),
        });
      }
    }
    return { shadows: shadows, radials: radials };
  }

  /** Split at top-level commas only — a comma inside :is(a, b) belongs to the pseudo, not to the
   *  list. (Moved from hover-walker.ts so both mechanisms parse pairs through one parser.) */
  function selectorSplitList(text) {
    var parts = [];
    var depth = 0;
    var quote = "";
    var buf = "";
    for (var si = 0; si < text.length; si += 1) {
      var ch = text.charAt(si);
      if (quote !== "") {
        buf += ch;
        if (ch === quote && text.charAt(si - 1) !== "\\\\") quote = "";
        continue;
      }
      if (ch === "'" || ch === '"') { quote = ch; buf += ch; continue; }
      if (ch === "(" || ch === "[") depth += 1;
      if (ch === ")" || ch === "]") depth -= 1;
      if (depth === 0 && ch === ",") { parts.push(buf); buf = ""; continue; }
      buf += ch;
    }
    parts.push(buf);
    return parts;
  }

  /** One complex selector to its top-level compounds, each with the combinator that precedes it. */
  function selectorCompounds(sel) {
    var out = [];
    var depth = 0;
    var quote = "";
    var buf = "";
    var comb = "";
    var pendingSpace = false;
    for (var ci = 0; ci < sel.length; ci += 1) {
      var c = sel.charAt(ci);
      if (quote !== "") {
        buf += c;
        if (c === quote && sel.charAt(ci - 1) !== "\\\\") quote = "";
        continue;
      }
      if (c === "'" || c === '"') { quote = c; buf += c; continue; }
      if (c === "(" || c === "[") { depth += 1; buf += c; continue; }
      if (c === ")" || c === "]") { depth -= 1; buf += c; continue; }
      if (depth > 0) { buf += c; continue; }
      if (c === " " || c === "\\t" || c === "\\n" || c === "\\r") {
        if (buf !== "") pendingSpace = true;
        continue;
      }
      if (c === ">" || c === "+" || c === "~") {
        if (buf !== "") { out.push({ combinator: comb, compound: buf }); buf = ""; }
        comb = c;
        pendingSpace = false;
        continue;
      }
      if (pendingSpace && buf !== "") { out.push({ combinator: comb, compound: buf }); buf = ""; comb = " "; }
      pendingSpace = false;
      buf += c;
    }
    if (buf !== "") out.push({ combinator: comb, compound: buf });
    return out;
  }

  function selectorJoin(parts) {
    var s = "";
    for (var ji = 0; ji < parts.length; ji += 1) {
      var step = parts[ji];
      if (ji === 0) s += step.compound;
      else if (step.combinator === " " || step.combinator === "") s += " " + step.compound;
      else s += " " + step.combinator + " " + step.compound;
    }
    return s;
  }
`;
