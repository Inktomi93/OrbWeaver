---
kind: work
status: doing
updated: 2026-10-15
priority: P1
lane: codex/canonical-table-builders-959
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

The combined native capsule passes with its unchanged guard on `e1d018555b`: `reports/runs/test/main-2224631-2026-10-15T12-37-53-280Z/test-report.json`. Owner-funded indexing settles before final search capture. Canonical identity breaks equal-distance image ties before candidate limits. Independent review accepts both corrections. Earlier failed runs remain preserved; this selected capsule does not establish complete application qualification.

The closed canonical table population has accepted selected row-builder chains and lawful database fixtures, not every persistence verb or wire output. Evidence: `reports/review/959-table-builder-semantics.json` and `reports/review/959-canonical-table-builder-evidence.md`. Native contract-output boundary accounting is complete; supplier and runtime qualification remain partial. Allocations and limits: `reports/review/959-mounted-output-uses.json`. Reviewed `5eff19a336` adds native admin/session captures and coherent human invite defaults with a browser-safe value closure. Evidence: `reports/review/959-canonical-output-builder-evidence.md`. Shared adoption remains open. These captures do not authorize general legacy ports.
