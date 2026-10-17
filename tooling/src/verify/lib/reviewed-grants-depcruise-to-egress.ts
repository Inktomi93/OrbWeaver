// Reviewed grants for JSON writes, configuration wiring, identity, macros and egress.
// Split from reviewed-grants.ts — see that file for the central home comment.
//
// TWO `knob-wire-coverage` ROWS RETIRED 2026-09-20 (lane cb-gate-reach, the @orb/inference §12 extraction
// audit), both because their SUBJECT was deleted by the program, which is exactly the condition each row's
// own `endsWhen` named:
//   · `config-allow-non-owner-local-compute` — `EffectiveAppConfig.allowNonOwnerLocalCompute` no longer
//     exists anywhere under `packages/` (the consent belt went with the per-user agent-sdk cut-over, step 6,
//     and the governance trio with the fleet yeet, step 6b). Its tracker #2283 asked for the flag to be READ;
//     it was deleted instead, which discharges the debt rather than fixing it.
//   · `metadata-provider-routing` — `chatMetadataSchema.providerRouting` was deleted with
//     `RouteChatAssignment` and the three compose reads (§7.1: a routing preference is a connection binding,
//     not a property of a room). The row called itself 'THE ONE SANCTIONED DOORWAY … only stale-checked',
//     and this is that stale check firing.
// Both were live stale-grant ALARMS on `pnpm check:structure`, not findings — which is why nothing failed
// loudly for the week between the deletions and this commit.

import type { ReviewedGateGrant } from "../contract/gate-authority.ts";
import { MANUAL_MEMO_CUSTOM_HOMES } from "../contract/manual-memo.ts";

