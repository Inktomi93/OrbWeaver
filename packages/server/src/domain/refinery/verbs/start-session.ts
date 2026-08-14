// verb: startSession — snapshot the OWNED card into a new session's `original_card` (the anti-drift
// anchor), selection defaulting to the card's populated refinable fields, config full/balanced/full.
// The card arrives through the injected character read (the `cardOf` projection stays one-homed in
// character); a foreign/absent character collapses to NOT_FOUND (leak-free — the ownership belt runs
// before anything else, the generate-greeting precedent).

import { DEFAULT_REFINERY_STAGE_CONFIG, refinerySessionNameSchema } from "@orb/contracts/refinery";
import { refinerySessions } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { defaultSelectionOf } from "../substrate/refine-prompt.ts";

export function createStartSession(ctx: RefineryContext): RefineryService["startSession"] {
  return async ({ principal, characterId, name }) => {
    const ownerId = principal.userId;
    const card = await ctx.loadOwnedCard({ ownerId, characterId });
    if (card === undefined) {
      throw new DomainNotFoundError("character", characterId);
    }
    // The internal-boundary parse (the wire parse does not cover a future internal caller).
    const parsedName = name === undefined || name === null ? null : refinerySessionNameSchema.parse(name);
    const at = ctx.now();
    const row = {
      id: ctx.newRefinerySessionId(),
      characterId,
      name: parsedName,
      status: "active" as const,
      originalCard: card,
      selection: defaultSelectionOf(card),
      stageConfig: DEFAULT_REFINERY_STAGE_CONFIG,
      guidance: null,
      iterationCount: 0,
      createdAt: at,
      updatedAt: at,
    };
    await ctx.db.insert(refinerySessions).values(row);
    // After the durable write (the user-bus posture): the roster gained a row on every device.
    ctx.emitUserEvent(ownerId, { type: "refineryChanged", sessionId: row.id });
    return {
      id: row.id,
      characterId: row.characterId,
      name: row.name,
      status: row.status,
      originalCard: row.originalCard,
      selection: row.selection,
      stageConfig: row.stageConfig,
      guidance: row.guidance,
      iterationCount: row.iterationCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  };
}
