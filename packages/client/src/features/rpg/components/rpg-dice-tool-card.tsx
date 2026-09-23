// rpg-dice-tool-card — what a `roll_dice` tool call looks like in the transcript
// (row B8, "result = a tool-renderers contribution in-thread"). The IN-THREAD half of B8's checks: the roll
// is CANON (the `ToolCallRecord` on the committed variant IS the stamp — `contracts/rpg/tools.ts`), and this
// draws it as a legible roll rather than the generic JSON block. rpg raises it; chat mounts it blind through
// the `tool-renderers` registry; neither imports the other (the §6c residency rule).
//
// THE FALLBACK IS THE NULL STATE, exactly as the plugin plane's tool card states it (`plugin-tool-card.tsx`):
// a tool call is CANON — it happened, the model read its result, and the transcript owes the reader a record of
// it. So every arm that is NOT "a well-formed, executed, non-error roll_dice result" renders the GENERIC
// `@orb/ui` `ToolCallBlock`, never nothing: an unexecuted call (`result === null`), a provider error
// (`isError`), or a malformed/foreign result blob all keep the record in the transcript. Silence would delete
// evidence from a conversation.
//
// The card BINDS the record, never a live plane: a roll is per-CALL and bake-once, so an old row keeps showing
// the roll it baked.

import type { ToolCallRecord } from "@orb/contracts/chat";
import type { RollDiceToolResult } from "@orb/contracts/rpg";
import { rollDiceToolResultSchema } from "@orb/contracts/rpg";
import { Card } from "@orb/ui/card";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { ToolCallBlock } from "@orb/ui/tool-call-block";
import type { ReactElement } from "react";

export interface RpgDiceToolCardProps {
  /** The persisted call — the client's ONLY tool read surface (chat never body-parses for tool markers). */
  readonly record: ToolCallRecord;
}

/** Parse a `roll_dice` result blob into its typed shape, or `null` when it is absent/malformed/foreign — the
 *  renderer's fall-back-to-generic decision, never a throw (a tool call is canon and the record is never
 *  dropped). Validated through the contract schema so a reshape of the wire result breaks here, not silently. */
function parseDiceResult(raw: string | null): RollDiceToolResult | null {
  if (raw === null) {
    return null;
  }
  let json: unknown;
  // @orb-waive caught-failure-ownership(catch): a roll_dice result is provenance-faithful; a malformed blob is the renderer's own fall-back-to-generic decision (a tool call is CANON — the record is never dropped, it renders in the generic ToolCallBlock below), so the parse leaves `json` unset for the schema to reject, never a swallow. Ends if the caller stops rendering the generic block on a null parse.
  try {
    json = JSON.parse(raw);
  } catch {
    json = undefined;
  }
  const parsed = rollDiceToolResultSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** A `roll_dice` tool call: the baked roll drawn legibly, or the generic block for every other arm. */
export function RpgDiceToolCard({ record }: RpgDiceToolCardProps): ReactElement {
  const result = record.isError ? null : parseDiceResult(record.result);
  if (result === null) {
    return <ToolCallBlock record={record} />;
  }
  // The per-die faces read as "4 + 3 + 6" so the total is auditable; a single die is just its face. The whole
  // card is one accessible sentence so a screen reader announces the outcome, not four disconnected numbers.
  const facesText = result.faces.join(" + ");
  // The `data-slot` rides a PLAIN wrapper, not the `Card` — an @orb/ui primitive forces its own
  // `data-slot="card-root"` (the slot-only seal), so a marker on it is dropped. The visible text ("Dice · d20",
  // the total, the faces) is the accessible content; a screen reader reads it in order.
  return (
    <div data-slot="rpg-dice-roll">
      <Card className="border border-border">
        <Stack gap="field">
          <Row align="center" gap="row" justify="between">
            <Text voice="label">Dice · {result.notation}</Text>
            {result.reason === undefined || result.reason === "" ? null : <Text voice="gloss">{result.reason}</Text>}
          </Row>
          <Row align="baseline" gap="field">
            {/* `hero` is the voice for THE number a surface exists to produce (@orb/ui text variants) — the
                roll's total. The per-die faces ride the `datum` register beside it so the total is auditable. */}
            <Text voice="hero">{result.total}</Text>
            {result.faces.length > 1 ? <Text voice="datum">{facesText}</Text> : null}
          </Row>
        </Stack>
      </Card>
    </div>
  );
}
