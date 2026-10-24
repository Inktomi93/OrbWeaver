// domain/rpg/verbs/roll-dice — rollDice (docs/plans/rpg/design.md). Server CSPRNG, BAKE-ONCE: rolled exactly once here
// (via the injected `randomInt`), the result returned for the composer stamp the client inserts. A
// client-supplied seed is NEVER honored (the security ruling — seed-replay is rejected by having no seed
// input at all). Zero durable state. Member-gated. Notation is `NdM(+/-K)?` (e.g. `2d6+3`, `d20`, `4d8-1`).

import { rpgAttributeModifier } from "@orb/contracts/rpg";
import { DomainOperationError } from "@orb/kit/errors";
import type { RollDiceParams } from "../contract/params.ts";
import type { ParsedDiceNotation, RollDiceResult } from "../contract/results.ts";
import type { RpgContext, RpgGameRow, RpgService } from "../contract/service.ts";
import { resolveMember } from "../guard.ts";
import { findSheet } from "../persistence/sheets.ts";
import { diceNotationInBounds, matchDiceNotation } from "../substrate/dice.ts";

const ABILITY_LABEL_BREAKS = /[[\]\r\n]/g;
/** A member's stamped roll needs a real die; the shared policy alone admits a one-faced one. */
const MIN_MEMBER_FACES = 2;

/** Parse through the shared dice policy; a malformed or out-of-bounds notation is a caller error. */
function parseNotation(notation: string): ParsedDiceNotation {
  const parsed = matchDiceNotation(notation);
  if (parsed === null) {
    throw new DomainOperationError("rpg_bad_dice_notation", `unparseable dice notation "${notation}"`);
  }
  if (!diceNotationInBounds(parsed) || parsed.faces < MIN_MEMBER_FACES) {
    throw new DomainOperationError("rpg_dice_out_of_bounds", `dice notation "${notation}" is out of bounds`);
  }
  return parsed;
}

async function resolveAbility(
  ctx: RpgContext,
  game: RpgGameRow,
  params: RollDiceParams,
  key: string,
): Promise<{ readonly modifier: number; readonly label: string }> {
  if (params.notation.trim().toLowerCase() !== "d20") {
    throw new DomainOperationError("rpg_bad_ability_dice", "an ability check rolls d20 without a caller-supplied modifier");
  }
  const profile = game.config.statProfile;
  const ability = profile.attributes.find((def) => def.key === key);
  if (ability === undefined) {
    throw new DomainOperationError("rpg_unknown_attribute", `attribute "${key}" is not in the profile`);
  }
  const sheet = await findSheet(ctx.db, game.id, { userId: params.principal.userId });
  const score = sheet?.sheet.attributes[ability.key];
  if (score === undefined) {
    throw new DomainOperationError("rpg_unset_ability", `Set your ${ability.label} score before rolling an ability check.`);
  }
  return { modifier: rpgAttributeModifier(profile, score), label: ability.label.replace(ABILITY_LABEL_BREAKS, " ") };
}

export function createRollDice(ctx: RpgContext): Pick<RpgService, "rollDice"> {
  async function rollDice(params: RollDiceParams): Promise<RollDiceResult> {
    const { game } = await resolveMember(ctx, params.principal, params.chatId);
    const parsed = parseNotation(params.notation);
    const ability = params.ability === undefined ? null : await resolveAbility(ctx, game, params, params.ability);
    const modifier = ability?.modifier ?? parsed.modifier;
    const label = ability === null ? "" : `${ability.label} `;
    const { count, faces } = parsed;
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      // `randomInt(faces)` is uniform in [0, faces); a die face is [1, faces].
      rolls.push(ctx.randomInt(faces) + 1);
    }
    const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;
    const notation = params.ability === undefined ? params.notation : `d20${modifier >= 0 ? "+" : ""}${modifier}`;
    const stamp = `[dice: ${label}${notation} → ${total}]`;
    return { notation: params.notation, rolls, modifier, total, stamp };
  }
  return { rollDice };
}
