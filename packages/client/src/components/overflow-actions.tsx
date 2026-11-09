// OverflowActions — the ONE overflow row for the shell's action rows (the topbar trail and each list band). Actions stay
// inline in their declared order while they fit the room their row has; the rest move into a "More" menu at the row's
// end. The row keeps its leading actions, or its primary action (the last one) when that is what the row exists for (the
// list band). A kept primary never moves into the menu: when the word does not fit beside the trigger it shows its compact
// form, an icon, and the other actions come back while they fit beside it. Nothing wraps, clips or slides under a neighbour.
//
// THE ROOM IS THE PARENT'S, NOT THE ROW'S OWN. The row measures the parent's content width minus the floor of every
// sibling (what each may shrink to) and the gaps, so it can grow back after it has overflowed, and it claims only the
// width it shows: the inline run plus the trigger, or nothing when no action renders. A ResizeObserver watches the
// parent, the row and each action, never a viewport query, so a column that narrows when a pane docks, or text that
// grows, moves actions the same way a narrower window does.
//
// An action that does not fit stays MOUNTED, out of flow and `inert`: its state (a dialog it owns) survives the move,
// and its width stays measurable. The primary's two forms are both mounted for the same reason: the form that is not
// shown is still measured, so the row knows when the word fits again. An action that renders nothing takes no box and no gap.
//
// Every action declares a menu form beside its inline form, so the menu offers the same handler. A surface a form opens
// from here (a popover, a dialog) returns focus to its own control, which is out of reach; the row sends focus to its
// trigger instead when that surface closes and focus would drop to the page.

import { Button } from "@orb/ui/button";
import { Ellipsis, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuSubmenuRoot, MenuSubmenuTrigger, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement, ReactNode, RefObject } from "react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { OverflowMenuForm } from "#lib";

/** One action in the row: its inline control and the menu node (`MenuItem`s) that stands in for it. */
export interface OverflowAction {
  readonly id: string;
  readonly inline: ReactNode;
  /** The icon form of a kept primary, shown when its inline form does not fit beside the trigger. */
  readonly compact?: ReactNode;
  readonly menu: ReactNode;
  /** The row's section primary: while it renders, the row says so with `data-holds-primary`, which the shell's phone
   *  topbar reads to give the name its own line instead of folding the primary. */
  readonly primary?: boolean;
}

/** The menu node for an action whose forms are plain data. */
export function OverflowMenuForms({ forms }: { readonly forms: readonly OverflowMenuForm[] }): ReactElement {
  return (
    <>
      {forms.map((form) =>
        "items" in form ? (
          <MenuSubmenuRoot key={form.id}>
            <MenuSubmenuTrigger>
              <Icon icon={form.icon} size="sm" />
              {form.label}
            </MenuSubmenuTrigger>
            <MenuPopup>
              <OverflowMenuForms forms={form.items} />
            </MenuPopup>
          </MenuSubmenuRoot>
        ) : (
          <MenuItem disabled={form.disabled === true} key={form.id} onClick={form.onSelect}>
            <Icon icon={form.icon} size="sm" />
            {form.label}
          </MenuItem>
        ),
      )}
    </>
  );
}

interface Fit {
  readonly visible: number;
  /** The kept primary shows its compact form. */
  readonly compact: boolean;
  /** The width the row asks its parent for: what it shows, never what it could show. */
  readonly claim: number;
}

// Sub-pixel layout rounding must not flip a fit that holds.
const FIT_EPSILON = 0.5;
// How long a closing surface may take to leave before the row stops waiting to hand focus back.
const RESCUE_WINDOW_MS = 1000;
const RESCUE_POLL_MS = 50;

// An action is whatever its caller placed in the cell, so the cell publishes no handle to its control.
function firstControlIn(cell: HTMLElement | undefined): HTMLElement | null {
  return cell?.querySelector<HTMLElement>("button, a[href]") ?? null;
}

function runWidth(widths: readonly number[], gap: number): number {
  const shown = widths.filter((width) => width > 0);
  return shown.reduce((sum, width) => sum + width, 0) + Math.max(0, shown.length - 1) * gap;
}

/** What the row keeps inline when room runs out: its leading actions, or its primary (the last action) and then the ones
 *  before it. */
type Keeps = "leading" | "primary";

/** What the row has to fit in: the trigger's width, the gap between its boxes, the room, the end it keeps, and the width
 *  of the primary's compact form (0 when it has none). */
interface FitRoom {
  readonly trigger: number;
  readonly gap: number;
  readonly available: number;
  readonly keeps: Keeps;
  readonly compact: number;
}

/** How many actions stay inline in `available`, keeping the declared order: with `leading` the first that does not fit,
 *  and everything after it, go to the menu; with `primary` the first of the others that does not fit, and everything
 *  before it, go to the menu, while the primary stays. A primary that does not fit beside the trigger shows its compact
 *  form, and the others come back while they fit beside it. The claim is the width of what then shows. */
