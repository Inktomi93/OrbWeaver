---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
---

# Refuse a message_variants text write outside the canon writers

## What

The text cap sits in the shared builders in `packages/server/src/domain/chat/persistence/canon-write.ts` and in the import check in `packages/server/src/domain/chat/persistence/import-write.ts`; `packages/server/src/domain/chat/verbs/fork.ts` copies stored rows. Add an ESLint `no-restricted-syntax` selector in `eslint.config.ts` that refuses `.insert(messageVariants)`, and `.update(messageVariants)` whose `.set` names a text column, outside those three files. The non-text updaters (`packages/server/src/domain/chat/persistence/generation-observation.ts` and the two migrations' updaters) pass it untouched. A column brand was measured and rejected: drizzle brands the read type too.

## Why

Every writer is accounted for today; the risk is a future direct write that skips the cap.

## Done when

The selector lands with a rule test, and a planted `db.update(messageVariants).set({ content })` in a verb file fails lint.

## Evidence

Filled at landing: what ran and where its output is.
