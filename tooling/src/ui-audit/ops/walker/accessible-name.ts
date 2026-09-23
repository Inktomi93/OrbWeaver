// ui-audit in-page walker — segment: THE ACCESSIBLE-NAME SOURCE SET **and the one name KEY over it**.
//
// Split out of census-interactive.ts at #1009 (the tooling 450-line cap): the resolvers below are
// not a census, they are the SOURCE SET the accessible-name census and the door census both read — one
// resolver per way a control can carry a name, so neither consumer re-derives one and the two cannot
// drift apart (the door census reading a different source set than the name census is exactly the shape
// that let a `<label for>`-named control be filed unnamed AND be an unnameable door at the same time).
//
// #1324 — THE PRECEDENCE WAS INVERTED IN BOTH HOMES, AND THIS SEGMENT IS NOW THE ONE KEY. The door
// census composed its comparison key `aria-label || labelledby || …` and snap's surface map composed
// `aria-label` before `aria-labelledby` too (tooling/src/snap/lib/map-browser.ts). accname 1.2 puts
// step 2B (aria-labelledby) BEFORE step 2C (aria-label), so both homes had it backwards, identically.
// MEASURED (2026-09-04 census, 2026-09-04 §2.2):
// a planted pair sharing `aria-label="Same label"` under DIFFERENT `aria-labelledby` targets produced a
// FALSE `duplicate-action-door` P3, while a pair carrying different `aria-label`s under the SAME
// `aria-labelledby` — a REAL duplicate — was missed. `accessibleNameOf` below is the single spec-ordered
// key; `pnpm snap <route> --aria` (Playwright's `ariaSnapshot`) remains the ORACLE this was proved against,
// because it is the only spec-correct name engine in the fleet. This is NOT the `@orb/ui` accname-engine
// merge Core-Tooling-Law.md §2.8 refuses: the `aria-name` RULE still tests presence only (RULE-AUTHORING
// row 8), and no name is COMPUTED for a WCAG verdict — this is a comparison key two censuses already
// computed, computed once and in the right order.
//
// DECLARES ONLY, exactly like state-paint.ts: no census runs here, so composing it costs nothing but its
// declarations — which is what lets snap's surface map compose this segment ALONE. It must sit BEFORE
// census-interactive.ts in the walker composition (ops/walker.ts) — these are `var f = function …`
// assignments, so they exist only after their lines have EXECUTED, the same hoists-undefined ordering
// rule that file's header states.
//
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string,
// not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_ACCESSIBLE_NAME = `  // ── accessible-name source resolvers + the ONE spec-ordered key (#1324) ──
  var labelledbyText = function (el) {
    var attr = el.getAttribute("aria-labelledby") || "";
    var ids = attr.split(/\\s+/).filter(Boolean);
    if (ids.length === 0) return null;
    var text = ids
      .map(function (id) {
        var ref = document.getElementById(id);
        return ref ? ref.textContent || "" : "";
      })
      .join(" ")
      .trim();
    return text.length > 0 ? text : null;
  };
  // THE NATIVE LABEL ASSOCIATION (#1009) — the one accname source this census did not read. A control
  // named the way HTML has named controls since forever (a label with for=, or a label wrapping it) was
  // filed "exposes no accessible name" P1, and a door with an EMPTY name (the duplicate-door lens
  // cannot see one). Proven both ways in tests/tooling/ui-audit/ops/walker/census-interactive.int.test.ts.
  //
  // SCOPE, MEASURED (do not repeat the claim this fix was dispatched with): NO live app surface is named
  // by a native label ALONE, so this closed a LATENT false-positive class, not a live wall of P1s. Base
  // UI belts every association: Field.Control and Switch.Root also emit aria-labelledby (FieldControl.js:107,
  // SwitchRoot.js:113), Field.Label emits for= (internals/labelable-provider/useLabel.js:60-64), and the
  // two hand-rolled label-for sites in packages/client (character-greeting-preview.tsx:323,
  // plugin-grant-list.tsx:206) each add an explicit aria-labelledby on top. The blindness still had to go:
  // a bare label with for= is correct, lint-clean HTML, and an instrument that files a P1 on correct
  // markup teaches authors to add redundant aria to appease it.
  //
  // THE BROWSER'S OWN ANSWER, NOT A SELECTOR. el.labels is the live HTMLLabelElement list for a
  // LABELABLE control (button/input/select/textarea/meter/output/progress) and already knows both
  // spellings — a label with for=id, and a label WRAPPING the control — and knows that a for= naming a
  // DIFFERENT id is not an association. Re-deriving that here with querySelector would be a second copy
  // of a rule the DOM already implements, and the copy is what drifts.
  //
  // DELIBERATELY NOT a closest("label") fallback for NON-labelable elements (a div with role=switch):
  // HTML declares no label association there, so such a control genuinely has no name and the finding is
  // TRUE. For a rule whose whole claim is "this control has no name", silencing a true positive is the
  // expensive direction — it trades a false positive for a false clean.
  var nativeLabelText = function (el) {
    var labels = el.labels;
    if (!labels || labels.length === 0) return null;
    var text = "";
    for (var nl = 0; nl < labels.length; nl += 1) {
      text += " " + (labels[nl].textContent || "");
    }
    text = text.replace(/\\s+/g, " ").trim();
    return text.length > 0 ? text : null;
  };
  var altTextOf = function (el) {
    if (el.tagName === "IMG") return el.getAttribute("alt");
    var inner = el.querySelector("img[alt]");
    return inner ? inner.getAttribute("alt") : null;
  };
  // NAME FROM CONTENT (accname 1.2 step 2F). THE SOURCE IS NOT textContent (#1317 item 8): accname 2A
  // excludes an aria-hidden="true" subtree from the computation, so a button whose only text is a
  // decorative glyph span marked aria-hidden — the house shape for an icon-only control — exposes NO
  // accessible name while textContent reads non-empty. That was a FALSE CLEAN on the aria-name rule.
  // Nor is a NOT-RENDERED branch content: step 2F reads rendered text, and snap's surface map already
  // skipped display:none / visibility:hidden / [hidden] branches — folding the two homes onto one key
  // (#1324) folds that filter in too rather than losing it.
  // sr-only text is DELIBERATELY still counted: it is not aria-hidden and it IS rendered (clip-path, not
  // display), a screen reader reads it, and it is the sanctioned way to name an icon-only control here.
  // Excluding it would trade this false clean for a false P1 on every correctly-named icon button.
  var accNameOwnText = function (root) {
    var collected = "";
    var visit = function (node) {
      for (var ni = 0; ni < node.childNodes.length; ni += 1) {
        var child = node.childNodes[ni];
        if (child.nodeType === 3) { collected += child.textContent; continue; }
        if (child.nodeType !== 1) continue;
        if (child.getAttribute("aria-hidden") === "true") continue;
        if (child.hidden) continue;
        var childStyle = getComputedStyle(child);
        if (childStyle.display === "none" || childStyle.visibility === "hidden") continue;
        visit(child);
      }
    };
    visit(root);
    return collected.replace(/\\s+/g, " ").trim();
  };
  // THE ONE ACCESSIBLE-NAME KEY (#1324) — accname 1.2 order, exactly: 2B aria-labelledby, 2C aria-label,
  // 2D the native host-language label, 2F name from content, then the two last-resort sources this fleet
  // has always read (title, alt). Returns "" for an unnamed control — the ABSENCE the aria-name rule and
  // the door census both key on. A caller needing a source BELOW this chain (the surface map's
  // placeholder-of-last-resort for a text input) applies it after an empty answer, never inside the key.
  var accessibleNameOf = function (el) {
    var byLabelledby = labelledbyText(el);
    if (byLabelledby) return byLabelledby;
    var byLabel = (el.getAttribute("aria-label") || "").trim();
    if (byLabel) return byLabel;
    var byNativeLabel = nativeLabelText(el);
    if (byNativeLabel) return byNativeLabel;
    var byContent = accNameOwnText(el);
    if (byContent) return byContent;
    var byTitle = (el.getAttribute("title") || "").trim();
    if (byTitle) return byTitle;
    var byAlt = altTextOf(el);
    return byAlt ? byAlt.trim() : "";
  };
`;
