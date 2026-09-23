---
kind: decision
status: blocked
updated: 2026-09-23
priority: P3
area: automation
blocked: owner
---

# Decide whether AutomationOps/PluginHostV1 need a surface allowlist gate

## What

The no-message-insert wall for background automation and plugins (`docs/adr/0188-background-automation-and-plugins-never-write-a-message.md`) is enforced only by review and by the op-type contract rejecting calls to ops that do not exist. An unbuilt gate option is a bus-payload-allowlist-shaped check on the AutomationOps and PluginHostV1 surfaces.

## Why

Adding an op today is caught only in review, not by a gate; the owner has not ruled whether review-only enforcement is final for this class.

## Done when

The owner rules whether to file and build the allowlist gate or to keep review as the final enforcement. See also docs/work/0046-every-law-rule-is-enforced-by-a-gate.md.

## Evidence

Filled at landing: what ran and where its output is.
