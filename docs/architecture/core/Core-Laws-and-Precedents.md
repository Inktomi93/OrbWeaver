---
kind: law
status: active
updated: 2026-08-03
---

# Core-Laws-and-Precedents

> The master ledger doc. The D-numbered path/home rulings live in the registry (§7 → `Core-Path-Registry.md`); the enforcement catalog is the two sibling docs (§Enforcement); this file holds the locked principles (§0) and the redirect index. **On ANY conflict the ledger (`Core-Path-Registry.md`) wins over every other doc.** §1–§6 were the 2026-06-25/26 greenfield planning + reconciliation body — their standing rulings promoted into the registry, the `Spine-*`/`Tier-*` docs, and the built code; the play-by-play is frozen in `../history/core-laws-archaeology-record.md`.

## 0. Locked principles (the constitution — `Core-0-Architecture-and-Structure.md`)

1. Boundaries are physics (pnpm workspace packages), not lint — the cake `kit ← contracts ← db ← server ← client` is resolver-enforced.
2. `#` intra-package, package deps cross-package, ZERO `paths` aliases (package scope is `@orb/*` — native via pnpm, no alias tooling; the shadcn `@/` alias is not carried over).
3. Name by role; **no `_shared` / `_` junk drawers** — services are features, primitives + engines are `kit`.
4. One central `tests/` tree mirroring `src` 1:1.
5. "unwired ≠ worthless" — evaluate intent, don't auto-delete.
6. **kit-purity ruling:** `@orb/kit` MAY use isomorphic npm (zod/typeid-js/luxon/remend); may NOT use `node:*` / contracts / db / domain / I/O. Node-only-pure → `@orb/server/kit`.
7. **Parity is proven, not assumed:** chat + memory are gated by a cross-repo differential oracle against the neo-tavern reference clone (diff SEND/ASSEMBLE/RECEIVE + cache-token counts). The clone is the reference, not deleted.

## 1. Code-grounded reconciliation resolutions (R1–R12)

The 2026-06-25 reconciliation corrections. Their standing rulings are absorbed into the registry + the built code (e.g. the serde home R3 → `server/kit/serde/card`; `AssetKind` R4 → `@orb/contracts/assets`; the isomorphic PNG codec R6). The full R-table is frozen in [`../history/core-laws-archaeology-record.md`](../history/core-laws-archaeology-record.md) §1.

## 2. Committed decisions by area

The per-doc "Lean" notes, promoted 2026-06-25. Each area now lives in its canonical home — read that, not a second copy:

| Area | Home |
| - | - |
| identity / auth / permission | `Spine-Identity-and-Auth.md` |
| settings / config / serialization | `Spine-Config-and-Serialization.md` |
| infra / providers | `Tier-3-Infra.md` · `Tier-3b-Providers.md` |
| knowledge cluster (embeddings/search/discovery/memory/stats) | `Knowledge-Cluster.md` |

The original promoted bullets are frozen in [`../history/core-laws-archaeology-record.md`](../history/core-laws-archaeology-record.md) §2.

## 3. Deferred-to-scaffold — the one remaining deferral

Of the six 2026-06-25 scaffold-gating defaults, five FIRED and are now law in their homes (UI engine = Base UI, D42/D54 · version pins = the pnpm catalog · agent-principal mechanics = D60 · agent credential inheritance = LIVE, D17 · event-bus = D38). One remains genuinely deferred:

- **COMMITTED (not yet built, YAGNI):** `contracts/observability` mirror · t-digest latency · per-knob settings-form details. No module exists (`contracts/observability` is absent); it lands only when a real external consumer / measured need appears.

The full fired-vs-open table is frozen in [`../history/core-laws-archaeology-record.md`](../history/core-laws-archaeology-record.md) §3.

## 4. Build order

The ordered runbook is frozen at **`../history/Core-BUILD-PLAN.md`** (superseded 2026-07-25 — the live working doc is `docs/retro-workboard.md`). The scaffold order + the `@orb/contracts` internal build DAG (completed build archaeology — the edges that made `tsc` fail during scaffolding) are frozen in [`../history/core-laws-archaeology-record.md`](../history/core-laws-archaeology-record.md) §4.

## 5. Council-driven decisions (2026-06-25 greenfield review)

The 5-seat council's committed calls are now law in their canonical homes — v1 participant-membership + deferred agent-mint (`Spine-Identity-and-Auth.md`, D60); local-light CPU tier (D39, `Tier-3b-Providers.md §2b`); the `can()`-throws seam (`domain/admin/guard.ts`); the union-redecl + inline-types gate formats (`Spine-TypeScript-and-Patterns.md §5.5` + the gates); the day-one blocking gate suite (`Core-Planning-and-Checklists.md`). The durable narrative record is [`../history/planning-council-record.md`](../history/planning-council-record.md); the committed-calls text is frozen in [`../history/core-laws-archaeology-record.md`](../history/core-laws-archaeology-record.md) §5.

## 6. Testing standards

Canonical: **`Spine-Testing.md`** (lanes by suffix, `test-presence`/`test-determinism`, mock + factory doctrine); layout is `Core-0-Architecture-and-Structure.md §5` + the `test-layout` gate. The 2026-06-26 consolidation record is frozen in [`../history/core-laws-archaeology-record.md`](../history/core-laws-archaeology-record.md) §6.

