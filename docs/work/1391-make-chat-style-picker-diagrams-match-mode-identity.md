---
kind: bug
status: doing
updated: 2026-10-27
priority: P3
area: client
lane: main
---

# Make chat-style picker diagrams match mode identity behavior

## What

Correct the Document option diagram, which draws avatars and name-like bars although the production Document mode intentionally omits identity.

## Why

A decorative preview may simplify typography, but it must not advertise the opposite structural behavior of the selected mode.

## Done when

Verify the real appearance picker against the production mode metadata and rendered Document treatment. Remove false identity cues from the diagram; do not add identities to Document or maintain a second mode contract.

## Case decisions

| Behavior | Layer and decision |
| - | - |
| Picker diagram represents Document identity policy | Add production appearance-contribution CT with visible prose and an identity-bearing mode as positive controls. |
| Actual message mode identity and reading behavior | Keep `tests/client/features/chat/components/chat-style-skins.ct.tsx`; do not duplicate its mode matrix. |

These cases address audit regressions, not wholesale legacy restoration. Execution remains pending until native results qualify the stated behavior.

## Evidence

Filled at landing: what ran and where its output is.