function fitActions(widths: readonly number[], { trigger, gap, available, keeps, compact }: FitRoom): Fit {
  const natural = runWidth(widths, gap);
  if (natural <= available + FIT_EPSILON) {
    return { visible: widths.length, compact: false, claim: natural };
  }
  const keepsPrimary = keeps === "primary";
  const kept = (count: number): readonly number[] => (keepsPrimary ? widths.slice(widths.length - count) : widths.slice(0, count));
  // The trigger exists only while something is in the menu.
  const shownWidth = (shown: readonly number[], count: number): number => runWidth(count < widths.length ? [...shown, trigger] : shown, gap);
  const fits = (shown: readonly number[], count: number): boolean => shownWidth(shown, count) <= available + FIT_EPSILON;
  let visible = widths.length;
  while (visible > (keepsPrimary ? 1 : 0) && !fits(kept(visible), visible)) {
    visible -= 1;
  }
  if (keepsPrimary && compact > 0 && !fits(kept(visible), visible)) {
    const keptCompact = (count: number): readonly number[] => [...kept(count).slice(0, -1), compact];
    visible = widths.length;
    while (visible > 1 && !fits(keptCompact(visible), visible)) {
      visible -= 1;
    }
    return { visible, compact: true, claim: shownWidth(keptCompact(visible), visible) };
  }
  return { visible, compact: false, claim: shownWidth(kept(visible), visible) };
}

/** Whether the action at `index` of `total` is among the `visible` the row keeps inline. */
function shownAt(index: number, total: number, visible: number, keeps: Keeps): boolean {
  return keeps === "leading" ? index < visible : index >= total - visible;
}

/** The map key of an action's compact form, beside the action's own. */
function compactKey(id: string): string {
  return `${id}\u0001compact`;
}

/** One mounted form of an action: its map key, and whether the row shows it. */
interface Form {
  readonly key: string;
  readonly shown: boolean;
}

interface Forms {
  readonly inline: Form;
  readonly compact: Form | undefined;
  readonly all: readonly Form[];
}

/** The forms an action mounts: its inline form, and the compact twin of a kept primary. Only the primary can show the twin. */
function formsOf(action: OverflowAction, kept: boolean, compactShown: boolean): Forms {
  if (action.compact === undefined) {
    const inline = { key: action.id, shown: kept };
    return { inline, compact: undefined, all: [inline] };
  }
  const inline = { key: action.id, shown: kept && !compactShown };
  const compact = { key: compactKey(action.id), shown: kept && compactShown };
  return { inline, compact, all: [inline, compact] };
}

/** How the row currently places its actions: how many it keeps, which end, and whether its primary shows the compact form. */
interface Placement {
  readonly visible: number;
  readonly keeps: Keeps;
  readonly compactShown: boolean;
}

/** The form focus lands on when the form of the action at `index` leaves the row: the first form the row still shows from
 *  that action on, so a folded action hands focus to the next action it keeps and a primary's form to its other form. `null`
 *  means the trigger. */
function landingKey(actions: readonly OverflowAction[], index: number, { visible, keeps, compactShown }: Placement): string | null {
  for (const [at, action] of actions.entries()) {
    const shown = at < index ? undefined : formsOf(action, shownAt(at, actions.length, visible, keeps), compactShown).all.find((form) => form.shown);
    if (shown !== undefined) {
      return shown.key;
    }
  }
  return null;
}

/** The parent that lays the row out: a `display: contents` wrapper has no box, so the box above it is the parent. */
function layoutParent(root: HTMLElement): HTMLElement | null {
  let parent = root.parentElement;
  while (parent !== null && getComputedStyle(parent).display === "contents") {
    parent = parent.parentElement;
  }
  return parent;
}

/** The smallest an element can be: its computed `min-inline-size`, or its min-content when that is a keyword. */
function floorOf(element: HTMLElement, minimum: string): number {
  const length = Number.parseFloat(minimum);
  if (!Number.isNaN(length)) {
    return length;
  }
  const { flex, inlineSize } = element.style;
  element.style.flex = "none";
  element.style.inlineSize = "min-content";
  const width = element.getBoundingClientRect().width;
  element.style.flex = flex;
  element.style.inlineSize = inlineSize;
  return width;
}

/** The inline room the parent leaves the row once every sibling sits at its floor, and the gap the parent puts
 *  between its boxes. */
