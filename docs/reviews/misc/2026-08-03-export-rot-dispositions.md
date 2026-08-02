---
kind: review
status: executed
updated: 2026-08-03
---

# Export-rot dispositions (lane CLEAN)

> **ONE-SHOT APPLIED RECORD — executed 2026-08-03. Its staleness is deliberate; do not "fix" it.** This table
> is the input its codemod (`scripts/codemods/export-rot-cleanup.ts`) has ALREADY consumed: it describes the
> tree as it stood BEFORE the apply and is intentionally not updated to the tree after. Re-running the codemod
> therefore ABORTS on the first already-applied row (`no exported "X" in …` / `edit target not found`), and
> that abort is CORRECT — the assert's "the table is stale" hint is written for a pre-apply run; post-apply it
> means the work is done, not that a row needs repairing. Read this file as HISTORY. To act on export rot
> again, re-run the lenses (`pnpm ast orphans|testonly`) and write a NEW dated table with its own executor.

The reviewed artifact for the export-rot sweep. **One row per export**: name · file:line · verdict ·
evidence · action taken. The codemod (`scripts/codemods/export-rot-cleanup.ts`) is DATA-DRIVEN off this
table — the table is the source, the codemod is the executor.

## Method (every row was upgraded from "candidate" to confirmed before acting)

1. **`pnpm ast orphans|testonly <scope>`** — the liveness lens, re-run 2026-08-03 AFTER the
   declaration-node keying fix (`c6c20d21`). Scopes swept: `contracts` (30 orphans / 30 testonly),
   `server` (15 / 32), `client` (7 / 18), `kit` (2 / 1).
2. **`git log -S <name> --oneline --all`** — did a consumer ever exist, and did it DEPART (supersession /
   receipted removal) or was the export born dead?
3. **A literal whole-repo sweep** (`grep -w`, incl. `docs/`) — catches string-keyed, comment, doc and
   script uses the symbol lens scopes out. This is what surfaced the pre-built-surface class.
4. **Twin-sibling check** — for every `z.infer<typeof X>` / `(typeof TUPLE)[number]` / `z.enum(TUPLE)`
   export, is the SIBLING it derives from alive? A twin of a live sibling is convention, not rot.
5. **A tag probe** — strip the `@public` off a sample row and re-run knip, to test (not assume) that the
   tag does what the brief said it does. It does not; see the correction below.

## The governing law (why most orphans are TAG, not DELETE)

- `docs/architecture/core/AGENTS.md` §1: *"'No consumer / dead / unwired' is a prompt to evaluate
  **intent**, not a delete signal … flag-for-delete only for genuinely superseded residue, and say why."*
