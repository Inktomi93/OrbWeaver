---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: tests
---

# Kit comments carry dates and issue numbers

## What

Comments across tests/support carry dates, issue numbers and incident history, which .claude/rules/comments.md and .claude/rules/writing.md forbid. Examples: tests/support/node/composed-real.ts, tests/support/iso/hit-extent-walk.ts, tests/support/browser/pixel-contrast.ts, tests/support/browser/touch-floor.ts.

## Why

A comment that tells history goes stale and hides the reason the code needs.

## Done when

Each such comment states only its non-obvious reason or is deleted; an rg for dates and issue-number patterns across tests/support comments finds none.

## Evidence

Pattern, comment lines only, `tests/support` excluding `node/server.ts`:

```text
rg -n -e '(//|/\*|^\s*\*).*(20\d\d-\d\d-\d\d|#\d{2,}|\bitem \d{3,}|\blane\b|used to|retired|previously|review found|cb-[a-z])' tests/support
```

- Before: 96 hits across 30 files. After: 4, all false positives (`unit lane`, `.int lane`, the fixed-epoch value in `iso/clock.ts`, `PKCS#10`).
- `node/server.ts` holds one hit (`item 1271`, line 270), left for the sibling lane that owns that file.
- Left open: string literals, not comments. Test titles in `iso/hit-extent-walk.test.ts`, `browser/touch-floor.ct.tsx` and `node/db.int.test.ts` carry `#NNNN`, and a thrown message in `browser/contained-within.ts` does too. Renaming them is a code change.
- `pnpm exec biome check tests/support --diagnostic-level=error` exit 0; `pnpm lint:eslint` on the changed files exit 0; `pnpm typecheck tsconfig.json` exit 0.
