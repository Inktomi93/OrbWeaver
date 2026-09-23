---
kind: history
status: superseded
updated: 2026-07-13
---

# Enforcement archaeology record

> **FROZEN 2026-07-13.** Extracted from the enforcement pair (`core/Core-Enforcement-Active-Gates.md` and `core/Core-Enforcement-Deferred-Dropped.md`) during the de-archaeology pass. The LIVE law — what fails a build today, the deferred backlog, the rejected gates — lives in those two docs; this file is provenance and dropped-experiment postmortems only. Nothing here is enforced. Git history is the deeper archaeology.

## Provenance

Both enforcement docs were split out of the ledger index doc on 2026-07-02 (the D-ledger grew a
dedicated enforcement catalog). The active/deferred split followed the next day. The Layer-3 gate table
originally carried an **Origin** column (`neo (ported)` vs `new`, plus a wave/PD/task tag per row); that
column was dropped 2026-07-13 — gate lineage is git-blame territory, not standing law. The neo-ported
gates were: `feature-structure`, `test-layout`, `commented-code`, `schema-branding`, `db-structure`,
`component-size` (+ the dormant `component-size-ui`, `monotonic-tests`, `audit-client-tests`). Everything
else was written new for orbweaver.

## Adoption waves (the dropped Origin tags, summarized)

- **PD-116 fired-trigger wave (2026-07-03).** The 7 deferred gates whose triggers had fired were built +
  promoted: `vector-scope-derived`, `turn-identity`, `membership-enforcer`, `owner-role-split`,
  `bus-coverage`, `member-card-clamped`, and the 7th as the property suite `solo-byte-identical`.
- **Ledger-gate wave.** The D21–D51 schema/contract gates: `ownerid-registry`, `no-untyped-soft-ref`,
  `db-enum-from-tuple`, `schema-banned-shapes`, `warning-code-coverage`, `infra-auth-no-userid`,
  `content-part-seam`, `no-raw-egress`.
- **Client-foundation wave (2026-07-09).** `no-array-literal-querykey`, `no-inline-invalidate-outside-seam`,
  `bus-onData-no-store-write`, `no-form-reset-in-autosave`, `persist-partialize-and-total-migrate`.
- **W1 waves.** `state-files` (W1-0c), `diagnostic-legibility` (W1-D), `test-presence-client` /
  `surface-in-a-container` (W1-1), `zustand-selector-derived` (task #51).
- **D62 design-enforcement wave (2026-07-11 →).** `no-raw-interactive-intrinsics`, `empty-state-has-action`,
  `no-arbitrary-tw-values`, `no-off-token-radius-shadow`, `motion-token-purity`, `no-off-token-inline-style`,
  `asset-refs-fk-coverage` (task #114).

## Founding catches (why the gates earned their place)

- **`owner-role-split`** — its founding catch fixed a live D17 violation: the auth seam's inline `isAdmin`
  was routed through the `can()`/`requireAdmin` seam.
- **`member-card-clamped`** — codified the PD-111 duplicate-clamp deletion (`getRosterCardView` stays dead).
- **`bus-coverage`** — founding census found 8/26 chat-bus members unwired → PD-89 (a trio) + PD-117 (the
  other five).
- **`no-effect-on-shared-selection`** — the "neo chase reborn": neo's `this_chid` shared-selection effect
  chase, reborn as a gate.
- **`infra-auth-no-userid`** — bans the neo tier-collapse (identity→row leaking a `userId` into `infra/auth`).
- **`tsconfig-routing-parity`** — its four founding false-green bugs: tests/client tsx → graph not client;
  ct-data-providers → ui not client; vite.config → no program; tests/ui tsx → graph not ui.

## Dropped-experiment postmortems

### `optimistic-chat` (DROPPED 2026-07-07)

Superseded by architecture-B: the `ChatHandle` discriminated union + the `startChat` carry-params. A draft
is NOT an optimistic query-cache seed (`state/chat-handle.ts` rejected `isOptimistic`); it is a distinct
`{kind:"draft"}` handle whose pre-send edits live in the `draft-config` store and ride `chat.startChat`
carry-params at first send. There were ZERO `isOptimistic` call-sites to gate — the fully-editable-draft
feature (greeting · overrides · roster · injections · group, all carried to commit) made the gate's premise
moot.

### `import-alias` (NOT PORTED from neo)

Neo forced cross-LAYER imports through aliases because neo was ONE package (`src/{shared,server,db,client}`)
whose resolver couldn't police layer boundaries. Orbweaver made those layers PHYSICAL packages, so the rule
became cross-PACKAGE `@orb/*` physics (dependency-cruiser + not-in-package.json) plus
`client-feature-front-door`/`no-cross` for cross-feature. The residual (intra-package deep-relative vs
`#lib`) is cosmetic, not a boundary — YAGNI to gate.

### Other rejected neo gates

- `clean-break` — a retrofit-diff rule (delete-home-as-you-add-replacement); orbweaver is greenfield, no
  retrofits.
- `shared-structure` — governs neo's `src/shared/`; orbweaver has no `_shared` (kit/contracts replace it).
