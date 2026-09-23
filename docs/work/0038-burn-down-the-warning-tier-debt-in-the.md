---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: tooling
---

# Burn down the warning-tier debt in the liveness, refusal-coverage and family-reader policies, then make them blocking

## What

A whole-tree structure run on main still reports warning findings from three policies built to count down to zero, and no open work item covers any of them. real-corpus-liveness-manifest flags every final policy that has no RealCorpusLivenessArm pin in a family test under tests/tooling/verify/gates/. policy-refusal-coverage flags every final policy that reads a derived fact or resource population but pins no refusal, either through a mustRefuse row or through a family test that drives it via runPolicyPass. policy-family-readers flags every member of a multi-member family that imports no lib/ reader shared with a sibling. Fix each flagged site with the missing liveness pin, refusal pin or shared-reader import. Do not waive them. In the same commit that brings a policy's own count to zero, change that policy's descriptor to severity error (and authority hard where its header calls for it), as its header says. The blocking findings the exception-authority audit recorded are already fixed and need nothing. query-freshness-coverage-debt is left to the open board row that already owns it.

## Why

While these three policies stay at warning, a gate with no real-corpus liveness proof, or a policy that reports nothing when its fact supply fails, looks the same as a clean one. The issues that created the policies are closed but their counts never reached zero, so the remaining work has no owner. The audit ledger row is the only thing still pointing at it, and that row is deleted when docs/reviews/ast-codebase-audit goes.

## Done when

A whole-tree pnpm check:structure run on main reports no findings for real-corpus-liveness-manifest, policy-refusal-coverage and policy-family-readers. The descriptors in tooling/src/verify/gates/real-corpus-liveness-manifest.ts, policy-refusal-coverage.ts and policy-family-readers.ts all declare severity error.

## Evidence

Filled at landing: what ran and where its output is.
