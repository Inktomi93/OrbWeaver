// RpgFieldLock — the manual-edit-wins LOCK indicator + Release affordance ("the lock consequence is
// visible"): a hand edit auto-stamps `fieldLocks[path]` (editSnapshot writes it,
// tools honor it), so the panel renders a small neutral pin glyph on the locked field with the explanatory
// title, and a Release action that clears the lock path — "let the model write it again". Without this,
// every hand edit silently creates a "why won't the model update this anymore?" mystery.
//
// Release rides the SAME editSnapshot verb (an empty patch + `releaseLocks:[path]`) — a lock is snapshot
// METADATA, not a state leaf, so it clears via the lock-DELTA, not a [merge-clear] null. Host-only:
// the caller renders this only when it already owns the edit affordance (a member never mounts it).

import { Button } from "@orb/ui/button";
import { Icon, Pin } from "@orb/ui/icons";
import type { ReactElement } from "react";

export interface RpgFieldLockProps {
  /** WHAT this pin holds, in the caller's own words ("Vitality", "the cast", "the pack"). REQUIRED
   *  (side-eye 08-01): the Scene tab alone renders five of these, and every one announced the identical
   *  "Pinned by hand — click to release to the model" — a name-navigating reader got five indistinguishable
   *  buttons and no way to tell which plane each one would hand back. The name is the caller's because only
   *  the caller knows which plane its pin covers (a field, a section, or a whole actor's row). */
  readonly field: string;
  /** Clear this field's lock — the caller wires `editSnapshot({ patch:{}, releaseLocks:[path] })`. */
  readonly onRelease: () => void;
}

/** The pin glyph — ONE click releases (owner ruling 08-01: the popover-confirm two-step was friction on a
 *  low-stakes, self-healing action — any hand edit re-pins). The title states the state AND the gesture. */
export function RpgFieldLock({ field, onRelease }: RpgFieldLockProps): ReactElement {
  return (
    <Button
      type="button"
      intent="ghost"
      size="glyph-sm"
      className="text-muted-foreground"
      aria-label={`Release ${field} to the model`}
      title={`${field} is pinned by hand — the story won't change it. Click to release it back to the model.`}
      onClick={onRelease}
    >
      <Icon icon={Pin} size="xs" />
    </Button>
  );
}
