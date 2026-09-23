// domain/rpg/verbs/roll-dice — rollDice (docs/plans/rpg/design.md). Server CSPRNG, BAKE-ONCE: rolled exactly once here
// (via the injected `randomInt`), the result returned for the composer stamp the client inserts. A
// client-supplied seed is NEVER honored (the security ruling — seed-replay is rejected by having no seed
// input at all). Zero durable state. Member-gated. Notation is `NdM(+/-K)?` (e.g. `2d6+3`, `d20`, `4d8-1`).

import { DomainOperationError } from "@orb/kit/errors";
import type { RollDiceParams } from "../contract/params.ts";
import type { RollDiceResult } from "../contract/results.ts";
import type { RpgContext, RpgService } from "../contract/service.ts";
import { resolveMember } from "../guard.ts";

const NOTATION_RE = /^(\d*)d(\d+)([+-]\d+)?$/i;
const MAX_DICE = 100;
const MAX_FACES = 1000;

/** Parse `NdM(+/-K)?` into `{count, faces, modifier}`; a malformed or out-of-bounds notation is a caller error. */
function parseNotation(notation: string): { count: number; faces: number; modifier: number } {
  const match = NOTATION_RE.exec(notation.trim());
  if (match === null || match[2] === undefined) {
    throw new DomainOperationError("rpg_bad_dice_notation", `unparseable dice notation "${notation}"`);
  }
  const countStr = match[1];
  const count = countStr === undefined || countStr === "" ? 1 : Number.parseInt(countStr, 10);
  const faces = Number.parseInt(match[2], 10);
  const modStr = match[3];
  const modifier = modStr !== undefined ? Number.parseInt(modStr, 10) : 0;
  if (count < 1 || count > MAX_DICE || faces < 2 || faces > MAX_FACES) {
    throw new DomainOperationError("rpg_dice_out_of_bounds", `dice notation "${notation}" is out of bounds`);
  }
  return { count, faces, modifier };
}

export function createRollDice(ctx: RpgContext): Pick<RpgService, "rollDice"> {
  async function rollDice(params: RollDiceParams): Promise<RollDiceResult> {
    await resolveMember(ctx, params.principal, params.chatId);
    const { count, faces, modifier } = parseNotation(params.notation);
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      // `randomInt(faces)` is uniform in [0, faces); a die face is [1, faces].
      rolls.push(ctx.randomInt(faces) + 1);
    }
    const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;
    const stamp = `[dice: ${params.notation} → ${total}]`;
    return { notation: params.notation, rolls, modifier, total, stamp };
  }
  return { rollDice };
}
