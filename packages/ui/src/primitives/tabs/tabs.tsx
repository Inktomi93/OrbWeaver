import type {
  TabsIndicatorProps as BaseTabsIndicatorProps,
  TabsListProps as BaseTabsListProps,
  TabsPanelProps as BaseTabsPanelProps,
  TabsRootProps as BaseTabsRootProps,
  TabsTabProps as BaseTabsTabProps,
} from "@base-ui/react/tabs";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactElement } from "react";
import { useLayoutEffect, useRef } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { tabsVariants } from "./variants.ts";

export interface TabsProps extends BaseTabsRootProps {
  className?: string;
}

export interface TabsListProps extends BaseTabsListProps {
  className?: string;
}

export interface TabsTabProps extends BaseTabsTabProps, VariantProps<typeof tabsVariants> {
  className?: string;
}

export interface TabsIndicatorProps extends BaseTabsIndicatorProps {
  className?: string;
}

export interface TabsPanelProps extends BaseTabsPanelProps {
  className?: string;
}

export function Tabs({ className, ...rest }: TabsProps): ReactElement {
  return <BaseTabs.Root className={cn(tabsVariants().root(), className)} data-slot="tabs-root" {...rest} />;
}

// Seal default: arrow keys ACTIVATE as they move (Base UI defaults activateOnFocus to false).
export function TabsList({ className, ...rest }: TabsListProps): ReactElement {
  return <BaseTabs.List activateOnFocus={true} className={cn(tabsVariants().list(), className)} data-slot="tabs-list" {...rest} />;
}

// `layout="stacked"` is the glyph-over-caption cell (the rpg HUD's rails): the ONE home for a tab whose
// height must follow its content — a caller cannot get there with `className` (see variants.ts).
export function TabsTab({ className, layout, ...rest }: TabsTabProps): ReactElement {
  return <BaseTabs.Tab className={cn(tabsVariants({ layout }).tab(), className)} data-slot="tabs-tab" {...rest} />;
}

/** The indicator's resting box, as Base UI writes it onto the node's own inline style. */
interface IndicatorGeometry {
  readonly left: number;
  readonly width: number;
}

/** Read the geometry off the INLINE style rather than a layout measurement: `--active-tab-left/width` are
 *  the exact numbers Base UI just computed from the active tab (`TabsIndicator.mjs`), so the glide needs
 *  no measuring pass of its own. `null` ⇒ no tab is selected yet (Base UI omits the vars and keeps the
 *  node `hidden` until layout settles) — nothing to glide from or to. */
function indicatorGeometry(node: HTMLElement): IndicatorGeometry | null {
  const left = Number.parseFloat(node.style.getPropertyValue("--active-tab-left"));
  const width = Number.parseFloat(node.style.getPropertyValue("--active-tab-width"));
  return Number.isFinite(left) && Number.isFinite(width) && width > 0 ? { left, width } : null;
}

/**
 * THE GLIDE IS A FLIP, AND IT HAS TO BE (#1069, motion guide §4.2 item 2 — the motion is RATIFIED, this
 * is its mechanism).
 *
 * The skin used to transition `left`/`width` straight off Base UI's runtime vars. That is a LAYOUT
 * animation: it relayouts the list on every frame of every tab switch, and the app's own `[anim]` flagger
 * printed `animating non-compositor left, width … OVER BUDGET` on the first switch of every tab surface —
 * guide §3.7's compositor-only rule, which is a correctness constraint and not a preference.
 *
 * The obvious transform spelling is illegal here. A pure-CSS `translateX(var(--active-tab-left))
 * scaleX(width/base)` never rests at identity — EVERY selected tab is a rest state carrying a
 * non-identity scale — which the `rest-transform-grid` gate reds (integer-line-boxes §9 Law 2: a resting
 * scale permanently resamples the subtree's raster), and it would scale the 2px bar's `rounded-full` cap
 * radius by the same factor for the whole life of the element.
 *
 * So the REST geometry stays in layout (`left-(--active-tab-left) w-(--active-tab-width)`, untransitioned
 * — the resting box and its caps are byte-identical to before) and only the MOVE is a transform: when
 * Base UI rewrites the vars, invert the delta onto the node, flush it, then drop it and let the slot's
 * `transition-[transform]` run back to identity. The animated property set is `transform` alone, the
 * transform is identity at every rest, and the mid-flight `scaleX` converges exactly onto the new box.
 *
 * Reduced motion is REMOVE for free (§3.9): under the globals.css `transition-property: none !important`
 * floor the inverse is applied and cleared inside one microtask, so the bar simply lands.
 *
 * JS rather than CSS because CSS cannot express "where this element was one update ago" — the same reason
 * guide §4.2 item 1's arrival transition is a rAF flip (`use-enter-motion.ts`), and the same posture as
 * `TabsPanel` below. The animation VALUES stay tokens on the slot; only the delta is JS.
 */
function glideIndicator(node: HTMLElement, from: IndicatorGeometry, to: IndicatorGeometry): void {
  node.style.transitionProperty = "none";
  node.style.transform = `translateX(${String(from.left - to.left)}px) scaleX(${String(from.width / to.width)})`;
  // The flush that makes the inverted box the transition's FROM state. Without a forced style read the
  // browser coalesces both writes into one recalc, the computed transform never leaves identity, and
  // there is nothing to interpolate across (measured in the CT — all four flush spellings work, a
  // missing one does not).
  node.getBoundingClientRect();
  node.style.transitionProperty = "";
  node.style.transform = "";
}

