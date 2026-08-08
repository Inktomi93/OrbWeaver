# Core-docs TRUTH AUDIT — 2026-08-03

Sweep of every file in `docs/architecture/core/` (35 files) for verifiable claims — build-tense assertions, counts, named symbols/files/verbs, behavioral claims — verified against the tree (find/ast-grep/direct reads; presence claims chased to the declaration, never grep-alone). Trigger: five lies found incidentally in one day (Spine-Identity agent principals · D60 ledger · lockdown type sketches · UI-Gates §12.6 · Tier-1-DB:32).

**Scope split:** the six files the CERD lane (branch `wt/agent-ada8d9c0033d2f420`) already touches — `AGENTS.md`, `Core-Laws-and-Precedents.md`, `Core-Path-Registry.md`, `Spine-Identity-and-Auth.md`, `UI-Architecture-and-Layout.md`, `client-architecture-lockdown.md` — got **notes for the CERD merge** (§4 below), zero edits here (merge-collision avoidance). Everything else: fixed in place or flagged.

## 1. Totals

| Class | Count | Disposition |
| - | - | - |
| TRUE (spot-verified claims that held) | ~95 symbol/file/gate checks OK (see §5 method) | none |
| STALE-BUILT-TENSE | 14 surfaces | dated riders / in-place corrections in 12 non-CERD files; 2 → CERD notes (D67, D60-adjacent rows) |
| COUNT-DRIFT | 6 | fixed in place |
| PHANTOM-REF | 6 | fixed to what the prose means |
| CONTRADICTS-LEDGER | 2 (CI claims vs D62 no-CI; deferred-table vs active-table gate status) | fixed to the ledger's side |
| FLAGGED (design-flavored, untouched) | 3 | §3 |

## 2. The truth-debt table (fixed items)

