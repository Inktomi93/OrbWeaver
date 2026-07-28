// RpgFieldLock — the manual-edit-wins LOCK indicator + Release affordance (panel-redesign DESIGN.md §12.3
// "the lock consequence is visible"): a hand edit auto-stamps `fieldLocks[path]` (editSnapshot writes it,
// tools honor it), so the panel renders a small neutral pin glyph on the locked field with the explanatory
// title, and a Release action that clears the lock path — "let the model write it again". Without this,
// every hand edit silently creates a "why won't the model update this anymore?" mystery.
//
// Release rides the SAME editSnapshot verb (an empty patch + `releaseLocks:[path]`) — a lock is snapshot
// METADATA, not a state leaf, so it clears via the lock-DELTA, not a [merge-clear] null (§12.3). Host-only:
// the caller renders this only when it already owns the edit affordance (a member never mounts it).

import { Button } from "@orb/ui/button";
import { Icon, Pin, Unlock } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export interface RpgFieldLockProps {
  /** Clear this field's lock — the caller wires `editSnapshot({ patch:{}, releaseLocks:[path] })`. */
  readonly onRelease: () => void;
}

/** The pin glyph + its Release popover. Render only for a locked field (the caller checks `lockedPaths`). */
export function RpgFieldLock({ onRelease }: RpgFieldLockProps): ReactElement {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            intent="ghost"
            size="sm"
            className="!size-5 !p-0 shrink-0 text-muted-foreground"
            aria-label="Pinned by hand — release to the model"
            title="Pinned by hand — the story won't change this. Release to let the model write it again."
          >
            <Icon icon={Pin} size="xs" />
          </Button>
        }
      />
      <PopoverPopup>
        <Stack gap="field" className="max-w-control-col">
          <Text size="micro" tone="muted">
            Pinned by hand — the story won't change this.
          </Text>
          <Button intent="secondary" size="sm" onClick={onRelease}>
            <Icon icon={Unlock} size="xs" /> Release to the model
          </Button>
        </Stack>
      </PopoverPopup>
    </Popover>
  );
}
