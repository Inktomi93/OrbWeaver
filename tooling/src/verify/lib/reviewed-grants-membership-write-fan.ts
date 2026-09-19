// Reviewed grants: membership-write-fan (#1734).
// Split from reviewed-grants.ts — see that file for the central home comment.
//
// BOTH rows are ONE owner-deferred gap, not two independent judgements: the databank `bridge` row is a NAMED
// CANDIDATE deliberately held out of the entity→room freshness wave (bridge design §8 + fork F-E,
// 2026-08-14, `docs/design/entity-room-member-freshness-bridge.md`), and `domain-freshness-plane`'s
// `databank` row records the same deferral at domain granularity. They are grants rather than a warning
// `workItem` because the retirement condition is a DESIGN row landing, not a tracked chunk of debt: central
// liveness reports each row stale the day the site gains its fan, which is the tripwire a prose deferral
// cannot give (the `knob-wire-coverage` precedent, #2283).
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_MEMBERSHIP_WRITE_FAN: readonly ReviewedGateGrant[] = [
  {
    id: "membership-write-fan:databank-attach-to-chat",
    policyId: "membership-write-fan",
    subject: "packages/server/src/domain/databank/verbs/attach/attach-to-chat.ts#chatDocuments",
    operation: "membership-write-per-person-emit",
    why: "the per-chat document rack is member-visible and its room half is a NAMED CANDIDATE bridge row deliberately held out of the 2026-08-14 wave (bridge design §8 + fork F-E, owner ruling; the same deferral `domain-freshness-plane`'s `databank` roomReach row records). The host's attach announces on `databankChanged`, which is per-person by construction.",
    endsWhen:
      "domain/databank joins the entity→room bridge (a roomEntityChanged-class fan at the chat-scope junction write) or this verb otherwise gains a room fan — central liveness then reports this row stale.",
  },
  {
    id: "membership-write-fan:databank-detach-from-chat",
    policyId: "membership-write-fan",
    subject: "packages/server/src/domain/databank/verbs/attach/detach-from-chat.ts#chatDocuments",
    operation: "membership-write-per-person-emit",
    why: "the detach half of the same owner-deferred gap — removing a document from a room's rack is as member-visible as adding one, and it announces on the same per-person `databankChanged`. Granted with its twin so the deferral cannot be half-recorded.",
    endsWhen:
      "domain/databank joins the entity→room bridge (a roomEntityChanged-class fan at the chat-scope junction write) or this verb otherwise gains a room fan — central liveness then reports this row stale.",
  },
];
