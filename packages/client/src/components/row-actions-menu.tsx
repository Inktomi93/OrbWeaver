// RowActionsMenu — the client-shared "⋯ trigger → menu items → optional destructive item wired to
// ConfirmDialog" composite (clone-audit item 1). Nine sites hand-assembled this exact anatomy: a ghost
// icon Button MenuTrigger, a MenuPopup of items, and (usually) a bottom destructive item that opens a
// controlled confirm. This composite owns the shell + the destructive item's confirm state so the
// per-site copy shrinks to its DIVERGENT parts: the aria-label, the item list (children), and the
// destructive copy. Non-destructive items stay as `children` (MenuItem/MenuSeparator/MenuSubmenuRoot/
// MenuLinkItem…) because item sets differ wildly per site (submenus, conditional rows, link items).
//
// OWNER RULING: lives client-shared (NOT @orb/ui — ui stays parts-only; the ConfirmDialog precedent).
// A3 (north-star): the trigger rests HIDDEN and hover-reveals ONLY where `reveal` is set — a row that
// showed its ⋯ at rest keeps showing it (do not newly hide a visible cluster).

import { Button } from "@orb/ui/button";
import { GlyphButton } from "@orb/ui/glyph-button";
import type { LucideIcon } from "@orb/ui/icons";
import { Ellipsis, Icon, Trash } from "@orb/ui/icons";
import { InlineAction } from "@orb/ui/inline-action";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode, Ref } from "react";
import { useState } from "react";
import { ROW_DELETE_NAME } from "#lib";
import type { ConfirmDialogProps } from "./confirm-dialog.tsx";
import { ConfirmDialog } from "./confirm-dialog.tsx";

// The optional destructive menu item + its ConfirmDialog (state owned by RowActionsMenu).
export interface RowDestructiveAction {
  /** The menu item label. @defaultValue `ROW_DELETE_NAME` */
  readonly label?: string;
  /** The menu item glyph. @defaultValue Trash */
  readonly icon?: LucideIcon;
  /** The confirm dialog heading. */
  readonly title: ReactNode;
  /** The confirm dialog body — plain text/fragment only (see ConfirmDialog). */
  readonly description: ReactNode;
  /** The confirm button's label. @defaultValue the item `label` (or `ROW_DELETE_NAME`). */
  readonly confirmLabel?: string;
  /** Fires on confirm — and may return a PROMISE (#1563b). This value is forwarded to
   *  `ConfirmDialog.onConfirm`, which awaits it: the dialog holds open while the work runs, closes itself on
   *  success, and stays open with the reason on rejection. Declaring `() => void` still ACCEPTED an async
   *  handler (a `Promise` return is assignable to `void`), so the hold-and-retry was reached by accident
   *  rather than by contract, and this type told a reader the opposite of what happens. */
  readonly onConfirm: ConfirmDialogProps["onConfirm"];
  /** Where focus goes when the confirm closes (see ConfirmDialog). Give one when the act removes the row. */
  readonly finalFocus?: ConfirmDialogProps["finalFocus"];
  /** Render a MenuSeparator before the destructive item. @defaultValue true */
  readonly separator?: boolean;
}

export interface RowActionsMenuProps {
  /** Accessible name for the ⋯ trigger button. */
  readonly label: string;
  /** The non-destructive menu items. */
  readonly children?: ReactNode;
  /** The trigger glyph. @defaultValue Ellipsis */
  readonly icon?: LucideIcon;
  /** Popup alignment. @defaultValue "end" */
  readonly align?: "center" | "end" | "start";
  /** Trigger button size — this composite's OWN vocabulary, resolved to a button-family box by
   *  `TRIGGER_BOX` below, never a passthrough. `"inline"` is the HintTrigger-parity box (the
   *  config setting row pairs the ⋯ with the tiny `i` and must not inflate the row); `"sm"` is the
   *  small SQUARE trigger for a row whose scale is the `sm` control step; `"glyph"` is the glyph-button box
   *  for a compact tool column (the composer's ☰), its touch floor carried by the glyph arm. @defaultValue "icon" */
  readonly triggerSize?: "glyph" | "icon" | "inline" | "sm";
  /** The trigger's outline: `control` (default) or `pill`, for a trigger standing among pill or glyph
   *  neighbours (the composer's controls, a message's header actions) so its hover paint matches them.
   *  @defaultValue "control" */
  readonly shape?: "control" | "pill";
  /** Roving focus: `-1` takes the trigger out of the tab order while its row is not the list's one tab stop. */
  readonly triggerTabIndex?: -1;
  /** A3 hover-reveal on the trigger (rest hidden). @defaultValue false — pass true only where the row already hid its cluster. */
  readonly reveal?: boolean;
  /** Render the trigger's `label` as a hover/focus tooltip — a BOOLEAN, never a second string (#869).
   *
   *  It used to take free text, and the one consumer that passed it (the chat room's ⋯) spelled a DIFFERENT
   *  string from `label`: the popup read "Manage this chat" while the accessible name read "Chat options"
   *  (measured, `cbrs-tip.log`). On an icon-only trigger the tooltip IS the visible label, so that is WCAG
   *  2.5.3 Label in Name (§13.10 N2) failing in letter — a voice-control user saying the words they can see
   *  cannot reach the only start door in the room, and an agent matching on the rendered string misses it.
   *  A `string` prop cannot be made safe by review: the boolean removes the second string, so the two can no
   *  longer disagree. A trigger that needs a fuller explanation puts it in `label` (where it becomes the name
   *  as well as the pixels), never in a divergent twin. @defaultValue false */
  readonly tooltip?: boolean;
  /** The trigger's ink: `receded` for a demoted-actions door, `inherit` for a trigger that is one
   *  tool among equals and must match its neighbours (the composer's ☰ beside the ✨). @defaultValue "receded" */
  readonly ink?: "inherit" | "receded";
  /** The bottom destructive item + its confirm dialog. Omit for a menu with no destructive action. */
  readonly destructive?: RowDestructiveAction;
  /** The ⋯ trigger button, for a caller that hands focus back to it (a dialog's `finalFocus`). */
  readonly triggerRef?: Ref<HTMLButtonElement>;
}

