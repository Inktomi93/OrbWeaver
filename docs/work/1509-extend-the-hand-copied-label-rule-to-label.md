---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-enforcement
---

# Extend the hand-copied label rule to label functions, error codes, routes and env keys

## What

orb/no-hand-copied-label indexes label-named constant exports only. Extend it, or add a sibling, to label-producing functions (contextToggleLabel), exported error code objects, route constants and env key constants, and record the convention that user-facing names live in zero-import .ts modules.

## Why

The audit's most frequent copy is a label or code that production exports under a shape the rule does not index.

## Done when

The rule refuses a planted copy of each kind and accepts the import; its findings over tests/ are fixed; the convention is in tests/support/README.md.

## Evidence

`orb/no-hand-copied-label` takes a `scope` option: `named` (the default and the repository config) keeps today's behaviour, and `all` adds the extended index. The index is `exportedProductionValues` in `tooling/src/eslint/test-labels.ts`:

- label-producing functions: an exported function named `*Label`, `*Name`, `*Title`, `*Copy` or `*Sentence` (any exported function in a copy module), indexed by the literal strings it can return;
- zero-import `*-copy.ts` and `*-names.ts` modules: every exported string, whatever the export is called, found by the production glob so a module with no door is covered;
- error code objects and codes (`*_CODES`, `*_CODE`): snake_case values with an underscore, so a one-word code stays prose;
- route objects (`*_ROUTES`, `*_ROUTE`): matched whole, with a query, or as the head of a path through a `:param`, the longest route winning;
- env keys (`*_ENV`, `*_KEY`): SCREAMING_SNAKE values.

At `all` the rule judges every string and template site in a test, except an object key, a type, an import or export source and a directive. The README records the convention (user-facing names live in zero-import `.ts` modules that production renders from) and the enforcement row.

Not done, by the coordinator's ruling: no finding is on. The sweep in 1426 turns the scope to `all` when its sites are fixed. The census is in `docs/work/1426-import-ct-and-e2e-accessible-name-labels-from.md`.

Red first: with `scopeOf` forced to `named`, 11 of the new refusal cases fail; restored, `tests/tooling/eslint-test-authoring.test.ts` passes. The cases plant a copy of each kind and accept the import: a label function's two branches, `RPG_OP_CODES` and `CHAT_OP_CODES` values, three route shapes, env keys as a computed key and as a read, plus the index unit test for zero-import copy modules, a copy module with a value import, codes, routes and env keys.

Limits: a template with a hole in a label function is not indexed, so `renameChatButtonName` is found through the constant `RENAME_CHAT_NAME` it is built from; a one-word code and a lower-case env value are left out; env keys defined in `tooling/src` are outside the production glob.

Floor: see the commit message.