## 7. The path/home registry (D1–D78, D86, D106–D124)

THE decision registry — every ledger ruling D1–D78, D86, and D106–D124, one file. Cite as `Core-Path-Registry.md D<n>` or `Core-Laws-and-Precedents.md §7 D<n>` — D-numbers are stable global ids; grep the id. If a doc ever disagrees with a D-entry, the registry wins. **D79–D105 are RESERVED** for main-era rulings that rolled back with the retro burn-down while the code obeying them survived — never mint a new ruling into that range; see the reserved-range note in `Core-Path-Registry.md`.

- **D1–D78, D86, D106–D124** → [`Core-Path-Registry.md`](Core-Path-Registry.md) — THE registry, one file (merged 2026-07-13, D66; D70 = client-architecture lockdown is law, 2026-07-14; D71 = the theme-palette pipeline — generated seed value-sets, seeds render static, polarity-aware `light-dark()` intent tokens, clamp-derived color-scheme; D72 = a machine ships WITH its seal — mint → migrate → SEAL in one wave; D73 = clusters-are-registries + D74 = You ⊃ Identity ⊃ Account (shell-chrome program close, 2026-07-16); D75–D77 = the neo-parity accepted deltas, 2026-07-16 — debug surface stays read-only/eval-free, healthz stays minimal, ingress XFF-only + empty-403; D78 = autosave entity forms mount only through the factory session boundary; D106 = chat read-visibility — presence-interval clamp, two planes, one verdict; D107 = a declared knob is WIRED or CITED-DORMANT — the knob-wire-coverage ratchet, 2026-07-25; D108 = the retro rpg-lite carve + the extraction delivery-model amendment, 2026-07-26; D109 = the rpg-lite two-turn exchange \[character turn + state round] + the out-of-turn consent-inheritance precedent + the `structured` provider role + the 6-mode connection canon, 2026-07-27; D110 = the PARITY-PLUS program — the content-class visibility registry + the rpg data planes (delta/relationship/level/cast-fields) + the macro-engine parity workstream MG/ME/MU + the P3–P6 feature-wave doorways, owner-greenlit + foundation-landed 2026-07-27; D111 = the crunchy-cluster rulings — extraction rides the transcript + `resyncFromStory`, ruling A \[the tracker records surface reality; hidden truth stays in the reasoning channel/reveal-eye], the ST-style composer wand + `chat.commitMessage`, fork clones the game with host-secret strips + the dangling-pointer heal — built 2026-07-28, minted 2026-07-31; D112 = the hosted extraction FOLD — `extractionMode:"folded"` mounts the 7 state tools TERMINALLY on the character turn \[AMENDS D108/D109-1], the terminal-tools chat primitive \[attached auto, never resolved/recursed/recorded], errors-as-data degrade with banned-silent-fork observability, freshness corrected \[only folded is live-at-commit] — built 2026-07-31 @ `940969f6`; AMENDED 2026-08-01 — the LOCAL-ENGINE FOLD GUARD: folded on a local vLLM wire runs the cheap round instead of mounting terminal tools, gated on the measured `ModelCapability.tools.silencesProse` capability fact via `coEmitsProseWithTools`, loud as `fallbackReason:"local-engine-fold-guard"`); D113 = tracker unification stage 1 (pools + cast-fields + widgets collapse into ONE def); D114 = the O3 amendment — a settings section homes with its READER; D115 = POPULATE-FROM-CHARACTER, the one sanctioned model doorway into hand-only born state; D116 = INJECTIONS is the ONE per-chat prose door; D117 = the workloads junk-drawer exit (SUPERSEDES D4); D118 = SSE-1, one multiplexed socket per tab; D119 = HUD-1, the context panel IS the HUD (+D119a's two-arm vertical budget); D120 = SET-SEAMS, every settings section is self-owned; **D121 = the preset + actor-state close-out** — the role-authority law (one kernel `can()`, cited chokepoints, ENFORCEMENT vs DATA-PROJECTION), the permissions-model page (`Spine-Identity-and-Auth.md` §2c–§2e), the EIGHTH rail section (AMENDS D62-P6), the lifecycle chrome anatomy (band=Import · kebab=Export), and D53's STORAGE amendment (authority/tier/ReDoS clauses preserved); **D122 = multi-human persona resolution** — playing a persona in a room consents its PRESENTATION SURFACE to the room, gated on the owner's PRESENT membership via the persona-domain op (never a copy, never reader-keyed); three-state triggerPersonaId (null binds the ANCHOR); + the first-run rider (forced dialog on real first sign-in only, seeder auto-creates solely under E2E\_HARNESS/DEV\_SEED).
- **D65** → OIDC group-derived roles (extends D17), in the registry.

## Enforcement registry

- **Active gates** — the catalog of what fails a build today → [`Core-Enforcement-Active-Gates.md`](Core-Enforcement-Active-Gates.md)
- **Deferred + dropped gates** — backlog (with activation triggers) + rejected neo gates → [`Core-Enforcement-Deferred-Dropped.md`](Core-Enforcement-Deferred-Dropped.md)
