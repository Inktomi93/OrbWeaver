---
kind: history
status: active
updated: 2026-07-13
---

# Misc core bundle — archaeology record

Frozen 2026-07-13, extracted from the misc core bundle during the de-archaeology pass:
`core/Chat-Macro-Resolution.md` and `core/Core-Docs-Formatting-Law.md`. The STANDING law — the macro
resolution rule + the formatting mechanics — lives on in those two core docs and the built code + its file
headers. This file is the build-provenance (task numbers, "was deferred / now built" journeys) and the
measured demos a cold agent does not need to reason about the live behavior. Git history is the deeper
archaeology.

## Chat macro/persona resolution — build provenance

The volatile-freeze + persona-attribution machinery landed across several tasks; the STANDING rule (raw
storage, commit-time freeze of nondeterministic macros only, per-view identity resolution, the one shared
`resolveRowMacros` atom, server-assemble == client-display parity) is now `Chat-Macro-Resolution.md`. The
journey, kept only so the lineage isn't lost:

- **Task #77 — volatile FREEZE at commit.** The RAW-storage-with-one-exception ruling (D51 + owner rule):
  nondeterministic clock/PRNG macros bake their value at the moment content commits, everything else stays
  raw/per-view. Implemented as `createVolatileOnlyRegistry` (the exact inverse of the names-only pass),
  sharing `registerVolatileMacros` with `createNamesOnlyRegistry` so the freeze axis can't drift.
- **Task #79 — greeting freeze at first user turn.** `freezeGreetingVolatiles` bakes each pre-first-turn
  assistant row's SELECTED greeting variant when the first user turn is detected (idempotent →
  concurrent-retry-safe). This graduated the greeting case from "malleable/swipeable, deferred" to BUILT.
  The still-open edge (a POST-first-turn swipe to a different, unfrozen greeting variant is not re-frozen,
  and the freeze is not re-emitted on the bus — a client sees the baked value on next refetch) survives as a
  standing known-gap note in the live doc, not as saga.
- **Task #59 — parity regression matrix.** The one-fixture oracle (chat anchor = Nyx, active = Zara, a user
  row stamped `personaId` = Mara, content `"{{user}} waves"` → resolves to Mara on BOTH server-assemble and
  client-display; Zara/"User" only when the stamp is null; a card `{{user}}` resolves to Nyx). Pins the
  viewer == model guarantee.
- **PD-100 (DONE 2026-07-04)** — `messages.personaId` attribution fallback (omitted param → the acting
  participant's active persona; explicit id or explicit null wins). **PD-129 (DONE 2026-07-13)** — the
  default-persona seeder (`createDefaultPersonaSeeder`) mints an editable default persona and points
  `defaultPersonaId`/`currentPersonaId` at it, so `{{user}}` now resolves a real persona NAME instead of the
  kit "User" floor; the floor survives only as the genuinely-no-persona legacy edge. Both rows are in
  `Core-Debt-Cleared-Ledger.md`.

## Docs formatting law — the measured demo + enforcement journey

The STANDING rules (compact tables, frontmatter passthrough, no reflow, deterministic style, idempotency)
live in `Core-Docs-Formatting-Law.md`. The measurements that justified them:

- **The prettier bloat.** The 2026-06-30 prettier pass alignment-padded every GFM table and inflated the
  corpus by \~550KB — the event that got prettier banned from markdown and made `.vscode/settings.json`
  disable markdown format-on-save. `format-md.ts` (remark, `tablePipeAlign:false`) exists precisely to undo
  and prevent that padding.
- **The `Tier-1-DB.md` demo.** Reformatting it compacted 101,852 → 49,545 bytes (−51%) but only −609 o200k
  tokens (−4.4%) — BPE compresses space runs, so the token win is real but modest (\~1.5% corpus-wide, \~8.3k
  tokens). The byte/line-width win is the bigger deal: padded rows ran 500–1500+ chars wide, burning
  tool-output truncation budgets (30k-char Bash caps, grep line dumps) and making targeted `Read` offsets
  useless. `Tier-1-DB.md` was measured at 51% padding by bytes.
- **Idempotency check.** `format(format(x)) === format(x)` was verified across all 73 docs at adoption (the
  corpus has since grown). A doc that round-trips unstably is a formatter bug, fixed in the script, never
  exempted.
- **Enforcement flip.** `check:docs` shipped ADVISORY — deliberately kept out of `pnpm check`/lefthook while
  \~72 pre-law docs would have red-failed every commit mid-sweep. It has since been wired as the `docs:format`
  stage in the verify registry (`scripts/verify/registry.ts`), running at `changed` + static tiers, so the
  flip described as "after the sweep" has happened — `pnpm check` now fails on an unformatted doc.
