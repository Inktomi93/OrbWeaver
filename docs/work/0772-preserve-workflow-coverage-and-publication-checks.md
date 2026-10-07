---
kind: tooling
status: doing
updated: 2026-10-07
priority: P2
area: release
lane: codex/ci-dependency-upgrade
---

# Preserve workflow coverage and publication checks

## What

Classify executable hooks and runner configuration as code. Preserve successful retry evidence and validate published source identity before publication.

## Why

Skipped tests and scans can produce green results without the required evidence. Static verification can outlast its workflow timeout.

## Done when

Focused workflow controls pass. Image scanning surfaces registry failures. Source identity and retry evidence remain enforced; live workflow limits are explicit.

## Evidence

Focused workflow controls pass. Published-image scanning surfaces registry failures. Executable hook changes trigger testing; successful retry reports persist. Stable identity checks validate both the source stamp and OCI revision before cache export and publication.

The static deadline follows the completed local verification measurement. Existing runner-resource holds remain in place. Hosted execution and publication remain unverified.
