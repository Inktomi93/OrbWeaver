---
kind: tooling
status: open
updated: 2026-11-11
priority: P2
area: tooling
---

# The citation test also refuses dead workflow paths, missing pnpm scripts, unresolvable package specifiers and unknown policy names

## What

`tests/tooling/doc/comment-path-citations.repo.int.test.ts` checks that a repo path cited in a comment or law doc exists. The same class of dead reference reached main in four other spellings that it does not read: a test path in a `run:` line under `.github/workflows/`, a `pnpm <script>` name in a comment or printed message that `package.json` does not define, an `@orb/<package>/<subpath>` specifier in a lint message that the package's exports map refuses, and a `policy` name that is neither a dependency-cruiser rule name nor an ESLint rule id. Each was found by hand in the codebase review and fixed per site under items 2432, 2433 and 2448.

## Why

A per-site fix does not stop the next rename from leaving the same dead reference, and nothing fails when it does.

## Done when

The test, or a sibling in the same directory, fails on a planted case of each of the four spellings and passes on the tree. It stays fast and in-process, reads the script names, exports maps and rule names from their real files, and holds no list of its own. It adds no framework and no waiver list.

## Evidence

Filled at landing: what ran and where its output is.
