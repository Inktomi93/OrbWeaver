---
kind: bug
status: doing
updated: 2026-10-09
lane: wt/credentials-ct-flakes
---

# Repair credential check CT retries

## What

Diagnose and repair the unreachable-endpoint and subscription sign-in retries in the connection editor CT suite.

## Why

Hosted credential checks pass only after retry, so their first-attempt behavior remains unproven.

## Done when

Prove each cause with native or deterministic controls. Preserve endpoint admission and sign-in behavior, exact results and request payloads. Require retry-free affected CT evidence.

## Evidence

Filled at landing: what ran and where its output is.
