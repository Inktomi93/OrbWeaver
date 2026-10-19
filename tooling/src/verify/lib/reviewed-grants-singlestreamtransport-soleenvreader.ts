// Reviewed grants: contract-verb-presence, single-stream-transport.
// Split from reviewed-grants.ts — see that file for the central home comment.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_SINGLESTREAMTRANSPORT_SOLEENVREADER: readonly ReviewedGateGrant[] = [
  {
    id: "contract-verb-presence:chat-room-overrides",
    policyId: "contract-verb-presence",
    subject: "chat.getRoomOverridesForChat",
    operation: "missing-contract-test",
    why: "W1i records this wired ChatService verb as the current behavioral-test gap; the grant keeps the missing test visible and exact.",
    endsWhen: "a domain test invokes getRoomOverridesForChat through the service or its factory, or the verb is removed.",
  },
  {
    id: "contract-verb-presence:discovery-themes",
    policyId: "contract-verb-presence",
    subject: "discovery.themes",
    operation: "missing-contract-test",
    why: "W1i records this wired DiscoveryService verb as the current behavioral-test gap; the grant keeps the missing test visible and exact.",
    endsWhen: "a domain test invokes themes through the service or its factory, or the verb is removed.",
  },
  {
    id: "contract-verb-presence:sessions-getOwnerUserId",
    policyId: "contract-verb-presence",
    subject: "sessions.getOwnerUserId",
    operation: "missing-contract-test",
    why: "an @internal boot-sequence verb (owner-row existence check); exercised through the boot path but has no direct service-level test.",
    endsWhen: "a domain test invokes getOwnerUserId through the service or its factory, or the verb is removed.",
  },
  {
    id: "single-stream-transport:chat-impersonate-stream",
    policyId: "single-stream-transport",
    subject: "packages/server/src/transport/trpc/routers/chat.ts",
    operation: "sse-subscription:impersonateStream",
    why: "PERMANENT by owner ruling (D118): request-scoped, user-gesture-initiated, at most one at a time, and its abort semantics ARE the socket teardown — folding it would mean modelling `detach = cancel generation`. This is the last survivor of the fold ledger; the six staged rows were deleted with the rooms they named.",
    endsWhen:
      "the spec is amended to fold impersonation onto the multiplexed socket; a fold that ships without deleting this row leaves it consumed zero times and reds.",
  },
  {
    id: "single-stream-transport:stream-connect",
    policyId: "single-stream-transport",
    subject: "packages/server/src/transport/trpc/routers/stream.ts",
    operation: "sse-subscription:connect",
    why: "THE one-socket home — the multiplex's own `.subscription(` lives here and every room rides it (D118). Keyed on the PROC so a SECOND subscription added to this same router is still red.",
    endsWhen:
      "the stream router moves or renames its connect proc; the row is then consumed zero times and reds at its dead identity instead of the exemption following the file.",
  },
];
