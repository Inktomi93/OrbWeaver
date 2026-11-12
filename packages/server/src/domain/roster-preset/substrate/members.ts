// Pure member-list normalization (zero I/O). The wire carries chat's D80 `characterMemberSpecSchema`
// seats with EXPLICIT positions that only need to ORDER (the vocabulary's shape); the stored junction
// wants them DENSE (0..n-1 — greet order, HUD order, apply order). Sort is stable, so wire-order breaks
// position ties deterministically. Uniqueness of characterIds is the wire schema's refinement (and the
// junction PK's physics) — not re-checked here.
//
// The input's `characterId` arrives parsed by its TypeID schema, and the write verbs run `ensureMembersOwned`
// on the result BEFORE any row lands — a foreign id matches no owned row and collapses to the same leak-free
// NotFound a missing one does.

import type { CreateRosterPresetInput, RosterPresetMemberView } from "@orb/contracts/roster-preset";
import type { RosterPresetId } from "@orb/kit/ids";
import type { MemberCardRow, MemberWrite } from "../contract/service.ts";

/** Wire seats → normalized junction writes: sorted by wire position, re-stamped dense 0..n-1, knob
 *  absence canonicalized (`talkativeness` absent → NULL = inherit; `disabled` absent → false). */
export function normalizeMembers(members: CreateRosterPresetInput["members"]): MemberWrite[] {
  return members
    .toSorted((a, b) => a.position - b.position)
    .map((member, index) => ({
      characterId: member.characterId,
      position: index,
      talkativeness: member.talkativeness ?? null,
      disabled: member.disabled ?? false,
    }));
}

/** Group the FLAT joined member rows per preset (order-preserving — the query already sorted by
 *  (presetId, position)). Pure, so it lives HERE: persistence is queries-only and holds no Map. */
export function groupMemberViews(rows: readonly MemberCardRow[]): Map<RosterPresetId, RosterPresetMemberView[]> {
  const byPreset = new Map<RosterPresetId, RosterPresetMemberView[]>();
  for (const row of rows) {
    const bucket = byPreset.get(row.presetId);
    if (bucket === undefined) {
      byPreset.set(row.presetId, [row.view]);
    } else {
      bucket.push(row.view);
    }
  }
  return byPreset;
}
