// OverflowActions — the ONE overflow row for the shell's action rows (the topbar trail and each list band). Actions stay
// inline in their declared priority order while they fit the room their row has; the rest move into a "More" menu at the
// row's end. Nothing wraps, clips or slides under a neighbour.
//
// THE ROOM IS THE PARENT'S, NOT THE ROW'S OWN. The row measures the parent's content width minus the floor of every
// sibling (what each may shrink to) and the gaps, so it can grow back after it has overflowed, and it claims only the
// width it shows: the inline run plus the trigger, or nothing when no action renders. A ResizeObserver watches the
// parent, the row and each action, never a viewport query, so a column that narrows when a pane docks, or text that
// grows, moves actions the same way a narrower window does.
//
// An action that does not fit stays MOUNTED, out of flow and `inert`: its state (a dialog it owns) survives the move,
// and its width stays measurable. An action that renders nothing takes no box and no gap.
//
// Every action declares a menu form beside its inline form, so the menu offers the same handler. A surface a form opens
// from here (a popover, a dialog) returns focus to its own control, which is out of reach; the row sends focus to its
// trigger instead when that surface closes and focus would drop to the page.

import { Button } from "@orb/ui/button";
import { Icon, MoreHorizontal } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuSubmenuRoot, MenuSubmenuTrigger, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement, ReactNode } from "react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { OverflowMenuForm } from "#lib";
import { cn } from "#lib";

/** The topbar trail's trigger name; the list band's is {@link BAND_OVERFLOW_LABEL}, so a rotor tells two rows apart. */
export const TRAIL_OVERFLOW_LABEL = "More top bar actions";
export const BAND_OVERFLOW_LABEL = "More list actions";

/** One action in the row: its inline control and the menu node (`MenuItem`s) that stands in for it. */
export interface OverflowAction {
  readonly id: string;
  readonly inline: ReactNode;
  readonly menu: ReactNode;
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
  /** The width the row asks its parent for: what it shows, never what it could show. */
  readonly claim: number;
}

// Sub-pixel layout rounding must not flip a fit that holds.
const FIT_EPSILON = 0.5;
// How long a closing surface may take to leave before the row stops waiting to hand focus back.
const RESCUE_WINDOW_MS = 1000;
const RESCUE_POLL_MS = 50;

function runWidth(widths: readonly number[], gap: number): number {
  const shown = widths.filter((width) => width > 0);
  return shown.reduce((sum, width) => sum + width, 0) + Math.max(0, shown.length - 1) * gap;
}

/** How many leading actions stay inline in `available`, keeping the declared order: the first that does not fit, and
 *  everything after it, go to the menu. The claim is the width of what then shows. */
function fitActions(widths: readonly number[], trigger: number, gap: number, available: number): Fit {
  const natural = runWidth(widths, gap);
  if (natural <= available + FIT_EPSILON) {
    return { visible: widths.length, claim: natural };
  }
  let visible = widths.length;
  while (visible > 0 && runWidth([...widths.slice(0, visible), trigger], gap) > available + FIT_EPSILON) {
    visible -= 1;
  }
  return { visible, claim: runWidth([...widths.slice(0, visible), trigger], gap) };
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

const OUT_OF_FLOW = "invisible absolute pointer-events-none";

export interface OverflowActionsProps {
  readonly actions: readonly OverflowAction[];
  /** The trigger's accessible name. */
  readonly label: string;
  readonly className?: string;
  readonly gap?: "row" | "field";
  /** The row's `data-slot`; each caller spells its own literal so the owner-CSS surface harvest sees it. */
  readonly slot: string;
}

export function OverflowActions({ actions, label, className, gap = "row", slot }: OverflowActionsProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // The trigger exists only while something overflows, so its width is the last one measured; before the first
  // measure it is the row's own minimum, which is the trigger's token.
  const [triggerWidth, setTriggerWidth] = useState(0);
  const items = useRef(new Map<string, HTMLElement>());
  const [fit, setFit] = useState<Fit | null>(null);
  const [rowGap, setRowGap] = useState(0);
  const idKey = actions.map((action) => action.id).join("\u0000");
  const visible = fit === null ? actions.length : fit.visible;
  const overflowing = visible < actions.length;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    const ids = idKey === "" ? [] : idKey.split("\u0000");
    const measure = (): void => {
      const widths = ids.map((id) => items.current.get(id)?.getBoundingClientRect().width ?? 0);
      const columnGap = Number.parseFloat(getComputedStyle(root).columnGap);
      const gapWidth = Number.isNaN(columnGap) ? 0 : columnGap;
      const trigger = triggerWidth > 0 ? triggerWidth : Number.parseFloat(getComputedStyle(root).minWidth);
      const { room, gap: outerGap } = roomFor(root);
      const next = fitActions(widths, Number.isNaN(trigger) ? 0 : trigger, gapWidth, room);
      setRowGap(outerGap);
      setFit((previous) => (previous !== null && previous.visible === next.visible && Math.abs(previous.claim - next.claim) < FIT_EPSILON ? previous : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    const parent = layoutParent(root);
    if (parent !== null) {
      observer.observe(parent);
    }
    for (const element of items.current.values()) {
      observer.observe(element);
    }
    if (triggerRef.current !== null) {
      observer.observe(triggerRef.current);
    }
    measure();
    return (): void => observer.disconnect();
  }, [idKey, triggerWidth]);

  // Focus on an action that just left the row moves to the trigger instead of dropping to the page.
  useLayoutEffect(() => {
    for (const [index, action] of actions.entries()) {
      if (index >= visible && items.current.get(action.id)?.contains(document.activeElement) === true) {
        triggerRef.current?.focus();
      }
    }
  }, [actions, visible]);

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

  const overflowed = actions.slice(visible);
  const empty = fit !== null && fit.claim === 0;
  return (
    <Row
      align="center"
      className={cn("min-inline-(--size-control-md)", className) ?? ""}
      data-empty={empty ? "" : undefined}
      data-slot={slot}
      gap={gap}
      justify="end"
      ref={rootRef}
      style={fit === null ? undefined : { flexBasis: fit.claim, ...(empty ? { marginInlineStart: -rowGap } : {}) }}
    >
      {actions.map((action, index) => {
        const shown = index < visible;
        return (
          <Row
            align="center"
            className={cn("shrink-0 empty:hidden", shown ? undefined : OUT_OF_FLOW) ?? ""}
            data-overflowed={shown ? undefined : ""}
            inert={!shown}
            key={action.id}
            ref={(element): (() => void) | undefined => {
              if (element === null) {
                return undefined;
              }
              items.current.set(action.id, element);
              return (): void => {
                items.current.delete(action.id);
              };
            }}
          >
            {action.inline}
          </Row>
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
                intent="ghost"
                ref={(element): void => {
                  triggerRef.current = element;
                  if (element !== null) {
                    setTriggerWidth(element.getBoundingClientRect().width);
                  }
                }}
                size="icon"
                type="button"
              >
                <Icon icon={MoreHorizontal} size="sm" />
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
