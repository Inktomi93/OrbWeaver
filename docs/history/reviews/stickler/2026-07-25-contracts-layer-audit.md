---
kind: history
status: archived
updated: 2026-08-01
---

# Contracts-layer architecture audit — 2026-07-25 (retro-burn-down)

Frontier-tier audit of `packages/contracts/src` (all 43 `.ts` files) + every `packages/server/src/domain/*/contract/` (25 domains, 140 `.ts` files). **All 183 files read IN FULL** — no sampling, no hunks. Count self-check: `find packages/contracts/src -name '*.ts' | wc -l` = 43; `find packages/server/src/domain -path '*/contract/*' -name '*.ts' | wc -l` = 140; 43 + 140 = 183. Matches the spec exactly.

Grounding read in full before judging: `.claude/agent-doctrine.md`, `docs/architecture/core/AGENTS.md`, `Core-Laws-and-Precedents.md`, `Core-Path-Registry.md` (D1–D79, both pages), `Documentation-Law.md`, `Spine-TypeScript-and-Patterns.md`, `Core-0-Architecture-and-Structure.md`, plus the serde section of `Spine-Config-and-Serialization.md` and the relevant gate sources (`no-inline-union-redecl.ts`, `db-enum-from-tuple.ts`, `bus-payload-allowlist.ts`, `warning-code-coverage.ts`, `contract-verb-presence.ts`, `dangling-refs.ts`, `no-vanity-alias.ts`, `types-in-contract.ts`, `no-untyped-soft-ref.ts`) and the depcruise `domain-no-cross-feature` / `domain-feature-front-door` rules.

**NOT run:** `pnpm check` / `pnpm test` — explicitly forbidden by the brief (5 concurrent lanes on a moving tree). All structural claims below come from full-file reads + `pnpm ast` lenses + `sg`/`/usr/bin/grep -a` sweeps performed this session; each finding cites its evidence.

**Moving-tree caveat honored:** the lanes named in the brief (chat `slotSeq` + `smart_arbitration_degraded`, role-clients abort rename, per-seat `historyVisibility`, domain/chat+automation+plugin edits) were treated as mid-edit; nothing in those areas is reported as a defect unless the evidence is independent of the in-flight change. None of the findings below sits inside a named lane's edit surface except F5 (chat god-file), which is explicitly a "split AFTER lanes settle" recommendation.

---

## RANKED FINDINGS

### F1 — HIGH · Post-rollback comment drift: the contracts layer describes purged members (agents, observers, crew, rpg, poses, roster-presets) as LIVE

The retro-burn-down purge narrowed the tuples/unions correctly (the derive machinery held — see "what's good"), but the comment corpus across the contracts layer still describes the pre-rollback world as built and wired. Per `Documentation-Law.md` §First-principles ("a wrong doc is worse than no doc… delete drift on sight; a lying comment is a defect, gated like a bug"), this is the highest-volume defect class in the audit. A cold agent reading these files will either rebuild against the described agent/crew world or "fix" the tuples to match the comments.

Confirmed instances (each verified against the live tuple/union/tree this session):

