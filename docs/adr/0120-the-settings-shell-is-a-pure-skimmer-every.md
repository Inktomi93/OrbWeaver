---
kind: adr
status: active
updated: 2026-09-23
---

# the settings shell is a PURE SKIMMER: every section is a `SettingsSectionContribution` owned by its domain's feature, registered at the door; the shell derives nav/search/render from contributions and owns NOTHING

## Context

Not recorded in the ledger row.

## Decision

The physics (§2): per-section saves are clobber-safe via key-partitioned writes — `owns` declarations cover the user-tier namespace EXACTLY (`assertSettingsKeyPartition`, zero cited gaps) and the APP tier claims LEAF-AWARE paths (`AppSettingsClaimPath` + the nesting case: a claim inside another's claim throws either order — the parent-null-wipes-co-owner hazard is structural, not prose). No optimistic state, deliberately. Save status reports per-section into the transient store; ONE aggregate footer renders the fold (error>saving>saved), read-only by D41 — it locates failures, never retries them. **Landed shape:** appearance = 8 chat/app-shell/character sections (S1 `9d4646d4`; AppearanceForm deleted — the whole-blob-per-keystroke class dead, a full-blob patch is a tsc error) · chat-behavior = chat-owned (S2 `65f0865c`) · workloads+admin = sections (S3 `1eaa962c`; Ops stayed two sections — anchor stability beats naming) · System pane DELETED into 12 admin contributions w/ override-vs-floor honesty (S4 `7813dbed`+`723ea15d`; a floor is UNKNOWABLE once overridden — rows degrade to "reset to fall back") · `features/tag` + `features/regex` minted, settings evicts foreign domains (S5 `0072e598`, the O3/D114 amendment) · the seal (S6 `66a68408`): every §8 deletion receipted as pre-landed; `settings-pane-completeness` placeholder case RE-KEYED onto the §5.3 body union (it had died silently at S0 — a union-ifying refactor kills gate cases keyed on the old shape) + the SKIMMER-PURITY case (a sections-mode pane declaring its own `subcategories` = RED). Patch types are LOCAL aliases via `ReturnType` (exported alias = no-inline-types RED; interface loses tRPC's index signature). The two hand-maintained door mirrors (`settings-pane-registry.test.ts` partition test · `tests/support/browser/ct-data-providers.tsx`) must gain every new section. Every extracted section re-homes its suspending reads under its OWN QueryBoundary (a boundary-less nested suspender renders BLANK, silent to tsc) and is its own `@container`.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