- `docs/history/reviews/stickler/2026-07-25-contracts-layer-audit.md` §F8: *"Most are benign symmetric
  exports (a tuple's schema twin, e.g. `inviteStatusSchema`, `userKindSchema`). … Per 'unwired ≠
  worthless': each needs a wire-or-annotate-or-delete decision, not a reflex delete. The actionable
  defect in every case is the comment asserting a live consumer."*
- Same audit: *"reserved seams (memory clips, `ChunkParamsPin`-style type pins) are deliberate orphans."*

**The applied test.** An orphan is DELETED only when it is a **hand-declared shape** (not a mechanical
twin, not a taxonomy member) whose doc comment asserts a consumer that does not and did not exist, OR
whose consumer's departure is receipted. Everything else is TAGGED `@public` with the reason naming the
live sibling / the unbuilt surface it belongs to.

> **Correction — what `@public` actually does today.** The brief's premise was that the tag is
> load-bearing *because knip consumes it*. Half true, and the half that's false matters. knip **does**
> consume it (`knip.ts:15`, `tags: ["-@public"]`, with the config's own comment naming it the
> "deliberate-API escape hatch"). But knip **does not currently flag any of these 32 exports at all** —
> **verified by probe, not assumed**: stripping the tag off four rows across three package tiers
> (`ChunkParamsPin` contracts/merged-JSDoc form · `CharacterMemberSpec` contracts/one-line form ·
> `OwnerStatId` kit · `HostVersionUnservedError` server) and re-running `npx knip --cache` reported
> **none** of them (knip stayed exit 0). Each package's `exports` map already makes these subpaths
> public API in knip's eyes.
>
> So the tag's value here is (a) the deliberate-orphan intent recorded **at the declaration**, where the
> next agent reads it, and (b) the marker the follow-up **ratchet lane** needs — because the lens that
> *does* flag every one of these rows is `pnpm ast orphans`, not knip. **The ratchet gate must therefore
> read `@public` itself; it cannot inherit the exemption from knip.** That is a hard requirement on the
> follow-up lane, and it is the single most important thing in this document for whoever builds it.

Verdict counts: **TAG 32** · **DELETE 23** · **RENAME 12** · **WIRE 1** · **TRUTH-REPAIR 2** ·
**FLAGGED (untouched) 7**.

---

## A. TAG `@public` — convention twin of a LIVE sibling

The export is the mechanical zod/type twin of a sibling that IS consumed. Deleting it breaks the
one-tuple-one-schema-one-type convention the whole contracts layer is built on.

| Export | File:line | Evidence (the live sibling) | Action |
| - | - | - | - |
| `ResolveBlobRefsParams` | `packages/contracts/src/assets/index.ts:143` | `resolveBlobRefsParamsSchema` is the tRPC input at `server/src/transport/trpc/routers/assets.ts:35` | tagged |
| `ResolveChatBlobRefsParams` | `packages/contracts/src/assets/index.ts:160` | `resolveChatBlobRefsParamsSchema` live, same router | tagged |
| `AutomationTriggerBus` | `packages/contracts/src/automation/index.ts:60` | `AUTOMATION_TRIGGER_BUSES` drives the db enum + CHECK (`db/src/schema/automation.ts:90,116`) | tagged |
| `AutomationBusEventType` | `packages/contracts/src/automation/index.ts:342` | `AutomationBusEvent` union live | tagged |
| `TurnAbortedOpCode` | `packages/contracts/src/chat/bus.ts:124` | `TURN_ABORTED_OP_CODE` live | tagged |
| `AcceptInviteInput` | `packages/contracts/src/chat/roster.ts:346` | `acceptInviteSchema` is the tRPC input at `routers/invites.ts:74` + pinned by `tests/contracts/chat/roster.contract.test.ts:41` | tagged |
| `GeneratePictureRequest` | `packages/contracts/src/imagery/index.ts:223` | `generatePictureRequestSchema` is the tRPC input at `routers/chat.ts:566` | tagged |
| `PersonaMetadataWrite` | `packages/contracts/src/persona/index.ts:52` | `personaMetadataWriteSchema` used at `persona/index.ts:62` + `domain/persona/substrate/metadata.ts` | tagged |
| `GuidedActionConfig` | `packages/contracts/src/preset/index.ts:326` | `guidedActionConfigSchema` used 6× in the same file (the six guided actions) | tagged |
| `GreetingTransformId` | `packages/contracts/src/preset/index.ts:525` | `GREETING_TRANSFORMS` rendered by `client/src/components/greeting-studio.tsx` | tagged |
| `CardAsset` | `packages/contracts/src/character/index.ts:51` | `cardAssetSchema` used at `character/index.ts:293` | tagged ⚑ |
| `MessageMediaKind` | `packages/contracts/src/chat/content-blocks.ts:18` | `messageMediaKindSchema` used at `content-blocks.ts:38` | tagged ⚑ |
| `MessageMediaSrc` | `packages/contracts/src/chat/content-blocks.ts:30` | `messageMediaSrcSchema` used at `content-blocks.ts:39` | tagged ⚑ |
| `participantKindSchema` | `packages/contracts/src/chat/participants.ts:16` | `PARTICIPANT_KINDS` drives the db enum + CHECK (`db/src/schema/chat.ts:409,464`) | tagged ⚑ |
| `participantRoleSchema` | `packages/contracts/src/chat/roster.ts:24` | `PARTICIPANT_ROLES` drives the db enum + CHECK (`db/src/schema/chat.ts:422,465`) | tagged ⚑✚ |
| `talkativenessSchema` | `packages/contracts/src/chat/roster.ts:55` | `TALKATIVENESS_DEFAULT` live in `client/.../draft-context-tabs.tsx` + `domain/chat/verbs/roster.ts`; the schema IS the named range clamp (`roster.ts:68`) | tagged ⚑ |
| `CharacterMemberSpec` | `packages/contracts/src/chat/roster.ts:84` | `characterMemberSpecSchema` is the extracted arm of `rosterMemberSpecSchema` AND round-trip-pinned by `tests/contracts/chat/roster.contract.test.ts:142` | tagged ⚑ |
| `RosterMemberSpec` | `packages/contracts/src/chat/roster.ts:94` | `rosterMemberSpecSchema` pinned by the same test (`:138`) | tagged ⚑ |
| `inviteStatusSchema` | `packages/contracts/src/chat/roster.ts:312` | `INVITE_STATUSES` drives the db enum + CHECK (`db/src/schema/chat.ts:495,501`) | tagged ⚑ |
| `userKindSchema` | `packages/contracts/src/identity/index.ts:20` | `USER_KINDS` drives the db enum (`db/src/schema/users.ts:50`) | tagged ⚑ |
| `RegexSettings` | `packages/contracts/src/settings/index.ts:841` | `regexSettingsSchema` used at `settings/index.ts:864` | tagged ⚑ |
| `AgentDialogKind` | `packages/server/src/infra/providers/contract/agent.ts:13` | `AGENT_DIALOG_KINDS` re-exported from the providers contract front door (`contract/index.ts:43`) | tagged ⚑ |
| `OwnerStatId` | `packages/kit/src/ids/index.ts:149` | one member of the per-table id-brand block (`CharacterStatId`/`OwnerStatId`/`DailyStatId`/`ModelStatId`); cited by name at `db/src/schema/stats.ts:15`. Unused as a column type only because `owner_stats` has a NATURAL PK | tagged ⚑ |

⚑ = **upgraded from the brief's delete bucket** on the twin-sibling evidence above (orchestrator ruling
2026-08-03: the F8 precedent + AGENTS §1 govern). ✚ = not in the brief at all; found by the re-run lens,
same class.

