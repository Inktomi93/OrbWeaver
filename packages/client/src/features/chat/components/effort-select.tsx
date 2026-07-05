// The composer's REASONING-EFFORT quick-control (ux-flow-revamp §3 "Reasoning block" row → the composer
// trailing cluster; the per-turn picker, NOT the full Presets "Reasoning" tab which is L7). A quiet
// icon-adjacent `@orb/ui/menu` radio group over the contract's `EFFORT_LEVELS` (`@orb/contracts/preset`
// — the ONE effort vocabulary, `none` = thinking-off) plus an "Auto" (unset) option.
//
// STICKY, not per-message: the selection lives in `active-chat-store` (`useEffort`/`setEffort`) so it
// survives every message + slot transition (a user shouldn't re-pick each turn). `useSendMessage` reads
// the SAME store value and threads it as `intent.effort` on the next send (null ⇒ send no effort ⇒ the
// server's preset/model default). NO client-side capability gate: `resolveEffort`
// (infra/providers/resolve-chat.ts) already clamps the level to the model's published `effortLevels` and
// warns+drops an unsupported one, so offering every level and letting the server clamp is correct
// (ux-flow-revamp effort brief) — reading the active connection's `effortLevels` here is not trivially
// reachable from the composer, so we don't.
//
// The trigger is an icon-only ghost button (the wand/speak-as cluster idiom); the radio menu's baked
// `RadioItemIndicator` (Base UI, R3) shows the active level when opened, and the trigger's `aria-label`
// names it for AT without opening.

import type { EffortLevel } from "@orb/contracts/preset";
import { EFFORT_LEVELS } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the composer-wand.tsx precedent).
import { Gauge, Icon } from "@orb/ui/icons";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { setEffort, useEffort } from "#state";

/** The sentinel radio value for "Auto" (unset) — distinct from every real `EffortLevel` member so the
 *  radio group can carry a single string value while `null` means "send no effort". */
const AUTO_VALUE = "auto";

/** Display labels per effort level (a `Record` dispatch, spine §5.5 — a new `EFFORT_LEVELS` member fails
 *  `tsc` here until it declares a label, never silently renders its raw enum string). */
const EFFORT_LABEL: Record<EffortLevel, string> = {
  none: "Off (no thinking)",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Very high",
  max: "Max",
};

/** Map the radio group's string value back to the nullable effort (`AUTO_VALUE` ⇒ `null`). */
function toEffort(value: string): EffortLevel | null {
  return value === AUTO_VALUE ? null : (value as EffortLevel);
}

/** The composer's reasoning-effort dropdown — "Auto" + one item per `EFFORT_LEVELS`, sticky via the
 *  active-chat store. Quiet ghost icon trigger; the current level rides its `aria-label`. */
export function EffortSelect(): ReactElement {
  const effort = useEffort();
  const activeLabel = effort === null ? "Auto" : EFFORT_LABEL[effort];

  return (
    <Menu>
      <MenuTrigger
        aria-label={`Reasoning effort: ${activeLabel}`}
        render={
          <Button type="button" intent="ghost" size="icon">
            <Icon icon={Gauge} size="sm" />
          </Button>
        }
      />
      <MenuPopup>
        <MenuRadioGroup
          value={effort ?? AUTO_VALUE}
          onValueChange={(value): void => setEffort(toEffort(String(value)))}
        >
          {/* `closeOnClick` (Base UI default is false for a radio item) — this is a single-pick quick
              control, so a pick commits + closes rather than staying open to flip several. */}
          <MenuRadioItem closeOnClick={true} value={AUTO_VALUE}>
            Auto (model default)
          </MenuRadioItem>
          {EFFORT_LEVELS.map((level) => (
            <MenuRadioItem closeOnClick={true} key={level} value={level}>
              {EFFORT_LABEL[level]}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
