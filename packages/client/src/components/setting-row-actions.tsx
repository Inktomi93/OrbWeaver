// SettingRowActions — the config row's TRAILING ACTION CELL (#928; replaces `setting-row-menu.tsx`).
//
// THE RULING IT IMPLEMENTS (owner, 2026-08-30): *"I don't want to show Copy id or Copy link to end users,
// but I do want the capability for backend shit and debug and aria etc."* Plus the cold authority
// correction (2026-09-01): the authority is `import.meta.env.DEV`, not `isProbeMode()` — probe mode is a
// deterministic-render localStorage flag, which is not permission to expose developer actions.
//
// A RECORDED-RULING FORK, RESOLVED AND STATED (cb-row-anatomy, 2026-09-02). The correction says to write
// the LITERAL `import.meta.env.DEV`; `lib/dev-flag.ts`'s own header rules the opposite for every module
// but `main.tsx` — *"modules reachable from the node-only root aggregator tsconfig must still typecheck …
// main.tsx keeps the literal expression instead"* — and this module IS reachable from it: the literal
// failed `pnpm typecheck:graph` here with `TS2339: Property 'env' does not exist on type 'ImportMeta'`.
// Both rulings survive because the correction's SUBSTANCE is the bundler fold, and `IS_DEV` is that same
// `import.meta.env.DEV` behind the house's one typed discriminant. The fold is not assumed — it is
// MEASURED on the CT's own production bundle, and the receipt is in
// `tests/client/components/setting-row-actions.fixtures.tsx`. Do NOT "clean this up" into a local
// `const isDev = …`: a module-local hoist is exactly what breaks the fold.
//
// THE FOUR ARMS, exactly:
//   · production, MODIFIED + bound  → ONE direct hover/focus-revealed Reset. A `⋯` that opens to a single
//     entry is worse than the entry itself — more clicks, more chrome, less clarity (#928's own reasoning).
//   · production, unmodified or unbound → an EMPTY reserved cell. Reset is a verb with nothing to do, and
//     the cell still holds the section's shared action track so no row's geometry moves.
//   · coarse pointer → the cell is display-GONE (`HIDE_AT_COARSE`). Touch reaches Reset through the
//     teacher's About door; a rest-invisible control on a pointer class with no hover is unreachable
//     chrome. The `i` is NOT in this cell and keeps its own 44px target.
//   · dev → the menu: Reset · separator · Copy id · Copy link (nit 7 — the three were flat `menuitem`s,
//     which read the copy verbs as siblings of a state-changing one). Unbound drops Reset and its
//     separator, keeping the two Copies: an address is always true even where there is no value.
//
// WHAT IS PRESERVED, DELIBERATELY: `SETTING_ROW_REVEAL`'s opacity/focus/open-popup contract (opacity only —
// a display or visibility swap under a hover key is a hit-test oscillator, row-reveal.ts), the reserved
// in-flow box (zero layout shift on reveal is the owner's bar, and the re-drive re-verified it), and the
// exact wire of Reset and of the deep-link grammar.
//
// THE DISABLED-RESET LEGIBILITY NIT (nit 8, `opacity: 0.5`) is answered by the SHAPE, not by a token: in
// production a disabled Reset no longer exists — an unmodified row renders the empty cell. The dev menu
// keeps `data-disabled:opacity-50`, which is the house-wide disabled convention shared by every menu,
// select and command item in `@orb/ui`; retuning it here would be a cross-cutting change to a surface this
// row does not own.

import { Button } from "@orb/ui/button";
import { Icon, Link2, RotateCcw, Tag } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { MenuItem, MenuSeparator } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { cn, IS_DEV, notify, rowActionsName } from "#lib";
import { formatConfigLink } from "#state";
import { HIDE_AT_COARSE } from "./pointer-variants.ts";
import { RowActionsMenu } from "./row-actions-menu.tsx";
import { SETTING_ROW_REVEAL } from "./row-reveal.ts";
import type { ConfigLeafAddress, ConfigLeafValue } from "./use-config-leaf.ts";

/** Copy + toast, the message-actions-row pattern — the toast is the only rendered ack a menu that has
 *  already closed can give. */
function copyText(text: string): void {
  navigator.clipboard.writeText(text).then(
    (): void => notify.success("Copied to clipboard."),
    (): void => notify.error("Couldn't copy to clipboard."),
  );
}

export interface SettingRowActionsProps {
  /** The row's address — Copy id copies its dotted spelling, Copy link its `/config?to=` form. */
  readonly address: ConfigLeafAddress;
  /** The row's visible label — every affordance here is named for it (#443). */
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
    <Row className={cn(SETTING_ROW_REVEAL, HIDE_AT_COARSE, "w-full shrink-0 justify-end") ?? ""} data-slot="setting-row-actions">
      {children}
    </Row>
  );
}

/**
 * THE DEVELOPER ARM — the full menu. Exported so a CT can mount it directly: `import.meta.env.DEV` is a
 * BUILD-TIME constant, so the two arms are not reachable from one another at runtime and a spec that only
 * ever mounted the dispatcher below could prove exactly one of them.
 */
export function SettingRowDevActions({ address, label, binding }: SettingRowActionsProps): ReactElement {
  const settingId = `${address.group}.${address.sub}.${address.setting}`;
  return (
    <ActionCell>
      <RowActionsMenu label={rowActionsName(label)} triggerSize="inline">
        {binding === null ? null : (
          <>
            <MenuItem
              disabled={!binding.modified || binding.resetPending}
              onClick={binding.reset}
              {...(binding.modified ? {} : { title: "Already at its default." })}
            >
              <Icon icon={RotateCcw} size="sm" />
              Reset to default
            </MenuItem>
            {/* Nit 7: the copy verbs are a DIFFERENT KIND of act from Reset — an address you take away vs
                a value you change — and three flat items said they were siblings. */}
            <MenuSeparator />
          </>
        )}
        <MenuItem onClick={(): void => copyText(settingId)}>
          <Icon icon={Tag} size="sm" />
          Copy setting id
        </MenuItem>
        <MenuItem onClick={(): void => copyText(`${globalThis.location.origin}${formatConfigLink(address.group, address.sub, address.setting)}`)}>
          <Icon icon={Link2} size="sm" />
          Copy link
        </MenuItem>
      </RowActionsMenu>
    </ActionCell>
  );
}

/** THE END-USER ARM — one direct Reset on a modified bound row, an empty reserved cell otherwise. */
export function SettingRowResetAction({ label, binding }: Omit<SettingRowActionsProps, "address">): ReactElement {
  if (binding === null || !binding.modified) {
    return <ActionCell />;
  }
  return (
    <ActionCell>
      <Button
        aria-label={`Reset ${label} to its default`}
        disabled={binding.resetPending}
        intent="ghost"
        onClick={binding.reset}
        size="inline"
        title={`Reset ${label} to its default`}
        type="button"
      >
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
