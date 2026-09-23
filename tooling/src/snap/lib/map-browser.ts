// Browser-realm source for --map. Kept out of the arm orchestration so the public map contract does not
// push one file past the tooling cap. Returned values are untrusted until ops/page-validate.ts accepts them.
//
// THE ACCESSIBLE NAME IS NOT COMPUTED HERE (#1324). This file used to spell its own resolver, reading
// `aria-label` BEFORE `aria-labelledby` — the reverse of accname 1.2 (2B precedes 2C) — and the walker's
// door census had the identical inversion in its own copy. Two homes, one bug, and a planted pair proved
// both wrong on the same page (2026-09-04 §2.2).
// The map now composes the walker's ONE spec-ordered key through ui-audit's front door; `--aria`
// (Playwright's `ariaSnapshot`) stays the oracle both were measured against.
import { WALKER_ACCESSIBLE_NAME } from "../../ui-audit/index.ts";

const MAP_TARGET_SELECTOR = "a,button,[role],input,select,textarea,[tabindex],[aria-label],main,nav,aside,form";

export function buildSurfaceMapScript(selector: string, includeHidden: boolean): string {
  return `(() => {
${WALKER_ACCESSIBLE_NAME}
    var root = document.querySelector(${JSON.stringify(selector)});
    if (!root) return null;
    var TARGET_SELECTOR = ${JSON.stringify(MAP_TARGET_SELECTOR)};
    var IMPLICIT_ROLE = { a: "link", aside: "complementary", button: "button", form: "form", img: "img", main: "main", nav: "navigation", select: "combobox", svg: "img", textarea: "textbox" };
    var INPUT_ROLES = { checkbox: "checkbox", radio: "radio", button: "button", submit: "button", range: "slider", search: "searchbox" };
    var NON_TARGET_ROLES = { generic: true, listitem: true, none: true, presentation: true };
    var LABELED_STRUCTURE_ROLES = { article: true, form: true, group: true, list: true, log: true, region: true, status: true };
    var ACTION_ROLES = { button: true, checkbox: true, combobox: true, link: true, menuitem: true, option: true, radio: true, searchbox: true, slider: true, switch: true, tab: true, textbox: true };

    function inactiveReason(el) {
      var cur = el;
      while (cur && cur !== document.documentElement) {
        if (cur.getAttribute("aria-hidden") === "true") return "aria-hidden";
        if (cur.hidden) return "hidden-attribute";
        if (cur.inert) return "inert";
        var style = getComputedStyle(cur);
        if (style.display === "none") return "display-none";
        // visibility inherits but descendants may override it; the target's computed value already
        // resolves that chain. Treating an ancestor's computed hidden as final hides painted children.
        if (cur === el && (style.visibility === "hidden" || style.visibility === "collapse")) return "visibility-hidden";
        if (Number(style.opacity) === 0) return "opacity-zero";
        cur = cur.parentElement;
      }
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return "zero-geometry";
      if (typeof el.checkVisibility === "function" && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) return "zero-geometry";
      return null;
    }
    function resolveRole(el) {
      var explicit = el.getAttribute("role");
      if (explicit) return explicit;
      var tag = el.tagName.toLowerCase();
      if (tag === "input") {
        var type = (el.getAttribute("type") || "text").toLowerCase();
        return INPUT_ROLES[type] || "textbox";
      }
      if (IMPLICIT_ROLE[tag]) return IMPLICIT_ROLE[tag];
      return el.hasAttribute("tabindex") ? "generic" : "";
    }
    // The spec-ordered chain is \`accessibleNameOf\` (composed above). A text input's PLACEHOLDER is the
    // one source below it the map has always read, and it stays below it: HTML-AAM offers the placeholder
    // only when every accname source is empty, so applying it after an empty key is where it belongs —
    // never inside the shared key, where it would hand the walker's door census a name the spec has not.
    function accessibleName(el) {
      var name = accessibleNameOf(el);
      if (name) return name;
      if (el.tagName === "INPUT") {
        var placeholder = el.getAttribute("placeholder");
        if (placeholder && placeholder.trim()) return placeholder.trim();
      }
      return "";
    }
    function stateOf(el) {
      var disabled = "disabled" in el ? Boolean(el.disabled) : null;
      var ariaDisabled = el.getAttribute("aria-disabled");
      // NATIVE disabled WINS unless aria-disabled says true (#1509). aria-disabled is an ARIA-tree claim;
      // the native property is what the browser enforces, so a natively disabled control carrying
      // aria-disabled="false" is still un-clickable and must not read as actionable.
      if (ariaDisabled === "true") disabled = true;
      else if (ariaDisabled === "false" && disabled !== true) disabled = false;
      var checked = null;
      if ("indeterminate" in el && el.indeterminate) checked = "mixed";
      else if ("checked" in el) checked = Boolean(el.checked);
      else {
        var ariaChecked = el.getAttribute("aria-checked");
        if (ariaChecked === "mixed") checked = "mixed";
        else if (ariaChecked === "true" || ariaChecked === "false") checked = ariaChecked === "true";
      }
      var expandedRaw = el.getAttribute("aria-expanded");
      return {
        disabled: disabled,
        current: el.getAttribute("aria-current"),
        checked: checked,
        expanded: expandedRaw === "true" ? true : expandedRaw === "false" ? false : null
      };
    }
    function nthOfType(node) {
      var index = 1; var sibling = node.previousElementSibling;
      while (sibling) { if (sibling.tagName === node.tagName) index += 1; sibling = sibling.previousElementSibling; }
      return node.tagName.toLowerCase() + ":nth-of-type(" + index + ")";
    }
    function fallbackPath(node) {
      var parts = []; var cur = node;
      while (cur && cur !== document.body) { parts.unshift(nthOfType(cur)); cur = cur.parentElement; }
      return "body > " + parts.join(" > ");
    }
    function bestSelector(el, role, name, visible) {
      var testid = el.getAttribute("data-testid");
      if (testid) return "[data-testid=" + JSON.stringify(testid) + "]";
      var ancestor = el.parentElement; var hops = 0;
      while (ancestor && hops < 3) {
        var ancestorTestId = ancestor.getAttribute("data-testid");
        if (ancestorTestId) {
          if (ancestor.querySelectorAll(TARGET_SELECTOR).length === 1) return "[data-testid=" + JSON.stringify(ancestorTestId) + "] " + el.tagName.toLowerCase();
          break;
        }
        ancestor = ancestor.parentElement; hops += 1;
      }
      var ownLabel = el.getAttribute("aria-label");
      if (ownLabel && ownLabel.trim()) return "[aria-label=" + JSON.stringify(ownLabel.trim()) + "]" + (visible ? ":visible" : "");
      if (role && name) return "role=" + role + "[name=" + JSON.stringify(name) + "]";
      if (role) return "role=" + role;
      return fallbackPath(el);
    }

    var out = [];
    var elements = root.querySelectorAll(TARGET_SELECTOR);
    for (var i = 0; i < elements.length; i += 1) {
      var el = elements[i];
      var reason = inactiveReason(el); var visible = reason === null;
      if (!visible && !${JSON.stringify(includeHidden)}) continue;
      var role = resolveRole(el);
      if (NON_TARGET_ROLES[role]) continue;
      if (LABELED_STRUCTURE_ROLES[role] && !el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby")) continue;
      var name = accessibleName(el);
      if (!role && !name) continue;
      var state = stateOf(el);
      var actionable = visible && ACTION_ROLES[role] && state.disabled !== true;
      var selectorValue = bestSelector(el, role, name, visible);
      out.push({
        role: role || "(none)", name: name, selector: selectorValue,
        semanticFallback: role && name ? "role=" + role + "[name=" + JSON.stringify(name) + "]" : role ? "role=" + role : "",
        fallback: fallbackPath(el), state: state, visibility: visible ? "visible" : "hidden",
        inactiveReason: reason, actionability: actionable ? "actionable" : "locator-only"
      });
    }
    var totals = Object.create(null); var seen = Object.create(null);
    for (var j = 0; j < out.length; j += 1) totals[out[j].selector] = (totals[out[j].selector] || 0) + 1;
    for (var k = 0; k < out.length; k += 1) {
      var base = out[k].selector;
      if (totals[base] > 1) { var occurrence = seen[base] || 0; out[k].selector = base + " >> nth=" + occurrence; seen[base] = occurrence + 1; }
    }
    return out;
  })()`;
}

