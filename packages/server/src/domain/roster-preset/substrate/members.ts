// Pure member-list normalization (zero I/O). The wire carries chat's D80 `characterMemberSpecSchema`
// seats with EXPLICIT positions that only need to ORDER (the vocabulary's shape); the stored junction
// wants them DENSE (0..n-1 — greet order, HUD order, apply order). Sort is stable, so wire-order breaks
// position ties deterministically. Uniqueness of characterIds is the wire schema's refinement (and the
// junction PK's physics) — not re-checked here.
//
// The `castId` at the seam is the sanctioned untyped-boundary cast, not a mint: the LENIENT input's
// `characterId` is a plain string (`z.input` of the TypeID schema), and the write verbs run
// `ensureMembersOwned` on the result BEFORE any row lands — a fabricated id matches no owned row and
// collapses to the same leak-free NotFound a foreign one does.

import type { CreateRosterPresetInput } from "@orb/contracts/roster-preset";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MemberWrite } from "../contract/service.ts";

/** Wire seats → normalized junction writes: sorted by wire position, re-stamped dense 0..n-1, knob
 *  absence canonicalized (`talkativeness` absent → NULL = inherit; `disabled` absent → false). */
export function normalizeMembers(members: CreateRosterPresetInput["members"]): MemberWrite[] {
  return [...members]
    .sort((a, b) => a.position - b.position)
    .map((member, index) => ({
      characterId: castId<CharacterId>(member.characterId),
      position: index,
      talkativeness: member.talkativeness ?? null,
      disabled: member.disabled ?? false,
    }));
}
