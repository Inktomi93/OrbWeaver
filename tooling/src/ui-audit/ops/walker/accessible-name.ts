// ui-audit in-page walker — segment: THE ACCESSIBLE-NAME SOURCE RESOLVERS.
//
// Split out of census-interactive.ts at #1009 (the tooling 450-line cap): the three functions below are
// not a census, they are the SOURCE SET the accessible-name census and the door census both read — one
// resolver per way a control can carry a name, so neither consumer re-derives one and the two cannot
// drift apart (the door census reading a different source set than the name census is exactly the shape
// that let a `<label for>`-named control be filed unnamed AND be an unnameable door at the same time).
//
// DECLARES ONLY, exactly like state-paint.ts: no census runs here, so composing it costs nothing but its
// declarations. It must sit BEFORE census-interactive.ts in the composition (ops/walker.ts) — these are
// `var f = function …` assignments, so they exist only after their lines have EXECUTED, the same
// hoists-undefined ordering rule that file's header states.
//
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string,
// not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

export const WALKER_ACCESSIBLE_NAME = `  // ── accessible-name source resolvers (shared by the name census and the door census) ──
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
`;