export const READ_MAP_BRIDGE_SCRIPT = `(() => {
  const url = location.href;
  const orb = globalThis.__orb;
  let atlas;
  let published = null;
  if (!orb || !orb.nav) {
    if (location.protocol !== "file:") throw new Error("INSTRUMENT ERROR: live page did not publish __orb.nav");
    atlas = { status: "unavailable", url, reason: "static file has no Orbweaver navigation bridge" };
  } else {
    if (typeof orb.nav.capabilities !== "function") throw new Error("INSTRUMENT ERROR: __orb.nav.capabilities is not callable");
    if (typeof orb.shell !== "function") throw new Error("INSTRUMENT ERROR: __orb.shell is not callable on a page with navigation capabilities");
    const capabilities = orb.nav.capabilities();
    published = orb.shell();
    atlas = {
      status: "available", url, capabilities,
      place: { url, section: published?.section, chatOpen: published?.chatOpen, focus: published?.focus }
    };
  }

  const grid = document.querySelector(".shell-grid");
  if (!grid) {
    if (atlas.status === "available") throw new Error("INSTRUMENT ERROR: __orb navigation exists but .shell-grid is absent");
    return { atlas, shell: { status: "unavailable", reason: "this page has no Orbweaver shell" } };
  }
  if (published === null) throw new Error("INSTRUMENT ERROR: .shell-grid exists but __orb.shell is unavailable");
  const visible = (el) => {
    if (!el) return false;
    if (el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (typeof el.checkVisibility !== "function" || el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true }));
  };
  const identity = (el) => el ? el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || null : null;
  const region = (id, selector, panel) => {
    const el = document.querySelector(selector);
    if (!el) return { id, mounted: false, visible: false, available: null, mode: null, inert: false, rect: null, position: null, zIndex: null, identity: null };
    const rect = el.getBoundingClientRect(); const style = getComputedStyle(el);
    const availableRaw = panel ? el.getAttribute("data-panel-available") : null;
    return {
      id, mounted: true, visible: visible(el), available: availableRaw === null ? null : availableRaw === "true",
      mode: panel ? el.getAttribute("data-panel-mode") : null,
      inert: Boolean(el.closest("[inert]")), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      position: style.position, zIndex: style.zIndex, identity: identity(el)
    };
  };
  const context = document.querySelector('.shell-panel[data-panel-side="context"]');
  const activeTab = context?.querySelector('[role="tab"][aria-selected="true"], [data-slot="tabs-tab"][data-active]');
  const activeTabName = activeTab ? activeTab.getAttribute("aria-label") || (activeTab.textContent || "").trim() || null : null;
  return {
    atlas,
    shell: {
      status: "available",
      regime: matchMedia("(max-width: 48rem)").matches ? "mobile" : matchMedia("(max-width: 64rem)").matches ? "narrow" : "wide",
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      section: grid.getAttribute("data-section"), published,
      contentIdentity: document.querySelector(".shell-content")?.getAttribute("aria-label") || null,
      focus: grid.getAttribute("data-focus-mode") === "true", activeContextTab: activeTabName,
      contextRelation: "unspecified/auxiliary",
      regions: [
        region("rail", ".shell-rail", false), region("topbar", ".shell-topbar", false),
        region("list", '.shell-panel[data-panel-side="list"]', true), region("content", ".shell-content", false),
        region("context", '.shell-panel[data-panel-side="context"]', true)
      ]
    }
  };
})()`;
