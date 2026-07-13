// Message handling — a collapsed Section in the Prompt tab. Two independent collapses between the rack
// and the wire: adjacent-role merging (an editable Select bound to `params.advanced.roleHandling`; the
// resolver clamps `max(floor, choice)`, the UI only annotates a below-floor pick) and squash system notes
// (a Switch bound to `params.advanced.squashSystemMessages`).

import type { ModelCapability, RoleHandling } from "@orb/contracts/connection";
import { ROLE_HANDLING } from "@orb/contracts/connection";
import type { PromptConfig } from "@orb/contracts/preset";
import { Badge } from "@orb/ui/badge";
import { Field } from "@orb/ui/field";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";

type AssemblyForm = AppFormInstance<PromptConfig>;

/** The role-handling vocabulary, ordered least→most strict. Unset (`""`) = "Model default" (falls to floor). */
const ROLE_HANDLING_LABELS: Record<RoleHandling, string> = {
  none: "None — leave adjacent same-role messages as-is",
  merge: "Merge — join adjacent same-role runs",
  "semi-strict": "Semi-strict — merge only where the wire requires",
  strict: "Strict — always one message per role turn",
};

const ROLE_HANDLING_ITEMS: SelectItems<string> = [
  { value: "", label: "Model default" },
  ...ROLE_HANDLING.map((value) => ({ value, label: ROLE_HANDLING_LABELS[value] })),
];

/** The strictness RANK — a pick below the floor is clamped up to it (the resolver's `max(floor, choice)`). */
const ROLE_HANDLING_RANK: Record<RoleHandling, number> = {
  none: 0,
  merge: 1,
  "semi-strict": 2,
  strict: 3,
};

/** Is the picked value STRICTLY below the model's floor? (⇒ the resolver clamps it UP to the floor.) */
function isBelowFloor(pick: RoleHandling | undefined, floor: RoleHandling): boolean {
  return pick !== undefined && ROLE_HANDLING_RANK[pick] < ROLE_HANDLING_RANK[floor];
}

export function MessageHandlingSection({
  form,
  capability,
}: {
  readonly form: AssemblyForm;
  readonly capability: ModelCapability | undefined;
}): ReactElement {
  const floor = capability?.turns?.roleHandlingFloor;

  return (
    <Stack gap="block">
      <Text size="micro" tone="muted">
        Two independent collapses happen between your rack and the wire.
      </Text>

      <form.Subscribe
        selector={(state): RoleHandling | undefined => state.values.params.advanced?.roleHandling}
      >
        {(roleHandling): ReactElement => (
          <Field
            label="Adjacent-role merging"
            description="How back-to-back same-role messages are handled — your choice can only go stricter than the model's floor."
          >
            <Select
              items={ROLE_HANDLING_ITEMS}
              value={roleHandling ?? ""}
              onValueChange={(next): void => {
                form.setFieldValue(
                  "params.advanced.roleHandling",
                  next === "" ? undefined : (next as RoleHandling),
                );
              }}
              aria-label="Adjacent-role merging"
            />
            {floor !== undefined ? (
              <Row gap="field" align="center">
                <Text size="micro" tone="muted">
                  This model enforces at least <b>{ROLE_HANDLING_LABELS[floor].split(" — ")[0]}</b>{" "}
                  — stricter always wins.
                </Text>
                {isBelowFloor(roleHandling, floor) ? (
                  <Badge intent="warning" size="sm">
                    Applies as {ROLE_HANDLING_LABELS[floor].split(" — ")[0]}
                  </Badge>
                ) : null}
              </Row>
            ) : null}
          </Field>
        )}
      </form.Subscribe>

      <form.Subscribe
        selector={(state): boolean => state.values.params.advanced?.squashSystemMessages === true}
      >
        {(squash): ReactElement => (
          <Section heading="Squash system notes">
            <Row gap="row" align="center" justify="between">
              <Text size="body">
                Merge consecutive system-note runs into one message. Never touches the transcript or
                examples.
              </Text>
              <Switch
                aria-label="Squash system notes"
                checked={squash}
                onCheckedChange={(on): void => {
                  form.setFieldValue("params.advanced.squashSystemMessages", on ? true : undefined);
                }}
              />
            </Row>
          </Section>
        )}
      </form.Subscribe>
    </Stack>
  );
}