## B. TAG `@public` — pre-built / spec'd-not-built surface

Deliberate reserved seams. The consumer is unbuilt, not departed.

| Export | File:line | Evidence | Action |
| - | - | - | - |
| `ChunkParamsPin` | `packages/contracts/src/databank/index.ts:60` | a compile-time mutual-assignability pin (its own header says so); named a "deliberate orphan" by the stickler audit | tagged |
| `ClipKind` | `packages/contracts/src/memory/index.ts:14` | memory domain is PRE-BUILT surface; `CLIP_KINDS` carries the reserved `{{world_state}}` macro slot + the reserved `reconcile-world-state` WorkloadKind | tagged |
| `clipKindSchema` | `packages/contracts/src/memory/index.ts:15` | same cluster | tagged |
| `ClipSourceKind` | `packages/contracts/src/memory/index.ts:19` | same cluster (`Knowledge-Cluster.md` §9 cited in-file) | tagged |
| `clipSourceKindSchema` | `packages/contracts/src/memory/index.ts:20` | same cluster | tagged |
| `ClipScope` | `packages/contracts/src/memory/index.ts:23` | same cluster | tagged |
| `clipScopeSchema` | `packages/contracts/src/memory/index.ts:24` | same cluster | tagged |
| `PluginInvocation` | `packages/contracts/src/plugin/host-v1.ts:55` | the guest-facing `PluginHostV1` invocation-context shape, spec'd at `proposed/plugin-design/01-runtime-and-membrane.md:48`; the membrane admits an invocation CHAT context but never delivers this shape — surface unbuilt, not dead | tagged ⚑ |
| `HostVersionUnservedError` | `packages/server/src/domain/plugin/contract/errors.ts:23` | a member of the built lifecycle error taxonomy (`ManifestInvalidError`/`CapabilityNotGrantedError`/`PluginCrashedError` are live); spec'd at `proposed/plugin-design/02:163` + `01 §3`. Zero throw sites because the hostVersion gate is unbuilt | tagged ⚑ |