| File | Claim | Verdict | Action |
| - | - | - | - |
| Core-STATUS.md | whole doc: "core backend BUILT… all six provider backends", "Ledger cursor: D106", "current lane = ui-cohesion" | STALE-BUILT-TENSE (frozen 07-13, pre-retro) | head rider: cursor superseded by `docs/retro-workboard.md`; D120 cursor; 5 backends; purge/built lists |
| Knowledge-Cluster.md | "the five vector tables" (inv 1) | COUNT-DRIFT — six (`document_chunks` joined; `vector-scope-derived` gate set is the receipt) | fixed |
| Knowledge-Cluster.md | "`document_chunks` … ZERO writers today" | STALE — databank landed 07-26; writes via `embeddingsStore` → `embeddings/persistence/queries.ts:335` (single write path HELD) | fixed |
| Tier-3-Infra.md | `gif-search.ts` Tenor adapter exists; safeFetch consumers incl. it | STALE-BUILT-TENSE (purged w/ hub drop, commit `dfc32628` 2026-07-22) | struck + rider; consumer list corrected |
| Tier-3-Infra.md | "`ip-ranges.ts` / `host.ts`" | PHANTOM-REF — `host.ts` never existed (no git history) | fixed |
| Tier-3b-Providers.md | `anth-direct` sealed backend, "a sixth `BACKEND_KEYS` member" | STALE-BUILT-TENSE — `BACKEND_KEYS` = 5 (`contract/backend.ts:34`), no dir, zero code refs | head rider + BackendKey list fixed |
| Tier-3b-Providers.md | 7 roles | COUNT-DRIFT — `PROVIDER_ROLES` = 8 (`structured`, D109-4; `roles/structured.ts`) | fixed |
| Tier-4-Transport.md | "20 domain routers" incl. buddy·hub | COUNT-DRIFT/PHANTOM — 24 on disk; buddy/hub gone; automation/databank/imagery/plugin/rpg/stream missing | list refreshed |
| Tier-4-Transport.md | `buddy-bus.ts` live bus | STALE — purged; `automation-bus.ts`/`notifications-bus.ts` live | fixed |
| Tier-4-Transport.md | notifications router "CRUD + the subscription" | CONTRADICTS-LEDGER (D118 deleted the proc) | fixed |
| Tier-4-Transport.md · Tier-5-Entry.md | `entry/compose/runner-env.ts` (D4) | STALE — DELETED by D117 | repointed to `workload-contributions.ts` |
| Tier-5-Entry.md | `compose/buddy-observer.ts` + boot-step-8 buddy observer | STALE — purged (commit `2b8a70e7`) | removed/annotated |
| Tier-1-DB.md | `agent-principals` schema file in the cross-cutting set + producer-map example | STALE — file gone; only dormant DDL in `users.ts`/`chat.ts` (matches CERD's D60 rider) | fixed both mentions |
| Spine-TypeScript-and-Patterns.md | gold standard = `RUNNERS` in `domain/workloads/substrate/dispatch.ts` | STALE — file deleted (D117); the shape is `WorkloadContributions` + `keyByKind` at compose | fixed |
| Spine-Testing.md | `.suite` example "the agent-principal containment matrix" | STALE — suite purged | swapped for live suites (`drift-gate.suite`, `solo-byte-identical`) |
| Chat-Macro-Resolution.md | reattribution "scoped to `REATTRIBUTE_WINDOW` recent turns" | PHANTOM-REF — const gone; verb takes explicit `messageIds` w/ per-row belts (`verbs/edit.ts`) | fixed |
| Core-Shared-Dissolution.md | `parseNeoPresetFile` | PHANTOM-REF — renamed `parsePresetFile` (`contracts/preset/index.ts:1817`) | fixed |
| Core-Planning-and-Checklists.md | C2 "`scopedCharacterId=''` sentinel" | STALE — D55 superseded (real synthetic-group ids; Shared-Dissolution §9 already said so) | fixed |
| Core-ST-Feature-Gap-Register.md | anth-direct COVERED · expressions seams born · databank stubbed · hub sliver COVERED · structured-output "no resolver/no runner" · vision "no resolver sets it" · §3 "automation contract-only today" | STALE both directions | head rider + 7 rows corrected (receipts: `resolve-model-capability.ts` synthesizes `output.structured`/`input.vision`; `domain/{automation,plugin,databank,tool-use}` + `infra/plugin-host` exist) |
| Core-SillyTavern-Feature-Map.md | §1 07-13 snapshot · §2d hub/direct/databank/expressions rows · §2e "Phase 8 not started" | STALE both directions | head rider + rows corrected |
| Core-Audits-and-Debt.md | PD-17's AP0–AP3-2 "BUILT" record + rows over purged domains | STALE-BUILT-TENSE (historical) | head rider (audit-lists-are-snapshots; PD-57 superseded-by-built noted) |
| Core-Enforcement-Active-Gates.md | "CI runs the full check…", "CI/on-demand lanes", pre-push = "check + test" | CONTRADICTS-LEDGER (D62 no-CI) + drift vs `lefthook.yml` — ci.yml is `workflow_dispatch`-only; pre-push is `verify --push` | fixed to the ledger + the file |
| Core-Enforcement-Active-Gates.md | monotonic-tests row: manifest "makes deletion structurally RED" | HALF-TRUE — `docs/test-baseline/manifest.json` ABSENT; `readManifest` fail-opens → deleted-test arm INERT (skip arms live) | inline rider; re-arm FLAGGED (§3) |
| Core-Enforcement-Active-Gates.md | dep-cruiser "49 rules (47+1+1)" | COUNT-DRIFT — 52 (50 error + 1 warn + 1 ignore) | fixed |
| Core-Enforcement-Active-Gates.md | `vector-scope-derived` row: five tables | COUNT-DRIFT — six | fixed |
| Core-Enforcement-Active-Gates.md | `bus-channel-primitive` row cites buddy's bus | STALE — purged; rpg's is the live domain-minted bus | fixed |
| Core-Enforcement-Deferred-Dropped.md | monotonic-tests + audit-client-tests "BUILT (dormant)" | CONTRADICTS its sibling doc — both `status:"active"` | fixed (promoted-record rows) |
| Core-Enforcement-Deferred-Dropped.md | touch-target-floor trigger "CI browser lane wired in ci.yml" | CONTRADICTS-LEDGER (D62) | trigger marked superseded |
| Core-Enforcement-Deferred-Dropped.md + `packages/ui/src/charts/meter/segmented-clock.tsx` | PREBUILT "no current consumer" on SegmentedClock | STALE — consumer LANDED (rpg quests tab, `rpg-quests-tab.tsx:27,192`) | marker deleted per the W6 contract; table row updated (`Meter` itself stays consumer-less, marker kept) |
| ui-package-design.md | registry-slot row: `RAIL_SLOTS`/`MODAL_SLOTS`/`check:registry-pairing` | PHANTOM-REF — replaced by D70/D73 registries; no such script | fixed |
| UI-Gates-and-Lessons.md | `resolveRowRenderPolicy` at `features/chat/lib/render-trust.ts` | PHANTOM-REF — lives at `client/src/lib/render-trust.ts` | fixed |
| Core-0-Architecture-and-Structure.md | root-lock list (buddy's bus.ts; missing 10th slot) + "hub (8 files)" example | STALE — gate allowlist is the receipt (`feature-structure.ts:32,81`) | fixed (workload-contributions.ts added; rpg singletons; example swapped) |

False alarms verified TRUE and left alone (worth recording): Knowledge-Cluster inv 2 (`vector_distance_cos` in discovery/embeddings is COMMENTS only — SQL solely in `search/persistence/`); `persistence-no-io` (a dep-cruiser rule, not a gate file); Tier-2-Foundation's whole inventory (audit.ts et al. all present; sole-env-reader allowlist matches the 5 keys); Spine-Config's serde/config symbol set (all present); the Tier-4 jobs list (exactly 4); stream sources (exactly 6); Chat-Macro-Resolution's producer/resolver symbol set; Core-Docs-Formatting-Law (formatter + stage live).

## 3. FLAGGED (design-flavored — untouched, owner/orchestrator calls)

1. **monotonic-tests re-arm** — regenerating + committing `docs/test-baseline/manifest.json` re-arms the deleted-test-file arm over the post-retro test tree. One command (`pnpm tsx scripts/check/gen-test-baseline-manifest.ts`) but it is an enforcement-posture change while lanes churn tests; not taken unilaterally.
2. **D59 crew** — the registry still records crew as "a committed Phase-7+ feature"; the rebuild-era owner ruling is crew DEAD. A D-entry disposition change is ledger territory (CERD-merge note, §4).
3. **`vector-scope-derived` gate header comment** says "the five vector tables" while its own set has six — code-comment fix, out of a docs lane's scope; one-liner for any code lane.

## 4. Notes for the CERD merge (findings in the six CERD-touched files — NOT edited here)

- **Core-Path-Registry.md:**
  - **D67 is a D60-class ledger lie** — "sealed at `infra/providers/backends/anth-direct/`, a sixth `BACKEND_KEYS` member" in built-tense; the tree has no directory, zero `anth-direct` refs in `packages/` outside two backends/kit test names, and `BACKEND_KEYS` = 5. Needs the D60 rider shape (purged 2026-07-22 retro sync; design of record).
  - **D68** — `ANTH_DIRECT_SAMPLING` has zero declarations on the tree (`minP` end-to-end HOLDS). Rider the anth-direct clause alongside D67.
  - **D31** — parenthetical "`CHAT_APIS` … currently agent-sdk/chat-completions/responses/anthropic-messages": tuple is 3 members, no anthropic-messages (self-inoculated by "the tuple is the truth" but stale).
  - **D109 (2)** — `RpgTurnConnection {connection, ownerConsented}` was renamed: the threaded type is `RpgTurnContext` (flush.ts:40). D111 already uses the new name.
  - **D112 (3) amendment** — "`logMalformedCalls` home" is a phantom name; the real one-homed predicate is `malformedToolCalls` (`contracts/rpg/extraction.ts:700`), which the entry's original clause names correctly.
  - **Reserved-range note** — "Next free number … is **D110+**" reads stale with D121 minting; "D122+" once CERD lands.
  - **D59** — crew "committed Phase-7+" vs the crew-DEAD owner ruling (see §3.2).
- **AGENTS.md §6 domain map:** the `buddy` row describes a purged domain as kept; the gallery row cites `domain/hub` (purged); the connection row says "all 7 roles" (now 8, `structured`); "unbuilt → databank · expressions · automation" — databank + automation are BUILT; the "active program = ui-cohesion-north-star" pointers (§0.3, §1, §7 ×2) are superseded by `docs/retro-workboard.md` (2026-07-25).
- **client-architecture-lockdown.md §13:** the bus inventory row `buddy (transport/trpc/buddy-bus.ts over domain/buddy's createBuddyBus)` — both purged; the D118 fold also reshaped the inventory (one socket, ROOM sources).
- **Spine-Identity-and-Auth.md:** `containment.suite.int.test.ts` cite + the "Built: agent_principals…" §4 paragraph — covered by CERD's rewrite (confirmed still-broken on main as of this audit).
- **Core-Laws-and-Precedents.md §3** — "`contracts/observability` is absent" VERIFIED TRUE; §7 range counts fixed by CERD's diff (verified in their branch).

## 5. The ledger-sweep verdict (D1–D121, the full pass)

Every D-entry's built-tense claims were read; the load-bearing named symbols were existence-checked (~95 checks, `sg`/grep-to-declaration). Verdict:

- **One outright built-tense LIE beyond D60: D67** (anth-direct — above). D68 carries the same purge shadow (`ANTH_DIRECT_SAMPLING`).
- **Two rename drifts:** D109's `RpgTurnConnection` → `RpgTurnContext`; D112's `logMalformedCalls` → `malformedToolCalls`.
- **One vocabulary-count shadow:** D31's `CHAT_APIS` parenthetical.
- **One disposition conflict:** D59 (crew) vs the later owner ruling.
- **Everything else checked out.** Spot-verified true across the range: D9/D10/D11/D32 kit homes; D35 (`rate-limit.ts` exists, no `schema/runtime.ts`); D38 events; D56 (no `simpleSend`; `commitMessage` exists per D111); D61's LANDED half (`safeFetch`/`isAllowedImageBuffer`/`EGRESS_FIREWALL` present; hub half is committed-tense, honest); D65 (role-policy.ts); D71 (theme machinery); D73/D74 (chrome registry, assemble-chrome.ts); D78 (autosave factory); D106 (clamp.ts/matrix.ts/resolveHistoryFloorSeq/viewerReadsHidden); D107 (knob-wire-coverage + tempChatTtlHours etc.); D108–D115 rpg symbol set (staging/flush-barrier/salvageExtraction/constrainExtractionSchema/trackerCeiling/carriesTracker/rpgPopulateSchema/promote-actor/actor-rekey); D116 (no `authorsNote`); D117 (contribution.ts/keyByKind/startWorkloadEnvelope/lanes/poison path); D118 (stream router + sources + gate); D119 (defineContextRegion/rpg-hud-region); D120 (settings contributions + partition assert). D1–D30 are largely design-tense path/home rulings whose homes were confirmed where named (seam.ts, upload.ts, run-profile-import.ts, resolve-variant.ts, vllm/, infra/image, credentials mint, …).

**Net:** the ledger is in far better truth-shape than the tier/status docs — the rot concentrates in *snapshot* docs (STATUS, the two ST registers, Audits-and-Debt) and *inventory lists* inside tier docs, not in rulings. The one systematic ledger failure mode is a purge that no one swept the registry for (D60, D67, D68 — all the same 07-22/25 event).

## 6. Gate-candidate assessment (can a build-tense-claim linter exist honestly?)

**Yes for two narrow arms; no for the general case.**

- **Arm 1 — backticked-path existence (RECOMMEND, mechanically holdable):** every backtick token in `docs/architecture/core/**` that parses as a repo path (`packages/…`, `docs/…`, `scripts/…`, `tests/…`, plus the resolvable shorthands `domain/<x>/…` → `packages/server/src/domain/…`, `entry/…`, `infra/…`, `kit/<x>` → `packages/kit/src/<x>`, `@orb/<pkg>/<mod>` → `packages/<pkg>/src/<mod>`) must exist on disk, with a cited-allowlist for deliberately-dead mentions (struck-through/rider'd text, "the deleted X", reserved future homes). This audit's own sweep was exactly that script and it found gif-search/host.ts/anth-direct/agent-principals/render-trust in one pass. It is the `dangling-refs` shape (which already does md LINKS + gate docRows) widened to prose backtick paths — same gate family, both-ways ratchet for the allowlist. Main cost: the shorthand resolver must be total or fail-open per token (unresolvable shapes skip, never guess).
- **Arm 2 — backticked-symbol existence (RECOMMEND with a fence):** a backtick token matching `[A-Z][A-Za-z0-9_]*[A-Z_]` (UPPER_SNAKE tuples, PascalCase types) or ending in `()` in core docs must have a declaration hit in `packages/**` (ts-morph name index, not grep). This finds `REATTRIBUTE_WINDOW`/`ANTH_DIRECT_SAMPLING`/`parseNeoPresetFile`/`RAIL_SLOTS`-class rot. Fence: only flag tokens ALSO absent from `tests/**` and `scripts/**`, and allowlist rider-quoted dead names — otherwise every "the deleted `X`" sentence reds. Expect a real founding-violation burn-down (this audit's fixes are most of it).
- **REFUTED — a general build-tense linter** ("X is built/wired/landed" ⇒ verify): tense detection is prose NLP, and the truth of "wired" is a *graph* property (a symbol can exist yet be product-unreachable — the dead-wire class), which no honest static rule can decide. The counts class ("N routers", "49 rules") is similarly unholdable generically — each count needs a bespoke comparator; the existing pattern for that is the `enforcement-registry-parity`/`knob-wire-coverage` per-count gate, minted only where a count is load-bearing.
- **Already-covered ground, don't duplicate:** `d-citation-integrity` (D-refs), `pd-citation-integrity`, `dangling-refs` (md links + gate doc paths), `gate-modernization` arm C (§-anchors in gate docRows — the thing that caught UI-Gates §12.6).

## 7. Coverage statement (honesty)

Read claim-by-claim + tree-verified: Core-Path-Registry (full), Core-Laws-and-Precedents, Core-STATUS, Core-Legacy-Migration, Core-Shared-Dissolution, Spine-Config, Knowledge-Cluster, Core-Planning, Tier-1/2/3/3b/4/5, Spine-TypeScript, Spine-Testing, Core-ST-Feature-Gap-Register, Core-SillyTavern-Feature-Map, Chat-Macro-Resolution, Core-Docs-Formatting-Law, Core-0, Core-Enforcement-Active-Gates, Core-Enforcement-Deferred-Dropped, AGENTS.md, Core-Audits-and-Debt (structure + PD-17 depth). **Lighter (targeted build-tense/symbol sweeps + path sweep, not line-by-line):** Documentation-Law, UNIFIED-VERIFICATION-DESIGN (ci.yml refs verified accurate — manual-dispatch), UI-Gates-and-Lessons (beyond the fixed items), UI-Primitives-and-Reuse, UI-Theming-and-Content (BUILT tables spot-checked: policy.ts, security-headers.ts, seed-themes present), ui-package-design (beyond the fixed row), motion-and-animation-guide (BUILT claims spot-checked: tabs/toast/sortable variants present), and the three CERD design docs (Spine-Identity/UI-Arch/lockdown — CERD's territory). Claims in the lighter set may still hide drift below the sweep's threshold.
