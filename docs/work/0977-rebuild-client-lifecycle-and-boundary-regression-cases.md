---
kind: bug
status: open
updated: 2026-10-22
priority: P2
plan: test-foundation
---

# Rebuild client lifecycle and boundary regression cases

## What

Rebuild client regression cases for initial-read invalidation, PostEventSource subscription lifetimes, invalid auth-config inputs and data-list-header behavior through production entries.

The [restoration register](../plans/test-foundation/design.md#restoration-register) distinguishes completed invite cases from the unavailable-card return-to-sign-in action still needing coverage. This item's open status does not authorize another wholesale invite port. Keep existing OIDC and first-run join journeys in E2E.

## Why

Reference cases identify useful behavior but are outside the maintained test and compiler population.

## Done when

Each selected case records its layer and keep, rebuild, move or drop decision. Uncovered behaviors have maintained replacements and relevant failing defect controls. Preserve strict parsing, subscription cleanup and real client composition. Remove redundant cases and unsupported helpers with their replacements.

## Evidence

Use the external reference cases for initial-read invalidation and PostEventSource only as case descriptions. Corpus producer, clone, search and cleanup qualification belongs to the corpus-lifetime work item.

### Invite runtime evidence

The [restoration register](../plans/test-foundation/design.md#restoration-register) owns current dispositions and maintained test links. OIDC runtime acceptance remains [separate work](1082-qualify-the-existing-oidc-pending-join-e2e.md).

The named CTs and pure-function test pass. Removing the production late-focus handler, in-flight confirmation guard or unnamed-room fallback fails the corresponding control. Restoring production source returns the selected tests to green. Fresh CT source maps identify the altered component source during those checks.

The replacements add no production export or copied assembly. Component navigation assertions describe client behavior under scripted HTTP, not session-cookie authority. This evidence does not close the remaining lifecycle, invalid-auth-config or data-list-header cases.
