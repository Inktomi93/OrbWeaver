// THE RULESET CONTROL (#862, owner ruling 2026-08-30) — the host console's segmented `Freeform · D20`
// setting, the home of the choice both start doors used to ask at the door. It sits FIRST in the console
// because it decides the vocabulary every section below it edits.
//
// IT IS NOT PART OF THE SCALAR AUTOSAVE FORM, DELIBERATELY. That form writes its whole value bag on every
// save, and the ruleset apply is ADDITIVE server-side — so riding it would re-apply the ruleset on an
// unrelated toggle and resurrect attributes/trackers the host had deleted. This is a path-scoped
// `updateConfig({patch:{ruleset}})`, the same shape the trackers/hints editors use, and the server applies
// only on an actual CHANGE.
//
// NO CONFIRMATION, BY RULING: a switch ADDS the new ruleset's vocabulary beside what exists, removes
// nothing and loses nothing, so a modal here would tax the common case for a risk that does not exist. The
// consequence line says what an apply will do; the copy under it says what it will not.

import type { RpgConfigView, RpgRuleset } from "@orb/contracts/rpg";
import { RPG_RULESET_CONSEQUENCE, RPG_RULESET_LABEL, RPG_RULESETS } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useUpdateConfig } from "../hooks/use-rpg-mutations.ts";
import { Kicker } from "./rpg-kicker.tsx";

/** The segmented toggle hands back raw strings; narrow to the closed axis before writing the field. */
function asRuleset(value: string | undefined): RpgRuleset | null {
  return RPG_RULESETS.find((ruleset) => ruleset === value) ?? null;
}

/** The ruleset setting — the vocabulary + dice this table plays with. */
export function RpgRulesetControl({ chatId, config }: { readonly chatId: ChatId; readonly config: RpgConfigView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  const current = config.ruleset;
  return (
    <Stack gap="field" data-slot="rpg-ruleset-control">
      <Kicker>Ruleset</Kicker>
      <Row gap="block" align="center">
        <ToggleGroup
          aria-label="Ruleset"
          value={[current]}
          onValueChange={(next): void => {
            const picked = asRuleset(next[0]);
            if (picked !== null && picked !== current) {
              updateConfig.mutate({ chatId, patch: { ruleset: picked } });
            }
          }}
        >
          {RPG_RULESETS.map((ruleset) => (
            <Toggle key={ruleset} value={ruleset}>
              {RPG_RULESET_LABEL[ruleset]}
            </Toggle>
          ))}
        </ToggleGroup>
        <Text voice="gloss" className="min-w-0 flex-1">
          {RPG_RULESET_CONSEQUENCE[current]}
        </Text>
      </Row>
      <Text voice="gloss">Switching adds the new ruleset's attributes and trackers beside what this game already has — nothing you set up is removed.</Text>
    </Stack>
  );
}
