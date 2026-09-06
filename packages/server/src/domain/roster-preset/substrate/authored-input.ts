// The create/update validation ladder + the shared detail re-read — ONE spelling for both write verbs
// (verb files may not value-import each other; the chat `substrate/auth` precedent for ctx-consuming
// feature-local helpers). The belts run BEFORE any write: the FK proves a referenced row EXISTS, never
// that it is the caller's (the persona `ensureAssetOwned` posture), so ownership is verified here at the
// producer verb (D18/D20 — gate at the producer, derive everywhere else).

import type { GroupConfigInput } from "@orb/contracts/chat";
import { groupConfigSchema } from "@orb/contracts/chat";
import type { CreateRosterPresetInput, RosterPresetView } from "@orb/contracts/roster-preset";
import type { PersonaId, RosterPresetId, UserId } from "@orb/kit/ids";
import { RosterPresetCharacterNotFoundError, RosterPresetNotFoundError, RosterPresetPersonaNotFoundError } from "../contract/errors.ts";
import type { CastRuleWrite, MemberWrite, RosterPresetContext } from "../contract/service.ts";
import { loadCastRuleRows, loadMemberCardRows, loadOwnedPresetRow, viewOf } from "../persistence/queries.ts";
import { groupMemberViews } from "./members.ts";
import { groupCastRuleViews } from "./rules.ts";

/** The member-ownership belt — throws on the FIRST member that is missing / another user's. */
export async function ensureMembersOwned(ctx: RosterPresetContext, ownerId: UserId, members: readonly MemberWrite[]): Promise<void> {
  const ids = members.map((m) => m.characterId);
  const owned = new Set(await ctx.verifyCharactersOwned(ownerId, ids));
  const missing = ids.find((id) => !owned.has(id));
  if (missing !== undefined) {
    throw new RosterPresetCharacterNotFoundError(missing);
  }
}

/** The anchor-persona belt — absent (null) passes; foreign/missing throws. */
export async function ensureAnchorOwned(ctx: RosterPresetContext, ownerId: UserId, anchorPersonaId: PersonaId | null): Promise<void> {
  if (anchorPersonaId !== null && !(await ctx.verifyPersonaOwned(ownerId, anchorPersonaId))) {
    throw new RosterPresetPersonaNotFoundError(anchorPersonaId);
  }
}

/** Validate-and-default the optional room-behavior blob at the write seam (a non-transport caller
 *  can't smuggle an unvalidated blob past the type — garbage refuses against chat's STRICT arms here
 *  instead of being stored and detonating later). What is STORED is the parse OUTPUT (fully defaulted,
 *  valid TODAY) — chat's `setGroupConfig` re-parses at apply, so a stored blob that predates a
 *  GroupConfig evolution degrades loudly at apply, never silently. */
export function parsedGroupConfig(groupConfig: GroupConfigInput | null | undefined): GroupConfigInput | null {
  return groupConfig === null || groupConfig === undefined ? null : groupConfigSchema.parse(groupConfig);
}

/** The cast-rule belt (B10's rules rider — the `parsedGroupConfig` posture, one knob bag at a time):
 *  every captured spec resolves through automation's OWN injected belt — catalogue membership, chat
 *  scope, full descriptor validation — and what is STORED is the resolved OUTPUT (every key present,
 *  valid TODAY). `createRuleFromPreset` re-resolves at apply, so a bag that predates a catalogue
 *  evolution degrades loudly there (a reported skip), never silently. Wire array order IS the order —
 *  re-stamped dense 0..n-1 (the members posture); uniqueness of `rulePresetId` is the wire schema's
 *  refinement (and the junction PK's physics), not re-checked here. */
export function resolveCastRules(ctx: RosterPresetContext, rules: CreateRosterPresetInput["rules"]): CastRuleWrite[] {
  return (rules ?? []).map((rule, index) => ({
    rulePresetId: rule.rulePresetId,
    position: index,
    knobs: ctx.automation.resolveChatRulePresetKnobs(rule.rulePresetId, rule.knobs ?? {}),
  }));
}

/** The detail read create/update/get share (card names + avatar hashes joined; members in position
 *  order; cast rules in stored order). The not-owned and not-found answers collapse into one leak-free
 *  NotFound. */
export async function loadView(ctx: RosterPresetContext, ownerId: UserId, presetId: RosterPresetId): Promise<RosterPresetView> {
  const row = await loadOwnedPresetRow(ctx.db, ownerId, presetId);
  if (row === undefined) {
    throw new RosterPresetNotFoundError(presetId);
  }
  const members = groupMemberViews(await loadMemberCardRows(ctx.db, ownerId, [presetId])).get(presetId) ?? [];
  const rules = groupCastRuleViews(await loadCastRuleRows(ctx.db, [presetId])).get(presetId) ?? [];
  return viewOf(row, members, rules);
}
