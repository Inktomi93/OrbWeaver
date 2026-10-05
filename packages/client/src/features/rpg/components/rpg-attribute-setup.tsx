// Generated scores use server dice and the existing sheet write; identity remains human-authored.

import type { RpgStatProfile } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { useRollDice } from "../hooks/use-rpg-mutations.ts";
import { canGenerateD20Attributes, rollD20Attributes, standardD20Attributes } from "../lib/attribute-generation.ts";

/** D20 score-entry choices; each generated set is one existing sheet patch. */
export function RpgAttributeSetup({
  chatId,
  profile,
  onFill,
}: {
  readonly chatId: ChatId;
  readonly profile: RpgStatProfile;
  readonly onFill: (attributes: Record<string, number>) => Promise<unknown>;
}): ReactElement {
  const generationReasonId = useId();
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const rollDice = useRollDice({ trpc, invalidation });
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const canGenerate = canGenerateD20Attributes(profile);
  const completedDescription = canGenerate
    ? "Scores save automatically."
    : "Automatic filling needs all six D20 attributes and a score range that allows 3 through 18. Enter scores by hand for this custom profile.";
  const generationDescription = busy ? "Filling scores…" : completedDescription;
  const fill = async (rolled: boolean): Promise<void> => {
    setBusy(true);
    try {
      const scores = rolled ? await rollD20Attributes(async () => (await rollDice.mutateAsync({ chatId, notation: "4d6" })).rolls) : standardD20Attributes();
      await onFill(scores);
    } catch {
      notify.error("Couldn't fill the attributes. Your saved scores are unchanged.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack gap="field">
      <Text voice="gloss">Fill Strength through Charisma in that order, then edit any score. These actions replace those scores only.</Text>
      <Row gap="field" className="flex-wrap">
        <Button intent="secondary" size="sm" disabled={busy || !canGenerate} aria-describedby={generationReasonId} onClick={(): Promise<void> => fill(true)}>
          Roll 4d6 drop lowest
        </Button>
        <Button intent="secondary" size="sm" disabled={busy || !canGenerate} aria-describedby={generationReasonId} onClick={(): Promise<void> => fill(false)}>
          Use standard array
        </Button>
        <Button intent="ghost" size="sm" onClick={(): void => setManual(true)}>
          Enter by hand
        </Button>
      </Row>
      <Text voice="gloss">Rolls keep the highest three dice for each score. Standard array: 15, 14, 13, 12, 10, 8.</Text>
      <Text voice="gloss" id={generationReasonId} role="status">
        {generationDescription}
      </Text>
      {manual ? <Text voice="gloss">Select any score below to edit it.</Text> : null}
    </Stack>
  );
}
