---
kind: reference
status: active
updated: 2026-07-13
---

# Orbweaver — Enforcement Registry: Deferred + Dropped

> The NOT-yet-active gates (each with a named activation trigger) and the explicitly-rejected neo gates (why they don't apply to a greenfield build). Active gates: `Core-Enforcement-Active-Gates.md`. Dropped-experiment postmortems in full: `history/enforcement-archaeology-record.md`. Each row here is ONE ruling line — the what + the trigger; the saga is in history.

---

## Deferred backlog — neo gates not yet ported, with activation trigger

These are tracked, not dropped. Each turns on when its target code exists; until then it would only
false-fire or be vacuous. Numbers reference neo's `scripts/check/`.

| Gate | What it does | Activates when |
| - | - | - |
| `touch-target-floor` (component half) | RENDERED half of the D62 P1 per-pointer floor: a coarse-pointer CT sweep asserting every interactive primitive's effective hit area (boundingBox ∪ the `::before` expansion) is ≥44px on the governed axis (NOT the stale D43 unconditional rule). BUILT + green as a browser-lane belt (`tests/ui/touch-target-floor.suite.ct.tsx`), not a `pnpm check` gate | trigger SUPERSEDED by the D62 no-CI ruling (ci.yml is manual-dispatch-only) — the CT suite at pre-push carries it; nothing further to activate |
| `assets-single-writer` | only `domain/assets` writes the assets table + `storeBlob` (the one CAS coherence site) | assets domain built (PRE-SCAFFOLD §A1) |
| `asset-owner-gated` | assets are per-user (`assets.ownerId` + `unique(ownerId,hash)`); the `/blob/:hash` route resolves the caller (session cookie) + `fetchOwned` (or the roster-avatar membership exception) — NEVER serves on bare row-existence; `Cache-Control: private`; the CAS is per-user keyed (ledger D21 — "no leaks ever") | assets domain + blob route built |
| `discovery-no-vector-write` | `discovery` embeds nothing — no write into the embeddings vector tables | discovery + embeddings domains built (§A1) |
| `dead-code` (knip) | unused exports / files / deps | PROMOTED 2026-07-13 — LIVE as the `deps:knip` static-tier stage in `pnpm check` (see Active-Gates Layer 4); this row is retained only as the deferral record |
| `api-surface` | public package-surface drift snapshot ("lock the surface") | packages export a stable surface |
| `monotonic-tests` | test-count baseline only grows (behavior lock) | PROMOTED — `status:"active"` (see Active-Gates); the committed manifest is RE-ARMED (2026-08-03) — the deleted-test arm reads `docs/test-baseline/manifest.json` with a two-sided `deletions` ledger and fail-loud on a missing/malformed manifest |
| `suppressions` | `biome-ignore` count ratchet + audit (reasons are already biome-native) | post-Phase-1 baseline (count-down ratchet needs existing code) |
| `provider-vocab` | provider-routing vocabulary has one home | connection domain built |
| `env-natures` | settings "four natures" split, machine-locked | settings domain built |
| `serde-core` | serialization-core invariants (one canonical home, layer-clean) | serde/import-export domains built |
| `bus-payload-allowlist` | credentials/secrets are **type-level-unrepresentable** in `ChatBusEvent` / `NotificationEvent`; all chat bus events are room-public (ledger D16) | chat + notifications domains built |
| `notifications-durable-first` | a notification is INSERTed in the membership-transition tx and fanned out only after commit (deliverable from the table alone); the stream uses the `chat.streamMessages` resume shape, never `buddy.stream` | notifications domain built |
| `optimistic-chat` | client optimistic-update call-site invariants | DROPPED 2026-07-07 — architecture-B (the `ChatHandle` union + `startChat` carry-params) makes the premise moot: a draft is a `{kind:"draft"}` handle, not an optimistic cache seed, so there are zero `isOptimistic` call-sites to gate (postmortem in history) |
| `design-tokens` | design-token file shape (globals.css) | client styling built |
| `substrate-clean` | substrate/canonical cleanliness ratchet | client built |
| `entity-editor` | entity-editor checklist ratchet | client entity editors built |
| `audit-client-tests` | client test audit | PROMOTED — `status:"active"` (see Active-Gates); row retained as the deferral record |
| `doc-tables` | docs ↔ code table-consistency | a docs-table convention is adopted |
| `no-inline-union-redecl` (tuple-vs-tuple) | UPGRADED: the active gate now flags an inline union or a `z.enum([…])` literal re-spelling a canonical tuple's members. Remaining (unbuilt): a 2nd `as const` tuple duplicating a 1st's members — contested (distinct axes may legitimately share a member set) | decide the distinct-axis-vs-dup policy |
| `dangling-refs` | prose pointers (paths/symbols) that lead nowhere | revisit (risk: doc-path refs); candidate post-Phase-1 |
| `abandoned-comments` | comments that lost their code anchor (report-only metric) | optional; revisit if churn warrants |
| `comment-density` | comment-density metric (report-only) | optional; revisit if a cap is agreed |
| `arch-metrics` | ArchUnitTS class-quality metrics (report-only) | optional |
| `show` | human-readable check-results viewer (UX) | optional (`report.ts` already prints readable output) |
| `enforcement-registry` | self-hosting gate that canonizes the catalog | optional (this doc is the catalog for now) |
| `fetch-fn-in-features` | bans a raw `fetch(` in `features/**` — multipart/binary goes to a `data/` fetch fn beside the existing four (`upload-asset.ts`/`import-tree.ts`/`import-bundle.ts`/`import-characters.ts`); everything else is tRPC (`client-architecture-lockdown.md` §10/§16 R5) | the first `fetch(`-in-features offender appears (zero today) |
| `shell-no-chrome-props` (shell-chrome §D) | the shell's component prop TYPES declare no feature-chrome ReactNode slot (the dead `railFoot`/`topbarTrail` injection seam) | DROPPED (permanent) 2026-07-16 — the seam it would guard is already type-DELETED: `AppShellProps` no longer exists and `AppShell()` takes zero props (`routes/app-root.tsx`), so the rot is unspellable at the strongest tier (compile). The REMAINING app-shell ReactNode props are a MIX of frame-grammar slots (`header`/`trail`/`actions`/`children`) and legitimate content composition (`ModalHost.body`, `SectionContent.fallback`, `SectionPlaceholder.description`); a prop-NAME allowlist cannot distinguish rot from legit composition (the §E-6 deferral rationale), and widening the allowlist to those content names makes it a name-denylist that guards nothing (the audit's no-half-gate rule) — as does a denylist of only the two dead names (any new name slips it). `no-parallel-section-map` (chrome arm) + `chrome-registry-completeness` already force new chrome through the registry. shell-chrome-unification.md §D/§E-7. |