- `packages/contracts/src/identity/index.ts:16-18` — `USER_KINDS = ["human"]` while the comment above says the axis is "`human | agent`" and `// FLAG[PD-17]: AP0-AP4a all landed (D99) — the seat wave is CLOSED.` Both halves false on this line: the tuple has one member and D99 does not exist (registry ends at D79). The `PD-17` registry row itself (`Core-Audits-and-Debt.md:56`) is a main-era snapshot describing `chat.seatAgent`/`provisionAgentPrincipal` as BUILT.
- `packages/contracts/src/chat/index.ts:45-48` — `PARTICIPANT_KINDS = ["human", "character"]` under a comment describing `agent` as "a first-class userId-backed AND AI-driven principal (D60)" and "`PD-17`: the `agent` seat is FILLED by `chat.seatAgent` (host-gated; AP3-1 verb, wired to the tRPC chat router at P6)". **No `seatAgent` definition exists anywhere in `packages/server/src`** — `sg run -p 'seatAgent' -l ts packages/server/src` returns zero files; `/usr/bin/grep -rn 'seatAgent\s*[:=(]'` returns zero definitions; the only hits are 6 more comments repeating the claim (`chat/verbs/invites.ts:93`, `chat/verbs/roster.ts:342,499`, `chat/persistence/participant.ts:23`, `transport/trpc/routers/invites.ts:12`, `admin/verbs/create-user.ts:77`). The full `ChatService` interface (read in full) has no such verb.
- `packages/contracts/src/chat/index.ts:1107-1114` — `rosterMemberSpecSchema` doc: "The `character` and `agent` arms are both live from birth" — the discriminated union has exactly ONE arm (`characterMemberSpecSchema`).
- `packages/db/src/schema/chat.ts:22-23, 378-380, 436-439` — "the 4-member tuple, D60: human/character/agent … `observer`" / "derives the 4-member PARTICIPANT\_KINDS" — the tuple has 2 members; the enum/CHECK correctly derive 2 (machinery held; the prose lies).
- `packages/db/src/schema/users.ts:10-11, 27, 47` — "`kind` (`human|agent`)" / "CHECK … `kind in ('human', 'agent')`" — `USER_KINDS` has one member; the generated CHECK list is `'human'` only. The `users_agent_shape` CHECK (line 77) is now dead DDL (the kind CHECK makes `'agent'` unreachable) — harmless but part of the same residue.
- `packages/contracts/src/events/index.ts:13-22` — the header narrates "The four `crew.*` members" and "The five `rpg.*` members" of the domain-event union in present tense; `DOMAIN_EVENT_TYPES = ["character.updated", "asset.created"]` — no crew/rpg members exist.
- `packages/contracts/src/notifications/index.ts:2` — header: "Invite/kick/host-handoff/**agent-seat-request/crew-proposal** ride a per-user durable inbox" — the union (read in full) has neither member.
- `packages/server/src/domain/workloads/contract/workload-params.ts:122-124` — "NOTE: these **five kinds** keep `stub:true` in … WORKLOAD\_KIND\_MODES until their real runners land (rpg-design/10 §R9/§R10)" — exactly ONE kind is `stub:true` (`reconcile-world-state`; verified in `WORKLOAD_KIND_MODES`).
- `packages/server/src/domain/preset/contract/packaged.ts:29-38, 151-158` — the `rpg-gm` packaged preset's GM-TUNE comments cite `domain/rpg/substrate/gather-macros.ts` (no `domain/rpg` exists in the tree — verified by `ls packages/server/src/domain/`) and its sections carry `{{rpgWorld}}`/`{{rpgSecrets}}`/etc. macros with no producer. `preset/contract/service.ts:50-51` cites "the cross-feature clone-source op (rpg `createGame` → `gmPresetId`)" — no such consumer exists.
- `packages/server/src/domain/assets/contract/service.ts:36-37` — `imageProbe` justified by "the BYO **pose** import computes a skeleton's orientation (C6c)" — poses were purged.
- `packages/server/src/domain/chat/contract/service.ts:259-262` — `removeCharacterFromChat`: "The only consumer is rpg's scene-cast prune (injected; no client caller — no tRPC row)" — that consumer does not exist. (The verb itself may still be legitimately kept; the *stated consumer* is false.)
- `packages/server/src/domain/chat/contract/context.ts` — the `ChatRpgOps` / `ChatCrewOps` / `ChatExpressionsOps` null-op seams (lines \~339-414) and `packages/server/src/domain/tool-use/contract/params.ts:36-38` (`turnId` "Inert until the rpg tool registrants land") describe purged design sets as pending consumers. The SEAMS themselves may be deliberate keep-for-regraft ("unwired ≠ worthless") — flagged as uncertainty, not deletion candidates — but the "current consumer" claims are drift.

Why it matters: `Documentation-Law` cites measured agent harm (\~22% test-success collapse under wrong comments). This layer is the "API README as code" the constitution routes every agent to read first. Cost of leaving it: the next agent building on chat/identity contracts re-derives the agent world or re-widens tuples to match prose.

Concrete fix: ONE dedicated comment-reconciliation sweep over the files above (plus `db/schema/{users,chat}.ts`), rewriting each drifted comment to the post-purge truth or deleting it (rung 5 of the decision procedure). If agent principals are intended to return, the honest form per `Documentation-Law` is "COMMITTED (not yet built): …", never present tense. Uncertainty flag: none of the 5 named in-flight lanes touches agents/crew/rpg, so this is rollback residue, not mid-edit churn.

### F2 — HIGH · Contracts code cites ledger entries that do not exist (D80, D85, D86, D91, D99)

`Core-Path-Registry.md` (updated 2026-07-25, i.e. actively maintained on this branch) holds D1–D79; `/usr/bin/grep -c 'D8[0-9]\|D9[0-9]'` over it = 0. Yet the contracts layer cites, as standing law:

- **D80** ("the participant five-plane model", the seat-knobs one-home): `packages/contracts/src/chat/index.ts:1081,1086,1107,1111`; `packages/server/src/domain/chat/contract/service.ts:278`; `chat/contract/params.ts:401`.
- **D85** ("membership-widened databank chat scope" + per-document visibility): `packages/contracts/src/databank/index.ts:93,94,102`; `packages/contracts/src/chat/index.ts:1043`; `chat/contract/service.ts:266`; `chat/contract/params.ts:383`; `databank/contract/service.ts:162`; `databank/contract/views.ts:26`.
- **D86** ("resolution-discriminant precedent" for reserved single-arm unions): `packages/contracts/src/plugin/lifecycle.ts:7`.
- **D91** ("databank graduated D91"): `packages/server/src/domain/databank/contract/service.ts:13`.
- **D99** (the agent seat wave): `packages/contracts/src/identity/index.ts:17`.

Sweep: `/usr/bin/grep -rnP '(?<![P\w-])D(8[0-9]|9[0-9]|1[0-9]{2})\b' packages/contracts/src packages/server/src/domain/*/contract` (the P-lookbehind excludes `PD-n` debt citations, which are a different, gated namespace).

Why it matters: "On ANY conflict the ledger wins" is the constitution's first tripwire — but these rulings have NO ledger home a cold agent can resolve. The features they govern are demonstrably built (setSeatKnobs, `chatMetadata.databankVisibility`, `PLUGIN_ORIGINS` single-arm are all live in the code read this session), so the RULINGS are real and orphaned, the worst combination: un-relitigable-by-doctrine yet unciteable.