export const REVIEWED_GRANTS_DEPCRUISE_TO_EGRESS: readonly ReviewedGateGrant[] = [
  {
    id: "json-column-write-parity:chats-pending-handoff-offer",
    policyId: "json-column-write-parity",
    subject: "chats.pendingHandoffOffer",
    operation: "json-column-straddle",
    why: "real offer writers replace or clear the whole offer; the key-wise sibling is the one-shot boot vocabulary rename.",
    endsWhen: "the migration/heal is retired, the writer provenance changes, or all writers adopt one write shape.",
  },
  {
    id: "json-column-write-parity:preset-replace",
    policyId: "json-column-write-parity",
    subject: "packages/server/src/domain/preset/persistence/queries.ts#replacePresetConfig",
    operation: "versioned-config-replace",
    why: "This explicit repair or packaged reseed writes caller-owned current-schema content rather than a degraded read of the row it replaces; refusing it would remove the recovery door.",
    endsWhen: "the function begins writing content derived from a read of the stored row, gains a dominating refusal guard, moves, or is removed.",
  },
  {
    id: "json-column-write-parity:preset-system-reseed",
    policyId: "json-column-write-parity",
    subject: "packages/server/src/domain/preset/persistence/queries.ts#reseedSystemDefault",
    operation: "versioned-config-replace",
    why: "This explicit repair or packaged reseed writes caller-owned current-schema content rather than a degraded read of the row it replaces; refusing it would remove the recovery door.",
    endsWhen: "the function begins writing content derived from a read of the stored row, gains a dominating refusal guard, moves, or is removed.",
  },
  {
    id: "json-column-write-parity:presets-config",
    policyId: "json-column-write-parity",
    subject: "presets.config",
    operation: "json-column-straddle",
    why: "the key-wise sibling is the one-shot prose-slot vocabulary migration; guarded edits and packaged replacements own the whole blob.",
    endsWhen: "the migration/heal is retired, the writer provenance changes, or all writers adopt one write shape.",
  },
  {
    id: "json-column-write-parity:settings-replace",
    policyId: "json-column-write-parity",
    subject: "packages/server/src/domain/settings/persistence/queries.ts#replaceUserConfig",
    operation: "versioned-config-replace",
    why: "This explicit repair or packaged reseed writes caller-owned current-schema content rather than a degraded read of the row it replaces; refusing it would remove the recovery door.",
    endsWhen: "the function begins writing content derived from a read of the stored row, gains a dominating refusal guard, moves, or is removed.",
  },
  {
    id: "json-column-write-parity:user-settings-config",
    policyId: "json-column-write-parity",
    subject: "userSettings.config",
    operation: "json-column-straddle",
    why: "the whole-blob user write and reset door coexist with the cross-user json_set theme heal; the residual is the separately ruled race, not a client-image straddle.",
    endsWhen: "the migration/heal is retired, the writer provenance changes, or all writers adopt one write shape.",
  },
  // THE D107 KNOB ROWS (#1584, #2283). They replace `knob-wire-coverage`'s two gate-local
  // `ExemptionTable`s — `DOORWAY` (one sanctioned, indefinitely-dormant rebuild seam) and `DEFERRED` (five
  // tracked-debt rows) — whose two-sided STALE/ORPHAN arms are now the central `stale-reviewed-grant`
  // alarm: a row consumed zero times after a complete owner run is an error whether the member GAINED its
  // wire or VANISHED. The legacy `ExemptionRow` carried only `why`, which is why #2283 recorded the five
  // debt rows as citing prose with no durable tracker; `endsWhen` is the field that deliverable inhabits,
  // and it cites #2283 rather than a design-doc coordinate (#1965).
  {
    id: "knob-wire-coverage:config-import-skip-characters",
    policyId: "knob-wire-coverage",
    subject: "EffectiveAppConfig.importSkipCharacters",
    operation: "unread-config-field",
    why: "D107 triage — the resolved env-floor skip list (env floor ⊕ admin override) is read by no import behavior outside the resolver itself, so editing it governs nothing today. Tracked debt, not a sanctioned doorway.",
    endsWhen: "domain/import consumes getEffectiveConfig().importSkipCharacters — central liveness then reports this row stale. Tracker: #2283.",
  },
  {
    id: "knob-wire-coverage:section-group-defaults",
    policyId: "knob-wire-coverage",
    subject: "USER_SETTINGS_SECTIONS.groupDefaults",
    operation: "unwritten-settings-section",
    why: "D107 audit Q1 — the READ half was wired 2026-07-25 (start-chat seeds metadata.group when the creator's defaults deviate); the section-patch WRITE path (a groupDefaults editor) is still owed. Tracked debt, not a sanctioned doorway.",
    endsWhen: 'a groupDefaults editor patches section:"groupDefaults" — central liveness then reports this row stale. Tracker: #2283.',
  },
  {
    id: "knob-wire-coverage:app-key-import-skip-characters",
    policyId: "knob-wire-coverage",
    subject: "appSettingsSchema.importSkipCharacters",
    operation: "unwritten-admin-key",
    why: "D107 — the admin-editor wave of the settings-wiring program; verified UI-less 2026-07-25 with zero write field anywhere in the admin surfaces (features/settings, which folded into features/config at #2447) ∪ features/user-admin. Tracked debt, not a sanctioned doorway.",
    endsWhen: "an admin surface gains an importSkipCharacters write field — central liveness then reports this row stale. Tracker: #2283.",
  },
  {
    id: "knob-wire-coverage:app-key-ip-certificate",
    policyId: "knob-wire-coverage",
    subject: "appSettingsSchema.ipCertificate",
    operation: "unwritten-admin-key",
    why: "D275 — wired, not dormant. The Share card (features/user-admin/components/share-ip-certificate.tsx) writes it through share.enableIpCertificate and share.disableIpCertificate, composed in entry/compose/services.ts onto updateAppSettings({ partial: { ipCertificate } }). Arm B2 scans the admin dirs for the key's name and cannot see a dedicated verb. A generic editor field would skip the refusal checks and the certificate controller start, so none exists by design.",
    endsWhen:
      "ipCertificate leaves appSettingsSchema, an admin surface names the key in a write field, or arm B2 learns to read a dedicated write verb — central liveness then reports this row stale.",
  },
  {
    id: "macro-resolution-home:ghost-message-row",
    policyId: "macro-resolution-home",
    subject: "packages/client/src/features/chat/components/ghost-message-row.tsx",
    operation: "macro-resolution",
    why: "The streaming ghost renders read-only in-flight content and reasoning through the same display pipeline used after commit.",
    endsWhen:
      "This exact home stops importing or calling a macro resolver, moves, or begins feeding a writable field; remove or re-review the grant and preserve token-roundtrip coverage.",
  },
  {
    id: "macro-resolution-home:message-content",
    policyId: "macro-resolution-home",
    subject: "packages/client/src/features/chat/components/message-content.tsx",
    operation: "macro-resolution",
    why: "The transcript renders read-only Markdown; its edit path swaps to the raw-text textarea before resolution.",
    endsWhen:
      "This exact home stops importing or calling a macro resolver, moves, or begins feeding a writable field; remove or re-review the grant and preserve token-roundtrip coverage.",
  },
  {
    id: "macro-resolution-home:message-render",
    policyId: "macro-resolution-home",
    subject: "packages/client/src/lib/message-render.ts",
    operation: "macro-resolution",
    why: "The canonical client display pipeline resolves the kit row atom into Markdown output, never a writable field.",
    endsWhen:
      "This exact home stops importing or calling a macro resolver, moves, or begins feeding a writable field; remove or re-review the grant and preserve token-roundtrip coverage.",
  },
  {
    id: "macro-resolution-home:message-row-parts",
    policyId: "macro-resolution-home",
    subject: "packages/client/src/features/chat/components/message-row-parts.tsx",
    operation: "macro-resolution",
    why: "The transcript row resolves settled reasoning and content; its editing branch returns MessageEditTextarea with the raw MessageView first.",
    endsWhen:
      "This exact home stops importing or calling a macro resolver, moves, or begins feeding a writable field; remove or re-review the grant and preserve token-roundtrip coverage.",
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
    id: "no-inline-invalidate-outside-seam:invalidation",
    policyId: "no-inline-invalidate-outside-seam",
    subject: "packages/client/src/data/invalidation.ts",
    operation: "inline-invalidate-queries",
    why: "the ONE sanctioned `invalidateQueries` call: this file owns the exhaustive event→`queryFilter()` maps that every `invalidate(event)` resolves through (UI-Gates-and-Lessons.md §11.3). It carries a second row under `client-cache-surgery-only-in-data` because that policy fences the same call at the DIRECTORY grain — two doc rows, two licences.",
    endsWhen: "the seam expresses invalidation as data consumed by the query client rather than as its own call, or the seam file moves.",
  },
  {
    id: "no-manual-memo:fuzzy-search",
    policyId: "no-manual-memo",
    subject: MANUAL_MEMO_CUSTOM_HOMES.fuzzySearch,
    operation: "manual-react-memo",
    why: "the MiniSearch index is cached on value-keyed dependencies because callers pass fresh inline field arrays. React Compiler memoizes by reference and cannot express this value-keyed cache.",
    endsWhen: "the options API requires stable option objects, or React Compiler learns value-keyed dependency semantics.",
  },
  {
    id: "no-manual-memo:media-grid",
    policyId: "no-manual-memo",
    subject: MANUAL_MEMO_CUSTOM_HOMES.mediaGrid,
    operation: "manual-react-memo",
    why: "React Compiler's installed bundle marks @tanstack/react-virtual known-incompatible, so this useVirtualizer component is skipped and its manual memo remains real work.",
    endsWhen: "the installed compiler delists @tanstack/react-virtual; tests/client/react-compiler-contract.test.ts reports that transition.",
  },
  {
    id: "no-manual-memo:message-list",
    policyId: "no-manual-memo",
    subject: MANUAL_MEMO_CUSTOM_HOMES.messageList,
    operation: "manual-react-memo",
    why: "React Compiler's installed bundle marks @tanstack/react-virtual known-incompatible, so this useVirtualizer component is skipped and its manual memo remains its only memoization.",
    endsWhen: "the installed compiler delists @tanstack/react-virtual; tests/client/react-compiler-contract.test.ts reports that transition.",
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
    id: "no-raw-egress:egress-hop",
    policyId: "no-raw-egress",
    subject: "packages/server/src/infra/network/egress.ts",
    operation: "raw-fetch",
    why: "`safeFetch`'s own home: `fetchHop` IS the guarded request every other server call is routed through. The guard cannot be built without the one raw fetch it wraps, and the scheme pin, host allowlist, resolve→validate→pin and deadline all run around this exact line.",
    endsWhen: "the guard stops issuing the request itself (a lower transport primitive takes over), at which point this row is consumed zero times and reds.",
  },
];