### PREBUILT orphan seals (W6 ruling — owner, 2026-07-15)

Four sealed primitives were flagged as consumer-less by the derive-modernization audit; the owner
ruled them intentional pre-builds, not dead code — each carries a greppable `PREBUILT[for:<design-doc>]`
header naming its consumer. Contract: when the consumer lands, the marker deletes in the same edit
(the O1 self-cleaning shape); a `PREBUILT` whose cited doc is deleted is a Documentation-Law defect —
catch it at the next audit of this table.

| Seal | Cited consumer | Header lives at |
| - | - | - |
| `@orb/ui/diff` | `refinery` pipeline compare sub-part (D62 §4.1; refinery is a declared-PLANNED section, `client-architecture-lockdown.md` §6a) | `packages/ui/src/diff/diff.tsx` |
| `charts/meter` (`Meter` only — `SegmentedClock`'s consumer LANDED: the rpg quests tab renders it, so its marker was deleted per the W6 contract, truth-audit 2026-08-03) | rpg HUD widgets (`rpg-design/11-client-ui.md` — resource/pool rows; the module's other parts — TrackBar, RingGauge, waystone — are consumed) | `packages/ui/src/charts/meter/meter.tsx` |
| `stream/stream-text.tsx` | no named feature — sanctioned convenience wrapper over `useSmoothText`+`StreamShimmer` for a future plain-text streaming surface (`ui-package-design.md` §6.3.1) | `packages/ui/src/stream/stream-text.tsx` |
| `primitives/status-chip` | workloads/automation run-status chips (`automation-design/03-actions.md`; statuses mirror `workloads-deferred-designs.md` run lifecycle) | `packages/ui/src/primitives/status-chip/status-chip.tsx` |

### Dropped (do not port)

| neo gate | Why N/A |
| - | - |
| `clean-break` | retrofit-diff rule (delete-home-as-you-add-replacement); orbweaver is greenfield, no retrofits |
| `shared-structure` | governs neo's `src/shared/`; orbweaver has no `_shared` (kit/contracts replace it) |
| `import-alias` | neo aliased cross-LAYER imports because it was ONE package; orbweaver's layers are PHYSICAL packages, so it's now cross-PACKAGE `@orb/*` physics (dep-cruiser + not-in-package.json) + `no-cross` for cross-feature — the intra-package residual is cosmetic, YAGNI to gate (rationale in history) |