/** The props every trigger box shares; the box picks the component that draws it. */
interface TriggerShared {
  readonly "aria-label": string;
  readonly reveal: "hover" | undefined;
  readonly ink: "muted" | undefined;
  readonly variant: "ghost";
  readonly ref: Ref<HTMLButtonElement> | undefined;
  readonly shape: NonNullable<RowActionsMenuProps["shape"]>;
  readonly tabIndex?: -1;
}

/**
 * THIS COMPOSITE'S TRIGGER VOCABULARY → the button-family box that carries it.
 *
 * The trigger is ICON-ONLY at every arm — a glyph with an `aria-label` and no text run — so it must be sized on an
 * axis that floors BOTH sides. A Button text step would be a pointer-conditional height around a content width under
 * the D62 P1 floor; the `sm` and `icon` squares take the step's height as their width too, so the box IS the tap
 * floor. The `glyph` and `inline` boxes sit under the floor and carry their own hit area.
 *
 * A MAP, not a ternary: a new member of the union above fails `tsc` here rather than silently falling through to a
 * text step — the one-union-plus-mapped-Record discipline the spine asks of every dispatch axis.
 */
const TRIGGER_BOX = {
  glyph: (shared, glyph) => (
    <GlyphButton {...shared} glyph="lg">
      {glyph}
    </GlyphButton>
  ),
  icon: (shared, glyph) => (
    <Button {...shared} square={true}>
      {glyph}
    </Button>
  ),
  inline: (shared, glyph) => (
    <InlineAction {...shared} step="label">
      {glyph}
    </InlineAction>
  ),
  sm: (shared, glyph) => (
    <Button {...shared} size="sm" square={true}>
      {glyph}
    </Button>
  ),
} as const satisfies Record<NonNullable<RowActionsMenuProps["triggerSize"]>, (shared: TriggerShared, glyph: ReactElement) => ReactElement>;

function actionsTrigger({
  label,
  icon,
  size,
  shape,
  ink,
  reveal,
  tabIndex,
  triggerRef,
}: {
  readonly triggerRef: Ref<HTMLButtonElement> | undefined;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly size: NonNullable<RowActionsMenuProps["triggerSize"]>;
  readonly shape: NonNullable<RowActionsMenuProps["shape"]>;
  readonly ink: NonNullable<RowActionsMenuProps["ink"]>;
  readonly reveal: boolean;
  readonly tabIndex: -1 | undefined;
}): ReactElement {
  const shared: TriggerShared = {
    "aria-label": label,
    reveal: reveal ? "hover" : undefined,
    ink: ink === "receded" ? "muted" : undefined,
    variant: "ghost",
    ref: triggerRef,
    shape,
    ...(tabIndex === undefined ? {} : { tabIndex }),
  };
  return TRIGGER_BOX[size](shared, <Icon icon={icon} size="sm" />);
}

/**
 * The one row/entity actions menu — ghost ⋯ trigger, a popup of `children` items, and an optional
 * destructive item wired to a ConfirmDialog whose open-state this composite owns. Non-destructive
 * items are `children`; the destructive item is declarative (`destructive`).
 */
export function RowActionsMenu({
  label,
  children,
  icon = Ellipsis,
  align = "end",
  triggerSize = "icon",
  shape = "control",
  triggerTabIndex,
  reveal = false,
  tooltip = false,
  ink = "receded",
  destructive,
  triggerRef,
}: RowActionsMenuProps): ReactElement {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const destructiveLabel = destructive?.label ?? ROW_DELETE_NAME;
  const trigger = actionsTrigger({ icon, label, reveal, shape, ink, size: triggerSize, tabIndex: triggerTabIndex, triggerRef });

  return (
    <>
      <Menu>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger render={<MenuTrigger render={trigger} />} />
            {/* The popup text IS the accessible name — the same `label`, never a twin (see the prop's doc). */}
            <TooltipPopup side="top">{label}</TooltipPopup>
          </Tooltip>
        ) : (
          <MenuTrigger render={trigger} />
        )}
        <MenuPopup align={align}>
          {children}
          {destructive === undefined ? null : (
            <>
              {destructive.separator === false ? null : <MenuSeparator />}
              <MenuItem onClick={(): void => setConfirmOpen(true)}>
                <Icon icon={destructive.icon ?? Trash} size="sm" />
                {destructiveLabel}
              </MenuItem>
            </>
          )}
        </MenuPopup>
      </Menu>

      {destructive === undefined || !confirmOpen ? null : (
        <ConfirmDialog
          confirmLabel={destructive.confirmLabel ?? destructiveLabel}
          description={destructive.description}
          {...(destructive.finalFocus === undefined ? {} : { finalFocus: destructive.finalFocus })}
          onConfirm={destructive.onConfirm}
          onOpenChange={setConfirmOpen}
          open={confirmOpen}
          title={destructive.title}
        />
      )}
    </>
  );
}
