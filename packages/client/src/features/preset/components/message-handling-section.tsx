// Message handling — a collapsed Section in the Prompt tab. Two independent collapses between the rack
// and the wire: adjacent-role merging (an editable Select bound to `params.advanced.roleHandling`; the
// resolver clamps `max(floor, choice)`, the UI only annotates a below-floor pick) and squash system notes
// (a Switch bound to `params.advanced.squashSystemMessages`).

import type { ModelCapability, RoleHandling } from "@orb/contracts/connection";
import { ROLE_HANDLING } from "@orb/contracts/connection";
import type { PromptConfig } from "@orb/contracts/preset";
import { Badge } from "@orb/ui/badge";
import { Field, FieldLayout } from "@orb/ui/field";
import { Row, Section } from "@orb/ui/layout";
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

export function MessageHandlingSection({ form, capability }: { readonly form: AssemblyForm; readonly capability: ModelCapability | undefined }): ReactElement {
  const floor = capability?.turns?.roleHandlingFloor;

  // NO ORPHANED LEDE (side-eye F-33): "Two independent collapses happen between your rack and the wire"
  // floated above the first control with nothing tying it to either of the two rows it counts — the reader
  // met a claim about a set before meeting the set. The sentence is what the CLUSTER is, so it belongs to
  // the cluster's own kicker, where it reads as the group's gloss and both rows sit under it.
  return (
    <Section kicker="Collapsing">
      <Text prose={true} voice="gloss">
        Two independent collapses happen between your rack and the wire.
      </Text>

      <FieldLayout orientation="horizontal">
        <form.Subscribe selector={(state): RoleHandling | undefined => state.values.params.advanced?.roleHandling}>
          {(roleHandling): ReactElement => (
            <Field
              hint="How back-to-back same-role messages are handled — your choice can only go stricter than the model's floor."
              label="Adjacent-role merging"
            >
              <Select
                aria-label="Adjacent-role merging"
                items={ROLE_HANDLING_ITEMS}
                onValueChange={(next): void => {
                  form.setFieldValue("params.advanced.roleHandling", next === "" ? undefined : (next as RoleHandling));
                }}
                value={roleHandling ?? ""}
              />
              {floor !== undefined ? (
                <Row align="center" gap="field">
                  <Text voice="gloss">This model enforces at least {ROLE_HANDLING_LABELS[floor].split(" — ")[0]} — stricter always wins.</Text>
                  {isBelowFloor(roleHandling, floor) ? (
                    <Badge intent="warning" size="sm" tone="soft">
                      Applies as {ROLE_HANDLING_LABELS[floor].split(" — ")[0]}
                    </Badge>
                  ) : null}
                </Row>
              ) : null}
            </Field>
          )}
        </form.Subscribe>

        <form.Subscribe selector={(state): boolean => state.values.params.advanced?.squashSystemMessages === true}>
          {(squash): ReactElement => (
            // The SAME label-left / control-right row as every other switch on the surface (F-22): this one
            // used to be a heading over a sentence over a switch, three lines for one boolean.
            <Field hint="Merge consecutive system-note runs into one message. Never touches the transcript or examples." label="Squash system notes">
              <Switch
                aria-label="Squash system notes"
                checked={squash}
                onCheckedChange={(on): void => {
                  form.setFieldValue("params.advanced.squashSystemMessages", on ? true : undefined);
                }}
              />
            </Field>
          )}
        </form.Subscribe>
      </FieldLayout>
    </Section>
  );
}
