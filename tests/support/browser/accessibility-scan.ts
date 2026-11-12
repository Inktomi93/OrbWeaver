import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

type AxeResults = ReturnType<AxeBuilder["analyze"]> extends Promise<infer Resolved> ? Resolved : never;
type AxeRule = AxeResults["violations"][number];
type AxeNode = AxeRule["nodes"][number];

/** Base UI's focus-trap sentinels: `aria-hidden` and tabbable by design, so the trap catches Tab at a popup's edge. */
const FOCUS_GUARD = "data-base-ui-focus-guard";

/** The content of a menu or select popup that is open now: the popup box and the positioner that places it. A closed select's trigger is not one. */
const OPEN_POPUP = [
  '[data-slot="menu-popup"][data-open]',
  '[data-slot="menu-positioner"][data-open]',
  '[data-slot="select-popup"][data-open]',
  '[data-slot="select-positioner"][data-open]',
].join(", ");

const FOCUS_GUARD_REASON = "Base UI focus guard: aria-hidden and tabbable by design, the focus trap's edge sentinel.";
const POPUP_COVER_REASON = "Covered by the content of an open menu or select popup, which is meant to lie over the page.";

/** One node the scan moved from `violations` to `incomplete`, and why. The vendor result keeps it as a violation. */
interface AxeReclassification {
  readonly ruleId: string;
  readonly target: AxeNode["target"];
  readonly html: string;
  readonly reason: string;
}

export interface AccessibilityEvidence {
  /** The vendor result, untouched. */
  readonly raw: AxeResults;
  /** The vendor result with the reclassified nodes moved to `incomplete`; what a test asserts on. */
  readonly results: AxeResults;
  readonly reclassified: readonly AxeReclassification[];
}

interface Excusal {
  readonly ruleId: string;
  readonly reason: string;
  readonly excused: (node: AxeNode) => boolean;
}

function isFocusGuard(node: AxeNode): boolean {
  return node.target.some((selector) => typeof selector === "string" && selector.includes(FOCUS_GUARD));
}

function partiallyObscured(node: AxeNode): boolean {
  return node.any.some(({ data }) => typeof data === "object" && data !== null && Reflect.get(data, "messageKey") === "partiallyObscured");
}

/** The nodes that cover `node`, as plain selectors. A node in a shadow tree or frame has none, and is never excused. */
function coveringSelectors(node: AxeNode): readonly string[] | null {
  const selectors: string[] = [];
  for (const { target } of node.any.flatMap(({ relatedNodes }) => relatedNodes ?? [])) {
    const [selector] = target;
    if (target.length !== 1 || typeof selector !== "string") {
      return null;
    }
    selectors.push(selector);
  }
  return selectors.length > 0 ? selectors : null;
}

/** The covering selectors that sit inside an open popup now, read from the page the scan ran on. */
function selectorsInOpenPopup(page: Page, raw: AxeResults): Promise<ReadonlySet<string>> {
  const candidates = (raw.violations.find(({ id }) => id === "target-size")?.nodes ?? []).flatMap((node) => coveringSelectors(node) ?? []);
  return page
    .evaluate(({ selectors, popup }) => selectors.filter((selector) => document.querySelector(selector)?.closest(popup) instanceof Element), {
      selectors: [...new Set(candidates)],
      popup: OPEN_POPUP,
    })
    .then((inside) => new Set(inside));
}

/** Move the nodes of each excusal from `violations` to `incomplete`, intact, merged into that rule's existing `incomplete` entry. */
function reclassify(raw: AxeResults, excusals: readonly Excusal[]): Omit<AccessibilityEvidence, "raw"> {
  const reclassified: AxeReclassification[] = [];
  let results = raw;
  for (const { ruleId, reason, excused } of excusals) {
    const rule = results.violations.find(({ id }) => id === ruleId);
    const moved = rule?.nodes.filter(excused) ?? [];
    if (rule === undefined || moved.length === 0) {
      continue;
    }
    reclassified.push(...moved.map(({ target, html }) => ({ ruleId, target, html, reason })));
    const remaining = rule.nodes.filter((node) => !moved.includes(node));
    const held = results.incomplete.find(({ id }) => id === ruleId);
    results = {
      ...results,
      violations:
        remaining.length === 0
          ? results.violations.filter((other) => other !== rule)
          : results.violations.map((other) => (other === rule ? { ...rule, nodes: remaining } : other)),
      incomplete:
        held === undefined
          ? [...results.incomplete, { ...rule, nodes: moved }]
          : results.incomplete.map((other) => (other === held ? { ...held, nodes: [...held.nodes, ...moved] } : other)),
    };
  }
  return { results, reclassified };
}

/**
 * Keep default document/frame rules and explicitly enable the vendor's disabled WCAG 2.2 target-size rule. Returns the untouched vendor
 * result beside the reclassified one callers assert on, and the record of what differs. Two findings are not the page's and move to `incomplete`:
 * the library's own focus guards for `aria-hidden-focus` (an authored focusable `aria-hidden` element still fails), and a control the
 * content of an open menu or select popup covers for `target-size` (a closed select's trigger over a control is still a finding).
 */
export async function accessibilityEvidence(page: Page): Promise<AccessibilityEvidence> {
  const builder = new AxeBuilder({ page }).options({ rules: { "target-size": { enabled: true } } });
  // The vendor's per-frame mode finishes every scan in a fresh blank page; with no child frame there is nothing for it
  // to join, so the single-frame run returns the same result without that page. Any child frame keeps per-frame mode.
  const raw = await (page.frames().length === 1 ? builder.setLegacyMode() : builder).analyze();
  const inOpenPopup = await selectorsInOpenPopup(page, raw);
  const { results, reclassified } = reclassify(raw, [
    { ruleId: "aria-hidden-focus", reason: FOCUS_GUARD_REASON, excused: isFocusGuard },
    {
      ruleId: "target-size",
      reason: POPUP_COVER_REASON,
      excused: (node) => {
        const covering = coveringSelectors(node);
        return partiallyObscured(node) && covering?.every((selector) => inOpenPopup.has(selector)) === true;
      },
    },
  ]);
  return { raw, results, reclassified };
}

/** The reclassified result: what a test asserts on. */
export async function accessibilityScan(page: Page): ReturnType<AxeBuilder["analyze"]> {
  return (await accessibilityEvidence(page)).results;
}
