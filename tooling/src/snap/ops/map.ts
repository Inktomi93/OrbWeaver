// --map: the live selector map (role · accessible name · best stable selector), validated so every
// emitted selector is an EXECUTABLE agent handle (unique + visible) before it is printed.
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { MapEntry, RawMapEntry } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// ── --map: a live selector map (role · accessible name · best stable selector) ──────────────
// "How do I reach this" instead of grepping source. Runs POST-STEPS so `--click X --map` maps
// a just-revealed surface (a settings dialog). RAW STRING IIFE (JSON.stringify-interpolated
// scope selector) — same constraint as scanDeadCss/buildContrastScript: the body runs in the
// BROWSER, tsc would check a function form against the NODE lib (the original keepNames reason
// died with the 2026-08-03 tsx shed). Unlike
// --contrast, this whole decision (role/name resolution, selector priority) has no WCAG-style
// fixed threshold to unit-test in Node, so it's formatted entirely in-page — nothing for
// design-audit-checks.ts to own.
const MAP_INTERACTIVE_SELECTOR = "a,button,[role],input,select,textarea,[tabindex],[aria-label]";

function buildMapScript(selector: string, includeHidden: boolean): string {
  return `(() => {
    var root = document.querySelector(${JSON.stringify(selector)});
    if (!root) return null;
    var INTERACTIVE_SELECTOR = ${JSON.stringify(MAP_INTERACTIVE_SELECTOR)};
    var IMPLICIT_ROLE = { a: "link", aside: "complementary", button: "button", form: "form", img: "img", main: "main", nav: "navigation", select: "combobox", svg: "img", textarea: "textbox" };
    var INPUT_ROLES = { checkbox: "checkbox", radio: "radio", button: "button", submit: "button", range: "slider", search: "searchbox" };
    var NON_TARGET_ROLES = { generic: true, listitem: true, none: true, presentation: true };
    var LABELED_STRUCTURE_ROLES = { article: true, complementary: true, form: true, group: true, list: true, log: true, main: true, navigation: true, region: true, status: true };

    function isVisible(el) {
      if (${JSON.stringify(includeHidden)}) return true;
      if (typeof el.checkVisibility === "function" && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) return false;
      var style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      var cur = el;
      while (cur && cur !== document.body) {
        if (cur.hidden || cur.inert || cur.getAttribute("aria-hidden") === "true") return false;
        cur = cur.parentElement;
      }
      return true;
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
    function accessibleName(el) {
      var al = el.getAttribute("aria-label");
      if (al && al.trim()) return al.trim();
      var lbId = el.getAttribute("aria-labelledby");
      if (lbId) {
        var text = lbId.split(/\\s+/).map(function (id) {
          var t = document.getElementById(id);
          return t ? t.textContent.trim() : "";
        }).join(" ").trim();
        if (text) return text;
      }
      // TEXT ALTERNATIVE COMPUTATION step 2A: a node that is NOT RENDERED contributes NOTHING to the
      // accessible name. Two families are excluded, and both are load-bearing:
      //   aria-hidden — avatar initials/decorative glyphs are rendered text the a11y tree drops
      //     ("DDiana" was the manufactured name that motivated this arm);
      //   display:none / visibility:hidden / the hidden attribute (#877) — a container-query TWO-ARM
      //     label (@md:hidden beside hidden @md:flex) ships BOTH arms in the DOM and paints one. Welding
      //     them produced "Pick a characterPick a character to start", a name no Playwright
      //     toHaveAccessibleName can ever match, and a reviewer filed a product defect on that reading.
      // The visibility arm is judged RELATIVE to el: with --include-hidden the map deliberately reports
      // hidden controls, and visibility INHERITS, so a visibility:hidden root must keep its own name
      // rather than blanking it. display:none does not inherit (only the styled element computes "none"),
      // so it needs no such relativisation.
      var rootVisibilityHidden = getComputedStyle(el).visibility === "hidden";
      var textNodes = [];
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        var hidden = false;
        var cur = node.parentElement;
        while (cur) {
          if (cur.getAttribute && cur.getAttribute("aria-hidden") === "true") {
            hidden = true;
            break;
          }
          if (cur === el) break;
          var curStyle = getComputedStyle(cur);
          if (cur.hidden || curStyle.display === "none" || (!rootVisibilityHidden && curStyle.visibility === "hidden")) {
            hidden = true;
            break;
          }
          cur = cur.parentElement;
        }
        if (!hidden) textNodes.push(node.textContent || "");
      }
      var text2 = textNodes.join("").trim().replace(/\\s+/g, " ");
      if (text2) return text2;
      var title = el.getAttribute("title");
      if (title && title.trim()) return title.trim();
      if (el.tagName === "INPUT") {
        var ph = el.getAttribute("placeholder");
        if (ph && ph.trim()) return ph.trim();
      }
      var alt = el.getAttribute("alt");
      if (alt && alt.trim()) return alt.trim();
      return "";
    }
    function nthOfType(node) {
      var idx = 1;
      var sib = node.previousElementSibling;
      while (sib) {
        if (sib.tagName === node.tagName) idx += 1;
        sib = sib.previousElementSibling;
      }
      return node.tagName.toLowerCase() + ":nth-of-type(" + idx + ")";
    }
    // Fallback #4: a complete nth-of-type path from body. Verbose but unique in this live DOM; captureMap
    // validates it before exposing it. A short "neighborhood" path is not an executable agent handle.
    function fallbackPath(node) {
      var parts = [];
      var cur = node;
      while (cur && cur !== document.body) {
        parts.unshift(nthOfType(cur));
        cur = cur.parentElement;
      }
      return "body > " + parts.join(" > ");
    }
    // Priority: 1) own data-testid  2) nearest ancestor testid that UNIQUELY wraps this element
    // (its only interactive/labeled descendant)  3) own aria-label  4) role=X[name="Y"]
    // (Playwright locator syntax)  5) fallback ancestor-chain path.
    function bestSelector(el, role, name) {
      var testid = el.getAttribute("data-testid");
      if (testid) return "[data-testid=" + JSON.stringify(testid) + "]";
      var anc = el.parentElement;
      var hops = 0;
      while (anc && hops < 3) {
        var atid = anc.getAttribute("data-testid");
        if (atid) {
          if (anc.querySelectorAll(INTERACTIVE_SELECTOR).length === 1) {
            return "[data-testid=" + JSON.stringify(atid) + "] " + el.tagName.toLowerCase();
          }
          break;
        }
        anc = anc.parentElement;
        hops += 1;
      }
      var ownLabel = el.getAttribute("aria-label");
      if (ownLabel && ownLabel.trim()) {
        var visibleOnly = ${JSON.stringify(includeHidden)} ? "" : ":visible";
        return "[aria-label=" + JSON.stringify(ownLabel.trim()) + "]" + visibleOnly;
      }
      if (role && name) return "role=" + role + "[name=" + JSON.stringify(name) + "]";
      return fallbackPath(el);
    }

    var out = [];
    var els = root.querySelectorAll(INTERACTIVE_SELECTOR);
    for (var i = 0; i < els.length; i += 1) {
      var el = els[i];
      if (!isVisible(el)) continue;
      var role = resolveRole(el);
      if (NON_TARGET_ROLES[role]) continue;
      if (LABELED_STRUCTURE_ROLES[role] && !el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby")) continue;
      var name = accessibleName(el);
      if (!role && !name) continue;
      out.push({
        role: role || "(none)",
        name: name,
        selector: bestSelector(el, role, name),
        semanticFallback: role && name ? "role=" + role + "[name=" + JSON.stringify(name) + "]" : "",
        fallback: fallbackPath(el)
      });
    }
    // An ambiguous selector is not navigation help. Preserve the best semantic selector, then add the
    // Playwright-native nth engine only when repeated names/labels make it non-unique on this surface.
    var totals = Object.create(null);
    var seen = Object.create(null);
    for (var j = 0; j < out.length; j += 1) totals[out[j].selector] = (totals[out[j].selector] || 0) + 1;
    for (var k = 0; k < out.length; k += 1) {
      var base = out[k].selector;
      if (totals[base] > 1) {
        var occurrence = seen[base] || 0;
        out[k].selector = base + " >> nth=" + occurrence;
        seen[base] = occurrence + 1;
      }
    }
    return out;
  })()`;
}

