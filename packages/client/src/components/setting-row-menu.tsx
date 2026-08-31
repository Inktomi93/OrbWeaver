// SettingRowMenu — the config row's revealed ⋯ (config-revamp-design.md §3.4/§7.7, #866 row-chrome leg):
// Reset to default · Copy setting id · Copy link, in a `RowActionsMenu` named for the row (#443 grammar).
// FINE POINTERS ONLY, invisible at rest: the wrapper composes `SETTING_ROW_REVEAL` (opacity fade keyed on
// the row's `group/setting` — zero layout shift, the slot is permanently reserved) with `HIDE_AT_COARSE`
// (touch reaches Reset through the teacher's About door — the rider's ruling; a rest-invisible control on
// a pointer class with no hover would be unreachable chrome). Split from `setting-teach-row.tsx` for the
// component-size cap; the row passes the resolved leaf binding down, so this file owns only the chrome.

import { Icon, Link2, RotateCcw, Tag } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { cn, notify } from "#lib";
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

export interface SettingRowMenuProps {
  /** The row's address — Copy id copies its dotted spelling, Copy link its `/config?to=` form. */
  readonly address: ConfigLeafAddress;
  /** The row's visible label — the menu announces `Actions for <label>` (#443). */
  readonly label: string;
  /** The leaf's value seam, `null` when the leaf declares no `key` (Reset then stays out of the menu —
   *  a verb with nothing to act on; the copy verbs remain, an address is always true). */
  readonly binding: ConfigLeafValue | null;
}

/** The revealed row menu. Renders the reserved, rest-invisible slot — the caller places it in flow. */
export function SettingRowMenu({ address, label, binding }: SettingRowMenuProps): ReactElement {
  const settingId = `${address.group}.${address.sub}.${address.setting}`;
  return (
    <Row className={cn(SETTING_ROW_REVEAL, HIDE_AT_COARSE, "mt-tight shrink-0") ?? ""} data-slot="setting-row-menu">
      <RowActionsMenu label={`Actions for ${label}`} triggerSize="inline">
        {binding === null ? null : (
          <MenuItem
            disabled={!binding.modified || binding.resetPending}
            onClick={binding.reset}
            {...(binding.modified ? {} : { title: "Already at its default." })}
          >
            <Icon icon={RotateCcw} size="sm" />
            Reset to default
          </MenuItem>
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
    </Row>
  );
}