function roomFor(root: HTMLElement): { readonly room: number; readonly gap: number } {
  const parent = layoutParent(root);
  if (parent === null) {
    return { room: root.getBoundingClientRect().width, gap: 0 };
  }
  const style = getComputedStyle(parent);
  const content = parent.clientWidth - Number.parseFloat(style.paddingInlineStart) - Number.parseFloat(style.paddingInlineEnd);
  const gap = Number.parseFloat(style.columnGap);
  let boxes = 0;
  let floors = 0;
  const visit = (children: Iterable<Element>): void => {
    for (const child of children) {
      if (!(child instanceof HTMLElement)) {
        continue;
      }
      const childStyle = getComputedStyle(child);
      if (childStyle.display === "contents") {
        visit(child.children);
      } else if (childStyle.display !== "none") {
        boxes += 1;
        floors += child === root ? 0 : floorOf(child, childStyle.minWidth);
      }
    }
  };
  visit(parent.children);
  const between = Number.isNaN(gap) ? 0 : gap;
  return { room: content - floors - between * Math.max(0, boxes - 1), gap: between };
}

/** One mounted form of an action, registered under `itemKey` so the row can measure it whether or not it shows. */
function FormItem({
  items,
  itemKey,
  shown,
  children,
}: {
  readonly items: RefObject<Map<string, HTMLElement>>;
  readonly itemKey: string;
  readonly shown: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Row
      align="center"
      className="shrink-0"
      hiddenAt="empty"
      data-overflowed={shown ? undefined : ""}
      inert={!shown}
      outOfFlow={!shown}
      ref={(element): (() => void) | undefined => {
        if (element === null) {
          return undefined;
        }
        items.current.set(itemKey, element);
        return (): void => {
          items.current.delete(itemKey);
        };
      }}
    >
      {children}
    </Row>
  );
}

export interface OverflowActionsProps {
  readonly actions: readonly OverflowAction[];
  /** The trigger's accessible name. */
  readonly label: string;
  /** The row is the topbar's trail, the owner-CSS hook the shell lays out. */
  readonly topbarTrail?: boolean;
  readonly gap?: "row" | "field";
  /** What the row keeps inline when room runs out. A row whose primary action is its last keeps `primary`. */
  readonly keeps?: Keeps;
  /** The row's `data-slot`; each caller spells its own literal so the owner-CSS surface harvest sees it. */
  readonly slot: string;
}

