---
kind: tooling
status: open
updated: 2026-11-14
priority: P3
area: tooling
plan: test-enforcement
---

# The hand-copied label rule misses log event names, log messages and strings production spells inline

## What

orb/no-hand-copied-label (tooling/src/eslint/test-labels.ts) is mounted on every test and refuses a string a test spells when production exports it under a name ending in label, name, title, copy or sentence, in a copy or names module, as an op code, a route or an env key. Reviews of the review-fix work still found tests copying production strings the rule could not see: a log event name and an unclassified-fault event name spelled inline in production with no exported constant, a dropped-append log message, the words Delete and Theme in a Looks test where production writes them inline in a component, and a back-link sentence built from a template with a substitution. The rule indexes exports; a string production itself writes inline has nothing to match. Known inline sites from the visual pass, each with no export for a test to import: Back buttons in `packages/client/src/features/credentials/components/add-connection-form-body.tsx`, `packages/client/src/features/automation/components/rule-preset-picker.tsx`, `packages/client/src/features/preset/components/preset-fork-choice-dialog.tsx` and the default in `packages/client/src/features/app-shell/components/shell-topbar.tsx`. The later and latest message labels in `packages/client/src/features/chat/components/transcript-window.tsx`. The status card's door in `packages/client/src/features/rpg/components/rpg-status-tab.tsx` builds its label inline. The embedder sentences in `packages/client/src/components/connection-role-slot.tsx` pass the raw connection label instead of the shared summary, so they keep the plain separator and unbroken slashes.

## Why

The rule already holds the law that a test derives its values from production. Its blind spots are where the copies now collect, and each is one small extension or one export in production.

## Done when

The rule's index gains a kind for log event names and log messages, by export name, and matches a substitution-free prefix or suffix of an exported sentence function's template where that is sound. A census lists the test literals that equal a string production spells inline; each such production string gets one exported constant in its feature's copy or names module, or its package's log module, so the rule can see it. The rule lands with planted cases and the tree at zero, with no suppression.

## Evidence

Filled at landing: what ran and where its output is.
