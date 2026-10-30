// OverflowActions — the ONE measured overflow row for the shell's action rows (the topbar trail today). Actions stay
// inline in their declared priority order while they fit the row's own width; the rest move into a "More" menu at the
// row's end. Nothing wraps, clips or slides under a neighbour. The row measures itself with a ResizeObserver on its own
// box and on each action, never a viewport query, so a column that narrows when a pane docks, or text that grows, moves
// actions the same way a narrower window does.
//
// An action that does not fit stays MOUNTED, out of flow and `inert`: its state (a dialog it owns) survives the move,
// and its width stays measurable so a roomier row brings it back. Every action also declares a menu form beside its
// inline form, so the menu offers the same handler.
//
// The row's flex-basis is the width of all actions inline, so its width is the room its parent gives it, up to that
// natural width: a row that moves actions to the menu does not shrink its own claim and chase its own tail.

import { Button } from "@orb/ui/button";
import { Icon, MoreHorizontal } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement, ReactNode } from "react";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { cn } from "#lib";
import type { OverflowMenuForm } from "#state";

export const OVERFLOW_TRIGGER_LABEL = "More actions";

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
      {forms.map((form) => (
        <MenuItem key={form.id} onClick={form.onSelect}>
          <Icon icon={form.icon} size="sm" />
          {form.label}
        </MenuItem>
      ))}
    </>
  );
}

interface Fit {
  readonly visible: number;
  readonly natural: number;
}

// Sub-pixel layout rounding must not flip a fit that holds.
const FIT_EPSILON = 0.5;

function runWidth(widths: readonly number[], gap: number): number {
  const shown = widths.filter((width) => width > 0);
  return shown.reduce((sum, width) => sum + width, 0) + Math.max(0, shown.length - 1) * gap;
}

/** How many leading actions stay inline in `available`, keeping the declared order: the first that does not fit,
 *  and everything after it, go to the menu. */
function fitActions(widths: readonly number[], trigger: number, gap: number, available: number): Fit {
  const natural = runWidth(widths, gap);
  if (natural <= available + FIT_EPSILON) {
    return { visible: widths.length, natural };
  }
  let visible = widths.length;
  while (visible > 0 && runWidth([...widths.slice(0, visible), trigger], gap) > available + FIT_EPSILON) {
    visible -= 1;
  }
  return { visible, natural };
}

const OUT_OF_FLOW = "invisible absolute pointer-events-none";

export interface OverflowActionsProps {
  readonly actions: readonly OverflowAction[];
  readonly className?: string;
}

export function OverflowActions({ actions, className }: OverflowActionsProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The trigger exists only while something overflows, so its width is the last one measured.
  const [triggerWidth, setTriggerWidth] = useState(0);
  const items = useRef(new Map<string, HTMLElement>());
  const [fit, setFit] = useState<Fit>({ visible: actions.length, natural: 0 });
  const idKey = actions.map((action) => action.id).join("\u0000");
  const overflowing = fit.visible < actions.length;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    const ids = idKey === "" ? [] : idKey.split("\u0000");
    const measure = (): void => {
      const widths = ids.map((id) => items.current.get(id)?.getBoundingClientRect().width ?? 0);
      const gap = Number.parseFloat(getComputedStyle(root).columnGap);
      const next = fitActions(widths, triggerWidth, Number.isNaN(gap) ? 0 : gap, root.getBoundingClientRect().width);
      setFit((previous) => (previous.visible === next.visible && Math.abs(previous.natural - next.natural) < FIT_EPSILON ? previous : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
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
      if (index >= fit.visible && items.current.get(action.id)?.contains(document.activeElement) === true) {
        triggerRef.current?.focus();
      }
    }
  }, [actions, fit.visible]);

  const overflowed = actions.slice(fit.visible);
  return (
    <Row
      align="center"
      className={cn("min-inline-(--size-touch-target)", className) ?? ""}
      data-slot="overflow-actions"
      gap="row"
      justify="end"
      ref={rootRef}
      style={fit.natural > 0 ? { flexBasis: fit.natural } : undefined}
    >
      {actions.map((action, index) => {
        const shown = index < fit.visible;
        return (
          <Row
            align="center"
            className={cn("shrink-0", shown ? undefined : OUT_OF_FLOW) ?? ""}
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
                aria-label={OVERFLOW_TRIGGER_LABEL}
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
          <MenuPopup align="end">
            {overflowed.map((action) => (
              <Fragment key={action.id}>{action.menu}</Fragment>
            ))}
          </MenuPopup>
        </Menu>
      ) : null}
    </Row>
  );
}
