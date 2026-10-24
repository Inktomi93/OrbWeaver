---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: tooling
---

# Code comments carry no history

## What

About 3,600 comment lines in 847 client files carry history that `.claude/rules/comments.md` bans: issue numbers (`#1789`), review dates (`side-eye 2026-08-19`), ticket ids (`HUD-1`, `RV-8`), "used to", "formerly", and the banned word `load-bearing`. No lint enforces the rule.

## Why

History rots and buries the reason; git holds history.

## Owner ruling

2026-10-24: build the rule. Existing hits are baselined per file; new hits fail.

## Done when

An ESLint rule over `packages/**` and `tooling/**` source comments flags the history patterns, with planted controls; existing hits sit in a per-file baseline the rule reads, which only shrinks; the baseline count is reported, and a file that drops to zero leaves it.

## Evidence

`orb/no-history-comments` (`tooling/src/eslint/general.ts`) runs over `packages/**/*.{ts,tsx}` and `tooling/**/*.{ts,tsx}`. It flags issue numbers (two digits or more), `side-eye YYYY-MM-DD`, bare ISO dates, ticket ids (standard names such as `UTF-8`, `SHA-256` and `TEST-NET-1` excepted), "used to" (not the passive "is used to"), "formerly", "the old", "previously" (not the compound "previously-seen") and `load-bearing`. D-numbers and law sections never match.

The per-file baseline is `tooling/src/eslint/history-comment-baseline.json`: 10,444 hits in 2,186 files at landing (client 4,468, server 2,392, tooling 1,563, contracts 835, ui 605, kit 251, db 143, inference 129, showcase-plugins 50, default-content 6, plugin-sdk 2). A file over its count reports every hit.

`pnpm test:tools tests/tooling/eslint-history-comments.test.ts` passes 17 tests: a planted control per pattern fails at its span, the allowed anchors pass, and a baselined file passes at its count and fails above it. The ratchet test lints every population file and requires each count to equal its baseline entry, so growth, a new file and an unrecorded shrink all fail. A planted `(#1999)` in an unlisted file turned the ratchet red with `{ "tooling/src/eslint/css-classes.ts": [0, 1] }`.
