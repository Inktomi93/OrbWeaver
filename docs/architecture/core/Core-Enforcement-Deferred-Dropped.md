---
kind: reference
status: active
updated: 2026-07-03
---

# Orbweaver — Enforcement Registry: Deferred + Dropped

> Split from `Core-Laws-and-Precedents.md` (2026-07-02). The NOT-yet-active gates (each with a named future activation trigger — backlog/goals) and the explicitly-rejected neo gates (archeology — why they don't apply to a greenfield build). Active gates are in `Core-Enforcement-Active-Gates.md`.

---

## Deferred backlog — neo gates not yet ported, with activation trigger

These are tracked, not dropped. Each turns on when its target code exists; until then it would only
false-fire or be vacuous. Numbers reference neo's `scripts/check/`.

| Gate | What it does | Activates when |
| - | - | - |
| `assets-single-writer` | only `domain/assets` writes the assets table + `storeBlob` (the one CAS coherence site) | assets domain built (PRE-SCAFFOLD §A1) |
| `asset-owner-gated` | assets are per-user (`assets.ownerId` + `unique(ownerId,hash)`); the `/blob/:hash` route resolves the caller (session cookie) + `fetchOwned` (or the roster-avatar membership exception) — NEVER serves on bare row-existence; `Cache-Control: private`; the CAS is per-user keyed (ledger D21 — "no leaks ever") | assets domain + blob route built |
| `discovery-no-vector-write` | `discovery` embeds nothing — no write into the embeddings vector tables | discovery + embeddings domains built (§A1) |
| `dead-code` (knip) | unused exports / files / deps | **DEFERRED to \~4c–6** — knip false-fires now: `contracts`/`db`/`kit` export symbols the domains (4c), transport/entry (4d/4e), and client (6) don't consume yet (same reason `no-orphans` is set to `ignore`). When the consuming tiers land, adopt a workspace knip config seeded from neo's `.config/knip.json` (entry: routes / shadcn / provider barrels; ignore: CSS-only deps). |
| `api-surface` | public package-surface drift snapshot ("lock the surface") | packages export a stable surface |
| `monotonic-tests` | test-count baseline only grows (behavior lock) | first real test suite + baseline file |
| `suppressions` | `biome-ignore` count ratchet + audit (reasons are already biome-native) | post-Phase-1 baseline (count-down ratchet needs existing code) |
| `provider-vocab` | provider-routing vocabulary has one home | connection domain built |
| `env-natures` | settings "four natures" split, machine-locked | settings domain built |
| `serde-core` | serialization-core invariants (one canonical home, layer-clean) | serde/import-export domains built |
| `bus-payload-allowlist` | credentials/secrets are **type-level-unrepresentable** in `ChatBusEvent` / `NotificationEvent`; all chat bus events are room-public (ledger D16) | chat + notifications domains built |
| `notifications-durable-first` | a notification is INSERTed in the membership-transition tx and fanned out only after commit (deliverable from the table alone); the stream uses the `chat.streamMessages` resume shape, never `buddy.stream` | notifications domain built |
| `optimistic-chat` | client optimistic-update call-site invariants | **DROPPED 2026-07-07** — superseded by architecture-B (the `ChatHandle` discriminated union + the `startChat` carry-params). A draft is NOT an optimistic query-cache seed (`state/chat-handle.ts` rejected `isOptimistic`); it is a distinct `{kind:"draft"}` handle whose pre-send edits live in the `draft-config` store and ride `chat.startChat` carry-params at first send. ZERO `isOptimistic` call-sites to gate — the fully-editable-draft feature (greeting · overrides · roster · injections · group, all carried to commit) makes this gate's premise moot. |
| `design-tokens` | design-token file shape (globals.css) | client styling built |
| `state-files` | canonical store layout (zustand) | client state built |
| `substrate-clean` | substrate/canonical cleanliness ratchet | client built |
| `entity-editor` | entity-editor checklist ratchet | client entity editors built |
| `audit-client-tests` | client test audit | client tests exist |
| `doc-tables` | docs ↔ code table-consistency | a docs-table convention is adopted |
| `no-inline-union-redecl` (tuple-vs-tuple) | **UPGRADED (4b)**: the active gate now flags an inline union (any position, incl. interface property) OR a `z.enum([…])` literal array that re-spells an EXISTING canonical tuple's member set (the AUTH\_MODE class). Remaining: a 2nd `as const` TUPLE duplicating a 1st's members — doctrinally contested (distinct axes may legitimately share a member set, e.g. `REASONING_DISPLAY_MODES`/`THINKING_DISPLAYS`, ledger §5 vs D5), so left unbuilt pending that policy call. | decide the distinct-axis-vs-dup policy |
| `dangling-refs` | prose pointers (paths/symbols) that lead nowhere | revisit (risk: doc-path refs); candidate post-Phase-1 |
| `abandoned-comments` | comments that lost their code anchor (report-only metric) | optional; revisit if churn warrants |
| `comment-density` | comment-density metric (report-only) | optional; revisit if a cap is agreed |
| `arch-metrics` | ArchUnitTS class-quality metrics (report-only) | optional |
| `show` | human-readable check-results viewer (UX) | optional (`report.ts` already prints readable output) |
| `enforcement-registry` | self-hosting gate that canonizes the catalog | optional (this doc is the catalog for now) |

### Dropped (do not port)

| neo gate | Why N/A |
| - | - |
| `clean-break` | retrofit-diff rule (delete-home-as-you-add-replacement); orbweaver is greenfield, no retrofits |
| `shared-structure` | governs neo's `src/shared/`; orbweaver has no `_shared` (kit/contracts replace it) |
| `import-alias` | forced cross-LAYER imports through aliases because neo was ONE package (`src/{shared,server,db,client}`) the resolver couldn't police. Orbweaver made those layers PHYSICAL packages — the rule is now cross-PACKAGE `@orb/*` physics (dep-cruiser + not-in-package.json) + `client-feature-front-door`/`no-cross` for cross-feature. Residual (intra-package deep-relative vs `#lib`) is cosmetic, not a boundary — YAGNI to gate. |
