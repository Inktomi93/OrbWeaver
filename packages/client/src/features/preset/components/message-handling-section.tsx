// Message handling — a collapsed Section in the Prompt tab. Two independent collapses between the rack
// and the wire: the message-handling level (an editable Select bound to `params.advanced.roleHandling`; the
// turn runs the stricter of the model's floor and this pick, so the Select offers only the levels at or above
// the floor) and squash system notes (a Switch bound to `params.advanced.squashSystemMessages`).

import type { GenerationCapability, RoleHandling, UserRoleHandling } from "@orb/contracts/inference";
import { isStricterRoleHandling, ROLE_HANDLING, USER_ROLE_HANDLING, userRoleHandlingOptions } from "@orb/contracts/inference";
import type { PromptConfig } from "@orb/contracts/preset";
import { Badge } from "@orb/ui/badge";
import { Field, FieldLayout } from "@orb/ui/field";
import { Row, Section } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms/editor";

type AssemblyForm = AppFormInstance<PromptConfig>;

/** The level vocabulary, one name and one gloss per ladder member. Name and gloss are two fields: the closed
 *  trigger prints only the name, and `SelectOption.description` carries the gloss under the option and to AT as
 *  a description. `slotted` is model-only, so it never appears as an option; it still needs a name, because it
 *  is a floor the note below can announce. */
const ROLE_HANDLING_LABELS: Record<RoleHandling, string> = {
  none: "None",
  merge: "Merge",
  slotted: "Slotted",
  "semi-strict": "Semi-strict",
  strict: "Strict",
};

const ROLE_HANDLING_GLOSSES: Record<UserRoleHandling, string> = {
  none: "leave adjacent same-role messages as-is; system notes stay system messages",
  merge: "join adjacent same-role runs; system notes stay system messages",
  "semi-strict": "merge, and fold every system note into user text",
  strict: "semi-strict, and open the conversation on a user message",
};

/** The vocabulary's least-strict member — a floor OF this value constrains nothing, so there is nothing to
 *  announce. Derived from `ROLE_HANDLING`'s own least→most-strict ordering, never a second literal. */
const UNCONSTRAINED_FLOOR: RoleHandling = ROLE_HANDLING[0];

/** Does the model's floor actually CONSTRAIN the pick? A model that imposes no floor (`none` — the local
 *  vLLM wire, whose template renders every message as its own block whatever the adjacency) must not
 *  announce a constraint that does not exist. No constraint, no sentence. */
function floorConstrains(floor: RoleHandling | undefined): floor is RoleHandling {
  return floor !== undefined && isStricterRoleHandling(floor, UNCONSTRAINED_FLOOR);
}

/** The Select's items: "Model default" (unset ⇒ the floor), then every user level this model can run. A
 *  pending capability read offers the whole user vocabulary. */
function roleHandlingItems(floor: RoleHandling | undefined): SelectItems<string> {
  const levels = floor === undefined ? USER_ROLE_HANDLING : userRoleHandlingOptions(floor);
  return [
    { value: "", label: "Model default" },
    ...levels.map((value) => ({ value, label: ROLE_HANDLING_LABELS[value], description: ROLE_HANDLING_GLOSSES[value] })),
  ];
}

/** A stored pick from a preset authored against a looser model, below this model's floor. */
function isBelowFloor(pick: UserRoleHandling | undefined, floor: RoleHandling): boolean {
  return pick !== undefined && isStricterRoleHandling(floor, pick);
}

function isUserRoleHandling(value: string | null): value is UserRoleHandling {
  return USER_ROLE_HANDLING.some((level) => level === value);
}

export function MessageHandlingSection({
  form,
  capability,
}: {
  readonly form: AssemblyForm;
  readonly capability: GenerationCapability | undefined;
}): ReactElement {
  const floor = capability?.turns?.roleHandlingFloor;

  // NO ORPHANED LEDE (side-eye F-33): the sentence is what the CLUSTER is, so it belongs to the cluster's own
  // kicker, where it reads as the group's gloss and both rows sit under it.
  return (
    <Section kicker="Collapsing">
      <Text prose={true} voice="gloss">
        Two independent collapses happen between your rack and the wire.
      </Text>

      <FieldLayout orientation="horizontal">
        <form.Subscribe selector={(state): UserRoleHandling | undefined => state.values.params.advanced?.roleHandling}>
          {(roleHandling): ReactElement => (
            <Field
              hint="How back-to-back same-role messages and system notes are handled — your choice can only go stricter than the model's floor."
              label="Adjacent-role merging"
            >
              <Select
                aria-label="Adjacent-role merging"
                items={roleHandlingItems(floor)}
                onValueChange={(next): void => {
                  form.setFieldValue("params.advanced.roleHandling", isUserRoleHandling(next) ? next : undefined);
                }}
                value={roleHandling ?? ""}
              />
              {floorConstrains(floor) ? (
                <Row align="center" gap="field">
                  <Text voice="gloss">This model enforces at least {ROLE_HANDLING_LABELS[floor]} — stricter always wins.</Text>
                  {isBelowFloor(roleHandling, floor) ? (
                    <Badge intent="warning" size="sm" tone="soft">
                      Applies as {ROLE_HANDLING_LABELS[floor]}
                    </Badge>
                  ) : null}
                </Row>
              ) : null}
            </Field>
          )}
        </form.Subscribe>

        <form.Subscribe selector={(state): boolean => state.values.params.advanced?.squashSystemMessages === true}>
          {(squash): ReactElement => (
            // The SAME label-left / control-right row as every other switch on the surface (F-22).
            <Field hint="Merge consecutive system-note runs into one message. Never touches the transcript or examples." label="Squash system notes">
              <Switch
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
