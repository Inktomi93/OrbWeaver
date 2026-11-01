---
kind: plan
status: parked
blocked: wake gone docs/plans/type-law/design.md
updated: 2026-10-30
---

# Restoration register

## Goal

Record which legacy reference cases have maintained homes, so a port never repeats covered work and a ledger citation of a removed test has a place to point.

## Shape

One table of reference scopes with a porting state, a maintained home or decision, and the remaining action. Ledger, law and work docs link to it instead of to removed tests. The test-foundation plan owns the rebuild order.

### Register

Read this register before selecting reference cases to port. Follow the maintained test links and compare assertions before adding another test.

This is the current coverage index for reviewed restoration scopes, not a generated test inventory or an archive of closed work items.

| Porting state | Meaning |
| - | - |
| Accounted for | The named reference cases have maintained homes or explicit drop decisions. Do not port them again. |
| Partial | Only the named subset is compared. Preserve its coverage and inspect the listed remainder. |
| Unreviewed | No complete case comparison is recorded. This does not mean tests or implementation are missing. |

Porting state and runtime qualification are separate. An implemented case awaiting execution needs qualification, not a second implementation.

Legacy paths below are relative to the external reference source named in [Spine-Testing](../../law/Spine-Testing.md#2-the-tree).

| Reference scope | State | Home or drop reason | Remaining |
| - | - | - | - |
| `kit/macro/metadata.test.ts`; `kit/handle-key/index.test.ts` | Partial | `tests/kit/macro/argument-enforcement.test.ts`; `tests/kit/handle-key/unicode-version.repo.int.test.ts` | Registry completeness, autocomplete, unknown-macro diagnostics and other handle-key cases need separate comparison. |
| `kit/theme-derivation/accepted-base-foreground.suite.test.ts`; `kit/theme-derivation/index.test.ts` | Partial | `tests/kit/theme-derivation/accepted-base-foreground.test.ts`; `tests/ui/content/theme-scope/emitted-contrast.ct.tsx` | Unrelated elevation, charts, prose and round-trip reference groups need separate comparison. |
| `client/features/chat/surfaces/worst-legal-art-contrast.suite.ct.tsx` | Unreviewed | `tests/ui/content/theme-scope/emitted-contrast.ct.tsx` | Compare the worst-legal-art contrast case against the live legibility solver before porting; the measurement helpers it used live behind `@orb/testkit/browser/spec`. |
| `db/query/check-list.test.ts` | Accounted for | `tests/db/query/check-list.test.ts` | - |
| `db/client.int.test.ts` | Partial | The database reset script and function are deleted with the boot reset path (D163), so no reset-script case remains. | Compare remaining migration, backup, integrity, tuning and forecast cases individually. |
| `client/features/chat/anchors/join-invite-dialog.ct.tsx` | Accounted for | `tests/client/features/chat/anchors/join-invite-dialog.ct.tsx`; `tests/client/lib/invite-copy.dom.test.ts` | - |
| `client/features/auth/components/login-pending-join.ct.tsx` | Accounted for | `tests/client/features/auth/components/login-pending-join.ct.tsx`; `tests/client/lib/invite-copy.dom.test.ts`; `tests/e2e/oidc-pending-join.oidc.spec.ts` | The unavailable-state CT exercises return to sign-in without confirmation. The OIDC journey is qualified, including stored-token retirement and preservation of unrelated URL/history state. |
| `client/routes/app-root.ct.tsx` | Accounted for | `tests/e2e/smoke.spec.ts`; `tests/e2e/corpus-home-launch.spec.ts`; `tests/e2e/corpus-shell.spec.ts`; `tests/e2e/corpus-workbench.spec.ts`; `tests/client/features/persona/anchors/first-run-persona-dialog.ct.tsx`; `tests/client/features/app-shell/surfaces/section-roster-census.ct.tsx`; `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx`; `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx`; `tests/client/features/discovery/lib/corpus-explore-empty.ct.tsx`; `tests/client/lib/census-title.dom.test.ts` | - |
| `client/routes/route-pending.ct.tsx` | Accounted for | `tests/client/routes/route-pending.ct.tsx` | - |
| `client/routes/router.ct.tsx` | Accounted for | `tests/e2e/oidc-pending-join.oidc.spec.ts`; `tests/e2e/corpus-signed-out.local.spec.ts` | - |
| `client/routes/stuck-splash.suite.ct.tsx` | Accounted for | `tests/e2e/corpus-shell.spec.ts` | - |
| `client/features/app-shell/surfaces/app-shell.ct.tsx` | Accounted for | `tests/e2e/smoke.spec.ts`; `tests/e2e/corpus-home-launch.spec.ts`; `tests/e2e/corpus-shell.spec.ts`; `tests/client/state/panel-resolve.test.ts`; `tests/client/features/app-shell/lib/command-shortcut-label.test.ts`; `tests/client/lib/census-title.dom.test.ts`; `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx`; `tests/client/features/app-shell/surfaces/list-arrival-focus.ct.tsx`; `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx`; `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx`; `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx`; `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx`; `tests/client/features/app-shell/surfaces/app-shell-notices.ct.tsx`; `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` | - |
| `client/features/app-shell/components/shell-topbar.ct.tsx`; `client/features/app-shell/components/rail.ct.tsx`; `client/features/app-shell/components/you-sheet.ct.tsx`; `client/features/app-shell/components/boot-veil.ct.tsx` | Accounted for | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx`; `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx`; `tests/e2e/corpus-workbench.spec.ts`; `tests/client/features/app-shell/components/rail-active-tone.ct.tsx`; `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx`; `tests/e2e/corpus-shell.spec.ts`; `tests/client/features/app-shell/components/boot-veil.ct.tsx`; `tests/client/features/app-shell/surfaces/mobile-bar.ct.tsx` | - |
| `client/features/app-shell/hooks/use-appearance-root-effects.ct.tsx`; `client/state/appearance-boot-hint.ct.tsx`; `client/state/appearance-boot-hint.test.ts` | Accounted for | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx`; `tests/e2e/corpus-shell.spec.ts`; `tests/client/routes/route-pending.ct.tsx`; `tests/client/state/appearance-boot-hint.ct.tsx` | - |
| `client/state/assemble-chrome.test.ts`; `client/state/panel-resolve.test.ts`; `client/features/app-shell/lib/command-shortcut-label.test.ts` | Accounted for | `tests/client/state/panel-resolve.test.ts`; `tests/client/features/app-shell/lib/command-shortcut-label.test.ts`; `tests/client/state/registry-definitions.dom.test.ts`; `tests/client/state/assemble-chrome.dom.test.ts` | - |
| Chat permissions and history | Partial | Keep the maintained integration and browser cases in the selected case map. | Do not label the entire chat domain restored. Compare additional reference cases individually. |
| `server/entry/http/join.test.ts` | Partial | `tests/server/entry/http/auth-meta.int.test.ts` | Compare the encoded-token assertion with maintained coverage before adding it. |
| `server/entry/compose/embedding-connection.test.ts` | Partial | `tests/inference/roles/runtime-authority.int.test.ts` | Missing-generation, search fallback, fingerprint and promotion behavior needs separate comparison. Constructor-based pinned-resolver cases are not production-root precedent. |
| `client/features/credentials/components/connection-editor.ct.tsx` | Partial | `tests/client/features/credentials/components/connection-prompt-cache.ct.tsx` | Other editor cases, including coalescing, reset, diagnostics, repair, removal and provider selection, need separate comparison. This does not qualify the full credentials surface. |
| `server/entry/boot/seed-atlas-realm-dates.suite.test.ts`; `server/entry/boot/seed-atlas-import-outcome.suite.test.ts` | Accounted for | `tests/showcase-plugins/atlas-dates.int.test.ts`; `tests/showcase-plugins/atlas-import-outcome.int.test.ts` | - |
| `server/infra/plugin-host/process-runtime.test.ts`; `server/infra/plugin-host/heap-growth.suite.test.ts` | Partial | `tests/server/infra/plugin-host/process-runtime.int.test.ts`; `tests/server/infra/plugin-host/heap-growth.int.test.ts` | Broker-descendant loss, parent-process death, RSS pressure, scale, Worker wall-time expiry and broader cold-source lifecycle cases need separate comparison. Do not infer them from direct-child teardown or the parent scheduler. |
| `server/domain/chat/substrate/wire-history.test.ts`; `db/query/chat-visibility.int.test.ts` | Unreviewed | Existing chat coverage remains authoritative for its named behaviors. | Complete case-by-case comparison; neither file is declared missing or obsolete. |
| `client/data/invalidation-initial-read.suite.test.ts` | Partial | `tests/client/data/invalidation-initial-read.dom.test.ts` | Compare canonical-view carrier coverage. Restore native view-transition settlement only in a browser case; headless coalescing does not qualify it. |
| `client/data/bus/post-event-source.test.ts`; `client/data/bus/post-event-source.int.test.ts` | Partial | `tests/client/data/bus/post-event-source.dom.test.ts` | Remaining comparison includes parser boundaries, malformed connected metadata, serialized errors, live idle expiry and private retry-option cases. The case decisions define the tested boundary. |
| `client/data/auth-config.test.ts` | Accounted for | `tests/client/data/auth-config.dom.test.ts`; `tests/contracts/auth-config/bootstrap.contract.test.ts`; `tests/server/entry/http/auth-meta.int.test.ts` | - |
| `client/components/list-pane-header.ct.tsx` | Partial | `tests/client/components/list-pane-header.ct.tsx` | Exact token spacing and baseline alignment remain open. Mobile band shedding, retained scoped/action rows, desktop shell behavior and device-pixel alignment need real-shell coverage. Drop the copied shell fixture and custom audit-ratio calculation, not those behaviors. |
| Feature list headers: character, discovery, plugin and databank | Accounted for | `tests/client/features/discovery/hooks/corpus-list-header.ct.tsx`; `tests/client/features/discovery/lib/corpus-vocabulary.test.ts`; `tests/client/features/plugin/hooks/extensions-list-header.ct.tsx`; `tests/client/features/databank/hooks/databank-list-header.ct.tsx`; `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx`; `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx` | - |
| `contracts/rpg/structured-patch.contract.test.ts`; `contracts/rpg/structured-round.contract.test.ts`; `server/entry/compose/rpg-structured-round.suite.test.ts` | Partial | `tests/contracts/rpg/structured-patch-public-contract.contract.test.ts` | Numeric preference, second-actor split invocation, interleaved actors, broader intent/loss records and composed planner/retry cases remain separate restoration work. |
| `contracts/rpg/tracker.contract.test.ts`; `server/domain/rpg/substrate/delta.test.ts`; `server/domain/rpg/substrate/reminder.test.ts`; `server/domain/rpg/chat-ops/macro-view.test.ts` | Partial | `tests/server/domain/rpg/persistence/tracker-delta-snapshot.int.test.ts` | Remaining pure reader, carrier, formatter, guide and reminder cases need individual comparison. Helper-specific gloss identities are dropped under D113; actual hinted delta behavior remains qualified. |
| `contracts/prose/index.contract.test.ts`; `contracts/preset/st-preset-import.contract.test.ts`; `contracts/theme/card-embeddable-partition.suite.test.ts` | Partial | `tests/contracts/prose/preset-storage.contract.test.ts`; `tests/contracts/preset/st-preset-import.contract.test.ts`; `tests/contracts/theme/card-embeddable-projection.contract.test.ts` | Unselected prose resolution, substitution, footer, historical byte fixtures and broader default/lift/theme cases need individual comparison. |
| `contracts/automation/index.contract.test.ts`; `contracts/automation/presets.contract.test.ts`; `contracts/stream/index.contract.test.ts`; `contracts/stream/index.test-d.ts` | Partial | `tests/contracts/automation/preset-view.contract.test.ts`; `tests/contracts/stream/room-inputs.contract.test.ts`; `tests/contracts/stream/frame-contract.test-d.ts`; `tests/contracts/events/bus-registry.test-d.ts` | Broader trigger, authored-action, fact-projection, helper and actual subscription/lifecycle matrices remain separate restoration work. |
| `contracts/inference/kinds.contract.test.ts`; `contracts/inference/capability/capability.contract.test.ts`; `contracts/inference/capability/capability.test-d.ts` | Accounted for | `tests/contracts/inference/capability/capability.contract.test.ts`; `tests/contracts/inference/capability/capability.test-d.ts` | - |
| `contracts/inference/connection-ref.contract.test.ts` | Partial | `tests/contracts/correlated-variants.contract.test.ts` | Bare-id prefix/missing/model-stripping, mounted selector, ownership and migrated-SQL purposes are not inferred from this parser case. |
| `contracts/chat/roster.contract.test.ts` | Partial | `tests/contracts/roster-preset/character-members.contract.test.ts` | Remaining invite, view-shape and rendering-policy cases need individual comparison; parser tests do not prove authorization. |
| `contracts/memory/index.contract.test.ts` | Accounted for | Drop tuple/schema-only assertions for unimplemented clip vocabulary with its unused production file. | - |
| Reranker-live probe behavior cases (Git reference `821e8f8dff^`); `server/domain/chat/memory/recall/`; `server/domain/chat/memory/memory-recall-trace.suite.int.test.ts`; `server/domain/chat/memory/memory-recall-eval.suite.int.test.ts`; `server/domain/chat/engine/rerank-pick.test.ts`; `server/domain/search/substrate/rerank.test.ts`; `inference/backends/openai-compat/rerank.test.ts`; `contracts/inference/capability/rerank.contract.test.ts` | Partial | `tests/server/domain/search/verbs/rerank-consumers.suite.int.test.ts`; `tests/server/domain/connection/persistence/local-light-seed-upgrade.int.test.ts`; `tests/server/domain/chat/persistence/authority-boundary-rows.int.test.ts`; `tests/server/domain/connection/local-light-cold-cache.suite.int.test.ts` | The recall pipeline and knob cases are built in recall pipeline; the tier-1 straddle and phase event cases are in the same suite, and the fail-closed missing span cases are in scoped digest horizon and recall missing span (item 1302); the bridge, format, window, query and unscorable-placement rules and the name and ambiguity rules are unit tested in kit and address; the `rerankPick` ban, rank order, blank-name, window clip and Stop cases run composed in rerank pick (item 1303). The cold-cache case is written (item 1304); its opted-in download run is owed on a quiet box. |
| `contracts/theme/pairing.suite.test.ts`; selected ThemeScope clamp/render cases | Partial | `tests/contracts/theme/pairing.dom.test-d.ts`; `tests/ui/content/theme-scope/token-boundary.ct.tsx` | Broader contextual-color, portal, ambient, elevation and invalid-container cases need separate comparison. |
| `ui/art/web-weave/web-weave-geometry.dom.test.ts`; selected shared-math purposes | Partial | `tests/ui/art/web-weave/geometry.dom.test.ts` | Radius attachment, birth windows, time monotonicity, measured lengths, strict dew-distance and broader spider/physics cases need separate comparison. |
| `ui/charts/meter/waystone-treatment.dom.test.ts` | Partial | `tests/ui/charts/meter/waystone.ct.tsx` | Remaining weather, celestial, phase and dial cases need separate comparison. |
| `ui/layout/toolbar.ct.tsx`; `ui/primitives/accordion/accordion.ct.tsx` | Accounted for | `tests/ui/layout/toolbar-native-parts.ct.tsx`; `tests/ui/primitives/accordion/accordion-native-parts.ct.tsx` | - |
| Selected Field validity and PickerCell cases | Partial | `tests/ui/primitives/field/field-native-parts.ct.tsx`; `tests/ui/primitives/radio-group/picker-native-parts.ct.tsx` | Other Field composition, styling and hint cases, and the standalone presentation-only frame, remain unselected. |
| Selected Dialog, AlertDialog, Drawer, Menu, Popover and Tooltip native-part cases | Partial | Maintained `native-parts.ct.tsx` suites under each mirrored primitive preserve selected payload, interaction, lifecycle and description behavior. | Unselected layout, motion and broader native matrices need separate comparison. |
| Selected client state draft, selection, preset and steer cases | Partial | `tests/client/state/state-lifecycle.ct.tsx`; `tests/client/state/composer-replacement.dom.test.ts` | Persistence, reload, caps, source isolation, surface measurement and actual-bus frame scheduling need separate comparison. |
| `client/data/session-freshness.test.ts`; selected durable-local cases | Partial | `tests/client/data/session-freshness.ct.tsx`; `tests/client/state/durable-local-binding.ct.tsx` | Storage refusal, failed adoption, queued transitions, held hydration and broader multiple-store permutations remain unselected. |
| Selected client transition, safe error, role and destination cases | Partial | `tests/client/lib/core-lifecycle.ct.tsx`; `tests/client/lib/connection-roles.dom.test.ts`; `tests/client/lib/corpus-destination.dom.test-d.ts` | Broader transition timing/motion/failure, error-cap/frame and role readout/repair matrices need separate comparison. |
| Selected client empty-send, duration and template cases | Partial | `tests/client/features/chat/lib/empty-send-and-duration.test.ts`; `tests/client/features/preset/lib/template-addresses.test.ts` | Template delivery dispatch and unselected helper cases need separate comparison. Feature component forwards do not establish obsolete behavior. |
| `client/a11y/accessible-name-quality.suite.ct.tsx` | Unreviewed | No maintained home; | - |
| `client/data/create-entity-mutation.ct.tsx` | Unreviewed | No maintained home; | - |
| `client/data/stale-session.test.ts` | Unreviewed | No maintained home; | - |
| `client/features/character/lib/character-library-lens.test.ts` | Unreviewed | No maintained home; | - |
| `client/features/chat/components/appearance-message-style-section.ct.tsx` | Accounted for | `tests/client/features/chat/components/appearance-message-style-section.ct.tsx`; `tests/client/features/config/surfaces/platform-settings-composition.suite.ct.tsx`; `tests/client/components/platform-setting-choices.suite.ct.tsx` | - |
| `client/features/chat/components/chat-options-menu.ct.tsx` | Unreviewed | No maintained home; | - |
| `client/features/chat/surfaces/chat-list-surface.ct.tsx` | Unreviewed | No maintained home; | - |
| `client/features/chat/surfaces/message-list-surface.ct.tsx` | Unreviewed | No maintained home; | - |
| `client/features/config/surfaces/config-content-surface.ct.tsx` | Unreviewed | No maintained home; | - |
| `client/features/plugin/lib/chat-anchors.ct.tsx` | Unreviewed | No maintained home; | - |
| `client/features/rpg/components/rpg-game-door.ct.tsx` | Unreviewed | No maintained home; | - |
| `client/features/rpg/lib/dice-composer-media.ct.tsx` | Unreviewed | No maintained home; | - |
| `client/features/workloads/components/schedules-section.ct.tsx` | Unreviewed | No maintained home; | - |
| `client/lib/session-channel.test.ts` | Unreviewed | No maintained home; | - |
| `client/state/create-persisted-store.test.ts` | Unreviewed | No maintained home; | - |
| `contracts/card-face/index.contract.test.ts` | Unreviewed | No maintained home; | - |
| `contracts/chat/producers.contract.test.ts` | Unreviewed | No maintained home; | - |
| `contracts/rpg/ruleset.contract.test.ts` | Unreviewed | No maintained home; | - |
| `default-content/index.test.ts` | Unreviewed | No maintained home; | - |
| `inference/backends/agent-sdk/env.test.ts` | Unreviewed | No maintained home; | - |
| `inference/backends/anthropic-messages/chat.test.ts` | Accounted for | `tests/inference/backends/anthropic-messages/chat-wire.int.test.ts`; `tests/inference/conformance/unsupported-settings.suite.int.test.ts`; `tests/server/foundation/observability/provider-turn-span-events.int.test.ts` | - |
| `inference/backends/openai-compat/body.test.ts` | Accounted for | `tests/inference/backends/openai-compat/body-shaping.int.test.ts` | - |
| `inference/backends/openai-compat/diagnostics.test.ts` | Accounted for | `tests/inference/backends/openai-compat/endpoint-inspection.int.test.ts`; `tests/support/node/corpus-connection.int.test.ts` | None beyond the security batch. |
| `inference/registry/providers.test.ts` | Accounted for | `tests/server/domain/connection/persistence/provider-rows.int.test.ts`; `tests/server/domain/plugin/activation/provider-contributions.suite.int.test.ts`; `tests/server/domain/connection/persistence/registry-publication-order.int.test.ts` | - |
| `server/domain/character/persistence/plugin-card-data.int.test.ts` | Accounted for | `tests/server/domain/character/persistence/plugin-card-data.int.test.ts`; `tests/server/domain/plugin/substrate/guest-installer-scope.suite.int.test.ts` | - |
| `server/domain/chat/assembly/shape-system-row-placement.test.ts` | Unreviewed | No maintained home; | - |
| `server/domain/chat/persistence/identity.int.test.ts` | Accounted for | `tests/server/domain/chat/persistence/identity.int.test.ts` | - |
| `server/domain/chat/persona-resolution.suite.int.test.ts` | Accounted for | `tests/server/domain/chat/persona-resolution.suite.int.test.ts`; `tests/server/domain/chat/assembly/turn-personas.int.test.ts`; `tests/server/domain/chat/verbs/prompt-config-triggerer.suite.int.test.ts` | - |
| `server/domain/chat/substrate/backfill-estimate.int.test.ts` | Partial | `tests/server/domain/chat/substrate/backfill-estimate.int.test.ts` | Consolidation parents above tier zero and an import window over a very large chat set. |
| `server/domain/chat/substrate/teaching.int.test.ts` | Partial | `tests/server/domain/chat/verbs/turn-teaching.suite.int.test.ts`; `tests/server/domain/chat/verbs/turn-offer-choices.suite.int.test.ts` | The order of host rows against the state block at one depth. |
| `server/domain/chat/substrate/teaching.test.ts` | Accounted for | `tests/server/domain/chat/verbs/turn-offer-choices.suite.int.test.ts`; `tests/server/domain/chat/verbs/turn-teaching.suite.int.test.ts` | - |
| `server/domain/chat/teaching-contribution.test.ts` | Accounted for | `tests/server/domain/chat/verbs/turn-teaching.suite.int.test.ts` | - |
| `server/domain/chat/verbs/read.int.test.ts` | Partial | `tests/server/domain/chat/verbs/read-gates.int.test.ts`; `tests/server/domain/chat/verbs/read-preview-honesty.int.test.ts`; `tests/support/node/corpus-chat-outputs.int.test.ts` | The groups the case map marks Open: fit preview, effective regex, library projections, owned-character fields, the hidden-content cases that need a deception game, and the single-fixture cases. |
| `server/domain/connection/persistence/provider-rows.int.test.ts` | Accounted for | `tests/server/domain/connection/persistence/provider-rows.int.test.ts`; `tests/db/schema/provider-row-namespace.int.test.ts` | - |
| `server/domain/embeddings/verbs/embed-assets.int.test.ts` | Partial | `tests/server/domain/embeddings/persistence/image-sweep-rows.int.test.ts`; `tests/support/node/factories/embedding-images.int.test.ts`; `tests/support/node/corpus-image-variants.int.test.ts` | Vanished-asset skip, half-embedded resume, text-only Utility quote, pre-facet caption rows, fused caption body, local-light caption and the refused joint-encoder update need separate work. |
| `server/domain/plugin/activation/provider-contributions.suite.int.test.ts` | Accounted for | `tests/server/domain/plugin/activation/provider-contributions.suite.int.test.ts`; `tests/server/domain/plugin/persistence/provider-crash-window.int.test.ts`; `tests/contracts/plugin/manifest-providers.contract.test.ts` | - |
| `server/domain/plugin/persistence/distributed-plugins.int.test.ts` | Accounted for | `tests/server/domain/plugin/persistence/distributed-plugins.int.test.ts`; `tests/contracts/plugin/view.contract.test.ts`; `tests/support/node/corpus-plugin.int.test.ts` | - |
| `server/domain/plugin/substrate/bridge.test.ts` | Accounted for | `tests/server/domain/plugin/verbs/ui-host-call-bridge.int.test.ts`; `tests/server/domain/plugin/substrate/call-floors.test.ts`; `tests/server/domain/plugin/substrate/guest-lore-write.suite.int.test.ts`; `tests/server/domain/plugin/substrate/guest-installer-scope.suite.int.test.ts`; `tests/server/domain/plugin/substrate/guest-room-reads.suite.int.test.ts`; `tests/server/domain/plugin/substrate/guest-call-floors.suite.int.test.ts` | - |
| `server/domain/rpg/authority.suite.int.test.ts` | Accounted for | `tests/server/domain/rpg/verbs/authority.suite.int.test.ts` | - |
| `server/domain/rpg/stale-actor-key.suite.int.test.ts` | Accounted for | `tests/contracts/rpg/actor-ref.contract.test.ts`; `tests/server/domain/rpg/persistence/stale-actor-key.int.test.ts` | - |
| `server/domain/rpg/verbs/game/update-config.int.test.ts` | Accounted for | `tests/server/domain/rpg/verbs/update-config.int.test.ts`; `tests/contracts/rpg/update-config-input.contract.test.ts` | - |
| `server/domain/sessions/contract/service.test-d.ts` | Unreviewed | No maintained home; | - |
| `server/domain/sessions/substrate/decide-provision.test.ts` | Unreviewed | No maintained home; | - |
| `server/domain/sessions/verbs/provision-identity-owner-claim.int.test.ts` | Unreviewed | No maintained home; | - |
| `server/domain/sessions/verbs/provision-identity.int.test.ts` | Unreviewed | No maintained home; | - |
| `server/domain/settings/seed-theme-pairing.suite.test.ts` | Accounted for | `tests/server/domain/settings/seed-theme-pairing.suite.test.ts` | - |
| `server/domain/share/certificate/controller.test.ts` | Unreviewed | No maintained home; | - |
| `server/domain/share/substrate/certificate-refusal.test.ts` | Unreviewed | No maintained home; | - |
| `server/domain/share/substrate/refusal.test.ts` | Unreviewed | No maintained home; | - |
| `server/domain/workloads/verbs/estimate-model-calls.int.test.ts` | Accounted for | `tests/server/domain/workloads/persistence/every-owner-authority.int.test.ts`; `tests/server/domain/workloads/persistence/funded-tenant-rows.int.test.ts`; `tests/server/domain/refinery/persistence/score-sweep-rows.suite.int.test.ts`; `tests/server/domain/workloads/verbs/estimate-model-calls.int.test.ts`; `tests/server/domain/workloads/persistence/estimate-poison-row.int.test.ts` | - |
| `server/entry/app.test.ts` | Partial | `tests/e2e/csrf-gates.local.spec.ts`; `tests/server/entry/trpc-batch-budget.int.test.ts` | Compare the remaining mount, header, rate-limit response and error-classification cases individually. |
| `server/entry/boot/boot-secrets.int.test.ts` | Accounted for | `tests/server/entry/boot/boot-secrets.int.test.ts`; `tests/server/entry/boot/identity-ownership.int.test.ts` | - |
| `server/entry/boot/disclaimer.test.ts` | Accounted for | `tests/server/entry/boot/disclaimer.test.ts` | - |
| `server/entry/boot/migrate-data-layout.int.test.ts` | Accounted for | `tests/server/entry/boot/persistence/migrate-data-layout.int.test.ts` | - |
| `server/entry/boot/migrate.int.test.ts` | Accounted for | `tests/server/entry/boot/persistence/migrate.int.test.ts`; `tests/db/schema/chat-freeze-provenance.repo.int.test.ts` | - |
| `server/entry/child-env.suite.int.test.ts` | Unreviewed | No maintained home; | - |
| `server/entry/compose/databank.int.test.ts` | Accounted for | `tests/server/domain/settings/verbs/get-databank-settings.int.test.ts`; `tests/support/node/corpus-databank.int.test.ts` | - |
| `server/entry/compose/services.test.ts` | Accounted for | `tests/server/domain/embeddings/persistence/autoindex-gate.int.test.ts`; `tests/server/domain/persona/verbs/remove-repoint.int.test.ts`; `tests/server/domain/connection/verbs/embed-space-rebuild.int.test.ts`; `tests/server/domain/persona/verbs/seat-persona.int.test.ts`; `tests/server/domain/automation/engine/dispatch.int.test.ts`; `tests/server/domain/embeddings/persistence/memory-scope-completion.suite.int.test.ts`; `tests/server/domain/embeddings/persistence/asset-created-lenses.int.test.ts` | - |
| `server/entry/http/auth-routes.int.test.ts` | Unreviewed | No maintained home; | - |
| `server/entry/http/auth-routes.test.ts` | Unreviewed | No maintained home; | - |
| `server/entry/http/security-headers.test.ts` | Unreviewed | No maintained home; | - |
| `server/entry/http/spa.test.ts` | Unreviewed | No maintained home; | - |
| `server/entry/import/bundle-round-trip.suite.int.test.ts` | Accounted for | `tests/server/domain/import/loader/library-planes.int.test.ts`; `tests/server/domain/import/loader/import-bundle.int.test.ts`; `tests/server/entry/http/portability-routes.int.test.ts` | - |
| `server/entry/import/import-identity.suite.int.test.ts` | Accounted for | `tests/server/entry/http/import-identity.int.test.ts`; `tests/client/data/import-tree-plan.int.test.ts` | - |
| `server/entry/lifecycle-host-allowlist.suite.int.test.ts` | Unreviewed | No maintained home; | - |
| `server/entry/lifecycle-share-container.suite.int.test.ts` | Unreviewed | No maintained home; | - |
| `server/entry/oidc-signup-roundtrip.suite.int.test.ts` | Unreviewed | No maintained home; | - |
| `server/entry/session-cookie-parity.suite.test.ts` | Unreviewed | No maintained home; | - |
| `server/foundation/data-layout/index.test.ts` | Accounted for | `tests/server/foundation/data-layout/index.test.ts`; `tests/server/foundation/data-layout/persistence/file-identity.int.test.ts` | - |
| `server/foundation/env/bind.test.ts` | Unreviewed | No maintained home; | - |
| `server/foundation/env/child-env-secrets.suite.test.ts` | Unreviewed | No maintained home; | - |
| `server/foundation/env/env-file-load.test.ts` | Accounted for | `tests/server/foundation/env/env-file-load.int.test.ts` | - |
| `server/foundation/env/fallback-peers.test.ts` | Unreviewed | No maintained home; | - |
| `server/foundation/env/file-secrets.suite.test.ts` | Unreviewed | No maintained home; | - |
| `server/foundation/env/floor-defaults.test.ts` | Accounted for | `tests/server/foundation/env/record/floor-defaults.test.ts`; `tests/server/foundation/env/host-env-allowlist.int.test.ts` | - |
| `server/infra/auth/dispatch.test.ts` | Unreviewed | No maintained home; | - |
| `server/infra/auth/forwarded.test.ts` | Unreviewed | No maintained home; | - |
| `server/infra/auth/transport.test.ts` | Unreviewed | No maintained home; | - |
| `server/infra/crypto/key.test.ts` | Unreviewed | No maintained home; | - |
| `server/infra/network/egress-attack.suite.int.test.ts` | Unreviewed | No maintained home; | - |
| `server/infra/network/egress.int.test.ts` | Unreviewed | No maintained home; | - |
| `server/infra/network/egress.test.ts` | Unreviewed | No maintained home; | - |
| `server/infra/network/ingress.test.ts` | Unreviewed | No maintained home; | - |
| `server/infra/plugin-host/` | Unreviewed | No maintained home; | - |
| `server/infra/plugin-host/_broker-containment-proof.ts` | Unreviewed | No maintained home; | - |
| `server/infra/plugin-host/broker-supervision.suite.test.ts` | Unreviewed | No maintained home; | - |
| `server/infra/plugin-host/membrane.test.ts` | Unreviewed | No maintained home; | - |
| `server/infra/plugin-host/process-permission.test.ts` | Partial | `tests/server/infra/plugin-host/worker-permission-drop.int.test.ts` | Compare the main-thread and Worker read denials (data-dir key, `.env`, workspace root, `/proc/<pid>/environ`), the allowed code read, the `node:sqlite` removal, and the spawn and network denials. |
| `server/infra/relay/pin.test.ts` | Unreviewed | No maintained home; | - |
| `server/primitives/serde/card/index.test.ts` | Accounted for | `tests/server/primitives/serde/card/card-serde.contract.test.ts`; `tests/server/domain/import/loader/import-bundle.int.test.ts` | - |
| `server/primitives/serde/chat-bundle/index.test.ts` | Accounted for | `tests/server/primitives/serde/chat-bundle/chat-bundle-serde.contract.test.ts`; `tests/server/domain/rpg/persistence/portable-json-boundaries.int.test.ts` | - |
| `server/transport/cross-tenant-sweep.suite.int.test.ts` | Unreviewed | No maintained home; | - |
| `showcase-plugins/index.test.ts` | Unreviewed | No maintained home; | - |
| `ui/art/web-weave/web-weave-glow.ct.tsx` | Unreviewed | No maintained home; | - |
| `ui/content/sandbox-frame/sandbox-frame.ct.tsx` | Unreviewed | No maintained home; | - |
| `ui/content/theme-scope/clamp.test.ts` | Unreviewed | No maintained home; | - |
| `ui/content/theme-scope/emit-surface.suite.test.ts` | Accounted for | `tests/ui/content/theme-scope/emit-surface.test.ts` | - |
| `ui/content/theme-scope/palette-contrast.suite.test.ts` | Partial | `tests/ui/content/theme-scope/emitted-contrast.ct.tsx`; `tests/ui/token-contract.test.ts`; `tests/ui/content/theme-scope/input-border.test.ts` | Compare the remaining reference cases: the D159 two-sided input-border pin per seed, chart and track 3:1 per seed, the reading plate, band and elevation literals per seed, and the seed prose inks. |
| `ui/content/theme-scope/token-classification.suite.test.ts` | Unreviewed | No maintained home; | - |
| `ui/primitives/dialog/dialog.ct.tsx` | Unreviewed | No maintained home; | - |
| `ui/primitives/input/input.ct.tsx` | Unreviewed | No maintained home; | - |
| `ui/primitives/popover/popover.ct.tsx` | Unreviewed | No maintained home; | - |
| `ui/primitives/switch/switch.ct.tsx` | Unreviewed | No maintained home; | - |
| `ui/primitives/tabs/tabs.ct.tsx` | Unreviewed | No maintained home; | - |
| `ui/primitives/toast/toast.ct.tsx` | Unreviewed | No maintained home; | - |
| `ui/styles/css-structure.suite.test.ts` | Unreviewed | No maintained home; | - |
| `ui/tokens/index.test.ts` | Unreviewed | No maintained home; | - |
| `ui/tokens/theme-emit-pairing.suite.test.ts` | Accounted for | `tests/ui/content/theme-scope/emit-surface.test.ts` | - |

An unlisted area is unreviewed, not missing. Neither filenames nor test counts establish whether its behaviors need restoration.

Update the existing row with its replacement commit's changes; do not append another completion record for the same scope. Name uncovered cases when marking a scope partial. Keep links to maintained tests here when the owning work item closes. A completed row may reopen only with a specific missing behavior, failing regression or changed product contract.

## Choosing what to test (not yet built)

Status: parked until the type plan and cleanup finish. A read-only report, never a gate. A presence gate produced filler before, and the report must not recreate one.

The unit is an outcome at an edge, not a file, verb or export.

1. Edges come from one generic list: each package's exports map, plus registries where the real entry is dynamic, such as tRPC procedures, HTTP routes, jobs and section registries. Config is data, with no per-package code.
2. Keep callable edges only: functions, components, hooks and schemas. Drop types, constants and re-exports.
3. Derive outcomes from types: success, each typed error, each union member. Schemas owe accept and refuse. Components owe loading, error and empty states.
4. The edge's kind suggests the layer from `docs/law/Spine-Testing.md` §10. It is a suggestion.

Evidence of reach: native V8 coverage used as a hit map, never a percentage, reported separately for Vitest and Playwright. A hit does not prove an assertion. Refusals match on error classes through `orb/no-bare-throw-assertion`, so failure paths are exact and success paths stay softer.

Rank the worklist by writes and authorization, then complexity times change frequency, then unasserted outcomes, then defect history. Filter barrels and composition files. Weight a fix commit by how few files it touches, and divide by file size. Mark code that changed since its last hit as a gap.

The highest-risk modules get hand-planted mutants in a lane brief: a throwaway script that edits one line, runs named tests, records the result and reverts. Keep nothing in the repository.

A case judged not worth a test is recorded once with its reason.

First step: run the ledger read-only on `packages/kit` and `domain/tag`. Stop if the output is noise.

Rejected: a test per export, because constants and re-exports produce filler; StrykerJS, because it needed a sandbox patch, an ignorer plugin and a gate, and was deleted for its upkeep; a coverage percentage, because it does not show that a test asserts behavior.

## Rejected

Citing removed legacy test paths in rulings: the paths no longer resolve, so the proof is lost.

## Coupled sites

Every ruling that cites a register entry; the test-foundation plan; AGENTS.md Test layout.

## Test plan

The governed-docs check keeps every link and path in this register live.
