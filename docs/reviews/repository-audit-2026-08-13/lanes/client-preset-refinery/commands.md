# Command receipt — client-preset-refinery

All commands ran from /home/inktomi/inktomi-stack/development/orbweaver on 2026-08-13.
This is a rolling lane snapshot, not a whole-worktree snapshot.

| Time | Command / scope | Exit | Duration | Result |
| --- | --- | ---: | ---: | --- |
| 23:43 | assignment hash/line/byte reconciliation, 138 OWNED paths | 0 | 2.1s | No drift; 138 files, 22,448 lines, 1,207,813 bytes. |
| 23:44 | sed -n 1,$p over every assigned path | 0 | 0.6s | Full-text pass completed for 138/138 paths before AST. |
| 23:45 | full read of scripts/codemods/ast.ts; pnpm ast --help | 0 | 0.8s | Read 4,099-line resolved ts-morph instrument. |
| 23:45–23:47 | pnpm ast orphans preset/refinery | 0 / 0 | 52.8s / 47.0s | Preset: no unexempted orphans. Refinery: one future-marked export candidate, useDeleteRefinerySchema at line 54. |
| 23:47–23:49 | pnpm ast testonly preset/refinery | 0 / 0 | 59.6s / 56.6s | Candidates: sectionKind line 21, guidedFooterState line 198, and future-marked useDeleteRefinerySession line 130. |
| 23:49 | pnpm ast refs RefineryContentSurface; PresetEditorSurface | 0 / 0 | 30.3s / 14.1s | Resolved live compositions at refinery-section.tsx:18,83 and preset-content.tsx:11,19. |
| 23:49 | pnpm exec vitest run --project unit --project integration --project integration-serial with 13 assigned files | 0 | 2.8s | 13 files, 89 passed assertions: 8 unit files / 66 tests; 5 integration files / 23 tests. |
| 23:50 | node_modules/.bin/playwright test -c playwright-ct.config.ts with 23 assigned CT files | 0 | 64.0s | 198 passed; 0 failed, flaky, or skipped. |
| 23:50 | pnpm check:tests-membership; check:tests-execution-membership; check:orphan-ratchet | 0 | 35.5s | Test type membership 1,858 files / 4 programs; runner membership 1,689 files / 3 views; zero ratchet failures. |
| 23:50 | ast-grep RefineryContentSurface over owned refinery tests, TS and TSX | 1 / 1 | under 0.1s each | Valid negative: TS scanned 2 files and TSX scanned 9, both zero code occurrences. Literal rg found only a comment in _ct-stories.tsx:254. |
| 23:50 | final owned-file reconciliation | 0 | 0.9s | Still 138/138; no owned-byte drift. |

## Scan bounds and failures

- Broad pnpm ast lenses were polled at 30 seconds, completed well under five minutes, and did not time out.
- Direct ast-grep was used only because the repository AST tool has no component-mount test lens.
  It covered every assigned refinery test file: 2 TS and 9 TSX, none excluded, plus an independent literal search.
- Three pre-execution tool failures: two CT command rewrites injected rm -rf playwright/.cache and the guard rejected them; one ast-grep call used an invalid comma-combined no-ignore argument. The CT was then run by the direct project binary and ast-grep was rerun with repeated valid flags.
- No official runner exited non-zero, so no canonical failure artifact required reconciliation.
- Five story modules and one fixture are CT inputs rather than runners. No e2e or live test is assigned.
