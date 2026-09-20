// Reviewed grants: membership-write-fan (#1734).
// Split from reviewed-grants.ts — see that file for the central home comment.
//
// THE TABLE IS EMPTY, AND THAT IS A RESULT, NOT A STUB (#2471, 2026-09-20). It carried exactly two rows —
// `membership-write-fan:databank-{attach-to-chat,detach-from-chat}` — one owner-deferred gap recorded twice:
// the databank `bridge` candidate held out of the entity→room freshness wave (bridge design §8 + fork F-E,
// 2026-08-14). Both `endsWhen` strings named the same condition, "databank joins the bridge (a
// roomEntityChanged-class fan at the chat-scope junction write)". The owner closed that fork on 2026-09-20
// ("im not locked in on three"), `databank` joined `ROOM_ENTITY_KINDS`, and both verbs now fan
// `emitRoomDatabankChanged` beside their per-person emit — so the policy no longer finds either file and a
// still-committed row would alarm `stale-reviewed-grant` rather than license anything.
//
// The module stays as this policy's grant home (the gate's own FIX string names this path as where a
// deliberate, owner-ruled gap is recorded). An empty array is the honest state: the policy currently has NO
// exempted site, so every membership-class write announced to one human only is EFFECTIVE.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_MEMBERSHIP_WRITE_FAN: readonly ReviewedGateGrant[] = [];