/**
 * THE TRIGGER IS THE STYLE ATTRIBUTE, not a React commit, and that is not a shortcut.
 *
 * `Tabs.Indicator` computes the vars in BASE UI's own component (`TabsIndicator.mjs` — a forced rerender
 * driven by the list's update listener), so this wrapper does NOT re-render when the active tab changes:
 * measured, a layout effect here fired exactly once, at mount, with no geometry yet. The move is only ever
 * observable on the node, so the node is what is observed — `attributeFilter: ["style"]`, which is where
 * Base UI writes `--active-tab-*`. The callback is a microtask, i.e. still before paint, which is what
 * keeps the inversion honest. It is also mechanism-agnostic: click, arrow keys, a programmatic value
 * change and a list resize all arrive the same way.
 *
 * The glide's own writes re-enter this observer (they mutate `style` too) and are absorbed by the
 * geometry comparison: `transform`/`transition-property` leave `--active-tab-*` untouched, so the
 * observed geometry is unchanged and nothing runs.
 */
function observeIndicatorGlide(node: HTMLElement): () => void {
  let previous = indicatorGeometry(node);
  const observer = new MutationObserver((): void => {
    const next = indicatorGeometry(node);
    const from = previous;
    previous = next;
    // A first settle (and a de-selected indicator) has no previous box to glide from — the bar appears
    // in place, exactly as it always has.
    if (next === null || from === null || (from.left === next.left && from.width === next.width)) {
      return;
    }
    glideIndicator(node, from, next);
  });
  observer.observe(node, { attributes: true, attributeFilter: ["style"] });
  return (): void => {
    observer.disconnect();
  };
}

export function TabsIndicator({ className, ...rest }: TabsIndicatorProps): ReactElement {
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect((): (() => void) | undefined => {
    const node = indicatorRef.current;
    return node === null ? undefined : observeIndicatorGlide(node);
  }, []);
  return (
    <BaseTabs.Indicator
      className={cn(tabsVariants().indicator(), className)}
      data-slot="tabs-indicator"
      {...rest}
      // The seal owns this node's ref (the glide above is its only reader). Last, so a spread cannot lose it.
      ref={indicatorRef}
    />
  );
}

/** Everything the browser puts in the tab sequence on its own. `[tabindex]` is deliberately excluded from
 *  the positive half by the `:not()` — a `-1` stop is programmatic-only and does not save the reader a Tab. */
const TABBABLE_DESCENDANT =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [contenteditable="true"], [tabindex]:not([tabindex^="-"])';

/**
 * THE PANEL IS ONLY A TAB STOP WHEN IT HAS NOTHING ELSE TO OFFER (#537, corpus ARIA sweep).
 *
 * Base UI sets `tabIndex: open ? 0 : -1` unconditionally (`TabsPanel.js`), so EVERY open panel is a tab
 * stop. APG's tabs pattern puts the panel in the sequence only when it "does not contain any focusable
 * elements" — the stop exists so a keyboard reader can reach panel CONTENT that is otherwise unreachable
 * (and so a scrollable read-only panel can be scrolled). Measured on the corpus Archetypes context tab:
 * `tabindex="0"` on a panel holding two buttons, i.e. one dead stop announcing the panel's name again in
 * front of the controls it already contains.
 *
 * DERIVED, never declared by the caller: the answer is a property of the CONTENT, and a `focusable` prop
 * would be a claim every call site would have to keep true as its body changed. Base UI keeps only the OPEN
 * panel mounted, so this measures exactly one element per tab set, with a `querySelector` that
 * short-circuits on the first match.
 *
 * IT CORRECTS THE ATTRIBUTE RATHER THAN RE-DECLARING IT, and that is not a shortcut. `tabIndex` here is
 * Base UI's own render output, so a state-backed prop would need a dependency-free layout effect calling
 * `setState` — which `react-hooks/exhaustive-deps` REDs, while pinning the effect to `[children]` is
 * exactly the "more dependencies than necessary" biome REDs. Writing the resolved attribute on the node the
 * seal already owns satisfies both honestly: it runs in a LAYOUT effect (before paint, so no flash) and on
 * every commit, which is what makes content arriving after mount — a query resolving, a section revealing
 * its controls — change the answer.
 *
 * It runs on the OPEN panel only, keyed on Base UI's own `inert` (which is exactly what it puts on a closed
 * one alongside `tabIndex: -1`). Both directions are written, not just the demotion: a panel whose last
 * control unmounts — a filter emptying a list, a form collapsing to a sentence — becomes the read-only case
 * the stop exists FOR, and a one-way correction would have quietly taken it away.
 */
export function TabsPanel({ className, ...rest }: TabsPanelProps): ReactElement {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect((): void => {
    const node = panelRef.current;
    if (node === null || node.hasAttribute("inert")) {
      return;
    }
    node.setAttribute("tabindex", node.querySelector(TABBABLE_DESCENDANT) === null ? "0" : "-1");
  });
  return (
    <BaseTabs.Panel
      className={cn(tabsVariants().panel(), className)}
      data-slot="tabs-panel"
      {...rest}
      // The seal OWNS the panel node's ref — the correction above is its only reader, and no call site
      // passes one. Last, so it cannot be lost to a spread.
      ref={panelRef}
    />
  );
}
