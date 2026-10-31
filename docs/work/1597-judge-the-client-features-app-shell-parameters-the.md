---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/app-shell parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/features/app-shell`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `TopbarIconButton.#0.pressed` | `client/src/features/app-shell/components/shell-topbar.tsx:73` | unsupplied-prop | delete | delete the prop and its default path (3 calls) |
| `captureBugReportBundle.input.now` | `client/src/features/app-shell/lib/bug-report-capture.ts:144` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

Two rows: two applied, none kept, none handed off, no owner questions.

| Row | Result |
| - | - |
| `TopbarIconButton.#0.pressed` | applied: prop and `aria-pressed` removed in `packages/client/src/features/app-shell/components/shell-topbar.tsx`. The two users are `shell-topbar.tsx` (back and list toggle) and `context-toggle.tsx`; neither passes it |
| `captureBugReportBundle.input.now` | applied: `now` removed from `BugReportCaptureInput`; the window anchors on `captureClockMs()` in `packages/client/src/features/app-shell/lib/bug-report-capture.ts`. The only caller, `bug-report-button.tsx:161`, passes `note` and `windowMinutes` |

Survey: `codegraph_explore` on `TopbarIconButton pressed shell-topbar captureBugReportBundle input now bug-report-capture`; ast-grep and literal `rg` for `TopbarIconButton`, `captureBugReportBundle`, `BugReportCaptureInput` over `packages tests tooling scripts` (`-l ts` 5929, `-l tsx` 1524 files); literal `rg pressed` across `app-shell` and its tests: only `aria-pressed` role queries in unrelated CTs.

Proof: client typecheck clean. No CT mounts `TopbarIconButton` directly; the shell CTs in `tests/client/features/app-shell` render `ShellTopbar`.
