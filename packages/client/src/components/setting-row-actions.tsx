// SettingRowActions — the config row's TRAILING ACTION CELL.
//
// THE OWNER RULING IT IMPLEMENTS: *"I don't want to show Copy id or Copy link to end users, but I do want
// the capability for backend shit and debug and aria etc."* The authority is `import.meta.env.DEV`, not
// `isProbeMode()` — probe mode is a deterministic-render localStorage flag, which is not permission to
// expose developer actions.
//
// WHY `IS_DEV` AND NOT THE LITERAL. This module is reachable from the node-only root aggregator tsconfig,
// where `import.meta.env` does not typecheck (`lib/dev-flag.ts`'s header). `IS_DEV` is that same
// `import.meta.env.DEV` behind the house's one typed discriminant, and the bundler still folds it — the CT
// measures the fold on its own production bundle. Do NOT "clean this up" into a local
// `const isDev = …`: a module-local hoist is exactly what breaks the fold.
//
// THE FOUR ARMS, exactly:
//   · production, MODIFIED + bound  → ONE direct hover/focus-revealed Reset. A `⋯` that opens to a single
//     entry is worse than the entry itself — more clicks, more chrome, less clarity.
//   · production, unmodified or unbound → an EMPTY reserved cell. Reset is a verb with nothing to do, and
//     the cell still holds the section's shared action track so no row's geometry moves.
//   · coarse pointer → the cell is display-GONE (`HIDE_AT_COARSE`). Touch reaches Reset through the
//     teacher's About door; a rest-invisible control on a pointer class with no hover is unreachable
//     chrome. The `i` is NOT in this cell and keeps its own 44px target.
//   · dev → the menu: Reset · separator · Copy id · Copy link. The separator keeps the copy verbs from
//     reading as siblings of a state-changing one. Unbound drops Reset and its
//     separator, keeping the two Copies: an address is always true even where there is no value.
//
// WHAT IS PRESERVED, DELIBERATELY: `SETTING_ROW_REVEAL`'s opacity/focus/open-popup contract (opacity only —
// a display or visibility swap under a hover key is a hit-test oscillator, row-reveal.ts), the reserved
// in-flow box (zero layout shift on reveal is the owner's bar), and the exact wire of Reset and of the
// deep-link grammar.
//
// A DISABLED RESET'S LEGIBILITY (`opacity: 0.5`) is answered by the SHAPE, not by a token: in production a
// disabled Reset does not exist — an unmodified row renders the empty cell. The dev menu
// keeps `data-disabled:opacity-50`, which is the house-wide disabled convention shared by every menu,
// select and command item in `@orb/ui`; retuning it here would be a cross-cutting change to a surface this
// row does not own.

import { Button } from "@orb/ui/button";
import { Icon, Link2, RotateCcw, Tag } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { MenuItem, MenuSeparator } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { cn, copyWithNotice, IS_DEV, rowActionsName } from "#lib";
import { formatConfigLink } from "#state";
import { DescribedMenuItem } from "./described-menu-item.tsx";
import { HIDE_AT_COARSE } from "./pointer-variants.ts";
import { RowActionsMenu } from "./row-actions-menu.tsx";
import { SETTING_ROW_REVEAL } from "./row-reveal.ts";
import type { ConfigLeafAddress, ConfigLeafValue } from "./use-config-leaf.ts";

/** A failed copy's next step: the toast description carries the text itself, where it can be selected. */
function manualCopyStep(text: string): string {
  return `Copy it by hand: ${text}`;
}

export interface SettingRowActionsProps {
  /** The row's address — Copy id copies its dotted spelling, Copy link its `/config?to=` form. */
  readonly address: ConfigLeafAddress;
  /** The row's visible label — every affordance here is named for it. */
  readonly label: string;
  /** The leaf's value seam, `null` when the leaf declares no `key`. */
  readonly binding: ConfigLeafValue | null;
}

/** The action cell's shell: the reserved, rest-invisible box the section's third grid track sizes to. */
function ActionCell({ children }: { readonly children?: ReactElement | null }): ReactElement {
  return (
    // `w-full` fills the section's third grid track, which is what the RESERVATION actually is: the track
    // is sized by the widest action in the section, so an empty cell still holds the column and no row's
    // geometry moves when a sibling's Reset appears. The reveal stays opacity-only (row-reveal.ts's law).
    <Row className={cn(SETTING_ROW_REVEAL, HIDE_AT_COARSE, "shrink-0 justify-end inline-full") ?? ""} data-slot="setting-row-actions">
      {children}
    </Row>
  );
}

// The development build keeps copy actions beside the row reset.
function SettingRowDevActions({ address, label, binding }: SettingRowActionsProps): ReactElement {
  const settingId = `${address.group}.${address.sub}.${address.setting}`;
  const settingLink = `${globalThis.location.origin}${formatConfigLink(address.group, address.sub, address.setting)}`;
  return (
    <ActionCell>
      <RowActionsMenu label={rowActionsName(label)} triggerSize="inline">
        {binding === null ? null : (
          <>
            <DescribedMenuItem
              detail={binding.modified ? undefined : "Already at its default."}
              disabled={!binding.modified || binding.resetPending}
              icon={RotateCcw}
              label="Reset to default"
              onClick={binding.reset}
            />
            {/* The copy verbs are a DIFFERENT KIND of act from Reset — an address you take away vs
                a value you change — so a separator keeps them from reading as siblings. */}
            <MenuSeparator />
          </>
        )}
        <MenuItem onClick={(): void => copyWithNotice(settingId, manualCopyStep(settingId))}>
          <Icon icon={Tag} size="sm" />
          Copy setting id
        </MenuItem>
        <MenuItem onClick={(): void => copyWithNotice(settingLink, manualCopyStep(settingLink))}>
          <Icon icon={Link2} size="sm" />
          Copy link
        </MenuItem>
      </RowActionsMenu>
    </ActionCell>
  );
}

// Production exposes reset directly and preserves the action track when no reset applies.
function SettingRowResetAction({ label, binding }: Omit<SettingRowActionsProps, "address">): ReactElement {
  if (binding === null || !binding.modified) {
    return <ActionCell />;
  }
  const name = `Reset ${label} to its default`;
  return (
    <ActionCell>
      {/* No tooltip: this button is disabled while the reset is pending, and a tooltip never wraps a disabled
          control. The name says what it does. */}
      <Button aria-label={name} disabled={binding.resetPending} intent="ghost" onClick={binding.reset} size="inline" type="button">
        <Icon icon={RotateCcw} size="sm" />
      </Button>
    </ActionCell>
  );
}

/** The trailing action cell. Always renders its box (the section's third grid track reserves the width);
 *  WHICH arm is inside it is the build-time decision above. */
export function SettingRowActions({ address, label, binding }: SettingRowActionsProps): ReactElement {
  return IS_DEV ? <SettingRowDevActions address={address} binding={binding} label={label} /> : <SettingRowResetAction binding={binding} label={label} />;
}
