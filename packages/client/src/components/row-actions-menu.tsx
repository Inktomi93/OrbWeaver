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
import type { LucideIcon } from "@orb/ui/icons";
import { Icon, MoreHorizontal, Trash2 } from "@orb/ui/icons";
import { RECEDED_INK } from "@orb/ui/lib";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { ROW_REVEAL } from "./row-reveal.ts";

/** The optional destructive menu item + its ConfirmDialog (state owned by RowActionsMenu). */
export interface RowDestructiveAction {
  /** The menu item label. @defaultValue "Delete" */
  readonly label?: string;
  /** The menu item glyph. @defaultValue Trash2 */
  readonly icon?: LucideIcon;
  /** The confirm dialog heading. */
  readonly title: ReactNode;
  /** The confirm dialog body — plain text/fragment only (see ConfirmDialog). */
  readonly description: ReactNode;
  /** The confirm button's label. @defaultValue the item `label` (or "Delete"). */
  readonly confirmLabel?: string;
  /** Fires on confirm — and may return a PROMISE (#1563b). This value is forwarded to
   *  `ConfirmDialog.onConfirm`, which awaits it: the dialog holds open while the work runs, closes itself on
   *  success, and stays open with the reason on rejection. Declaring `() => void` still ACCEPTED an async
   *  handler (a `Promise` return is assignable to `void`), so the hold-and-retry was reached by accident
   *  rather than by contract, and this type told a reader the opposite of what happens. */
  readonly onConfirm: () => void | Promise<void>;
  /** Render a MenuSeparator before the destructive item. @defaultValue true */
  readonly separator?: boolean;
}

export interface RowActionsMenuProps {
  /** Accessible name for the ⋯ trigger button. */
  readonly label: string;
  /** The non-destructive menu items. */
  readonly children?: ReactNode;
  /** The trigger glyph. @defaultValue MoreHorizontal */
  readonly icon?: LucideIcon;
  /** Popup alignment. @defaultValue "end" */
  readonly align?: "center" | "end" | "start";
  /** Trigger button size — this composite's OWN vocabulary, resolved to a Button size arm by
   *  `TRIGGER_BUTTON_SIZE` below, never a passthrough. `"inline"` is the HintTrigger-parity box (the
   *  config setting row pairs the ⋯ with the tiny `i` and must not inflate the row); `"sm"` is the
   *  small SQUARE trigger for a row whose scale is the `sm` control step. @defaultValue "icon" */
  readonly triggerSize?: "icon" | "inline" | "sm";
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
  /** The bottom destructive item + its confirm dialog. Omit for a menu with no destructive action. */
  readonly destructive?: RowDestructiveAction;
}

// ── THE TRIGGER RECEDES, AND THIS COMPOSITE SAYS SO (#1244, 2026-09-02 — the #1141 fork, second instance;
// converted to the shared `RECEDED_INK` spelling by #1249, third instance) ────────────────────────────────
// This composite IS the demoted-actions door: every consumer puts it at the quiet end of a row whose primary
// action sits beside it, and side-eye #621's ruling for exactly such a row is "three affordances at three
// weights". It got the recession for free while `Button`'s `ghost` intent painted `text-muted-foreground`;
// 242bfaecb (#969) flipped every transparent intent to
// `text-current` so a transparent action inherits its host's paired ink, and the two weights collapsed onto
// one colour — the automation rule row's Test and its ⋯ measured IDENTICAL, which is the pin #621 minted to
// stop that exact reading.
// BOTH RULINGS SURVIVE, resolved the way #1141 was: the primitive keeps inheriting (#969's mechanism and its
// button CT are untouched), and the component whose whole identity is "demoted" states its own ink at the
// two trigger sites below. `RECEDED_INK`'s module header owns the full fork and the unprefixed-so-hover-
// still-wins reasoning.

/**
 * THIS COMPOSITE'S TRIGGER VOCABULARY → the `Button` size arm that carries it (#1613).
 *
 * The trigger is ICON-ONLY at every arm — a glyph with an `aria-label` and no text run — so it must be
 * sized on an axis that floors BOTH sides. `triggerSize` used to be a raw passthrough, and its `"sm"`
 * value therefore named Button's TEXT step (`h-control-sm px-block text-label`): a pointer-conditional
 * HEIGHT with a CONTENT width of `px-block × 2 + a 16px glyph` = 40px, i.e. 40×44 under a finger. That
 * is the D62 P1 floor missed on the short side, filed by design-audit's `tap-target` against the theme
 * Looks rows (`[aria-label="Actions for Hearth"]` / "Light" / "Mocha" — 3 affected of 3 judged, short
 * side 40px, settings:appearance --mobile 2026-09-05).
 *
 * `icon-sm` is the SAME `--spacing-control-sm` box on both axes (44px coarse / 32px fine — the token is
 * pointer-conditional, so the box IS the tap floor and needs none of the `glyph-*` ramp's hit-area
 * pseudo; button/variants.ts states that arm's contract). Row HEIGHT is unchanged at both pointer
 * classes; the trigger gains 4px of width at a coarse pointer and sheds 8 at a fine one, which is the
 * square an icon-only control should always have been.
 *
 * A MAP, not a ternary: a new member of the union above fails `tsc` here rather than silently falling
 * through to a text step — the same one-union-plus-mapped-Record discipline the spine asks of every
 * dispatch axis.
 */
const TRIGGER_BUTTON_SIZE = { icon: "icon", inline: "inline", sm: "icon-sm" } as const satisfies Record<
  NonNullable<RowActionsMenuProps["triggerSize"]>,
  "icon" | "icon-sm" | "inline"
>;

/**
 * The one row/entity actions menu — ghost ⋯ trigger, a popup of `children` items, and an optional
 * destructive item wired to a ConfirmDialog whose open-state this composite owns. Non-destructive
 * items are `children`; the destructive item is declarative (`destructive`).
 */
export function RowActionsMenu({
  label,
  children,
  icon = MoreHorizontal,
  align = "end",
  triggerSize = "icon",
  reveal = false,
  tooltip = false,
  destructive,
}: RowActionsMenuProps): ReactElement {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const destructiveLabel = destructive?.label ?? "Delete";

  return (
    <>
      <Menu>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <MenuTrigger
                  render={
                    <Button
                      aria-label={label}
                      className={reveal ? `${RECEDED_INK} ${ROW_REVEAL}` : RECEDED_INK}
                      intent="ghost"
                      size={TRIGGER_BUTTON_SIZE[triggerSize]}
                    >
                      <Icon icon={icon} size="sm" />
                    </Button>
                  }
                />
              }
            />
            {/* The popup text IS the accessible name — the same `label`, never a twin (see the prop's doc). */}
            <TooltipPopup side="top">{label}</TooltipPopup>
          </Tooltip>
        ) : (
          <MenuTrigger
            render={
              <Button
                aria-label={label}
                className={reveal ? `${RECEDED_INK} ${ROW_REVEAL}` : RECEDED_INK}
                intent="ghost"
                size={TRIGGER_BUTTON_SIZE[triggerSize]}
              >
                <Icon icon={icon} size="sm" />
              </Button>
            }
          />
        )}
        <MenuPopup align={align}>
          {children}
          {destructive === undefined ? null : (
            <>
              {destructive.separator === false ? null : <MenuSeparator />}
              <MenuItem onClick={(): void => setConfirmOpen(true)}>
                <Icon icon={destructive.icon ?? Trash2} size="sm" />
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
          onConfirm={destructive.onConfirm}
          onOpenChange={setConfirmOpen}
          open={confirmOpen}
          title={destructive.title}
        />
      )}
    </>
  );
}
