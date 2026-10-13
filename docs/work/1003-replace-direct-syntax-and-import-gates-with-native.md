---
kind: tooling
status: doing
updated: 2026-10-13
priority: P1
area: tooling
lane: codex/native-restrictions-1003
plan: test-foundation
---

# Replace direct syntax and import gates with native restrictions

## What

Move no-layout-context-props, no-caller-user-id, no-if-is-group, no-untrusted-html-in-main-dom, route-imports-no-feature and query-machine-seals into maintained native configuration. Move direct no-form-state-in-useeffect syntax into native restrictions; retain only its unmatched computed-name analysis. Remove query-machine-seals-health after replacing its import permission mechanism. Delete obsolete gate registrations, grants and redundant proofs with their implementations. Preserve actual policy populations and justified file-and-capability exceptions.

## Why

Literal syntax and import predicates do not need compiler-backed gate implementations or grant certification machinery. Maintained tools already express these restrictions.

## Done when

Native configuration rejects the forbidden source shapes and admits the relevant supported alternatives on the same populations. Ordered ESLint overrides preserve other active restrictions. Obsolete custom implementations and their exclusive support code are deleted. Bounded native controls and affected program checks pass; one substantive review confirms the migration. Shared-selection taint, invalidation graphs, conditional query windows and manual memo origin policy remain separate work.

## Evidence

The form reader resolves const-bound computed member and callee names through shared code facts. Native selectors cannot follow those bindings. Keep that semantic remainder without duplicating the direct syntax checks or adding another reader.

Native parser handling also rejects parenthesized direct group conditions and effect callees. Parentheses do not change the prohibited operation. Record this checker correction and prove it with bounded controls; preserve the substantive population and accepted-source exclusions.