## C. DELETE — verified un-exports (dead re-export / degenerate alias)

Zero references confirmed in-script before removal. "Un-export" is not sufficient for any of these: an
unexported unused `const`/`type` is itself dead code, so the DECLARATION and every barrel re-export go
together (site counts below).

| Export | File:line | Evidence | Action |
| - | - | - | - |
| `ChromeRegistryContext` | `packages/client/src/state/chrome-registry-context.ts:12` | orphan; the live read path is `useChromeRegistry()` | deleted (2 sites: decl + `state/index.ts:82`) |
| `ModalRegistryContext` | `packages/client/src/state/modal-registry-context.ts:13` | orphan; live path `useModalRegistry()` | deleted (2 sites: decl + `state/index.ts:141`) |
| `SectionRegistryContext` | `packages/client/src/state/section-registry-context.ts:15` | orphan; live path `useSectionRegistry()` | deleted (2 sites: decl + `state/index.ts:172`) |
| `SettingsPaneRegistryContext` | `packages/client/src/state/settings-pane-registry-context.ts:13` | orphan | deleted (2 sites: decl + `state/index.ts:196`) |
| `SettingsSectionRegistryContext` | `packages/client/src/state/settings-section-registry-context.ts:17` | orphan | deleted (2 sites: decl + `state/index.ts:209`) |
| `ConnectionServiceDeps` | `packages/server/src/domain/connection/contract/service.ts:120` | degenerate `= ConnectionContext` alias, zero importers | deleted (2 sites: decl + `connection/index.ts:31`) |
| `CredentialsServiceDeps` | `packages/server/src/domain/credentials/contract/service.ts:68` | degenerate `= CredentialContext` alias | deleted (2 sites: decl + `credentials/index.ts:7`; the file header's mention also repaired) |
| `DiscoveryServiceDeps` | `packages/server/src/domain/discovery/contract/service.ts:209` | degenerate `= DiscoveryContext` alias | deleted (2 sites: decl + `discovery/index.ts:66`) |
| `EmbeddingsServiceDeps` | `packages/server/src/domain/embeddings/contract/service.ts:64` | degenerate `= EmbeddingsContext` alias | deleted (2 sites: decl + `embeddings/index.ts:16`) |
| `SearchServiceDeps` | `packages/server/src/domain/search/contract/service.ts:61` | degenerate `= SearchContext` alias | deleted (2 sites: decl + `search/index.ts:42`; header mention repaired) |
| `debugAuthMiddleware` | `packages/server/src/foundation/observability/debug/routes.ts:185` | `registerDebugRoutes` builds its OWN gate via `createDebugAuthMiddleware(auth)` (`routes.ts:190`); the export additionally captures `env.DEBUG_TOKEN` at MODULE LOAD (a stale-env footgun) | deleted (3 sites: decl + `debug/index.ts:21` + `observability/index.ts:20`) |

### The `.Context` root-cause finding (factory KEPT)

The brief's proposed root fix — stop exposing `.Context` from `createRegistryContext` — is **not
available**. `.Context` has two REAL consumers that need the nullable/optional read the throwing
`useRegistry()` hook cannot give:

- `packages/client/src/features/chat/components/message-tool-calls.tsx:28` — `useContext(MessageToolsRendererRegistryContext)`
- `packages/client/src/features/chat/hooks/use-slash-commands.tsx:35` — `useContext(SlashCommandRegistryContext)`

So 2 of the 7 `*RegistryContext = X.Context` re-exports are load-bearing and 5 are rot. The factory stays;
its header now DOCUMENTS the direct-`useContext` optional-read pattern as the sanctioned `.Context`
consumer, so the next lens run (and the next agent) does not re-litigate this.

### Where the `*ServiceDeps` mint comes from

Not a code template — the **parked design sets** prescribe it unconditionally in the front-door slot:
`docs/architecture/proposed/chat-crew-design/02-domain-shape-and-state.md:95`,
`docs/architecture/proposed/rpg-design/02-domain-shape.md:97`,
`docs/architecture/proposed/hub-browse-design/02-domain-and-adapters.md:57` — all spelling
*"index.ts FRONT DOOR — XService, createXService, XServiceDeps"*. Five of ten domains whose service takes
the context directly ended up with a degenerate alias nobody imports. Prose correction is the
orchestrator's (the parked sets are frozen reference).

## D. DELETE — dead, with both receipts

`ast` zero-refs AND `git log -S` showing the consumer's departure or that none ever existed.

| Export | File:line | Evidence (ast + archaeology) | Action |
| - | - | - | - |
| `assertMappedHistoryRole` | `packages/server/src/infra/providers/backends/kit/history.ts:23` | born `c24d86b6` (T1), consumers removed `a65348b1` (T2). `proposed/tool-use-design/README.md:62` states it verbatim: *"the `assertMappedHistoryRole` bridge deleted at all three sites"*. A T1→T2 bridge whose job is done | deleted (2 sites: decl + `backends/kit/index.ts:32`) |
| `ModelCatalogView` | `packages/server/src/domain/connection/contract/views.ts:9` | single-commit history (`c78112c8`, born with the domain); a bypassed `= ModelCatalogEntry` boundary alias — the catalog endpoint ships the contracts shape directly | deleted (2 sites: decl + `connection/index.ts:32`) |
| `ModelCapabilityView` | `packages/server/src/domain/connection/contract/views.ts:13` | same; the params panel WAS built and renders from `ModelCapability`, never through this alias | deleted (2 sites: decl + `connection/index.ts:32`) |
| `NEEDS_ASSISTANT_REPLY` | `packages/client/src/lib/injection-copy.ts:19` | born `7c31da30`, consumer DELETED by `ed9c1020` (W-D composer control map) which replaced the nested ComposerWand with the four-icon cluster. Superseded by the live `SWIPE_NEEDS_REPLY`/`CONTINUE_NEEDS_REPLY`. Supersession, NOT regression — the sibling `DRAFT_UNLOCK_AFTER_SEND` survived the same commit and is still live | deleted (2 sites: decl + `lib/index.ts:55`) |
| `WAND_NEEDS_TEXT` | `packages/client/src/lib/injection-copy.ts:30` | same commit, same supersession (the wand's dual-mode icons carry per-icon reasons now) | deleted (2 sites: decl + `lib/index.ts:66`) |
| `PROMPT_MACRO_NAMES` | `packages/contracts/src/preset/index.ts:1498` | single commit (`e5f8a297`, contracts Phase 2) — born dead. Its comment claims "fast lookup for autocomplete"; the autocomplete never used it. Named in stickler F8 | deleted (1 site) |
| `clampImageVariantQuality` | `packages/contracts/src/settings/index.ts:204` | single commit (`c4561fa8`) — born dead | deleted (1 site) |
| `StreamScrollMode` | `packages/contracts/src/settings/index.ts:494` | a vanity alias of `@orb/kit/scroll-mode`'s `ScrollMode` (the `no-vanity-alias` class); the real consumers (`@orb/ui/message-list`, contracts' own wire) import `ScrollMode` directly | deleted (1 site) |
| `TagTargetId` | `packages/contracts/src/tag/index.ts:106` | single commit (`e5f8a297`) — born dead; a hand union with exactly ONE occurrence in the entire repo (its own declaration) | deleted (1 site) |
| `PortableEnvelope` | `packages/contracts/src/portability/index.ts:48` | single commit (`b808f760`) — born dead. Stickler F8 verbatim: *"nothing references it; the serde files (e.g. `PresetFile`) re-spell `schemaKind`/`schemaVersion` structurally without the type"* | deleted (1 site) |
| `MessageVariant` | `packages/contracts/src/chat/messages.ts:50` | hand-declared interface, no twin. Stickler F8 verbatim: *"no producer or consumer; the live variant read surface is `MessageView` + `MessageVariantSummary`"* | deleted (2 sites: decl + `chat/index.ts:92`) |
| `TurnRef` | `packages/contracts/src/chat/bus.ts:156` | hand-declared interface. Stickler F8 verbatim: *"the actual op (`AutomationOps.chat.getTurnOrigin`) takes bare `(chatId, messageId)`; the vocabulary type is bypassed by its one intended consumer"* | deleted (2 sites: decl + `chat/index.ts:67`) |

## E. WIRE — the orphan dies by gaining its consumer

| Export | File:line | Evidence | Action |
| - | - | - | - |
| `EmitNotification` | `packages/server/src/domain/notifications/contract/service.ts:21` | its own header says *"Composed at `entry/`"*; `entry/compose/automation-watcher.ts:76` RE-SPELLS the exact signature inline (`(event: NotificationEvent) => Promise<void>`) instead of importing it — the `no-inline-types` class. De-exporting would make the violation permanent | **wired**: `automation-watcher.ts:76` now `readonly emitNotification: EmitNotification;` importing from `#domain/notifications`; the now-unused `NotificationEvent` import dropped |

**Correction to the brief's premise** (and to this lane's own first report): only ONE of the three
`emitNotification` sites was a re-spell. `entry/compose/chat.ts:854` and
`entry/compose/automation-plugin.ts:114` are IMPLEMENTATIONS, not type declarations — and chat's is a
different, WIDER two-arg signature (`NotificationsEmitOp`, `domain/chat/contract/context.ts:855`, carrying
the co-statements arm). Wiring `EmitNotification` there would have been wrong.

