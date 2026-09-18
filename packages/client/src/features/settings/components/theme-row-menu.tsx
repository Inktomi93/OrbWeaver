// The per-theme action menu — every theme card's ⋯ (#920: ONE collection, ONE card shape; difference is
// expressed in AFFORDANCES, not in anatomy). A shipped theme is ownerless and non-deletable, so its menu
// offers Apply · Duplicate · Export; an owned theme's offers Apply · Edit in builder · Duplicate · Export ·
// Delete. Same trigger, same card, different item list — the way a read-only row differs from an editable
// one everywhere else in this app. `isSeed` therefore changes CAPABILITY only: it never renders a badge, a
// provenance word, or a second anatomy (owner ruling 2026-08-30).
//
// Delete is confirm-gated (UI-Primitives §13.8 R4 — destructive → AlertDialog; deleting an authored theme
// incl. its custom CSS is unrecoverable, so a misclick under Export must not fire it). A COMPONENT, not
// part of the section surface, so the destructive <AlertDialog> stays legal (client-structure rule 7).
//
// A11Y / TESTABILITY NOTE (#2252): the trigger's accessible name is `Theme actions: <name>`, NOT
// `Actions for <name>`. The bare `Actions for Mocha` pattern collides with Playwright's default
// substring matching on the theme card's own name (`role=radio, name="Mocha"`): `getByRole("button",
// { name: "Mocha" })` silently matches the kebab instead of failing, then opens a modal backdrop that
// eats every subsequent click. The `Theme actions:` prefix makes the name unambiguous with `exact: true`
// and clearly distinguishable even under substring matching (a locator for "Mocha" still matches, but a
// locator for "Theme actions" scopes to exactly the kebab).

import type { Theme } from "@orb/contracts/theme";
import { Check, Copy, Download, Icon, Pencil } from "@orb/ui/icons";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { RowActionsMenu } from "#components";

export interface ThemeRowMenuProps {
  readonly theme: Theme;
  readonly onApply: () => void;
  readonly onEdit: () => void;
  readonly onDuplicate: () => void;
  readonly onExport: () => void;
  /** MAY return a promise (#1563b, widened #1632): it reaches `RowActionsMenu.destructive.onConfirm` →
   *  `ConfirmDialog.onConfirm`, which awaits it — the confirm holds open busy and stays open with the reason
   *  on rejection. `() => void` accepted an async handler anyway, so the type said the opposite. */
  readonly onDelete: () => void | Promise<void>;
}

/** A theme's ⋯ — Apply · (Edit in builder) · Duplicate · Export · (Delete, confirm-gated). */
export function ThemeRowMenu({ theme, onApply, onEdit, onDuplicate, onExport, onDelete }: ThemeRowMenuProps): ReactElement {
  const items = (
    <>
      <MenuItem onClick={onApply}>
        <Icon icon={Check} size="sm" />
        Apply
      </MenuItem>
      {theme.isSeed ? null : (
        <MenuItem onClick={onEdit}>
          <Icon icon={Pencil} size="sm" />
          Edit in builder
        </MenuItem>
      )}
      <MenuItem onClick={onDuplicate}>
        <Icon icon={Copy} size="sm" />
        Duplicate
      </MenuItem>
      <MenuItem onClick={onExport}>
        <Icon icon={Download} size="sm" />
        Export
      </MenuItem>
    </>
  );
  // A shipped theme has no Delete at all — not a disabled one. There is nothing to explain: it is not the
  // user's row, and a greyed item would teach a capability that does not exist.
  if (theme.isSeed) {
    return (
      <RowActionsMenu label={`Theme actions: ${theme.name}`} triggerSize="sm">
        {items}
      </RowActionsMenu>
    );
  }
  return (
    <RowActionsMenu
      destructive={{
        title: "Delete this theme?",
        description: `This permanently deletes "${theme.name}", including its custom CSS. This can't be undone.`,
        onConfirm: onDelete,
      }}
      label={`Theme actions: ${theme.name}`}
      triggerSize="sm"
    >
      {items}
    </RowActionsMenu>
  );
}
