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

Reuse the maintained invite-component cases in the [chat case map](../plans/test-foundation/design.md#selected-case-map-chat-permissions-and-history). Keep existing OIDC and first-run join journeys in E2E. Compare each remaining reference assertion before restoring it.

## Why

Reference cases identify useful behavior but are outside the maintained test and compiler population.

## Done when

Each selected case records its layer and keep, rebuild, move or drop decision. Uncovered behaviors have maintained replacements and relevant failing defect controls. Preserve strict parsing, subscription cleanup and real client composition. Remove redundant cases and unsupported helpers with their replacements.

## Evidence

Use the external reference cases for initial-read invalidation and PostEventSource only as case descriptions. Corpus producer, clone, search and cleanup qualification belongs to the corpus-lifetime work item.

### Invite component dispositions

| Reference behavior | Decision and maintained home |
| - | - |
| Ready/loading preview, late popup focus, invalid preview, dismissal and refused redemption | Rebuilt in [join-invite-dialog.ct.tsx](../../tests/client/features/chat/anchors/join-invite-dialog.ct.tsx), through the public component and production providers. |
| Unavailable preview, persona validation/focus, canonical submission, in-flight submit guard, approval and refusal | Rebuilt in [login-pending-join.ct.tsx](../../tests/client/features/auth/components/login-pending-join.ct.tsx), through the public login surface and real router context. |
| Invite wording and anonymous/unnamed-room variants | Moved to [invite-copy.dom.test.ts](../../tests/client/lib/invite-copy.dom.test.ts); duplicate capitalization-only CTs are not restored. |
| OIDC callback, pending-join dismissal and URL/history cleanup | Keep [the existing E2E](../../tests/e2e/oidc-pending-join.oidc.spec.ts); its runtime acceptance remains [separate work](1082-qualify-the-existing-oidc-pending-join-e2e.md). |

The named CTs and pure-function test pass. Removing the production late-focus handler, in-flight confirmation guard or unnamed-room fallback fails the corresponding control. Restoring production source returns the selected tests to green. Fresh CT source maps identify the altered component source during those checks.

The replacements add no production export or copied assembly. Component navigation assertions describe client behavior under scripted HTTP, not session-cookie authority. This evidence does not close the remaining lifecycle, invalid-auth-config or data-list-header cases.
