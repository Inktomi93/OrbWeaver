// ui-audit in-page walker — shared authored identity for tap-target populations (#983).
//
// WHY THIS IS A WALKER FACT. Node decides whether geometry violates the pointer-conditional floor, but
// only the live DOM can state which rendered targets are nested and which instances share the author's
// structural decision. Selector strings are presentation and contain nth-of-type instance positions;
// grouping them would turn one repeated component into N fake repairs.
//
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string,
// not a function). Concatenated into the same IIFE as census-interactive.ts by ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_TARGET_IDENTITY = `  // ── authored target identity (#983) ───────────────────────────────────────
  var targetIdentityEls = [];
  var TARGET_HOME_MAX = 24;
  // The four AUTHORED axes are @orb/ui's stamped vocabulary (#1080 — STAMPED_VARIANT_AXES in
  // packages/ui/src/lib/variant-attrs.ts, emitted by the primitives themselves since 2026-09-02);
  // data-orientation is Base UI's RUNTIME state attribute, kept because an authored decision
  // routinely differs by it. This
  // list must stay a SUPERSET of the stamped vocabulary — pinned BOTH ways, with a planted control, by
  // tests/tooling/ui-audit/ops/walker/target-identity.test.ts (it cannot be interpolated: this is raw
  // browser JS in a template literal).
  var TARGET_VARIANT_ATTRS = ["data-variant", "data-size", "data-intent", "data-tone", "data-orientation"];

  function targetIdentity(el) {
    var at = targetIdentityEls.indexOf(el);
    if (at < 0) {
      at = targetIdentityEls.length;
      targetIdentityEls.push(el);
    }
    return "t" + at;
  }

  function authoredTargetClaim(el) {
    var slot = el.getAttribute("data-slot");
    var role = el.getAttribute("role");
    var type = el.tagName === "INPUT" ? String(el.getAttribute("type") || "text").toLowerCase() : "";
    var parts = [el.tagName.toLowerCase(), "slot=" + (slot || ""), "role=" + (role || "").trim().toLowerCase(), "type=" + type];
    // Label association is an AUTHORED decision, not presentation (#837): a control wrapped in a label
    // whose for= names another control (.labels empty) and a control genuinely for-associated inside the
    // same DOM shape are two different authored mistakes — without this facet they share a claim+home key
    // and the decision population collapses them into one representative.
    if (el.labels !== undefined && el.labels !== null) {
      var inLabel = el.closest("label") ? "|inlabel" : "";
      parts.push("labels=" + el.labels.length + inLabel);
    }
    for (var va = 0; va < TARGET_VARIANT_ATTRS.length; va += 1) {
      var attr = TARGET_VARIANT_ATTRS[va];
      if (el.hasAttribute(attr)) parts.push(attr + "=" + String(el.getAttribute(attr) || ""));
    }
    return parts.join("|");
  }

  function authoredHomePart(el) {
    var slot = el.getAttribute("data-slot");
    var role = String(el.getAttribute("role") || "").trim().toLowerCase();
    return el.tagName.toLowerCase() + (slot ? "@" + slot : "") + (role ? "[role=" + role + "]" : "");
  }

  function authoredTargetHome(el) {
    var path = [];
    var roleFallback = null;
    var levels = 0;
    for (var anc = el.parentElement; anc && anc !== document.body && levels < TARGET_HOME_MAX; anc = anc.parentElement, levels += 1) {
      path.push(authoredHomePart(anc));
      if (anc.hasAttribute("data-slot")) return authoredHomePart(anc) + "::" + path.join("<");
      var role = String(anc.getAttribute("role") || "").trim().toLowerCase();
      var labelled = anc.hasAttribute("aria-label") || anc.hasAttribute("aria-labelledby");
      if (roleFallback === null && (role === "region" || role === "tabpanel" || role === "dialog" || role === "main" || labelled)) {
        roleFallback = authoredHomePart(anc) + "::" + path.join("<");
      }
    }
    return roleFallback || "body::" + path.join("<");
  }

  function interactiveAncestorIdentities(el) {
    var ids = [];
    for (var anc = el.parentElement; anc && anc !== document.body; anc = anc.parentElement) {
      if (anc.matches(INTERACTIVE_SELECTOR)) ids.push(targetIdentity(anc));
    }
    return ids;
  }
`;
