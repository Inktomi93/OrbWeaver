---
kind: history
status: archived
updated: 2026-08-08
---

# Wiring audit (AU-8 second sweep) — complete report, 2026-08-01

> Snapshot audit (\[\[audit-lists-are-snapshots]] — re-sweep before acting). Completes the 07-31 first
> sweep (AU-1…7, board §C3). Method: knip:prod × pnpm-ast/ast-grep cross-check, grep only as the
> corroborating second method. TRK-1-lane rpg files deliberately skipped (mid-rewrite).

## Ranked action table

| # | Finding | Class | Size |
| - | - | - | - |
| 1 | `automation.stream` — server-built + server-tested SSE channel, ZERO client surface (no features/automation dir, no hook; only an anticipatory CT stub) | WIRE-L or explicit-DOORWAY — **owner call**; the sse-multiplex spec must record whichever | L |
| 2 | `chat.setUserMacroValues` — verb + cross-tenant tested, zero client callers (= #24 MU-picks pane's server half) | WIRE | M |
| 3 | `chat.setChatDocumentVisibility` — D85 host databank override, verb tested, zero client callers (databank scope test says "what writes this in production") | WIRE | M |
| 4 | `ResolvedWarning`/`WarningCode` provider layer — reaches no user surface | DOORWAY (= EFF-3, workboard-tracked, D112-cross-referenced) | — |
| 5 | `rpg.extraction.*` events | logs-only-by-design (D112: "a log can never disagree with what applied") | — |
| 6 | `GroupOutput` independently declared 4× (one contract export, 3 local re-declarations) | dedup | S |
| 7 | \~24 internal-use-only over-exports (all verified live via same-file callers; incl. two grep false-orphans corrected — see gotcha) | cosmetic export-strip | S |
| 8 | `tailwindcss` unlisted dep (ui globals.css) + `tsx` unlisted root binary | manifest hygiene | S |

## Sweep results

**A. knip:prod (73 exports + 12 types):** 24 = over-exported-but-live (same-file callers) · \~15 =
test-only-alive but contract-pinned BY DESIGN (StoreDigest/StoreSegment params, SourceKind/SourceLens
membership pins, etc. — legitimate) · rpg entries skipped (TRK lane) · rest = the table above.
`WorkerTickOutcome` + `AssemblyFormHandle` = genuinely internal, zero external refs.

**B. chat router (39 procs):** 37 wired (incl. `chat.commitMessage` via use-composer-utilities.ts:21);
2 zero-caller (table #2/#3).

**C. bus exhaustiveness:** ChatBusEvent → assertNever switch ✓ · UserBusEvent → Record-total dispatch ✓
· RpgBus → Record dispatch (not deep-audited, TRK lane) · `automation.stream` = table #1.

**D. warning vocabularies:** ChatWarningCode (10 members) → warning-notice.ts assertNever — FULLY
user-surfaced ✓ · ResolvedWarning → table #4 · rpg.extraction.\* → table #5.

## Methodology gotcha (banked in memory)

Two repo files carry stray NUL bytes (`chat/memory/build/substrate/transcript.ts`,
`tests/ui/markdown/policy.test.ts`) — plain grep silently treats them as binary and no-matches
ordinary ASCII, which manufactured two false "orphan" verdicts (`speakerLabel`,
`UNTRUSTED_ALLOWED_PREFIXES`), caught by `grep -a` re-runs. Also worth stripping the NULs someday.

## Not covered

rpg contracts/tools/apply/widgets (TRK-1 rewriting) · model-picker/card/assembly-preview files (their
lanes) · per-member RpgBusEvent audit · rpg.extraction beyond doc+grep.