## F. TRUTH-REPAIR — the lying header is the actionable defect (stickler F8)

| Export | File:line | Evidence | Action |
| - | - | - | - |
| `DiscoveryError` | `packages/server/src/domain/discovery/contract/errors.ts:8` | zero throw sites anywhere in `domain/discovery`. What the paths ACTUALLY do: `verbs/analyze.ts:78,130` RE-THROW the upstream engine/infra error unchanged, and a validation failure DEGRADES (returns the ungrounded/raw result) rather than erroring; an empty corpus returns zero-count stats. The header's claim — *"the typed domain error(s) the discovery compute/read paths throw"* — is false | **deleted** (class + the now-empty `contract/errors.ts` file + the `discovery/index.ts:6` re-export), and the truth moved to the domain front-door header so it cannot be silently re-minted |
| `createRegistryContext` `.Context` | `packages/client/src/lib/create-registry-context.tsx` | the header described `Context` only as *"assembled at main.tsx"*, which is not what its two live consumers do | **header amended** to document the direct-`useContext` optional-read as the sanctioned `.Context` consumer |

> **Board question for the owner** (not decided here — it is a behaviour/design change, not mechanical):
> **should `discovery` grow a typed error taxonomy?** Today it has none, by practice: infra errors
> propagate raw and validation failures degrade. Every other built domain carries `contract/errors.ts`
> on the kit taxonomy, so discovery is the odd one out — either that asymmetry is deliberate (analytics
> degrade, they don't fail) and should be stated as law, or discovery should mint real typed errors at
> its compute boundaries.

## G. RENAME — test-only seams adopt the server's self-identifying convention

**The convention, read off the server (not invented).** Every self-identifying test-only export on the
server carries a leading `__`:

- `__reset*` (5): `__resetAgentSdkModelCache`, `__resetOrModelCache`, `__resetVllmGenWindowCache`,
  `__resetEffectiveConfigCache`, `__resetWakeGateCache` — the state-RESET form.
- `__<verb>ForTest` (2): `__setEgressResolverForTest`, `__pinnedAgentForTest` — the general form
  (install / read).

So: a reset/clear takes `__reset<Noun>`; anything else takes `__<verb>ForTest`. No third spelling minted.

| Old | New | File | Verdict evidence |
| - | - | - | - |
| `clearTagFilter` | `__resetTagFilter` | `state/character-library-store.ts:118` | testonly lens; only consumer `tests/client/state/_ct-stories.tsx:425` |
| `readMessageEditDraft` | `__readMessageEditDraftForTest` | `state/message-edit-draft.ts:52` | testonly; `tests/client/state/message-edit-draft.test.ts` (12 call sites) |
| `clearSelection` | `__resetSelection` | `state/message-selection-store.ts:46` | testonly; `tests/client/state/message-selection-store.test.ts:47` |
| `clearPresetSelection` | `__resetPresetSelection` | `state/preset-selection-store.ts:18` | testonly; 2 CT story files |
| `clearPresetSection` | `__resetPresetSection` | `state/preset-selection-store.ts:22` | testonly; `_ct-stories.tsx:345` |
| `dismissPresetSection` | `__dismissPresetSectionForTest` | `state/preset-selection-store.ts:24` | testonly; a DISMISS action (dual-write close), not a reset → `ForTest` form |
| `clearPresetTemplate` | `__resetPresetTemplate` | `state/preset-template-selection-store.ts:24` | testonly; `_readout-stories.tsx:37` |
| `readRecentModels` | `__readRecentModelsForTest` | `state/recent-models-store.ts:71` | testonly; a READ snapshot → `ForTest` form |
| `clearAllRecentModels` | `__resetAllRecentModels` | `state/recent-models-store.ts:76` | testonly; used as "reset the module singleton between tests" (`recent-models-store.test.ts:13`) |
| `readRecentSteers` | `__readRecentSteersForTest` | `state/steer-recovery-store.ts:42` | testonly; a READ snapshot |
| `clearRecentSteers` | `__resetRecentSteers` | `state/steer-recovery-store.ts:47` | testonly; same singleton-reset use (`steer-recovery-store.test.ts:12`) |
| `setFrameScheduler` | `__setFrameSchedulerForTest` | `state/chat-stream.ts:114` | testonly; its OWN doc says *"Test seam: install a manual frame scheduler"* — structurally identical to `__setEgressResolverForTest` |

**`subscribeTurnSlot` NOT renamed** (per brief): it is a real subscription API shape
(`(chatId, listener) => unsubscribe`), test-only only because the production subscriber path differs.

**The literal-sweep arm.** `renameExportedSymbol` uses the language service, which misses string-keyed and
comment uses. A word-boundary literal sweep ran AFTER every rename and caught:
`packages/client/src/state/character-library-store.ts:119` — the zustand devtools action label
`"character-library/clearTagFilter"` — plus test titles and prose comments naming the old symbols.

## H. FLAGGED — ambiguous or out of scope after both methods; UNTOUCHED

| Export | File:line | Why flagged |
| - | - | - |
| `sectionKind` | `client/src/features/preset/lib/assembly-model.ts:21` | testonly per the lens, but it is a PURE model helper, not a test seam — its header claims *"the one home for the per-section type classification the rack + inspector both branch on"* and neither surface imports it. Renaming it `__…ForTest` would be a lie; deleting it is a design call. Same F8 "lying comment" defect class |
| `guidedFooterState` | `client/src/features/preset/lib/assembly-model.ts:198` | same class; additionally CITED as landed law by `contracts/src/preset/index.ts:706` and `features/preset/lib/template-rows.ts:93`, and its shape is generalized by `features/chat/lib/prose-settings-model.ts:51` — so the concept is live even though the function is not called |
| `addSpanEvent` | `server/src/foundation/observability/tracing.ts:362` | orphan, single-commit (`8b8e5714`), NOT in the brief. Observability seam — deleting a tracing affordance is an owner call |
| `useViewer` | `client/src/data/use-viewer.ts:23` | testonly, not in the brief |
| `createEntityDraftStore` | `client/src/state/create-entity-draft-store.ts:98` | testonly, not in the brief — and memory `[[entity-draft-store-dual-consumers]]` says two consumers share this store; the lens result needs a second look before anyone acts |
| `useListDocked` | `client/src/state/shell-store.ts:377` | testonly, not in the brief |
| `permitsHost`, `SessionToken` | `server/.../auth/decide.ts:67`, `kit/src/ids/index.ts:97` | explicitly the sibling security lane's |

## I. Explicitly NOT touched (brief §E)

`packages/ui` in full — all handles + its 39 testonly exports are the R2 sealed surface; the future
ratchet exempts `ui` at package level. No tags, no renames, no deletions. The lens extensions and the
ratchet gate are a follow-up lane.
