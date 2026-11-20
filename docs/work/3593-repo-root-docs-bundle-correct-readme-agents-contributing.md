---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: docs
---

# Repo root docs bundle: correct README, AGENTS, CONTRIBUTING, Constitution and Mission

## What

`README.md:237` says every version lives in `catalog:`; `packages/plugin-toolchain/package.json:29-31` hardcodes `fflate` and `typescript`. `README.md:285` pins the example version block at v0.1.0 and `0.2.0-dev+`; use a current form. `README.md:281` says `/healthz` returns the identity block on every response; `healthz.ts:20-31,38` gates it to the operator and a friend's probe gets `{}`. `docs/law/Constitution.md:8-10` and `docs/law/Core-0-Architecture-and-Structure.md:9-10` swap the labels of `AGENTS.md` and the architecture doc. `docs/Mission.md` says built code has no prose doc; `plugin-host/README.md` is one. `AGENTS.md:44` says an undeclared import does not resolve, which the root manifest does not enforce. `AGENTS.md:72` says every placement names its check while the table names none and `:88`,`:93` say two have no custom check: name the layer per row or drop the sentence. `CONTRIBUTING.md:74-75` documents `windows_proof_repetitions`, which `scheduled-native-workflows.int.test.ts:29` rejects. `CONTRIBUTING.md:73` attributes plugin-broker proofs to `install.yml`; they live in `contributor.yml:82-88`.

## Why

Contributors and bug reporters copy from these lines. Several promise a check or a path the repository does not have.

## Done when

Each line above reads true against the cited code, and the doc check passes.

## Evidence

Filled at landing: what ran and where its output is.
