---
kind: work
status: open
updated: 2026-10-27
priority: P2
area: security
plan: cross-surface-consistency
---

# Resolve credential-bearing diagnostic output

## What

Assess the credential-bearing tooling failure output without printing or copying secret values. Keep the raw log private and separate credential remediation from the repaired test isolation.

## Why

Repairing the test does not remove credentials already written into diagnostic output.

## Done when

Have the owner resolve affected credential rotation or retention decisions. Sanitize retained evidence and remove unnecessary raw copies under the agreed policy. Do not revoke credentials automatically.

## Evidence

The raw `/tmp/orb-full-tooling-tests.log` contains real environment values emitted by a failed isolation test. Access is restricted to the owner. Do not print or copy it. Include any retained session diagnostic output in the exposure assessment.

The faulty module-mock approach is removed and native enforcement prevents its recognized filesystem forms. This repair does not establish that credential exposure is remediated.
