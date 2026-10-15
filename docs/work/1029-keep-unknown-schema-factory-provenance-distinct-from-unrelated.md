---
kind: tooling
status: open
updated: 2026-10-15
priority: P2
area: tooling
plan: test-foundation
---

# Keep unknown schema factory provenance distinct from unrelated factories

## What

Extend the existing canonical factory provenance boundary to preserve unknown nested-property outcomes separately from proven unrelated factories. Update no-raw-id through that shared owner without a second resolver or package-spelling grant.

## Why

Independent review reproduced an inherited false clean for an imported declared object with an any-typed nested member used as userId: bag.nested.string(). The native member reader refuses, but the Boolean factory helper collapses that refusal to false and the consumer treats it as unrelated.

## Done when

The imported opaque nested-member control reports the existing unreadable outcome. Direct, renamed, wrapped canonical, numeric, counterfeit and local-shadow controls preserve their actual decisions. Shared positive-only consumers retain their contract; no unknown result becomes a negative identity proof. Affected controls and independent review pass.

## Evidence

Independent review confirms the imported opaque nested-member false clean on the base and candidate. Native property lookup refuses, but the Boolean factory predicate collapses that result into unrelated identity. Evidence: `.claude/worktrees/codex-zod-barrel-identity-1028/reports/review/1028-zod-barrel-identity-security-review.md`. Implementation remains unstarted.
