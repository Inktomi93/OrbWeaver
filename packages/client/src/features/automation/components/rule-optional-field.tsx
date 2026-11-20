// An optional rule field: an Add control while it is absent, the field with its Remove while it is set.
// The Add control outlives a removal, so it takes the focus the removed field's Remove control leaves behind.

import { Button } from "@orb/ui/button";
import { ChevronRight, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { useRemovalFocus } from "../hooks/use-removal-focus.ts";
import { ruleFieldAddName } from "../lib/automation-names.ts";
import { RuleRemoveField } from "./rule-remove-field.tsx";

interface RuleOptionalFieldProps {
  /** The field's lower-case name, as the Add control, the Remove control and its confirm say it. */
  readonly name: string;
  /** The stored value: absent (`undefined` or `null`) shows the Add control. */
  readonly value: string | null | undefined;
  /** Opens the field, empty. */
  readonly onAdd: () => void;
  /** Takes the field away; the author asked first when the field held text. */
  readonly onRemove: () => void;
  /** The field itself, shown while set. */
  readonly children: ReactNode;
}

export function RuleOptionalField({ name, value, onAdd, onRemove, children }: RuleOptionalFieldProps): ReactElement {
  const focus = useRemovalFocus();
  if (value === undefined || value === null) {
    return (
      <Button ref={focus.target()} variant="ghost" justify="start" onClick={onAdd}>
        <Icon icon={ChevronRight} size="sm" />
        {ruleFieldAddName(name)}
      </Button>
    );
  }
  return (
    <Stack gap="tight">
      {children}
      <RuleRemoveField focus={focus} name={name} onRemove={onRemove} value={value} />
    </Stack>
  );
}
