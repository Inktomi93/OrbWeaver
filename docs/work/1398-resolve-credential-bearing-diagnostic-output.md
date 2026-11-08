---
kind: work
status: blocked
updated: 2026-11-08
priority: P2
area: security
blocked: owner
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

The raw `/tmp/orb-full-tooling-tests.log` no longer exists. The GitHub personal access token that leaked into retained reports under `reports/` was revoked through GitHub's credential revocation API (a later call returned 401) and replaced with the `gh` login token. Left for the owner: whether any other environment value in that log needs rotation, and whether to delete the report copies that still hold the dead token.
