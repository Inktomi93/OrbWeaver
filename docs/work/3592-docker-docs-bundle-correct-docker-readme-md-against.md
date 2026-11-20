---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: docs
---

# Docker docs bundle: correct docker/README.md against the code

## What

Edit `docker/README.md`. `:103-105` says the app refuses to boot without a key and omits the `AUTH_BREAK_GLASS=true` exception (`packages/server/src/foundation/env/record/index.ts:385-398`). `:193-194` understates the Share egress allowlist; `packages/server/src/infra/relay/pin.ts:13-15` also needs `release-assets.githubusercontent.com`. `:321-322` says no stable release is published; tags exist through v0.6.0. `:360-361` blames the GitHub Actions cache; `release.yml:107,157` use the registry cache, and `:97` says it exists because of the Actions quota. `:60-67` teaches a Claude subscription connection without the risk disclosure the app shows (`add-connection-form-model.ts:22-27`).

## Why

An operator reads these lines as the setup contract. Each one sends them to a wrong or missing step.

## Done when

Each line above reads true against the cited code, and the subscription section carries the same disclosure as the app.

## Evidence

Filled at landing: what ran and where its output is.
