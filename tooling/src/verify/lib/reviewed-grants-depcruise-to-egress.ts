// Reviewed grants: depcruise-grant-liveness, eslint-grant-liveness, firehose-import-allowlist, json-column-write-parity, knob-wire-coverage....
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

export const REVIEWED_GRANTS_DEPCRUISE_TO_EGRESS: readonly ReviewedGateGrant[] = [
  {
    id: "depcruise-grant-liveness:dist",
    policyId: "depcruise-grant-liveness",
    subject: "config.options.exclude.path[0]",
    operation: 'depcruise-zero-member-pattern:"^packages/[^/]+/dist/"',
    why: "BUILD OUTPUT: `dist/` is gitignored, so it is absent from the tracked corpus by design and present only after a build — judging it either way makes the verdict depend on machine state. The exclude is ANCHORED to workspace packages on purpose: a bare `(^|/)dist/` also matches `node_modules/<lib>/dist/` and would drop the sealed-lib import edges the satellite-seal rules fire on. Migrated from the retired gate-local RATIFIED row (#1922 / #2176), whose cite `.gitignore` is no longer liveness-checked by anything (successor citation check: #2349).",
    endsWhen: "the packages stop emitting dist/ — the exclude leaves .dependency-cruiser.cjs and this row is consumed zero times.",
  },
  {
    id: "depcruise-grant-liveness:quickjs-wasm-url",
    policyId: "depcruise-grant-liveness",
    // POSITIONAL, SO IT MOVES WHEN A RULE LANDS ABOVE IT. Re-pointed 65 → 67 (#2397, 2026-09-18): two
    // `forbidden` rules were inserted earlier in `.dependency-cruiser.cjs` and this row went STALE by
    // INDEX while its pattern stayed live and unchanged — the alarm and the finding arrived as a matched
    // pair (grant unused at [65], finding unbound at [67]), which is what makes the diagnosis mechanical.
    // Re-derive the index from the finding's own subject rather than counting rules by hand.
    // Re-pointed 67 → 68 (2026-09-20, the `@orb/inference` extraction): `vllm-surface-isolation` was
    // DELETED one rule above it and `depcruise-to-egress`'s own row count did not change, so the whole
    // tail shifted DOWN by one — the mirror of the #2397 insertion, same mechanical diagnosis.
    subject: "config.forbidden[68].to.pathNot[0]",
    operation: 'depcruise-zero-member-pattern:"^@jitl/quickjs-ng-wasmfile-release-sync/wasm\\\\?url$"',
    why: "a vite ASSET QUERY specifier (`?url`), not a module path and not a repo file: its member set is what the bundler emits at build time, which no static tree read can enumerate — dep-cruiser matches it only as an unresolvable-import exemption. Migrated from the retired gate-local RATIFIED row (#1922 / #2176), whose cite `packages/client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts` (the one importer that makes it live) is no longer liveness-checked by anything (successor citation check: #2349).",
    endsWhen:
      "the guest worker stops importing the quickjs wasm through a `?url` asset query — the exemption then leaves .dependency-cruiser.cjs and this row is consumed zero times.",
  },
  {
    id: "eslint-grant-liveness:cache",
    policyId: "eslint-grant-liveness",
    subject: "config[0].ignores[4]",
    operation: 'eslint-zero-member-selector:"**/.cache/**"',
    why: "local tools write derived, refetchable cache artifacts outside the tracked corpus, at the root and at every nesting depth, so the ignore has no tracked member by construction. The value is `**/.cache/**`, NOT `.cache/**` (#2213): a flat-config glob is anchored at the config directory, and the bare spelling left `playwright/.cache` linted. Migrated from the retired gate-local RATIFIED row (#1922), whose cite `.gitignore` is no longer liveness-checked by anything (successor citation check: #2349).",
    endsWhen:
      "the cache root changes or the repository starts tracking authored files under a `.cache` directory — the selector then gains a member or moves, and this row is consumed zero times.",
  },
  {
    id: "eslint-grant-liveness:claude-worktrees",
    policyId: "eslint-grant-liveness",
    subject: "config[0].ignores[5]",
    operation: 'eslint-zero-member-selector:"**/.claude/worktrees/**"',
    why: "agent worktrees are transient checkouts the repository never tracks, and ESLint cannot see .gitignore (flat config reads no VCS ignore file), so this selector is the only fence and has no tracked member by construction (#2281). Migrated from the retired gate-local RATIFIED row (#1922), whose cite `.gitignore` is no longer liveness-checked by anything (successor citation check: #2349).",
    endsWhen:
      "worktrees stop living inside the repository or the harness stops creating them under .claude/ — the ignore leaves the config and this row is consumed zero times.",
  },
  {
    id: "eslint-grant-liveness:dist",
    policyId: "eslint-grant-liveness",
    subject: "config[0].ignores[1]",
    operation: 'eslint-zero-member-selector:"**/dist/**"',
    why: "build output is absent from the tracked corpus by design, so the ignore has no tracked member by construction. Migrated from the retired gate-local RATIFIED row (#1922), whose cite `.gitignore` is no longer liveness-checked by anything (successor citation check: #2349).",
    endsWhen: "packages stop emitting dist/ — the ignore leaves the config and this row is consumed zero times.",
  },
  {
    id: "eslint-grant-liveness:node-modules",
    policyId: "eslint-grant-liveness",
    subject: "config[0].ignores[0]",
    operation: 'eslint-zero-member-selector:"**/node_modules/**"',
    why: "installed dependencies are absent from the tracked corpus by design, so the ignore has no tracked member by construction. Migrated from the retired gate-local RATIFIED row (#1922), whose cite `.gitignore` is no longer liveness-checked by anything (successor citation check: #2349).",
    endsWhen: "ESLint stops ignoring node_modules — the ignore leaves the config and this row is consumed zero times.",
  },
  {
    id: "eslint-grant-liveness:st-goldens-runtime",
    policyId: "eslint-grant-liveness",
    subject: "config[0].ignores[6]",
    operation: 'eslint-zero-member-selector:"scripts/probes/st-goldens/sillytavern-runtime/**"',
    why: "the st-parity rig's captured SillyTavern runtime is vendored third-party source the repository deliberately does not track; the rig's own 9 tracked files sit ABOVE this path and stay outside the fence, so the selector has no tracked member by construction (#2282). Migrated from the retired gate-local RATIFIED row (#1922), whose cite `.gitignore` is no longer liveness-checked by anything (successor citation check: #2349).",
    endsWhen:
      "the rig stops materialising a runtime under scripts/probes/ or the repository starts tracking it — the selector leaves the config or gains a member, and this row is consumed zero times.",
  },
  {
    id: "eslint-grant-liveness:stryker-tmp",
    policyId: "eslint-grant-liveness",
    subject: "config[0].ignores[3]",
    operation: 'eslint-zero-member-selector:".stryker-tmp/**"',
    why: "Stryker writes rewritten copies and generated runner setup outside the authored corpus, so the ignore has no tracked member by construction. Migrated from the retired gate-local RATIFIED row (#1922), whose cite `tooling/src/_shared/stryker-config.ts` is no longer liveness-checked by anything (successor citation check: #2349).",
    endsWhen:
      "Stryker's sandbox directory changes or mutation execution is retired — the ignore moves or leaves the config and this row is consumed zero times.",
  },
  {
    id: "firehose-import-allowlist:automation-watcher",
    policyId: "firehose-import-allowlist",
    subject: "packages/server/src/entry/compose/automation-watcher.ts",
    operation: "all-chat-firehose-reference",
    why: "The server composition root is the sole HOST-authority consumer of the unclamped all-chat stream; it injects the bounded automation operation instead of exposing the stream to a user surface.",
    endsWhen:
      "the watcher stops naming the firehose, moves, or the stream gains a caller-bound per-member clamp; central zero-use reconciliation then stales this exact row.",
  },
  {
    id: "firehose-import-allowlist:transport-barrel",
    policyId: "firehose-import-allowlist",
    subject: "packages/server/src/transport/trpc/index.ts",
    operation: "all-chat-firehose-reference",
    why: "The transport barrel republishes the canonical firehose only so the composition root can wire the HOST-authority consumer; no user-facing module receives the stream.",
    endsWhen:
      "the composition root imports the definition directly, the barrel moves, or the re-export disappears; central zero-use reconciliation then stales this exact row.",
  },
  {
    id: "json-column-write-parity:automation-rules-actions",
    policyId: "json-column-write-parity",
    subject: "automationRules.actions",
    operation: "json-column-straddle",
    why: "the only key-wise sibling is the one-shot plugin-tool wire-name migration; authored rule edits replace the whole action document.",
    endsWhen: "the migration/heal is retired, the writer provenance changes, or all writers adopt one write shape.",
  },
  {
    id: "json-column-write-parity:chats-pending-handoff-offer",
    policyId: "json-column-write-parity",
    subject: "chats.pendingHandoffOffer",
    operation: "json-column-straddle",
    why: "real offer writers replace or clear the whole offer; the key-wise sibling is the one-shot boot vocabulary rename.",
    endsWhen: "the migration/heal is retired, the writer provenance changes, or all writers adopt one write shape.",
  },
  {
    id: "json-column-write-parity:message-variants-tool-calls",
    policyId: "json-column-write-parity",
    subject: "messageVariants.toolCalls",
    operation: "json-column-straddle",
    why: "the only key-wise sibling is the one-shot plugin-tool wire-name migration; turn persistence replaces the generated list.",
    endsWhen: "the migration/heal is retired, the writer provenance changes, or all writers adopt one write shape.",
  },
  {
    id: "json-column-write-parity:preset-packaged-reseed",
    policyId: "json-column-write-parity",
    subject: "packages/server/src/domain/preset/persistence/queries.ts#reseedPackagedPreset",
    operation: "versioned-config-replace",
    why: "This explicit repair or packaged reseed writes caller-owned current-schema content rather than a degraded read of the row it replaces; refusing it would remove the recovery door.",
    endsWhen: "the function begins writing content derived from a read of the stored row, gains a dominating refusal guard, moves, or is removed.",
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
    id: "json-column-write-parity:regex-scripts-behavior",
    policyId: "json-column-write-parity",
    subject: "regexScripts.behavior",
    operation: "json-column-straddle",
    why: "the bulk placement writer reads each stored row before crossing the module boundary; the shared taint reader deliberately stops at that boundary.",
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
  // THE SIX D107 KNOB ROWS (#1584, #2283). They replace `knob-wire-coverage`'s two gate-local
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
    id: "knob-wire-coverage:section-profile",
    policyId: "knob-wire-coverage",
    subject: "USER_SETTINGS_SECTIONS.profile",
    operation: "unwritten-settings-section",
    why: "D107 — the settings-wiring remediation program: profile.avatarAssetId is live-read but the section has ZERO section-patch writers, so the user's own avatar is unsettable. Tracked debt, not a sanctioned doorway.",
    endsWhen: 'a client or compose-seed writer patches section:"profile" — central liveness then reports this row stale. Tracker: #2283.',
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
    id: "no-direct-useform:contexts",
    policyId: "no-direct-useform",
    subject: "packages/client/src/forms/editor/contexts.ts",
    operation: "tanstack-form-mint:createFormHookContexts",
    why: "the ONE `createFormHookContexts()` call the whole toolkit is built on (TanStack Form's own guidance: 'define this once'); it is split from `use-app-form.ts` only so the bound components can import the contexts without a circular edge.",
    endsWhen: "the form toolkit stops minting its own contexts (a vendor change), or the contexts move.",
  },
  {
    id: "no-direct-useform:use-app-form",
    policyId: "no-direct-useform",
    subject: "packages/client/src/forms/editor/use-app-form.ts",
    operation: "tanstack-form-mint:createFormHook",
    why: "the single `createFormHook` instance every multi-field form builds from — `useAppForm` IS this call, and it is what the rule points every surface at instead.",
    endsWhen: "the shared instance is minted somewhere else, which stales this row at its old path.",
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
    subject: "packages/ui/src/fuzzy-search/fuzzy-search.ts",
    operation: "manual-react-memo",
    why: "the MiniSearch index is cached on value-keyed dependencies because callers pass fresh inline field arrays. React Compiler memoizes by reference and cannot express this value-keyed cache.",
    endsWhen: "the options API requires stable option objects, or React Compiler learns value-keyed dependency semantics.",
  },
  {
    id: "no-manual-memo:media-grid",
    policyId: "no-manual-memo",
    subject: "packages/ui/src/primitives/media-grid/media-grid.tsx",
    operation: "manual-react-memo",
    why: "React Compiler's installed bundle marks @tanstack/react-virtual known-incompatible, so this useVirtualizer component is skipped and its manual memo remains real work.",
    endsWhen: "the installed compiler delists @tanstack/react-virtual; no-manual-memo-compiler-health reports that transition.",
  },
  {
    id: "no-manual-memo:message-list",
    policyId: "no-manual-memo",
    subject: "packages/ui/src/primitives/message-list/message-list.tsx",
    operation: "manual-react-memo",
    why: "React Compiler's installed bundle marks @tanstack/react-virtual known-incompatible, so this useVirtualizer component is skipped and its manual memo remains its only memoization.",
    endsWhen: "the installed compiler delists @tanstack/react-virtual; no-manual-memo-compiler-health reports that transition.",
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
  {
    id: "no-raw-egress:entry-compose-transport",
    policyId: "no-raw-egress",
    subject: "packages/server/src/entry/compose/services.ts",
    operation: "raw-fetch",
    why: "the composition root READS the ambient transport it INJECTS into the inference runtime (`InferenceDeps.sdkFetch`, a REQUIRED field) — the `no-raw-clock:entry-lifecycle` shape: a root that cannot read the ambient api cannot mint the one every tier below receives injected. This reference performs no egress itself and is never a user-influenced URL; provider calls are backstopped by the boot-installed global undici dispatcher (`packages/server/src/infra/network/egress.ts`), and user-influenced URLs go through `safeFetch` on a different path entirely. The row EXISTS so the fallback does not: while `sdkFetch` was optional, every runtime and backend resolved `?? globalThis.fetch` on its own, which is an ambient read this policy could not see AT THE TIME (its population was `@server` alone, and the inference package sits outside it; the policy has since been widened to `@inference` too) and which let a composed-real test reach a real inference engine.",
    endsWhen: "the transport arrives from a platform seam the root RECEIVES rather than reads here; the row is then consumed zero times and reds.",
  },
];
