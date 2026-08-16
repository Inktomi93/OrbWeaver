// The custom-schema editor's two READ-ONLY panes — the preflight advisory and the live render preview +
// test drill. Split out of `schema-editor-dialog.tsx` for the `component-size` cap (the `render-hint-picker`
// precedent that file's own header cites). They belong together and apart from the dialog for the same
// reason: neither AUTHORS anything. The dialog owns the four editable panes, the save press and the close
// guard; these two only ever READ the draft and tell the author what it will cost and what it will look
// like, so nothing here can lose a keystroke.

import type { RefinerySchemaStage } from "@orb/contracts/refinery";
import { refinerySchemaAdvisoryOf } from "@orb/contracts/refinery";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import { useTestRefinerySchema } from "../hooks/use-refinery-schemas.ts";
import type { buildRenderPlan } from "../lib/render-plan.ts";
import { CharacterDoor } from "./character-door.tsx";
import { PayloadView } from "./payload-view.tsx";
import { RefineryChip } from "./refinery-chip.tsx";

/** The raw door's PREFLIGHT (the third tier — see `@orb/contracts/refinery/schema-advisory`'s header).
 *  Tier 1 is `RefusalNote` (the belt's verbatim refusal, unchanged); tier 2 is this, and it NEVER
 *  blocks: the Save press does not consult it. It answers the question a valid-but-expensive schema
 *  leaves hanging — "this saves, but what does it cost on a real wire?" — with the accounting the OG
 *  extension put behind a validator, minus the client-side policing that validator also did. */
export function PreflightNote({ schema }: { schema: Record<string, unknown> }): ReactElement {
  const { stats, advisories } = refinerySchemaAdvisoryOf(schema);
  return (
    <Stack data-testid={testId("refinerySchemaPreflight")} gap="tight">
      <Text data-testid={testId("refinerySchemaStats")} voice="gloss">
        {stats.properties} fields · {stats.optionalFields} optional · {stats.enums} choice lists · {stats.anyOfBlocks} unions · {stats.maxDepth} levels deep
      </Text>
      {/* The advisories need a CLASS above them or they read as a second, longer stats line — measured
          on the rendered dialog: same voice, same tint, no separation, no way to tell that one is an
          accounting and the other is a warning. The kicker is the cheapest honest separator, and it
          names WHERE the warnings apply rather than shouting that they exist. */}
      {advisories.length === 0 ? null : <Text voice="kicker">On a hosted model</Text>}
      {advisories.map((advisory) => (
        <Text
          data-advisory={advisory.code}
          data-testid={testId("refinerySchemaAdvisory")}
          key={`${advisory.code}:${advisory.path}:${advisory.message}`}
          voice="gloss"
        >
          {advisory.message}
        </Text>
      ))}
    </Stack>
  );
}

/** The live render preview + the test drill — remounted per draft (`key={schemaText}` at the caller),
 *  so a fresh draft always opens with an empty test payload. */
export function PreviewCard({
  plan,
  schema,
  stage,
  outerBusy,
}: {
  plan: ReturnType<typeof buildRenderPlan>;
  schema: Record<string, unknown>;
  stage: RefinerySchemaStage;
  outerBusy: boolean;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const testSchema = useTestRefinerySchema({ trpc, invalidation });
  const [testCharacter, setTestCharacter] = useState<{ readonly id: CharacterId; readonly name: string } | null>(null);
  const [testPayload, setTestPayload] = useState<Record<string, unknown> | null>(null);
  const testCharacterId = testCharacter?.id ?? null;
  return (
    <Card>
      <Stack gap="row" padding="block">
        <Row align="center" gap="field">
          <Text voice="kicker">Render preview</Text>
          <RefineryChip tone="info">the same renderer every run uses</RefineryChip>
        </Row>
        {/* The test drill's own loading arm (P1-10: "no loading affordance on any model call"). A
            `testSchema` turn is a real model round-trip; while it runs, the preview keeps painting the
            LAST settled payload under a shimmer rather than blanking — the same "never goes blank
            between stages" law the content surface holds itself to. */}
        <PayloadView payload={testPayload ?? {}} plan={plan} pending={testSchema.isPending} />
        <Row align="center" gap="field">
          <CharacterDoor
            chosenName={testCharacter?.name ?? null}
            disabled={outerBusy || testSchema.isPending}
            label="Test the schema on a card"
            onSelect={(id, name): void => setTestCharacter({ id, name })}
            placeholder="Pick a card to test on"
          />
          <Button
            aria-busy={testSchema.isPending}
            disabled={outerBusy || testSchema.isPending || testCharacterId === null}
            intent="secondary"
            onClick={(): void => {
              if (testCharacterId !== null) {
                testSchema.mutate({ schema, stage, characterId: testCharacterId }, { onSuccess: (payload): void => setTestPayload(payload) });
              }
            }}
            size="sm"
          >
            {testSchema.isPending ? "Running…" : "Test on this card"}
          </Button>
        </Row>
      </Stack>
    </Card>
  );
}
