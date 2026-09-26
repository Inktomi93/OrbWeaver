// verb: create — mint a saved party owned by the caller. Ownership is scoped off `principal.userId`
// (§7.1 — never a `users` read). The producer belts (`substrate/authored-input.ts`) run BEFORE the
// insert: every member character and the optional anchor persona must be the CALLER's own (db-verified
// — which is also what keeps a non-transport caller's fabricated id honest without a second TypeID
// re-parse; the router's schema owns the wire strictness), the `groupConfig` blob re-parses through
// chat's STRICT arms at this seam (a garbage blob refuses here, never stored-and-detonating at apply),
// and a duplicate `(owner, name)` is a typed conflict. Preset + seats land as ONE batch; the detail
// re-reads with the card join (the inserted rows alone would lose the joined names/avatar hashes).

import type { PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RosterPresetContext } from "../context.ts";
import { RosterPresetNameConflictError } from "../contract/errors.ts";
import type { CreateRosterPresetParams } from "../contract/params.ts";
import type { RosterPresetService } from "../contract/service.ts";
import { insertPresetWithMembers, ownedPresetNameTaken } from "../persistence/queries.ts";
import { ensureAnchorOwned, ensureMembersOwned, loadView, parsedGameTemplate, parsedGroupConfig, resolveCastRules } from "../substrate/authored-input.ts";
import { normalizeMembers } from "../substrate/members.ts";

export function createCreate(ctx: RosterPresetContext): RosterPresetService["create"] {
  return async ({ principal, input }: CreateRosterPresetParams) => {
    const ownerId = principal.userId;
    const members = normalizeMembers(input.members);
    await ensureMembersOwned(ctx, ownerId, members);
    // The lenient input's anchor is a plain string — the ownership belt is the validator (castId is the
    // sanctioned untyped-seam cast; a fabricated id matches no owned persona → the same leak-free NotFound).
    const anchorPersonaId = input.anchorPersonaId === null || input.anchorPersonaId === undefined ? null : castId<PersonaId>(input.anchorPersonaId);
    await ensureAnchorOwned(ctx, ownerId, anchorPersonaId);
    const groupConfig = parsedGroupConfig(input.groupConfig);
    const gameTemplate = parsedGameTemplate(input.game);
    // B10's rules rider — the same belt posture as groupConfig: automation's own injected validation
    // refuses a bad bag HERE; what lands is the resolved OUTPUT.
    const rules = resolveCastRules(ctx, input.rules);
    if (await ownedPresetNameTaken(ctx.db, ownerId, input.name)) {
      throw new RosterPresetNameConflictError(input.name);
    }
    const at = ctx.now();
    const presetId = ctx.newRosterPresetId();
    await insertPresetWithMembers(
      ctx.db,
      {
        id: presetId,
        ownerId,
        name: input.name,
        description: input.description ?? "",
        anchorPersonaId,
        groupConfig,
        gameTemplate,
        createdAt: at,
        updatedAt: at,
      },
      members,
      rules,
    );
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "rosterPreset.create",
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