Concrete fix (pick one per number): re-mint the entry in `Core-Path-Registry.md` (D80/D85 clearly deserve rows — they are load-bearing multi-domain rulings), or rewrite the comment to state the constraint itself without the citation (the Documentation-Law "no D-numbers in comments" posture — note the layer pervasively violates that D66 rule anyway; that broader tension is out of scope here, the actionable defect is citations that resolve to NOTHING).

Gate note: this class is currently unenforceable by anything in the battery — `dangling-refs` covers only `*.md` path links; `pd-citation-integrity` covers only `PD-n`. See gate rec G1.

### F3 — MEDIUM-HIGH · The automation trigger tuples are NOT machine-pinned to their source unions (assumed-but-unenforced subset invariant)

`packages/contracts/src/automation/index.ts:16-43`: `CHAT_TRIGGER_TYPES` claims to be "a subset of the frozen chat-bus union" and `DOMAIN_TRIGGER_TYPES` "DomainEvent types automation may trigger on" — but both are bare `as const` tuples with **no `satisfies readonly ChatBusEvent["type"][]` / `satisfies readonly DomainEventType[]` binding**. The sibling axis in the same file models the correct idiom (`AUTOMATION_TRIGGER_BUSES … as const satisfies readonly AutomationTrigger["bus"][]`, line 54), so the omission is an inconsistency, not a style choice.

The contract test does not close the gap: `tests/contracts/automation/index.contract.test.ts:24-50` pins the tuples against **a literal copy of the same strings** — it detects tuple edits, never drift from the bus unions. Failure scenario: rename/remove a `ChatBusEvent` member (the union is actively evolving — the moving lanes just added members) → the trigger tuple keeps the stale string → rules on that trigger silently never fire again (the exact "declared-never-emitted is silently dead" class `warning-code-coverage` exists to kill on the warning axis), and the db bus↔type CHECK keeps accepting the dead value.

