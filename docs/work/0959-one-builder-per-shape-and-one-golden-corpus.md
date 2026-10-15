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

The world-split kit calls the real server root. Builders derive values from canonical types, defaults or actual producers. Database-subject fixtures remain distinct from composed production evidence.

Native corpus producers cover identity/session transitions, funded execution, automation, plugin containment, RPG lineage, SDK sessions, search and library operations. Private rows, credentials and physical observations stay outside portable DTOs.

Portable projections preserve exact finite requests, native viewer identity and stage. Known raw and JSON-escaped private literals refuse before parser diagnostics. This guarantee excludes unknown secrets and arbitrary encodings. Fixture identities select data; they do not authenticate clones.

Fresh native clone login, credential rotation and logout controls preserve independent viewers and unchanged publication bytes. Source credentials refuse on scrubbed DB/CAS clones. Disposal joins before database close.

Reviewed preset and automation wire schemas live in canonical contracts. Public index APIs remain; private facades are removed. Reviewed native tag, persona and roster projections retain exact viewer binding.

Integrated `0f010719c1` publishes native preset list/detail/effective reads, independently captured usage stages and live rules. Security review confirms native clone HTTP equality and ownership/member-splice rejection controls. Evidence: `.claude/worktrees/codex-native-config-999/reports/review/959-preset-publication-independent-security-review.md`.

The combined native capsule passes on `661739bb6e` with its unchanged guard and shared recipe. Evidence: `reports/runs/test/main-3259091-2026-10-15T16-27-16-101Z/test-report.json`. Owner-funded indexing and canonical image tie ordering remain production-owned. This selected case does not establish complete application qualification.

Canonical row-builder chains and database fixtures are qualified within their selected cases, not every persistence verb. Evidence: `reports/review/959-table-builder-semantics.json`. Native output boundaries are inventoried; current supplier allocations and limits live in `reports/review/959-mounted-output-uses.json`.

Reviewed suppliers cover each canonical parser-output root in the frozen inventory. Defaults retain browser-safe value closures. Selected native Host returns, callbacks, lifecycle refusals and log bounds pass. Evidence and per-root scope live in `reports/review/959-mounted-output-uses.json`; cohort deliveries and independent reviews remain linked there. Unallocated aliases, variants, protocol hard states and shared adoption remain open. These captures do not authorize general legacy ports.

The committed corpus has lazy defaults, Node replay state and independent writable clones. Selected Node, CT, smoke and stage consumers pass without private selectors. Reviewed `08bdafe2ef` serves CT media through native viewer admission and production blob policy, using the actual frontend input. Credentials and layout remain Node-only; payload bytes are unchanged. Evidence: `.claude/worktrees/codex-identity-notification-suppliers-1036/reports/review/959-ct-corpus-media-delivery.md` and adjacent security review. Capsule timing remains marginal; Snap performance is withheld. Complete adoption and matrix qualification remain open.