export function OverflowActions({ actions, label, topbarTrail = false, gap = "row", keeps = "leading", slot }: OverflowActionsProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // The trigger exists only while something overflows, so its width is the last one measured; before the first
  // measure it is the row's own minimum, which is the trigger's token.
  const [triggerWidth, setTriggerWidth] = useState(0);
  const items = useRef(new Map<string, HTMLElement>());
  const [fit, setFit] = useState<Fit | null>(null);
  const [rowGap, setRowGap] = useState(0);
  const [holdsPrimary, setHoldsPrimary] = useState(false);
  const idKey = actions.map((action) => action.id).join("\u0000");
  const primaryKey = actions
    .filter((action) => action.primary === true)
    .map((action) => action.id)
    .join("\u0000");
  // The primary's compact form is the last action's, so the key says whether it exists.
  const compactId = keeps === "primary" && actions.at(-1)?.compact !== undefined ? (actions.at(-1)?.id ?? null) : null;
  const visible = fit === null ? actions.length : fit.visible;
  const overflowing = visible < actions.length;
  const compactShown = fit?.compact === true;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    const ids = idKey === "" ? [] : idKey.split("\u0000");
    const primaries = new Set(primaryKey === "" ? [] : primaryKey.split("\u0000"));
    const measure = (): void => {
      const widths = ids.map((id) => items.current.get(id)?.getBoundingClientRect().width ?? 0);
      const compact = compactId === null ? 0 : (items.current.get(compactKey(compactId))?.getBoundingClientRect().width ?? 0);
      const columnGap = Number.parseFloat(getComputedStyle(root).columnGap);
      const gapWidth = Number.isNaN(columnGap) ? 0 : columnGap;
      const trigger = triggerWidth > 0 ? triggerWidth : Number.parseFloat(getComputedStyle(root).minWidth);
      const { room, gap: outerGap } = roomFor(root);
      const next = fitActions(widths, { trigger: Number.isNaN(trigger) ? 0 : trigger, gap: gapWidth, available: room, keeps, compact });
      setRowGap(outerGap);
      // A primary that renders nothing has no box, and a row without one holds none.
      setHoldsPrimary(ids.some((id, index) => primaries.has(id) && (widths[index] ?? 0) > 0));
      setFit((previous) =>
        previous !== null && previous.visible === next.visible && previous.compact === next.compact && Math.abs(previous.claim - next.claim) < FIT_EPSILON
          ? previous
          : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    const parent = layoutParent(root);
    // A sibling's floor is its content (a census growing from "326" to "0 of 326"), and a clipped sibling's box does
    // not change when its content does, so the parent's resize alone never re-reads it.
    const siblingContent = new MutationObserver(measure);
    if (parent !== null) {
      observer.observe(parent);
      siblingContent.observe(parent, { characterData: true, childList: true, subtree: true });
    }
    for (const element of items.current.values()) {
      observer.observe(element);
    }
    if (triggerRef.current !== null) {
      observer.observe(triggerRef.current);
    }
    measure();
    return (): void => {
      observer.disconnect();
      siblingContent.disconnect();
    };
  }, [idKey, primaryKey, compactId, triggerWidth, keeps]);

  // Focus on a form that just left the row moves to the next control the row shows, or to the trigger, instead of
  // dropping to the page.
  useLayoutEffect(() => {
    for (const [index, action] of actions.entries()) {
      const kept = shownAt(index, actions.length, visible, keeps);
      for (const form of formsOf(action, kept, compactShown).all) {
        if (!form.shown && items.current.get(form.key)?.contains(document.activeElement) === true) {
          const landing = landingKey(actions, index, { visible, keeps, compactShown });
          const control = landing === null ? triggerRef.current : firstControlIn(items.current.get(landing));
          control?.focus();
        }
      }
    }
  }, [actions, visible, keeps, compactShown]);

  // A menu form opens a surface that returns focus to its own, out-of-reach control. Armed when a form is chosen, the
  // rescue notes the surface taking focus, and when that focused element is gone and focus has dropped to the page it
  // hands focus to the trigger.
  const rescue = useRef<{ state: "idle" | "armed" | "inside"; surface: Element | null }>({ state: "idle", surface: null });
  useEffect(() => {
    const pending = rescue.current;
    const onFocusIn = (event: FocusEvent): void => {
      if (pending.state === "idle" || !(event.target instanceof Element) || event.target === triggerRef.current) {
        return;
      }
      if (pending.state === "armed" && popupRef.current?.contains(event.target) !== true) {
        pending.state = "inside";
      }
      if (pending.state === "inside") {
        pending.surface = event.target;
      }
    };
    const handBack = (): void => {
      const active = document.activeElement;
      if (pending.state !== "inside" || (active !== null && active !== document.body)) {
        return;
      }
      if (pending.surface?.isConnected === true) {
        return;
      }
      pending.state = "idle";
      triggerRef.current?.focus();
    };
    const watch = (): void => {
      if (pending.state !== "inside") {
        return;
      }
      const started = performance.now();
      const poll = setInterval(() => {
        handBack();
        if (pending.state !== "inside" || performance.now() - started > RESCUE_WINDOW_MS) {
          clearInterval(poll);
        }
      }, RESCUE_POLL_MS);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keyup", watch);
    document.addEventListener("pointerup", watch);
    document.addEventListener("focusout", watch);
    return (): void => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keyup", watch);
      document.removeEventListener("pointerup", watch);
      document.removeEventListener("focusout", watch);
    };
  }, []);

  const overflowed = actions.filter((_, index) => !shownAt(index, actions.length, visible, keeps));
  const empty = fit !== null && fit.claim === 0;
  return (
    <Row
      align="center"
      minWidth="controlMd"
      className={topbarTrail ? "shell-topbar-trail" : ""}
      data-empty={empty ? "" : undefined}
      data-holds-primary={holdsPrimary ? "" : undefined}
      data-slot={slot}
      gap={gap}
      justify="end"
      ref={rootRef}
      style={fit === null ? undefined : { flexBasis: fit.claim, ...(empty ? { marginInlineStart: -rowGap } : {}) }}
    >
      {actions.map((action, index) => {
        const kept = shownAt(index, actions.length, visible, keeps);
        const { inline, compact } = formsOf(action, kept, compactShown);
        return (
          <Fragment key={action.id}>
            <FormItem items={items} itemKey={inline.key} shown={inline.shown}>
              {action.inline}
            </FormItem>
            {compact === undefined ? null : (
              <FormItem items={items} itemKey={compact.key} shown={compact.shown}>
                {action.compact}
              </FormItem>
            )}
          </Fragment>
        );
      })}
      {overflowing ? (
        <Menu>
          <MenuTrigger
            render={
              <Button
                aria-label={label}
                className="shrink-0"
                data-slot="overflow-actions-trigger"
                variant="ghost"
                ref={(element): void => {
                  triggerRef.current = element;
                  if (element !== null) {
                    setTriggerWidth(element.getBoundingClientRect().width);
                  }
                }}
                square={true}
                type="button"
              >
                <Icon icon={Ellipsis} size="sm" />
              </Button>
            }
          />
          <MenuPopup
            align="end"
            ref={popupRef}
            onClickCapture={(): void => {
              rescue.current.state = "armed";
              rescue.current.surface = null;
            }}
          >
            {overflowed.map((action) => (
              <Fragment key={action.id}>{action.menu}</Fragment>
            ))}
          </MenuPopup>
        </Menu>
      ) : null}
    </Row>
  );
}
