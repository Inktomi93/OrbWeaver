---
kind: plan
status: active
updated: 2026-11-12
rank: 1
---

# Who may act on whose data, and who may see it

## Goal

Every verb that takes a target user, a target user's resource or a viewer's visibility refuses what the caller's role does not reach, decided by the kernel and proved by a test through the real router. An owner's resources are out of a delegated admin's reach unless a decision says otherwise.

## Shape

Work the open authorization and visibility findings in priority order. Each fix names the kernel decision it goes through and adds a row to the sweep of verbs that take a target. Client controls follow the server refusal and are never the only guard.

## Rejected

A client-side filter as the guard. A new comparison in a verb where the kernel can decide.

## Coupled sites

The role predicates in the identity contracts and the role comparison lint rule.

## Test plan

One test per verb through the real router as the lower role, with the owner or host succeeding as the positive control.