async function mapSelectorIsExecutable(page: Page, selector: string, includeHidden: boolean): Promise<boolean> {
  const locator = page.locator(selector);
  // @orb-gate-ignore caught-failure-ownership(promise:count): probe-whose-failure-is-its-return-value — a count failure becomes 0, which fails the `=== 1` check below and reports the selector as not executable. Ends if that check stops gating on count.
  const count = await locator.count().catch(() => 0);
  // @orb-gate-ignore caught-failure-ownership(promise:isVisible): probe-whose-failure-is-its-return-value — an isVisible failure becomes false, which is exactly the "not executable" verdict this function returns. Ends if the return stops being read as pass/fail.
  return count === 1 && (includeHidden || locator.isVisible().catch(() => false));
}

async function validateMapEntry(page: Page, entry: RawMapEntry, includeHidden: boolean): Promise<MapEntry> {
  if (await mapSelectorIsExecutable(page, entry.selector, includeHidden)) {
    return {
      role: entry.role,
      name: entry.name,
      selector: entry.selector,
      source: entry.selector === entry.fallback ? "dom" : "semantic",
    };
  }
  if (
    entry.semanticFallback !== "" &&
    entry.semanticFallback !== entry.selector &&
    (await mapSelectorIsExecutable(page, entry.semanticFallback, includeHidden))
  ) {
    return { role: entry.role, name: entry.name, selector: entry.semanticFallback, source: "semantic" };
  }
  if (await mapSelectorIsExecutable(page, entry.fallback, includeHidden)) {
    return { role: entry.role, name: entry.name, selector: entry.fallback, source: "dom" };
  }
  throw new Error(`map could not mint one visible selector for ${entry.role} ${JSON.stringify(entry.name)}`);
}

export async function captureMap(page: Page, selector: string, includeHidden: boolean): Promise<{ entries: MapEntry[] | null; error: string | null }> {
  try {
    const result = (await page.evaluate(buildMapScript(selector, includeHidden))) as RawMapEntry[] | null;
    if (result === null) {
      return { entries: null, error: `no element matches "${selector}"` };
    }
    return { entries: await Promise.all(result.map((entry) => validateMapEntry(page, entry, includeHidden))), error: null };
  } catch (e) {
    return { entries: null, error: errorMessage(e) };
  }
}
