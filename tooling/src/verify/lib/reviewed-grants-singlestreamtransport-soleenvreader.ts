// Reviewed grants: contract-verb-presence, single-stream-transport, sole-env-reader.
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
        why: "PERMANENT by owner ruling (sse-multiplex-spec.md §14 decision 2): request-scoped, user-gesture-initiated, at most one at a time, and its abort semantics ARE the socket teardown — folding it would mean modelling `detach = cancel generation`. This is the last survivor of the fold ledger; the six staged rows were deleted with the rooms they named.",
        endsWhen:
          "the spec is amended to fold impersonation onto the multiplexed socket; a fold that ships without deleting this row leaves it consumed zero times and reds.",
      },
      {
        id: "single-stream-transport:stream-connect",
        policyId: "single-stream-transport",
        subject: "packages/server/src/transport/trpc/routers/stream.ts",
        operation: "sse-subscription:connect",
        why: "THE one-socket home — the multiplex's own `.subscription(` lives here and every room rides it (sse-multiplex-spec.md §11). Keyed on the PROC so a SECOND subscription added to this same router is still red.",
        endsWhen:
          "the stream router moves or renames its connect proc; the row is then consumed zero times and reds at its dead identity instead of the exemption following the file.",
      },
      {
        id: "sole-env-reader:env-home-dynamic-key",
        policyId: "sole-env-reader",
        subject: "packages/server/src/foundation/env/index.ts",
        operation: "process-env-read",
        why: "THE sole reader (Tier-2-Foundation.md inv #1) — foundation/env is what parses and FREEZES `env` for every other tier, so it cannot import the frozen object it produces. This row covers the reads that name no static key: the `.env` loader's `process.env[key]` copy, the zod parse of the whole bag, and the raw snapshot the agent-sdk child env builders spread.",
        endsWhen: "the sole reader moves out of foundation/env, or stops making this read; the row is then consumed zero times and reds.",
      },
      {
        id: "sole-env-reader:env-home-orb-env-no-file",
        policyId: "sole-env-reader",
        subject: "packages/server/src/foundation/env/index.ts",
        operation: "process-env-read:ORB_ENV_NO_FILE",
        why: "THE sole reader (Tier-2-Foundation.md inv #1) — foundation/env is what parses and FREEZES `env` for every other tier, so it cannot import the frozen object it produces. The `.env` file load is skipped by this escape hatch, which must be read BEFORE the frozen object exists.",
        endsWhen: "the sole reader moves out of foundation/env, or stops making this read; the row is then consumed zero times and reds.",
      },
      {
        id: "sole-env-reader:env-home-orb-env-no-override",
        policyId: "sole-env-reader",
        subject: "packages/server/src/foundation/env/index.ts",
        operation: "process-env-read:ORB_ENV_NO_OVERRIDE",
        why: "THE sole reader (Tier-2-Foundation.md inv #1) — foundation/env is what parses and FREEZES `env` for every other tier, so it cannot import the frozen object it produces. Whether a checked-in dev `.env` overrides an already-set var is decided before the parse, so it cannot come from the parse's own output.",
        endsWhen: "the sole reader moves out of foundation/env, or stops making this read; the row is then consumed zero times and reds.",
      },
      {
        id: "sole-env-reader:env-home-vitest",
        policyId: "sole-env-reader",
        subject: "packages/server/src/foundation/env/index.ts",
        operation: "process-env-read:VITEST",
        why: "THE sole reader (Tier-2-Foundation.md inv #1) — foundation/env is what parses and FREEZES `env` for every other tier, so it cannot import the frozen object it produces. The test runner's own marker selects the no-override posture, and is read at module init before the frozen object exists.",
        endsWhen: "the sole reader moves out of foundation/env, or stops making this read; the row is then consumed zero times and reds.",
      },
      {
        id: "sole-env-reader:role-policy-oidc-admin-groups",
        policyId: "sole-env-reader",
        subject: "packages/server/src/domain/sessions/substrate/role-policy.ts",
        operation: "process-env-read:OIDC_ADMIN_GROUPS",
        why: "the IdP group whose members are granted admin — the group→role governance half. the role-derivation policy reads this governance var at CALL time rather than through the frozen `env` so per-test `vi.stubEnv` drives the role/access matrix; the exception is scoped to this one file and to exactly these keys, and any other key here is still red.",
        endsWhen:
          "role-policy stops reading this var at call time — which is the per-key ratchet the legacy SANCTIONED_KEYS ledger owned by hand, now the central zero-consumption alarm.",
      },
      {
        id: "sole-env-reader:role-policy-oidc-allowed-groups",
        policyId: "sole-env-reader",
        subject: "packages/server/src/domain/sessions/substrate/role-policy.ts",
        operation: "process-env-read:OIDC_ALLOWED_GROUPS",
        why: "the IdP group gate on login itself — the other governance half. the role-derivation policy reads this governance var at CALL time rather than through the frozen `env` so per-test `vi.stubEnv` drives the role/access matrix; the exception is scoped to this one file and to exactly these keys, and any other key here is still red.",
        endsWhen:
          "role-policy stops reading this var at call time — which is the per-key ratchet the legacy SANCTIONED_KEYS ledger owned by hand, now the central zero-consumption alarm.",
      },
      {
        id: "sole-env-reader:role-policy-owner-group",
        policyId: "sole-env-reader",
        subject: "packages/server/src/domain/sessions/substrate/role-policy.ts",
        operation: "process-env-read:OWNER_GROUP",
        why: "the IdP group that adopts the owner row. the role-derivation policy reads this governance var at CALL time rather than through the frozen `env` so per-test `vi.stubEnv` drives the role/access matrix; the exception is scoped to this one file and to exactly these keys, and any other key here is still red.",
        endsWhen:
          "role-policy stops reading this var at call time — which is the per-key ratchet the legacy SANCTIONED_KEYS ledger owned by hand, now the central zero-consumption alarm.",
      },
      {
        id: "sole-env-reader:role-policy-owner-handles",
        policyId: "sole-env-reader",
        subject: "packages/server/src/domain/sessions/substrate/role-policy.ts",
        operation: "process-env-read:OWNER_HANDLES",
        why: "the handle list that adopts the owner row. the role-derivation policy reads this governance var at CALL time rather than through the frozen `env` so per-test `vi.stubEnv` drives the role/access matrix; the exception is scoped to this one file and to exactly these keys, and any other key here is still red.",
        endsWhen:
          "role-policy stops reading this var at call time — which is the per-key ratchet the legacy SANCTIONED_KEYS ledger owned by hand, now the central zero-consumption alarm.",
      },
      {
        id: "sole-env-reader:role-policy-re-derive-role-on-login",
        policyId: "sole-env-reader",
        subject: "packages/server/src/domain/sessions/substrate/role-policy.ts",
        operation: "process-env-read:RE_DERIVE_ROLE_ON_LOGIN",
        why: "whether a login re-derives the stored role from current group membership. the role-derivation policy reads this governance var at CALL time rather than through the frozen `env` so per-test `vi.stubEnv` drives the role/access matrix; the exception is scoped to this one file and to exactly these keys, and any other key here is still red.",
        endsWhen:
          "role-policy stops reading this var at call time — which is the per-key ratchet the legacy SANCTIONED_KEYS ledger owned by hand, now the central zero-consumption alarm.",
      },

];
