---
kind: work
status: doing
updated: 2026-10-15
priority: P1
lane: codex/identity-notification-suppliers-1036
plan: test-foundation
---

# One builder per shape and one golden corpus

## What

Every contract output and database row has one builder in `@orb/testkit`, built from contract defaults or by running production. The seed tool writes one synthetic corpus that e2e, CTs, server tests and side-eye all read.

## Why

Hand-written fixtures drift from the contracts, and each test layer invents its own data.

## Done when

A builder exists per contract output and table; the corpus is committed and loaded by each test layer; a builder test reds when a contract adds a required field.

## Evidence

Production-derived builders call the real root. Database-subject fixtures do not establish composed behavior.

Native producers cover identity, funded execution, automation, plugins, RPG, SDK sessions, search and libraries. Private rows, credentials and physical observations remain Node-only. Portable projections preserve exact requests, viewer identity and stage. Known private literals refuse before diagnostics; unknown secrets and arbitrary encodings remain outside the claim. Clone authentication uses fresh credentials and joins disposal before database close.

Reviewed preset and automation wire schemas live in canonical contracts. Public index APIs remain; private facades are removed. Reviewed native tag, persona and roster projections retain exact viewer binding.

Integrated `0f010719c1` publishes native preset list/detail/effective reads, independently captured usage stages and live rules. Security review confirms native clone HTTP equality and ownership/member-splice rejection controls. Evidence: `.claude/worktrees/codex-native-config-999/reports/review/959-preset-publication-independent-security-review.md`.

Reviewed `10505b0a9c` applies the registered slow completion policy to the full native capsule. Its producers and assertions are unchanged; the current ordinary case passes. This is behavioral qualification, not a speedup or stable-timing claim. Evidence: `.claude/worktrees/codex-identity-notification-suppliers-1036/reports/review/959-corpus-producer-cost-diagnosis.md`.

Canonical row-builder chains and database fixtures are qualified within their selected cases, not every persistence verb. Evidence: `reports/review/959-table-builder-semantics.json`. Native output boundaries are inventoried; current supplier allocations and limits live in `reports/review/959-mounted-output-uses.json`.

Reviewed suppliers cover each canonical parser-output root in the frozen inventory. Defaults retain browser-safe value closures. Allocated native Host returns, callbacks, browser protocol, lifecycle refusals and log bounds pass independent security review. Evidence and per-root scope live in `reports/review/959-mounted-output-uses.json`; cohort deliveries and independent reviews remain linked there. The existing plugin/protocol supplier allocation is complete. Shared corpus adoption remains open. These captures do not authorize general legacy ports.

The committed corpus has lazy defaults, Node replay state and independent writable clones. Selected Node, CT, smoke and stage consumers pass without private selectors. Reviewed `08bdafe2ef` serves CT media through native viewer admission and production blob policy. Evidence: `.claude/worktrees/codex-identity-notification-suppliers-1036/reports/review/959-ct-corpus-media-delivery.md` and adjacent security review.

Reviewed plugin stages and injected-clock publication feed default native clones and Extensions. The public default-corpus E2E passes through an independent clone. Additive CI wiring retains ordinary smoke and its reports; actual GitHub qualification remains pending. Evidence: `reports/review/959-injected-clock-integrated-adoption.md`. Stable timing is unqualified. Complete adoption, smoke matrix and Snap qualification remain open.
