// The rule editor autosaves, so removing a filled optional field destroys what the author wrote; it asks first.
// An empty field holds nothing to lose, so it leaves on the press.

import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { DestructiveAction } from "#components";
import type { RemovalFocus } from "../hooks/use-removal-focus.ts";

interface RuleRemoveFieldProps {
  /** The field's lower-case name, as the control and its confirm say it. */
  readonly name: string;
  readonly value: string | null | undefined;
  readonly onRemove: () => void;
  /** Hands focus to the control that outlives the removal. */
  readonly focus: RemovalFocus;
}

/** The Remove control under one optional rule field. */
export function RuleRemoveField({ name, value, onRemove, focus }: RuleRemoveFieldProps): ReactElement {
  const remove = (): void => {
    focus.arm();
    onRemove();
  };
  if ((value ?? "").trim() === "") {
    return (
      <Button variant="ghost" justify="start" onClick={remove}>
        Remove {name}
      </Button>
    );
  }
  return (
    <DestructiveAction
      confirm={{ confirmLabel: "Remove", description: "What you wrote here leaves this rule. This can't be undone.", title: `Remove ${name}?` }}
      finalFocus={focus.finalFocus}
      onConfirm={(): void => {
        focus.confirmed();
        remove();
      }}
      trigger={
        <Button variant="ghost" justify="start">
          Remove {name}
        </Button>
      }
    />
  );
}
