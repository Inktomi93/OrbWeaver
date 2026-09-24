---
kind: work
status: open
updated: 2026-09-24
priority: P1
area: auth
plan: easy-sharing
---

# Easy-sharing leg J: invite-provisioned accounts, one path per auth mode

## What

Build leg J of docs/plans/easy-sharing/design.md with one clean path per auth mode: local provisions the account, oidc binds a separate pending record to a fresh per-transport pending cookie (never to state), forward-header binds to the proxy identity, and single-user refuses. Under OIDC_REQUIRE_APPROVAL an invite never counts as approval. Route the build to security-executor, and have a security review of the brief before the build.

## Why

The owner ruled that leg J ships only if it stays clean under every auth mode. A verifier found and closed a state-as-bearer hole in the plan.

## Done when

The leg J per-mode test list in the plan passes, including a copied state value and a replayed callback finding nothing, and a security review returns CONFIRMED.

## Evidence

Filled at landing: what ran and where its output is.