Fix: two one-line `satisfies` pins (compile-time — tier 2 of the enforcement ladder, above any gate): `as const satisfies readonly ChatBusEvent["type"][]` (import type from `#chat`) and `as const satisfies readonly DomainEventType[]` (import type from `#events`; `events` imports only kit, so no cycle). Verified currently in-sync (no live drift today — the finding is the missing enforcement, per the coordinator's classification request).

### F4 — MEDIUM · Live §5.5 axis re-spells that slip the `no-inline-union-redecl` gate through two confirmed blind spots

Confirmed inline re-spell instances (all live code, none fixtures):

1. **`PROMPT_TRANSFORM_POINTS`** (canonical home `packages/contracts/src/chat/index.ts:727`) re-spelled as `"user_input" | "assembled_dynamic"` at `packages/contracts/src/plugin/registrations.ts:29` and `packages/contracts/src/plugin/host-v1.ts:153`. Both files already import from `#automation`; importing `PromptTransformPoint` from `#chat` is free.
2. **`ENTRY_POSITIONS`** (canonical home `packages/kit/src/world-info/*.ts:25`) re-spelled at `packages/contracts/src/automation/index.ts:201` (`z.enum(["before", "after"])`), `packages/contracts/src/chat/index.ts:129` (`AssembleWorldEntry.position`), `packages/contracts/src/plugin/host-v1.ts:48` (`PluginWorldEntryUpsert.position`).
3. **The notification-recipient axis has NO canonical home at all** — `"host" | "all_members"` is spelled independently at 4 sites: `packages/contracts/src/automation/index.ts:214` (`z.enum`), `packages/contracts/src/plugin/host-v1.ts:119`, `packages/contracts/src/plugin/bridge.ts:68`, `packages/server/src/domain/plugin/contract/ops.ts:125`. Adding a recipient kind (e.g. `mentions`) is a 4-file scavenger hunt — precisely the neo pain §5.5 exists to kill. Fix: mint `NOTIFICATION_RECIPIENTS` in `@orb/contracts/notifications` (it is that domain's vocabulary) and derive everywhere.
4. **`CHAT_INJECTION_POSITIONS`** (4 members, `packages/contracts/src/chat/index.ts:151`) re-spelled at `packages/server/src/domain/chat/contract/params.ts:297` (`SetChatInjectionParams.position: "before_prompt" | "in_static" | "in_prompt" | "in_chat"`) instead of `ChatInjection["position"]`.

Why they pass the gate (verified by reading `scripts/check/gates/no-inline-union-redecl.ts` in full):

- **Blind spot (a): `MIN_MEMBERS = 3`** (line 10) — a 2-member tuple never registers as canonical, so every 2-member axis (items 1–3, plus `WORLD_BOOK_ROLES`, `WORLD_INFO_SCOPES`, `JOIN_HISTORY_VISIBILITIES`, …) is entirely outside arm B.
- **Blind spot (b): `tupleSig()` requires a bare `AsExpression`** (line 63, `Node.isAsExpression(init)`) — a tuple declared with the house-encouraged `[...] as const satisfies readonly X[]` idiom parses as a `SatisfiesExpression` wrapper and silently never registers, so `CHAT_INJECTION_POSITIONS` (declared with `satisfies`) protects nothing. This is a live instance of the `gate-probe-literal-shapes` trap class (AST readers blind to `as`/`satisfies` wraps = silent GREEN).

See gate rec G2 for the mechanized fix; the four code fixes above are worth doing regardless.

### F5 — MEDIUM · `packages/contracts/src/chat/index.ts` is a 1,475-line god-file; the sanctioned split shape already exists in-tree

The owner asked for this judgment explicitly. Verdict: **split it — along the banner seams it already draws for itself — but only after the in-flight lanes settle** (two of the five named lanes are editing this exact file).

The file currently folds \~9 separable concerns, each already delimited by a `═══` banner: (1) participant kinds + speaker refs; (2) the ASSEMBLE family (`AssembleContext` et al.); (3) the D26 message/variant wire (`messageSlotSchema`, `MessageView`, tool-call records, variable deltas); (4) the macro-name/avatar producers (incl. runtime map builders); (5) the stream delta + bus union + warning codes + turn origin + the D50 transform seam; (6) the chatMetadata sub-blobs (roomOverrides/groupConfig/opening/visibility/background); (7) the roster/seat/invite wire (D16/D22); (8) the D44 content blocks incl. the `contentSpansToBlocks` runtime projection; (9) the bulk-import shapes. `theme/` (5 files) and `plugin/` (7 files) already model the multi-file contracts module: internals flat, `index.ts` front-door re-exports, consumer-invisible per D15's directory-module law — a split costs consumers nothing. Cost of not splitting: this file is the single highest-traffic merge surface in the layer (both current chat lanes touch it), and every chat-adjacent agent pays the full 1.5k-line read. `preset/index.ts` (1,215 lines) is the second candidate but has only 3 coherent seams (config+lifts / macro catalog / ST+native serde) and lower churn — lower priority. Not gate-worthy (see gate recs — "what NOT to gate").

### F6 — LOW-MEDIUM · `DEFAULT_BLUR_SURFACES` is dead AND contradicts the real default

`packages/contracts/src/settings/index.ts:340-342` exports `DEFAULT_BLUR_SURFACES = ["panels", "composer", "modals"]` documented as "the default set", while the actual schema default is `[]` (`appearanceSchema.blurSurfaces: … .catch([]).default([])`, line 423). The constant has **zero consumers** (`pnpm ast orphans contracts` lists it). One of the two is a lie; today the shipped default is `[]`. Fix: delete the constant (and its "deliberately excluded from the default set" comment, which now describes nothing), or make the schema default it — whichever matches design intent.

### F7 — LOW-MEDIUM · `google_vertex` is an orphan metadata arm, and the db schema header lies about the provider tuple

`packages/contracts/src/credentials/index.ts:70-76` carries a `kind: "google_vertex"` arm in `providerMetadataSchema`, but `CRED_PROVIDERS = ["openrouter", "anthropic", "openai", "custom_openai"]` (line 25) has no `google_vertex` member — the provider CHECK (`packages/db/src/schema/credentials.ts:69`) refuses the value the arm exists to pair with, and no writer constructs it (`/usr/bin/grep -rn google_vertex packages` → only the schema arm + db comments). Meanwhile `packages/db/src/schema/credentials.ts:3-7` states the tuple as "`openrouter|anthropic|openai|google_vertex|custom_openai`" (5 members) — false. Per the file's own rule ("a provider's union member, resolver arm, and runner must land TOGETHER — never a stranded partial") this is a stranded HALF-member. Fix: either add `google_vertex` to `CRED_PROVIDERS` as a storable forward-compat slot (the `openai` precedent) or delete the metadata arm; correct the db header either way.

### F8 — LOW · Orphan contract exports whose comments claim live consumers (evaluate-intent, not auto-delete)

`pnpm ast orphans contracts` → 32 orphan exports (full list in the appendix below). Most are benign symmetric exports (a tuple's schema twin, e.g. `inviteStatusSchema`, `userKindSchema`). The ones worth an intent decision, because their doc comments assert consumers that don't exist:

- `chat/index.ts:1096-1115` — `characterMemberSpecSchema`/`CharacterMemberSpec`/`rosterMemberSpecSchema`/`RosterMemberSpec` (the "D80 one roster-member vocabulary"): the stated consumers (roster presets, founding casts, saved-rosters) were purged or never wired; nothing imports them.
- `chat/index.ts:388` — `MessageVariant` interface ("the client's read view") — no producer or consumer; the live variant read surface is `MessageView` + `MessageVariantSummary`.
- `chat/index.ts:717` — `TurnRef` ("How `getTurnOrigin` addresses a turn") — the actual op (`AutomationOps.chat.getTurnOrigin`, `automation/contract/ops.ts:119`) takes bare `(chatId, messageId)`; the vocabulary type is bypassed by its one intended consumer.
- `theme/seeded-backgrounds.ts:30` — `resolveSeededBackgroundUrl` ("the background layer's render-time lookup") — zero consumers.
- `preset/index.ts:791` — `PROMPT_MACRO_NAMES` ("fast lookup" for autocomplete) — zero consumers.
- `portability/index.ts:48` — `PortableEnvelope` ("Every portable file carries this envelope") — nothing references it; the serde files (e.g. `PresetFile`) re-spell `schemaKind`/`schemaVersion` structurally without the type.

Per "unwired ≠ worthless": each needs a wire-or-annotate-or-delete decision, not a reflex delete. The actionable defect in every case is the comment asserting a live consumer.

### F9 — LOW · Two styles for the same sideways type-import seam; deep paths bypass the front door ungated

Four files deep-import a SIBLING domain's contract internals by relative path: `packages/server/src/domain/databank/contract/service.ts:22-23` (`../../embeddings/contract/service`, `../../search/contract/service`), `settings/contract/service.ts:11` and `workloads/contract/service.ts:10` (`../../admin/contract/guard`) — while the rest of the layer uses the front door for the identical job (`credentials/contract/service.ts` → `#domain/admin`; `automation/contract/ops.ts` → `#domain/chat`; `plugin/contract/ops.ts` → `#domain/automation`, `#domain/chat`; `discovery/contract/service.ts` → `#domain/embeddings` etc.). The admin front door already re-exports the guard types (`domain/admin/index.ts:6`), so the deep path buys nothing. Verified ungated: `domain-feature-front-door` fires only when FROM is outside `domain/` (`.dependency-cruiser.cjs:406`), and `domain-no-cross-feature` exempts type-only — so sibling deep imports are structurally invisible today. Cost: two spellings of one seam (the insider-knowledge trap `no-vanity-alias` fights elsewhere) + silent breakage surface on sibling-internal renames. Fix: normalize the 4 sites to `#domain/<x>`; optionally close the hole per gate rec G3.

### F10 — INFO · `packages/contracts/src/index.ts` is a 1-line placeholder with zero importers

"public barrel (placeholder; re-exports added as modules land)" — 41 modules landed, none were ever re-exported, and nothing imports bare `@orb/contracts` (grep = 0 hits). Consumers correctly use subpaths. Delete the stale promise comment (or the aspiration entirely); the `exports` map requires the file to exist, so keep it one line.

---

## THE BOUNDARY VERDICT (`packages/contracts` vs `domain/*/contract`)

**Coherent, articulated, and consistently applied — the strongest structural result of the audit.** The rule as actually practiced, uniform across all 25 domains:

- **`@orb/contracts`** = shapes that must live BELOW server: server↔client wire (zod-first, type inferred), domain↔domain shared vocabulary (injected-op DTOs like `StatsDelta`, `MemoryQueryOptions`, `NotificationEvent`), and any tuple a `@orb/db` enum/CHECK must derive (the D34 chain: workloads kinds/statuses, `DOC_ORIGINS`, `IMAGE_LENSES`, `RELATIONS`, plugin origins/statuses, `ASSET_KINDS` — each promoted exactly when db needed it, with the derivation enforced by the `db-enum-from-tuple` gate).
- **`domain/*/contract`** = server-internal call surface: `*Params` wrapping the resolved `Principal`, DI bundles (`*Context`, explicit interfaces per `no-context-returntype`), `*Service` interfaces (enforced present by `types-in-contract`), typed errors on the kit error taxonomy, and read-models that reach the client only via tRPC inference.
- **The promotion rule is named and obeyed**: "promote to `@orb/contracts` iff the client deep-imports the shape" (the AdminUserView precedent, cited verbatim at `admin/contract/views.ts:3`, `automation/contract/results.ts:2-4`, `connection/contract/results.ts:44-49`). Re-export slots explicitly refuse to re-declare (`tag/contract/views.ts`, `world-info/contract/views.ts`, `automation/contract/views.ts`, `assets/contract/views.ts` — all carry the one-home note).
- **The apparent duplications are sanctioned mirror classes, verified at both ends** (do NOT "fix" these): (1) the portability result-shape mirrors (`assets/contract/results.ts:31-44`, `settings/contract/portability.ts:2-4`, `preset/contract/portability.ts:4-6`) — all three independently state the same deliberate policy: the entity-agnostic registry is composed at the entry root and domains stay registry-blind; (2) infra structural twins where the cake forbids the import (imagery `ImageGenerateRequest`/`ImageEditInput` ↔ infra; admin `AdminEngineStatus` ↔ infra `EngineStatusRecord`; connection `VLLM_WINDOW_ENGINES` ↔ infra `VLLM_ENGINES` — each annotated with the constraint); (3) chat's slim assemble projections (`AssembleDepthNote`/`AssemblePersona`) to avoid chat→character/persona DAG edges — annotated; (4) `chat/contract/memory.ts` `MemoryConfig` vs settings `memoryDefaultsSchema` — annotated deliberate knob-subset ownership; (5) the theme-override two-copy (contracts wire clamp vs `@orb/ui` render clamp) — pinned by `tests/contracts/theme/pairing.suite.test.ts`.
- **The serde asymmetry is sanctioned, not drift**: card serde in `server/kit/serde/card` (R3) vs the ST preset importer fully modeled in `@orb/contracts/preset` — `Spine-Config-and-Serialization.md` §serde explicitly rules "ST semantics … fully modeled in `@orb/contracts/preset` — no separate client-side ST mapper".

The only boundary wobbles are mechanical, already filed: F9 (import-style inconsistency) and F4-item-3 (an axis that never got a home). Nothing crosses the boundary in the wrong DIRECTION anywhere in the 183 files.

---

## WHAT'S ACTUALLY GOOD (propagate these)

1. **The derive machinery survived a violent rollback.** When the purge narrowed `PARTICIPANT_KINDS`/`USER_KINDS`, the db enums and the `sql.raw` CHECK lists followed automatically because they derive from the one tuple — zero stranded DDL members (only stranded COMMENTS, F1). This is the one-home architecture doing exactly what it was bought for.
2. **Exhaustiveness pins are used correctly and pervasively**: `CHAT_BUS_EVENT_TYPES` / `USER_BUS_EVENT_TYPES` `satisfies Record<Union, true>`; the workloads triple (`WORKLOAD_KIND_MODES` + `PARAMS_SCHEMAS` + `ResultByKind`) makes a new kind fail tsc at three coupled sites at once; plugin's `HOST_FUNCTION_CAPABILITY` derives `HostFunctionRef` from the surface type so both completeness directions are compile-checked (+ the `.test-d` reverse pin).
3. **Secret-unrepresentability is engineered, not asserted**: closed bus unions of literals (backed by the `bus-payload-allowlist` gate + depcruise `bus-contract-no-credentials` + `.test-d` pins), the `ResolvedCredential` unique-symbol brand with one mint site, `ViewerVisibility`'s null-fails-closed design with the WHY written into the type's doc (`chat/contract/context.ts:275-295` is a model of a load-bearing rung-4 comment).
4. **The injected-op discipline is uniform**: every cross-feature edge is a declared TYPE in a contract slot, principal-free ops carry the injected-op-caller-gate reasoning, and the reserved null-op seams keep the off-path byte-identical.
5. **Fault-isolated blob parsing as a house pattern**: `parseChatMetadata` per-sub-blob `.catch`, `themeBackgroundSchema` heal-to-none + `canonicalBackgroundSource` GC-safety, `defineVersionedConfig` as the one lift-loop with `storedVersion`-beats-probe.
6. **`workloads/contract/` is the best-in-class folder shape** — 11 small single-concern files, every axis pinned, every result per-kind mapped. It is the template F5's chat split should copy.
7. **Genuinely clean modules** (nothing to report at all): admin, character, credentials, export, imagery, notifications, persona, search, sessions, stats, tag, tool-use, world-info domain contracts; contracts `extraction`, `identity` (minus the F1 comment), `providers`, `regex`, `role-clients`, `search`, `session`, `stats`, `user-bus`, `versioned-config`, `workloads`, `world-info`, `theme`.

---

## GATE RECOMMENDATIONS

### Existing coverage inventory (assessed before proposing anything)

149 gate modules in `scripts/check/gates/`. Already enforcing the contracts layer (verified by reading each header + the union-gate in full): `no-inline-types` (type homes), `types-in-contract` (service.ts interface presence), `no-inline-union-redecl` (axis re-spells — with the two blind spots in F4), `db-enum-from-tuple` (the D34 derive — notably it DOES handle `as const satisfies`), `bus-payload-allowlist` (+ depcruise `bus-contract-no-credentials`), `user-bus-coverage` (declared-never-emitted members, DEFERRED-ratcheted), `warning-code-coverage` (both warning tuples ↔ real emit sites), `contract-verb-presence` (every `*Service` member has an invoking test), `no-vanity-alias`, `no-context-returntype`, `schema-branding`/`schema-banned-shapes`/`no-untyped-soft-ref` (db side), `pd-citation-integrity` (PD-n ↔ registry), `enforcement-registry-parity`, `dangling-refs` (doc PATHS only), plus the full `tests/contracts/**` per-module `.contract.test` corpus and `.test-d` pins (chat, plugin, connection, credentials, regex) and the theme pairing suite. This is already an unusually well-held layer.

Per-finding classification:

| Finding | Coverage verdict |
| - | - |
| F1 comment drift | **Unenforceable as-is** (prose truth vs code) — fix by sweep + review; do NOT gate |
| F2 unminted D-citations | **Assumed but unenforced** → G1 |
| F3 trigger-subset pins | **Assumed but unenforced** → fix in the TYPE SYSTEM (satisfies), not a gate — tier 2 beats tier 3 |
| F4 axis re-spells | **Partially covered** (`no-inline-union-redecl`) with two confirmed blind spots → G2 (repair the existing gate) + mint the missing recipient tuple |
| F5 god-file | **Do not gate** — a size gate on contracts would ossify; judgment call, one-time split |
| F6/F7 dead constants/arms | **Not gate-worthy individually**; the class is served by the advisory `pnpm ast orphans` lens |
| F8 orphan exports | **Keep advisory** — a hard orphan gate would fight "unwired ≠ worthless" (and the knip-lens gotchas memory) |
| F9 sibling deep imports | **Unenforced** → G3 (cheap depcruise arm), with a cycle caveat |
| F10 | Nothing to enforce |

### G1 — `d-citation-integrity` (BUILD FIRST)

- **Invariant:** every bare `D<n>` ledger citation in `packages/**` (and `docs/architecture/core/**`) resolves to an existing entry in `Core-Path-Registry.md`.
- **Would have caught:** all of F2 (five unminted numbers, 17 sites) and the D99 half of F1.
- **Keying:** off the LIVE registry — parse `Core-Path-Registry.md` for its `**D<n>**` entry anchors at gate runtime; never a hardcoded ceiling constant (a hardcoded "≤79" is the path-keyed-gates-die-on-rename failure in number form). The registry path is already a hard anchor of `pd-citation-integrity` — share the constant between the two gates so a registry move updates both in one place.
- **Mechanism:** extend `pd-citation-integrity` (same scan machinery, a second pattern + a second registry parse) — cheapest implementation that bites.
- **False-positive control (measured this session):** a naive `D\d+` sweep is poisoned by `PD-n` substrings (my own first `-o` sweep produced exactly this artifact). Require a non-`P`, non-word, non-hyphen left boundary (`(?<![PA-Za-z0-9-])D\d+\b` in spirit, expressed in the gate's matcher); scope OUT `docs/architecture/history/**` (archaeology legitimately cites dead numbers); dry-run the whole tree before landing.
- **Probe (bites-proof):** scratch file `packages/contracts/src/__probe/index.ts` containing `// per D999` → gate RED; `rm` it. Also probe the `PD-999` shape and assert it does NOT fire this gate (it belongs to the sibling).
- **Four-coupled-sites law:** module + Enforcement row + gate count + `writeFixtures`, one change.

### G2 — repair `no-inline-union-redecl`'s two blind spots (BUILD SECOND)

- **Invariant (unchanged, §5.5):** an axis is declared once; re-spells are RED.
- **Would have caught:** F4 items 1, 2, 4 (the recipient axis needs its tuple minted first — a one-line `NOTIFICATION_RECIPIENTS` in `@orb/contracts/notifications` — after which the repaired gate holds it too).
- **Fix (a) — `satisfies` tuples:** `tupleSig()` must unwrap a `SatisfiesExpression` around the `as const` (today `Node.isAsExpression(init)` fails on it → the tuple never registers → silent GREEN). Note the interaction: when a tuple is `satisfies`-bound to `Interface["prop"]`, that interface property is the co-declaration-of-record — the gate must exempt exactly that binding site or the chat idiom (interface-first + satisfies-bound tuple) goes red against itself. Simplest sound version: unwrap satisfies; when reporting arm-B hits, skip a union node that IS the type the tuple's satisfies clause references (resolvable via the satisfies type node's text).
- **Fix (b) — the 2-member floor:** do NOT drop `MIN_MEMBERS` globally (arm A on 2-member unions would flag every `"ok" | "error"` one-off — unacceptable noise). Drop the floor **only for arm B's canonical-tuple registration**: an exact-set match against a REGISTERED 2-member tuple (`ENTRY_POSITIONS`, `PROMPT_TRANSFORM_POINTS`) is a far lower false-positive class because the home demonstrably exists. Expect and triage some new reds on generic pairs (e.g. `["chat","global"]`-style coincidental matches) in the landing dry-run; if a coincidental-match class appears, key arm-B-at-2 on tuples homed in `contracts/`/`kit/` only.
- **Probe:** per `gate-probe-literal-shapes`, the probe MUST use the reader's shape — one fixture with `export const AXIS = ["a","b"] as const satisfies readonly string[];` + a sibling re-spell `mode: "a" | "b"` → RED; and the current bare-`as const` fixtures stay green-path.

### G3 — sibling front-door arm on depcruise (OPTIONAL THIRD)

- **Invariant:** a domain importing a SIBLING domain reaches only `domain/<sibling>/index.ts` (type-only included) — the front door is the only legal external import for siblings too, not just for transport/entry.
- **Would have caught:** F9's four sites.
- **Keying:** the package graph (a `from: domain/([^/]+)/ → to: domain/(other)/(non-index)` rule) — no path list, rename-proof.
- **Mechanism:** one new dependency-cruiser rule beside `domain-feature-front-door` (`severity: error`, no `dependencyTypesNot` exemption).
- **Caveat to test in the probe:** type-only front-door imports route through sibling `index.ts` barrels that also re-export VALUES; verify no resolution cycle appears for the databank↔search/embeddings pair before committing (probe: rewrite one deep import to `#domain/embeddings` in a scratch copy, run depcruise + tsc). If cycles bite, the honest alternative is to document the deep-type-import convention as sanctioned (and normalize the STYLE the other way) — say so in the Enforcement row rather than shipping a gate that forces a cycle.

### What should NOT be gated (as important as the proposals)

- **F1's class (comment truth)** — no machine can adjudicate prose vs intent; the fix is the sweep + the standing review rule ("a lying comment is a defect"). Gating keyword lists ("agent", "rpg") would be permanent noise.
- **Orphan exports** — keep `pnpm ast orphans` as the advisory lens it is. A hard gate contradicts "unwired ≠ worthless" and the knip-lens gotchas memory; reserved seams (memory clips, `ChunkParamsPin`-style type pins) are deliberate orphans.
- **Contracts file size** — `chat/index.ts` should split once (F5), but a size gate would ossify a layer whose right shape is still settling per-module (`preset` at 1.2k lines is defensibly one module).
- **F3's subset pins** — the type system already offers the enforcement (satisfies); a gate would be a weaker tier duplicating a stronger one (the enforcement-ladder rule, and the `prefer-biome-over-mirror-gates` spirit).

### Build order

1. **G1** (`d-citation-integrity`) — makes the F2 class unrepresentable forever; trivially implementable on the existing pd-gate chassis.
2. **F3's two `satisfies` pins + minting `NOTIFICATION_RECIPIENTS`** — not gates, three one-liners, close real drift channels at compile time.
3. **G2** (union-gate repair) — makes the F4 class unrepresentable; medium effort (the satisfies-binding exemption needs care).
4. **G3** — cheap but carries the cycle caveat; probe first.

---

## VERIFIED CLEAN (what my silence covers)

- **Read in full:** all 43 `packages/contracts/src` files; all 140 `domain/*/contract` files; the ground-law docs listed in the header; the 9 most relevant gate sources; the depcruise domain rules; `db/schema/{credentials,users,chat}.ts` (targeted); `tests/contracts/automation/index.contract.test.ts` (body), `tests/contracts` tree enumeration.
- **Boundary direction:** zero instances of a domain contract homing a wire/client shape that the client deep-imports, and zero instances of `@orb/contracts` importing upward (spot-verified by reading every import block in all 183 files — contracts imports only `@orb/kit` + intra-package `#modules`; domain contracts import contracts/db/kit/infra/foundation, all downward).
- **All 25 domains have a `contract/` folder** (no missing-contract domain); every domain with a `contract/service.ts` declares its `*Service` interface.
- **No `_shared`/junk-drawer patterns, no `enum`, no decorators, no `ReturnType<>` context exports** anywhere in the 183 files.
- **One-home spot-sweeps that came back clean:** `chats.metadata` (one home, `ChatMetadata` in contracts; domain parser derives — the historical dup stays resolved); `CredentialSource` (D31 verbatim re-export, no vanity alias); `EFFORT_LEVELS` preset-derives-connection (aliased as `MODEL_EFFORT_LEVELS`, never re-spelled); `MEMORY_RETRIEVAL_MODES` (search-homed, settings + chat derive); `BACKGROUND_IMAGE_KINDS` (theme-homed, settings imports); `RegexScript` (contracts-homed, kit structural twin pinned by the documented satisfies + contract test); theme `Theme`/`themeSchema` alive (router-consumed — earlier dup suspicion refuted); portability mirrors deliberate (all three domains state the policy).
- **Sweeps run** (tools: `pnpm ast orphans|importers`, `sg run -l ts`, `/usr/bin/grep -a` for load-bearing absences per the sandbox-grep memory): seatAgent definition sweep (0 defs), D8x/D9x citation sweep (P-lookbehind), google\_vertex liveness, recipient/transform-point/entry-position/injection-position re-spell sweeps, bare-`@orb/contracts` import sweep (0), domains-without-contract sweep (0).
- **Not verified (out of scope / forbidden):** whole-tree `pnpm check`/`pnpm test` (moving tree per the brief); runtime behavior of any verb; the client side of the wire shapes; `Core-Enforcement-Active-Gates.md` read only via targeted grep of gate names, not in full.

## UNCONFIRMED / LOW-PRIORITY SUSPICIONS

- `chat/contract/memory.ts:64` cites "(D-100 stamp)" — ambiguous between an unminted D100 and shorthand for PD-100; not resolved, so not folded into F2's confirmed list.
- The `ChatRpgOps`/`ChatCrewOps`/`ChatExpressionsOps` null-op seams may be deliberate keep-for-regraft; I flagged only their false "current consumer" comments (F1), not the seams.
- `AGENTS.md` §6 still maps a `buddy` domain; no `domain/buddy` exists in the tree — constitution-vs-tree drift, outside the contracts scope of this audit.
- `MessageVariant` (F8) may be pre-staged for an upcoming full-variant read surface; treated as evaluate-intent.
- The pervasive D-number/§-ref citations in contract comments technically violate Documentation-Law's D66 "no doc citations in comments" budget; the practice is so uniform (hundreds of sites, clearly owner-tolerated) that I treated it as accepted convention and confined findings to citations that resolve to NOTHING (F2).

## APPENDIX — full `pnpm ast orphans contracts` output (32 hits)

assets: ResolveBlobRefsParams, ResolveChatBlobRefsParams · automation: AutomationTriggerBus, AutomationBusEventType · character: CardAsset · chat: participantKindSchema, MessageVariant, TurnAbortedOpCode, TurnRef, participantRoleSchema, talkativenessSchema, CharacterMemberSpec, RosterMemberSpec, inviteStatusSchema, AcceptInviteInput, MessageMediaKind, CardTrust, MessageMediaSrc · databank: ChunkParamsPin (deliberate type-pin) · identity: userKindSchema · imagery: GeneratePictureRequest · persona: PersonaMetadataWrite · plugin: PluginInvocation · portability: PortableEnvelope · preset: guidedActionKindSchema, GuidedActionConfig, PROMPT\_MACRO\_NAMES · settings: StreamScrollMode, DEFAULT\_BLUR\_SURFACES, RegexSettings · tag: TagTargetId · theme: resolveSeededBackgroundUrl
