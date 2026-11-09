import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

type AxeResults = ReturnType<AxeBuilder["analyze"]> extends Promise<infer Resolved> ? Resolved : never;
type AxeNode = AxeResults["violations"][number]["nodes"][number];

/** Base UI's focus-trap sentinels: `aria-hidden` and tabbable by design, so the trap catches Tab at a popup's edge. */
const FOCUS_GUARD = "data-base-ui-focus-guard";

/** An open menu or select row: what a popup lays over the controls beneath it. */
const POPUP_ITEM = /data-slot="(?:menu|select)-/u;

function isFocusGuard(node: AxeNode): boolean {
  return node.target.some((selector) => typeof selector === "string" && selector.includes(FOCUS_GUARD));
}

/** `target-size` has no cause left to fix on a control that an open popup deliberately covers. */
function coveredByOpenPopup(node: AxeNode): boolean {
  const related = node.any.flatMap(({ relatedNodes }) => relatedNodes ?? []);
  const obscured = node.any.some(({ data }) => typeof data === "object" && data !== null && Reflect.get(data, "messageKey") === "partiallyObscured");
  return obscured && related.length > 0 && related.every(({ html }) => POPUP_ITEM.test(html));
}

/** Move the nodes of `ruleId` that `excused` accepts from `violations` to `incomplete`, intact: the finding stays readable, it just does not fail the page. */
function excuse(results: AxeResults, ruleId: string, excused: (node: AxeNode) => boolean): AxeResults {
  const rule = results.violations.find(({ id }) => id === ruleId);
  const moved = rule?.nodes.filter(excused) ?? [];
  if (rule === undefined || moved.length === 0) {
    return results;
  }
  const remaining = rule.nodes.filter((node) => !moved.includes(node));
  return {
    ...results,
    violations:
      remaining.length === 0
        ? results.violations.filter((other) => other !== rule)
        : results.violations.map((other) => (other === rule ? { ...rule, nodes: remaining } : other)),
    incomplete: [...results.incomplete, { ...rule, nodes: moved }],
  };
}

/**
 * Keep default document/frame rules and explicitly enable the vendor's disabled WCAG 2.2 target-size rule.
 * Two findings are not the page's and move to `incomplete`: the library's own focus guards for `aria-hidden-focus` (an authored
 * focusable `aria-hidden` element still fails), and a control an open menu or select popup covers for `target-size`.
 */
export async function accessibilityScan(page: Page): ReturnType<AxeBuilder["analyze"]> {
  const results = await new AxeBuilder({ page }).options({ rules: { "target-size": { enabled: true } } }).analyze();
  return excuse(excuse(results, "aria-hidden-focus", isFocusGuard), "target-size", coveredByOpenPopup);
}
