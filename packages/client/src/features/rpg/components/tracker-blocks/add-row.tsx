// RPG creation drafts require a name before any action sends; Enter fires the first action.
// A stated refusal disables the row and remains visible below it.

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
          // No height here: Input's default `layout="field"` arm already IS `h-control-sm` (#169 — the
          // duplicate was invisible to `ui-size-via-variant` while its value class rejected hyphens).
          className="min-w-0 flex-1"
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
        <Text tone="destructive" size="micro">
          {refusal}
        </Text>
      )}
    </Stack>
  );
}
