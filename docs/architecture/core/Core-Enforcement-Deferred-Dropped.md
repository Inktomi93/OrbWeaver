---
kind: reference
status: active
updated: 2026-08-17
---

# Orbweaver — Enforcement Registry: Deferred + Dropped

> The NOT-yet-active gates (each with a named activation trigger) and the explicitly-rejected neo gates (why they don't apply to a greenfield build). Active gates: `Core-Enforcement-Active-Gates.md`. Dropped-experiment postmortems in full: `history/enforcement-archaeology-record.md`. Each row here is ONE ruling line — the what + the trigger; the saga is in history.

---

## Deferred backlog — neo gates not yet ported, with activation trigger

These are tracked, not dropped. Each turns on when its target code exists; until then it would only
false-fire or be vacuous. Numbers reference neo's `tooling/src/verify/`.

**THIS TABLE IS NOW HELD AGAINST THE TREE, in one direction** (#2008, 2026-09-12). `ledgers:fresh`
(`pnpm check:ledgers-fresh`, on every `pnpm check`) reds when a row here reads as not-yet-ported and
`tooling/src/verify/gates/<id>.ts` is on the tree. It was one-sided until then, and five rows were living
lies: `assets-single-writer`, `suppressions`, `bus-payload-allowlist`, `dangling-refs` and
`fetch-fn-in-features` all shipped and all still read as waiting. **A row whose trigger has fired says
`PROMOTED` / `DROPPED` / `SUPERSEDED` and names where the rule now lives.**

**What is NOT held, deliberately: the reverse direction.** A row marked `PROMOTED` whose gate is not a
module can still be honest — `dead-code` was promoted into the `deps:knip` STAGE under a different id —
and where a promotion landed is prose in the trigger cell rather than anything a census can read. A
tripwire that guessed would fire on the one honest row and prove nothing. **And a trigger whose CONDITION
has fired while no gate landed is not held at all**: that is a reading task against constitution §2.2's
enforcement LADDER — a control-flow-dependent or per-request property is routinely held by a behavioural
suite by design, so "no gate of that name" is never evidence of a gap. Ask which TIER holds it before
filing one.

| Gate | What it does | Activates when |
| - | - | - |
| `touch-target-floor` (component half) | RENDERED half of the D62 P1 per-pointer floor: a coarse-pointer CT sweep asserting every interactive primitive's effective hit area (boundingBox ∪ the `::before` expansion) is ≥44px on the governed axis (NOT the stale D43 unconditional rule). BUILT + green as a browser-lane belt (`tests/ui/touch-target-floor.suite.ct.tsx`), not a `pnpm check` gate | trigger SUPERSEDED by the D62 no-CI ruling (ci.yml is manual-dispatch-only) — the CT suite at pre-push carries it; nothing further to activate |
| `assets-single-writer` | only `domain/assets` writes the assets table + `storeBlob` (the one CAS coherence site) | PROMOTED — `tooling/src/verify/gates/assets-single-writer.ts`, rostered in Active-Gates; row retained as the deferral record |
| `asset-owner-gated` | assets are per-user (`assets.ownerId` + `unique(ownerId,hash)`); the `/blob/:hash` route resolves the caller (session cookie) + `fetchOwned` (or the roster-avatar membership exception) — NEVER serves on bare row-existence; `Cache-Control: private`; the CAS is per-user keyed (ledger D21 — "no leaks ever") | TRIGGER FIRED (assets domain + blob route built) and the property is HELD ELSEWHERE ON THE LADDER (§2.2), re-derived 2026-09-12 (#2008): the write half by `owner-scoped-writes` / `owner-scoped-upserts` and the read half by `owner-scoped-reads`; the ROUTE half is a per-request control-flow property no structural gate can decide and is held by `tests/server/transport/cross-tenant-sweep.suite.int.test.ts`, which every router-touching merge runs. **No gate of this name is owed.** |
| `discovery-no-vector-write` | `discovery` embeds nothing — no write into the embeddings vector tables | PROMOTED — the fence landed as `vector-scope-derived` (a vector-table WRITE outside the sanctioned homes is RED, and `discovery/persistence` is admitted as a READ home for in-RAM analytics only, D20). Re-derived 2026-09-12 (#2008); row retained as the deferral record |
| `dead-code` (knip) | unused exports / files / deps | PROMOTED 2026-07-13 — LIVE as the `deps:knip` static-tier stage in `pnpm check` (see Active-Gates Layer 4); this row is retained only as the deferral record |
| `api-surface` | public package-surface drift snapshot ("lock the surface") | packages export a stable surface |
| `monotonic-tests` | test-count baseline only grows (behavior lock) | PROMOTED — `status:"active"` (see Active-Gates); the committed manifest is RE-ARMED (2026-08-03) — the deleted-test arm reads `docs/test-baseline/manifest.json` with a two-sided `deletions` ledger and fail-loud on a missing/malformed manifest |
| `suppressions` | `biome-ignore` count ratchet + audit (reasons are already biome-native) | PROMOTED — `tooling/src/verify/gates/suppressions.ts` with its committed ratchet ledger; row retained as the deferral record |
| `provider-vocab` | provider-routing vocabulary has one home | TRIGGER FIRED (connection domain built) and HELD by `providers-runner-seal` — the constitution's own tell for this boundary is *"providers imports zero domains, and runner/family never appear in domain/\*\*"*, which is exactly that gate. Re-derived 2026-09-12 (#2008); no gate of this name is owed |
| `env-natures` | settings "four natures" split, machine-locked | TRIGGER FIRED (settings domain built) and HELD by `sole-env-reader` — the four natures differ by WHO may read the environment, and that is the reader seal. Re-derived 2026-09-12 (#2008); no gate of this name is owed |
| `serde-core` | serialization-core invariants (one canonical home, layer-clean) | PROMOTED — landed as `serde-core-seal` + `serde-core-seal-health` (the importer seal on `@orb/kit/png-card-chunk`); that module's own header cites THIS row as its origin. Re-derived 2026-09-12 (#2008); row retained as the deferral record |
| `bus-payload-allowlist` | credentials/secrets are **type-level-unrepresentable** in `ChatBusEvent` / `NotificationEvent`; all chat bus events are room-public (ledger D16) | PROMOTED — `tooling/src/verify/gates/bus-payload-allowlist.ts`, rostered in Active-Gates (still on the legacy descriptor under the #1584 mixed runtime, which is a CONTRACT state and not a deferral); row retained as the deferral record |
| `notifications-durable-first` | a notification is INSERTed in the membership-transition tx and fanned out only after commit (deliverable from the table alone); the stream uses the `chat.streamMessages` resume shape, never `buddy.stream` | TRIGGER FIRED (notifications domain built) and HELD AT THE BEHAVIOURAL TIER BY DESIGN (§2.2): insert-in-the-transaction-then-fan-out-after-commit is a control-flow ORDERING, which no structural gate can decide; `tests/server/domain/notifications/verbs/replay-since.int.test.ts` and the domain's own int suite hold it, and the router-merge floor names the first by path. Re-derived 2026-09-12 (#2008); no gate is owed |
| `optimistic-chat` | client optimistic-update call-site invariants | DROPPED 2026-07-07 — architecture-B (the `ChatHandle` union + `startChat` carry-params) makes the premise moot: a draft is a `{kind:"draft"}` handle, not an optimistic cache seed, so there are zero `isOptimistic` call-sites to gate (postmortem in history) |
| `design-tokens` | design-token file shape (globals.css) | TRIGGER FIRED (client styling built) and SUPERSEDED by a whole family rather than one gate: `no-color-literals`, `css-var-defined`, `css-family-ownership`, `css-length-tokens`, `css-selector-has-a-writer`, `sanctioned-css-homes`, `no-off-token-inline-style`, `no-off-token-radius-shadow`, `class-token-splice`, `motion-token-purity`, `tokens-contract`. The neo row's subject (one `globals.css` shape) no longer exists — CSS has SIX declared homes (`client-architecture-lockdown.md` §4). Re-derived 2026-09-12 (#2008) |
| `substrate-clean` | substrate/canonical cleanliness ratchet | TRIGGER FIRED (client built) and SUPERSEDED: the neo "substrate/canonical" ratchet's subject is covered structurally by `client-structure`, `feature-structure` and `ui-primitive-structure`, which are layout LAW rather than a count-down ratchet. Re-derived 2026-09-12 (#2008) |
| `entity-editor` | entity-editor checklist ratchet | TRIGGER FIRED (client entity editors built) and remains OPTIONAL by nature: the neo row is a report-only CHECKLIST ratchet, not an invariant, and the load-bearing half (draft identity and its commit) is held by `stale-draft-commit` plus the EntityDraftStore suites. Re-derived 2026-09-12 (#2008); nothing is owed unless a checklist is agreed |
| `audit-client-tests` | client test audit | PROMOTED — `status:"active"` (see Active-Gates); row retained as the deferral record |
| `doc-tables` | docs ↔ code table-consistency | a docs-table convention is adopted |
| `no-inline-union-redecl` (tuple-vs-tuple) | UPGRADED: the active gate now flags an inline union or a `z.enum([…])` literal re-spelling a canonical tuple's members. Remaining (unbuilt): a 2nd `as const` tuple duplicating a 1st's members — contested (distinct axes may legitimately share a member set) | decide the distinct-axis-vs-dup policy |
| `dangling-refs` | prose pointers (paths/symbols) that lead nowhere | PROMOTED — `tooling/src/verify/gates/dangling-refs.ts`, rostered in Active-Gates; the doc-path-ref risk was resolved in that module's own fences; row retained as the deferral record |
| `abandoned-comments` | comments that lost their code anchor (report-only metric) | optional; revisit if churn warrants |
| `comment-density` | comment-density metric (report-only) | optional; revisit if a cap is agreed |
| `arch-metrics` | ArchUnitTS class-quality metrics (report-only) | optional |
| `show` | human-readable check-results viewer (UX) | PROMOTED — the `show` verb exists (`pnpm check:show`, `tooling/src/verify/cli.ts show`), and it reports which run id it read and refuses when this checkout's last run died. Re-derived 2026-09-12 (#2008); row retained as the deferral record |
| `enforcement-registry` | self-hosting gate that canonizes the catalog | PROMOTED — self-hosting landed as `enforcement-registry-parity`: this doc's declared registered-gate COUNT and its ACTIVE/DORMANT tables are reconciled against the DISCOVERED roster in BOTH directions. Re-derived 2026-09-12 (#2008); row retained as the deferral record |
| `fetch-fn-in-features` | bans a raw `fetch(` in `features/**` — multipart/binary goes to a `data/` fetch fn beside the existing four (`upload-asset.ts`/`import-tree.ts`/`import-bundle.ts`/`import-characters.ts`); everything else is tRPC (`client-architecture-lockdown.md` §10/§16 R5) | PROMOTED — `tooling/src/verify/gates/fetch-fn-in-features.ts`, rostered in Active-Gates; row retained as the deferral record |
| `shell-no-chrome-props` (shell-chrome §D) | the shell's component prop TYPES declare no feature-chrome ReactNode slot (the dead `railFoot`/`topbarTrail` injection seam) | DROPPED (permanent) 2026-07-16 — the seam it would guard is already type-DELETED: `AppShellProps` no longer exists and `AppShell()` takes zero props (`routes/app-root.tsx`), so the rot is unspellable at the strongest tier (compile). The REMAINING app-shell ReactNode props are a MIX of frame-grammar slots (`header`/`trail`/`actions`/`children`) and legitimate content composition (`ModalHost.body`, `SectionContent.fallback`, `SectionPlaceholder.description`); a prop-NAME allowlist cannot distinguish rot from legit composition (the §E-6 deferral rationale), and widening the allowlist to those content names makes it a name-denylist that guards nothing (the audit's no-half-gate rule) — as does a denylist of only the two dead names (any new name slips it). `no-parallel-section-map` (chrome arm) + `chrome-registry-completeness` already force new chrome through the registry. shell-chrome-unification.md §D/§E-7. |

### PREBUILT orphan seals (W6 ruling — owner, 2026-07-15)

Four sealed primitives were flagged as consumer-less by the derive-modernization audit; the owner
ruled them intentional pre-builds, not dead code — each carries a greppable `PREBUILT[for:<design-doc>]`
header naming its consumer. Contract: when the consumer lands, the marker deletes in the same edit
(the O1 self-cleaning shape); a `PREBUILT` whose cited doc is deleted is a Documentation-Law defect —
catch it at the next audit of this table. **That audit ran on 2026-08-17** — all four rows re-derived
with `pnpm ast importers` on each barrel (scanned=4924), and TWO had gone stale: `charts/meter` and
`@orb/ui/diff` both have live production consumers, so their markers were deleted per the contract
(rows struck through below). `stream/stream-text` and `primitives/status-chip` still have exactly zero
consumers outside their own CT — those markers are doing their job and STAY.

| Seal | Cited consumer | Header lives at |
| - | - | - |
| ~~`@orb/ui/diff`~~ RETIRED 2026-08-17 — the section it waited for BUILT: refinery's review surfaces render `DiffView` (accept-review\.tsx, context-tabs.tsx), so its marker was deleted per the W6 contract. | was: `refinery` pipeline compare sub-part (D62 §4.1) | was: `packages/ui/src/diff/diff.tsx` |
| ~~`charts/meter`~~ RETIRED 2026-08-17 — the LAST unconsumed part of the module found a consumer: the refinery payload view renders `Meter` for bounded-number fields, so its marker was deleted per the W6 contract (`SegmentedClock` went the same way on 2026-08-03). The rpg HUD rows it was sealed for are still unbuilt; they now inherit a consumed primitive. | was: rpg HUD widgets (`rpg-design/11-client-ui.md`) | was: `packages/ui/src/charts/meter/meter.tsx` |
| `stream/stream-text.tsx` | no named feature — sanctioned convenience wrapper over `useSmoothText`+`StreamShimmer` for a future plain-text streaming surface (`ui-package-design.md` §6.3.1) | `packages/ui/src/stream/stream-text.tsx` |
| `primitives/status-chip` | workloads/automation run-status chips (`automation-design/03-actions.md`; statuses mirror `workloads-deferred-designs.md` run lifecycle) | `packages/ui/src/primitives/status-chip/status-chip.tsx` |

### Dropped (do not port)

| neo gate | Why N/A |
| - | - |
| `clean-break` | retrofit-diff rule (delete-home-as-you-add-replacement); orbweaver is greenfield, no retrofits |
| `shared-structure` | governs neo's `src/shared/`; orbweaver has no `_shared` (kit/contracts replace it) |
| `import-alias` | neo aliased cross-LAYER imports because it was ONE package; orbweaver's layers are PHYSICAL packages, so it's now cross-PACKAGE `@orb/*` physics (dep-cruiser + not-in-package.json) + `no-cross` for cross-feature — the intra-package residual is cosmetic, YAGNI to gate (rationale in history) |
