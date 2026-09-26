// verb: update — full replace of an owned party's authored fields, member list included (a party is
// small enough that patch semantics would only buy drift). The SAME producer belts as create run before
// the write (one spelling — imported from `create.ts`); the not-owned and not-found answers collapse
// into one leak-free NotFound.

import type { PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RosterPresetContext } from "../context.ts";
import { RosterPresetNameConflictError, RosterPresetNotFoundError } from "../contract/errors.ts";
import type { UpdateRosterPresetParams } from "../contract/params.ts";
import type { RosterPresetService } from "../contract/service.ts";
import { loadOwnedPresetRow, ownedPresetNameTaken, updatePresetWithMembers } from "../persistence/queries.ts";
import { ensureAnchorOwned, ensureMembersOwned, loadView, parsedGameTemplate, parsedGroupConfig, resolveCastRules } from "../substrate/authored-input.ts";
import { normalizeMembers } from "../substrate/members.ts";

export function createUpdate(ctx: RosterPresetContext): RosterPresetService["update"] {
  return async ({ principal, presetId, input }: UpdateRosterPresetParams) => {
    const ownerId = principal.userId;
    const existing = await loadOwnedPresetRow(ctx.db, ownerId, presetId);
    if (existing === undefined) {
      throw new RosterPresetNotFoundError(presetId);
    }
    // The SAME validation ladder as create (one spelling, full replace) — see create.ts's header.
    const members = normalizeMembers(input.members);
    await ensureMembersOwned(ctx, ownerId, members);
    const anchorPersonaId = input.anchorPersonaId === null || input.anchorPersonaId === undefined ? null : castId<PersonaId>(input.anchorPersonaId);
    await ensureAnchorOwned(ctx, ownerId, anchorPersonaId);
    const groupConfig = parsedGroupConfig(input.groupConfig);
    const gameTemplate = parsedGameTemplate(input.game);
    const rules = resolveCastRules(ctx, input.rules);
    if (await ownedPresetNameTaken(ctx.db, ownerId, input.name, presetId)) {
      throw new RosterPresetNameConflictError(input.name);
    }
    const at = ctx.now();
    await updatePresetWithMembers(ctx.db, {
      ownerId,
      presetId,
      patch: { name: input.name, description: input.description ?? "", anchorPersonaId, groupConfig, gameTemplate, updatedAt: at },
      members,
      rules,
    });
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "rosterPreset.update",
        entityType: "roster_preset",
        entityId: presetId,
        metadata: { name: input.name, members: members.length, rules: rules.length, game: gameTemplate !== null },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "rosterPresetsChanged", rosterPresetId: presetId });
    return loadView(ctx, ownerId, presetId);
  };
}
