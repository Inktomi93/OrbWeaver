// The ONE central home for typed reviewed grants (docs/design/gate-runtime-standardization.md §"Exceptions
// and debt"). A row licenses exactly one `(policyId, subject, operation)` identity of one `reviewed-grant`
// policy; `why` and `endsWhen` are mandatory; after a complete owner run zero consumption is STALE and more
// than one matching finding is OVER-BROAD and licenses nothing (lib/gate-authority.ts owns reconciliation).
// Gate modules never import this table; the command runner hands it to `runPolicyPass` as `reviewedGrants`.
import type { ReviewedGateGrant, SelectedGatePolicy } from "../contract/gate-authority.ts";

/** Sorted by `policyId`, then `id`; `id` is `<policyId>:<short-kebab-subject>` so a row is greppable by its policy. */
export const REVIEWED_GRANTS: readonly ReviewedGateGrant[] = Object.freeze([
  {
    id: "bus-channel-primitive:bus-channel-mint",
    policyId: "bus-channel-primitive",
    subject: "packages/server/src/transport/trpc/bus-channel.ts",
    operation: "event-emitter-construction",
    why: "`defineBusChannel`'s own module — the emitter it wraps is constructed HERE, which is the entire point of the mint (M9, client-architecture-lockdown.md §13/§16 G10).",
    endsWhen:
      "the mint moves or stops wrapping a node EventEmitter; the row is then consumed zero times and reds at its dead subject, which is the rename tripwire the legacy SANCTIONED_HOMES table owned by hand.",
  },
  {
    id: "config-anchor-in-registry:config-jump",
    policyId: "config-anchor-in-registry",
    subject: "packages/client/src/features/config/lib/config-jump.ts",
    operation: "config-anchor-stamp",
    why: "the config JUMP resolves an anchor id to scroll to it — the READER half of §6.8.3's contract, which is the reason anchors are derived from the registry rather than authored twice.",
    endsWhen: "jump targets are resolved from registry rows directly instead of by re-deriving the anchor id.",
  },
  {
    id: "config-anchor-in-registry:config-scroll-spy",
    policyId: "config-anchor-in-registry",
    subject: "packages/client/src/features/config/hooks/use-config-scroll-spy.ts",
    operation: "config-anchor-stamp",
    why: "the config content pane's scroll-spy hook READS anchors rather than painting one: it derives the active group's anchor prefix to drive the spy (the WHEN half split out of `surfaces/config-content-surface.tsx` on main, #1632 train 81; the grant moved with the reader, which is exactly the liveness this row is keyed on). It owns no config row and must not be registered as one (config-revamp-design.md §6.8.3).",
    endsWhen: "the spy's prefix is supplied by the registry itself instead of recomputed at the reader.",
  },
  {
    id: "content-part-seam:chat-contract-results",
    policyId: "content-part-seam",
    subject: "packages/server/src/domain/chat/contract/results.ts",
    operation: "chat-content-part-reference",
    why: "the domain-side request DTO the seam populates (`content: ChatContentPart[]` handed to the runner) — the shape the engine fills and infra reads.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:chat-engine-pipeline",
    policyId: "content-part-seam",
    subject: "packages/server/src/domain/chat/engine/pipeline.ts",
    operation: "chat-content-part-reference",
    why: "the engine request seam ASSEMBLES the parts the CONVERT step builds, and mints its own for the TOOL-RESULT rows (`toolResultMessages`), which never pass through the history conversion.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:chat-wire-history",
    policyId: "content-part-seam",
    subject: "packages/server/src/domain/chat/substrate/wire-history.ts",
    operation: "chat-content-part-reference",
    why: "THE one producer (D51). The CONVERT step moved here at #1540 so the read verb's previews price the same converted rows the turn's fitter prices; a pure read cannot import the turn-execution module.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:providers-contract-chat",
    policyId: "content-part-seam",
    subject: "packages/server/src/infra/providers/contract/chat.ts",
    operation: "chat-content-part-reference",
    why: "the sealed runner tier's own request contract — the shape every backend runner is handed.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:runner-custom-byo-chat",
    policyId: "content-part-seam",
    subject: "packages/server/src/infra/providers/backends/custom-byo/runners/chat.ts",
    operation: "chat-content-part-reference",
    why: "the sealed runner tier is the D51 seam's ONLY consumer — this runner maps content parts onto its backend's wire, which is the reason parts exist at all.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:runner-kit-history",
    policyId: "content-part-seam",
    subject: "packages/server/src/infra/providers/backends/kit/history.ts",
    operation: "chat-content-part-reference",
    why: "the sealed runner tier is the D51 seam's ONLY consumer — this runner maps content parts onto its backend's wire, which is the reason parts exist at all.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:runner-openrouter-responses",
    policyId: "content-part-seam",
    subject: "packages/server/src/infra/providers/backends/openrouter/runners/chat/responses.ts",
    operation: "chat-content-part-reference",
    why: "the sealed runner tier is the D51 seam's ONLY consumer — this runner maps content parts onto its backend's wire, which is the reason parts exist at all.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:runner-openrouter-shared",
    policyId: "content-part-seam",
    subject: "packages/server/src/infra/providers/backends/openrouter/runners/chat/shared.ts",
    operation: "chat-content-part-reference",
    why: "the sealed runner tier is the D51 seam's ONLY consumer — this runner maps content parts onto its backend's wire, which is the reason parts exist at all.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:runner-vllm-chat",
    policyId: "content-part-seam",
    subject: "packages/server/src/infra/providers/vllm/surfaces/chat.ts",
    operation: "chat-content-part-reference",
    why: "the sealed runner tier is the D51 seam's ONLY consumer — this runner maps content parts onto its backend's wire, which is the reason parts exist at all.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "no-direct-users-read:admin-create-user",
    policyId: "no-direct-users-read",
    subject: "packages/server/src/domain/admin/verbs/create-user.ts",
    operation: "users-table-reference",
    why: "user MANAGEMENT is one of the two sanctioned identity readers (Spine-Identity-and-Auth.md): the admin surface owns the `users` row's own lifecycle, so it cannot take userId from a Principal that describes the CALLER instead of the target.",
    endsWhen:
      "this module stops reading the identity root — which is the mode-A staleness the legacy EXEMPT_DOMAINS arm checked by hand, now the central zero-consumption alarm.",
  },
  {
    id: "no-direct-users-read:admin-persistence-queries",
    policyId: "no-direct-users-read",
    subject: "packages/server/src/domain/admin/persistence/queries.ts",
    operation: "users-table-reference",
    why: "user MANAGEMENT is one of the two sanctioned identity readers (Spine-Identity-and-Auth.md): the admin surface owns the `users` row's own lifecycle, so it cannot take userId from a Principal that describes the CALLER instead of the target.",
    endsWhen:
      "this module stops reading the identity root — which is the mode-A staleness the legacy EXEMPT_DOMAINS arm checked by hand, now the central zero-consumption alarm.",
  },
  {
    id: "no-direct-users-read:admin-reset-password",
    policyId: "no-direct-users-read",
    subject: "packages/server/src/domain/admin/verbs/reset-password.ts",
    operation: "users-table-reference",
    why: "user MANAGEMENT is one of the two sanctioned identity readers (Spine-Identity-and-Auth.md): the admin surface owns the `users` row's own lifecycle, so it cannot take userId from a Principal that describes the CALLER instead of the target.",
    endsWhen:
      "this module stops reading the identity root — which is the mode-A staleness the legacy EXEMPT_DOMAINS arm checked by hand, now the central zero-consumption alarm.",
  },
  {
    id: "no-direct-users-read:admin-set-enabled",
    policyId: "no-direct-users-read",
    subject: "packages/server/src/domain/admin/verbs/set-enabled.ts",
    operation: "users-table-reference",
    why: "user MANAGEMENT is one of the two sanctioned identity readers (Spine-Identity-and-Auth.md): the admin surface owns the `users` row's own lifecycle, so it cannot take userId from a Principal that describes the CALLER instead of the target.",
    endsWhen:
      "this module stops reading the identity root — which is the mode-A staleness the legacy EXEMPT_DOMAINS arm checked by hand, now the central zero-consumption alarm.",
  },
  {
    id: "no-direct-users-read:admin-set-role",
    policyId: "no-direct-users-read",
    subject: "packages/server/src/domain/admin/verbs/set-role.ts",
    operation: "users-table-reference",
    why: "user MANAGEMENT is one of the two sanctioned identity readers (Spine-Identity-and-Auth.md): the admin surface owns the `users` row's own lifecycle, so it cannot take userId from a Principal that describes the CALLER instead of the target.",
    endsWhen:
      "this module stops reading the identity root — which is the mode-A staleness the legacy EXEMPT_DOMAINS arm checked by hand, now the central zero-consumption alarm.",
  },
  {
    id: "no-direct-users-read:sessions-persistence-sessions",
    policyId: "no-direct-users-read",
    subject: "packages/server/src/domain/sessions/persistence/sessions.ts",
    operation: "users-table-reference",
    why: "the resolution path JOINS the session row to its identity row — this is the read that MINTS the Principal every other domain then takes userId from, so it cannot itself take one.",
    endsWhen:
      "this module stops reading the identity root — which is the mode-A staleness the legacy EXEMPT_DOMAINS arm checked by hand, now the central zero-consumption alarm.",
  },
  {
    id: "no-direct-users-read:sessions-persistence-users",
    policyId: "no-direct-users-read",
    subject: "packages/server/src/domain/sessions/persistence/users.ts",
    operation: "users-table-reference",
    why: "the identity root's own persistence module in the sanctioned resolution-path domain — it is what turns a session into the Principal.",
    endsWhen:
      "this module stops reading the identity root — which is the mode-A staleness the legacy EXEMPT_DOMAINS arm checked by hand, now the central zero-consumption alarm.",
  },
  {
    id: "no-raw-clock:entry-lifecycle",
    policyId: "no-raw-clock",
    subject: "packages/server/src/entry/lifecycle.ts",
    operation: "ambient-clock-read",
    why: "the composition root CONSTRUCTS the clock it injects into every tier (Tier-5-Entry.md) — a root that cannot read the ambient clock cannot mint one.",
    endsWhen: "the clock is minted from a platform seam the root receives rather than read here; the row is then consumed zero times and reds.",
  },
  {
    id: "no-raw-clock:kit-time-engine",
    policyId: "no-raw-clock",
    subject: "packages/kit/src/time/index.ts",
    operation: "ambient-clock-read",
    why: "`@orb/kit/time` IS the clock seam — `createClock`/`nowMs` read the ambient clock here exactly once so nothing else has to.",
    endsWhen:
      "the time engine moves out of this module or stops defaulting to the ambient clock; the row is then consumed zero times and reds at its dead subject.",
  },
  {
    id: "no-raw-random:entry-compose-chat",
    policyId: "no-raw-random",
    subject: "packages/server/src/entry/compose/chat.ts",
    operation: "ambient-entropy-draw",
    why: "the composition root SEEDS the turn PRNG it injects into the chat engine (Tier-5-Entry.md) — the seed has to be drawn somewhere, and the root is the one tier allowed to.",
    endsWhen: "the seed is supplied to the root as an injected value rather than drawn here; the row is then consumed zero times and reds.",
  },
  {
    id: "owner-role-split:admin-create-user",
    policyId: "owner-role-split",
    subject: "packages/server/src/domain/admin/verbs/create-user.ts",
    operation: "global-role-comparison",
    why: "the owner is the immutable bootstrap row and is never minted through admin, so this verb refuses to ASSIGN the owner role even to an owner caller. This is a TARGET-VALIDITY check on the owner ROW, not a caller-privilege gate: `can()` decides whether a principal may act, and it structurally cannot answer whether the row being acted on is the immutable bootstrap owner. The legacy text reader was blind to it because the literal is the `OWNER_ROLE` const rather than a quoted string.",
    endsWhen: "the admin guard exposes an owner-immutability decision the verbs call, instead of each verb comparing the global-role value itself.",
  },
  {
    id: "owner-role-split:admin-link-sso-identity",
    policyId: "owner-role-split",
    subject: "packages/server/src/domain/admin/verbs/link-sso-identity.ts",
    operation: "global-role-comparison",
    why: "the owner is never admin-linked — its SSO binding is the automatic owner-flip adoption, and choosing the owner's subject here would be box takeover. This is a TARGET-VALIDITY check on the owner ROW, not a caller-privilege gate: `can()` decides whether a principal may act, and it structurally cannot answer whether the row being acted on is the immutable bootstrap owner. The legacy text reader was blind to it because the literal is the `OWNER_ROLE` const rather than a quoted string.",
    endsWhen: "the admin guard exposes an owner-immutability decision the verbs call, instead of each verb comparing the global-role value itself.",
  },
  {
    id: "owner-role-split:admin-reset-password",
    policyId: "owner-role-split",
    subject: "packages/server/src/domain/admin/verbs/reset-password.ts",
    operation: "global-role-comparison",
    why: "the owner's credential is not admin-resettable; the verb refuses the owner ROW rather than the caller. This is a TARGET-VALIDITY check on the owner ROW, not a caller-privilege gate: `can()` decides whether a principal may act, and it structurally cannot answer whether the row being acted on is the immutable bootstrap owner. The legacy text reader was blind to it because the literal is the `OWNER_ROLE` const rather than a quoted string.",
    endsWhen: "the admin guard exposes an owner-immutability decision the verbs call, instead of each verb comparing the global-role value itself.",
  },
  {
    id: "owner-role-split:admin-set-enabled",
    policyId: "owner-role-split",
    subject: "packages/server/src/domain/admin/verbs/set-enabled.ts",
    operation: "global-role-comparison",
    why: "the owner row cannot be disabled — a disabled owner is a bricked box. This is a TARGET-VALIDITY check on the owner ROW, not a caller-privilege gate: `can()` decides whether a principal may act, and it structurally cannot answer whether the row being acted on is the immutable bootstrap owner. The legacy text reader was blind to it because the literal is the `OWNER_ROLE` const rather than a quoted string.",
    endsWhen: "the admin guard exposes an owner-immutability decision the verbs call, instead of each verb comparing the global-role value itself.",
  },
  {
    id: "owner-role-split:admin-set-role",
    policyId: "owner-role-split",
    subject: "packages/server/src/domain/admin/verbs/set-role.ts",
    operation: "global-role-comparison",
    why: "the owner cannot be demoted, and the no-op re-grant of owner-to-owner returns unchanged. This is a TARGET-VALIDITY check on the owner ROW, not a caller-privilege gate: `can()` decides whether a principal may act, and it structurally cannot answer whether the row being acted on is the immutable bootstrap owner. The legacy text reader was blind to it because the literal is the `OWNER_ROLE` const rather than a quoted string.",
    endsWhen: "the admin guard exposes an owner-immutability decision the verbs call, instead of each verb comparing the global-role value itself.",
  },
  {
    id: "route-imports-no-feature:app-root-app-shell",
    policyId: "route-imports-no-feature",
    subject: "packages/client/src/routes/app-root.tsx",
    operation: "feature-front-door-import:#features/app-shell",
    why: "app-root.tsx is the ONE sanctioned composition route (client-architecture-lockdown.md §6): the shell it mounts is what OWNS the section/modal/chrome registries, so it cannot itself reach them through a registry that does not exist until it has mounted.",
    endsWhen: "the app shell is entered through a registry-assembled door rather than composed at the route.",
  },
  {
    id: "route-imports-no-feature:app-root-chat",
    policyId: "route-imports-no-feature",
    subject: "packages/client/src/routes/app-root.tsx",
    operation: "feature-front-door-import:#features/chat",
    why: "the sanctioned composition route assembles the chat feature's contributor registries at the door (client-architecture-lockdown.md §12 row 5); the assembly is the door's job by construction.",
    endsWhen: "chat's contributor registries are assembled by the shell from registered contributions instead of at the route.",
  },
  {
    id: "route-imports-no-feature:app-root-persona",
    policyId: "route-imports-no-feature",
    subject: "packages/client/src/routes/app-root.tsx",
    operation: "feature-front-door-import:#features/persona",
    why: "the sanctioned composition route assembles the persona feature's contributions at the door, on the same §12 row-5 ruling as chat.",
    endsWhen: "persona's contributions are assembled by the shell from registered contributions instead of at the route.",
  },
  {
    id: "route-imports-no-feature:login-page-auth",
    policyId: "route-imports-no-feature",
    subject: "packages/client/src/routes/login-page.tsx",
    operation: "feature-front-door-import:#features/auth",
    why: "the login page IS the auth surface: it renders before any authenticated shell exists, so there is no registry for it to ride.",
    endsWhen: "the login surface is reached through the authenticated shell's registries, which by definition it cannot be while it is the pre-auth entry.",
  },
  {
    id: "route-imports-no-feature:router-auth",
    policyId: "route-imports-no-feature",
    subject: "packages/client/src/routes/router.tsx",
    operation: "feature-front-door-import:#features/auth",
    why: "the router's beforeLoad gate must consult auth before it can decide which route tree to build, which is strictly earlier than any registry read.",
    endsWhen: "route admission is decided by a contracts-level session fact instead of by the auth feature's own door.",
  },
  {
    id: "scrubber-home:member-visibility-stamp",
    policyId: "scrubber-home",
    subject: "packages/server/src/domain/chat/substrate/member-visibility.ts",
    operation: "hidden-span-scrubber-construction",
    why: "THE producer stamp — the one place a stateful per-slot scrubber may be constructed (§3.6, ed2aafc5), because scrub state cannot survive a replay→live handoff and a cold scrubber mid-`<lie>` forwards the secret's tail.",
    endsWhen:
      "the producer stamp moves or stops constructing a scrubber; the row is then consumed zero times and reds, which is the legacy mode-A arm owned centrally.",
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
  {
    id: "two-class-role-authority:admin-guard-can-seam",
    policyId: "two-class-role-authority",
    subject: "packages/server/src/domain/admin/guard.ts",
    operation: "enforcement-role-comparison",
    why: "the `can()` seam itself — spine invariant #6: the chat resource-role verdict is DECIDED here and nowhere else, so the comparison must be spelled here exactly once.",
    endsWhen:
      "the kernel stops comparing the participant role directly (a resource-role table replaces the switch); the row is then consumed zero times and reds.",
  },
  {
    id: "two-class-role-authority:chat-nominee-target",
    policyId: "two-class-role-authority",
    subject: "packages/server/src/domain/chat/verbs/participants.ts",
    operation: "enforcement-role-comparison",
    why: "the host compare is on the NOMINEE (`nominee.role === 'host'` → ChatNotFound) — a TARGET-VALIDITY check on the handoff candidate, not the caller's privilege; the caller's gate is the `requireHost` on the line above it.",
    endsWhen: "target validity moves behind a chokepoint helper that owns the leak-free refusal for a nominee as well as for a caller.",
  },
  {
    id: "two-class-role-authority:chat-participant-shape",
    policyId: "two-class-role-authority",
    subject: "packages/server/src/domain/chat/persistence/participant.ts",
    operation: "enforcement-role-comparison",
    why: "`assertForcedCharacterMember` is the runtime twin of the `chat_participants` CHECK constraint — a persisted-row SHAPE invariant (a character seat can never be the host), not a caller-privilege gate. The legacy reader was blind to it because it hardcoded the `host` literal and this assertion names `member`.",
    endsWhen: "the row shape is guaranteed by the schema alone at every write path, so the runtime twin can be deleted.",
  },
]);

/** The rows a partial invocation may pass: a grant naming a policy the run does not know is a tool error by
 *  contract, so a pre-cutover real-tree receipt over a hand-picked roster filters to that roster first. */
export function reviewedGrantsFor(policies: readonly Pick<SelectedGatePolicy, "id">[]): readonly ReviewedGateGrant[] {
  const known = new Set(policies.map(({ id }) => id));
  return REVIEWED_GRANTS.filter((grant) => known.has(grant.policyId));
}
