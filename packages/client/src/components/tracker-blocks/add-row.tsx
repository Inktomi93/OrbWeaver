// The ADD-ROW primitive (RV-8 — the deliberate panel-CRUD set: add-row · inline-edit · hint-editor). Every
// authoring plane in the takeover was growing its own "draft field + create button" pair — quests, journal
// entries, checkpoint marks, trackers, relationship hints, attributes, pack items — and they drifted: some
// submitted on Enter, most did not; some refused a blank name with a disabled button, some sent it. ONE row
// so the create gesture reads identically on every plane.
//
// The grammar: a CREATION draft is NOT a datum at rest, so this is a
// plain `Input` (never the display-at-rest `TrackerValue`); a blank draft is Tier-2 refusal — nothing sends
// and every action is disabled; Enter in the field fires the FIRST action (the primary), which is why
// `actions` is a non-empty tuple rather than an array. A `refusal` (the ≤12-attribute cap) is STATED under
// the row in destructive tone and disables the whole row — never a silently dead control.
//
// Multi-action is the tracker case: one name, three shapes (meter/text/list). The actions row is its own
// line so a 17rem panel never squeezes the draft field to nothing.

import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Icon } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { useState } from "react";

/** One create action the row offers for its draft (the trimmed value is handed to `onAdd`). */
export interface AddRowAction {
  /** React key + identity ("meter"). */
  readonly key: string;
  /** The button word ("New quest", "meter"). */
  readonly label: string;
  readonly icon?: LucideIcon;
  /** @defaultValue "primary" for the first action, "ghost" for the rest. */
  readonly intent?: ComponentProps<typeof Button>["intent"];
  readonly onAdd: (value: string) => void;
}

export interface AddRowProps {
  /** The draft field's accessible name ("New quest name"). */
  readonly ariaLabel: string;
  readonly placeholder: string;
  /** At least one action; the FIRST one is the primary (Enter fires it). */
  readonly actions: readonly [AddRowAction, ...AddRowAction[]];
  /** An extra control before the draft field (the journal type picker). */
  readonly leading?: ReactNode;
  /** An extra axis control after the draft field (the tracker subject toggle). */
  readonly trailing?: ReactNode;
  /** A create is in flight — the actions disable (the checkpoint mint). @defaultValue false */
  readonly pending?: boolean;
  /** A stated refusal (Tier-2): the row disables and says why. */
  readonly refusal?: string;
}

/** The one CREATE row: draft field (+ optional pickers) over its action buttons. */
export function AddRow({ ariaLabel, placeholder, actions, leading, trailing, pending, refusal }: AddRowProps): ReactElement {
  const [draft, setDraft] = useState("");
  const value = draft.trim();
  const blocked = value === "" || pending === true || refusal !== undefined;
  const fire = (action: AddRowAction): void => {
    if (blocked) {
      return;
    }
    action.onAdd(value);
    setDraft("");
  };
  return (
    <Stack gap="field" data-slot="add-row">
      <Row gap="field" align="center">
        {leading}
        <Input
          aria-label={ariaLabel}
          value={draft}
          placeholder={placeholder}
          disabled={refusal !== undefined}
          onValueChange={setDraft}
          onKeyDown={(e): void => {
            // Enter commits through the PRIMARY action — the gesture every other panel field already has.
            if (e.key === "Enter") {
              fire(actions[0]);
            }
          }}
          className="h-control-sm min-w-0 flex-1"
        />
        {trailing}
      </Row>
      <Row gap="field" justify="end" className="flex-wrap">
        {actions.map((action, i) => (
          <Button key={action.key} intent={action.intent ?? (i === 0 ? "primary" : "ghost")} size="sm" disabled={blocked} onClick={(): void => fire(action)}>
            {action.icon === undefined ? null : <Icon icon={action.icon} size="xs" />}
            {action.label}
          </Button>
        ))}
      </Row>
      {refusal === undefined ? null : (
        <Text size="micro" className="text-destructive">
          {refusal}
        </Text>
      )}
    </Stack>
  );
}
