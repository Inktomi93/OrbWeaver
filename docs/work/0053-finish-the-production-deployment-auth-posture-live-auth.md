---
kind: work
status: blocked
updated: 2026-09-23
priority: P2
area: infra
blocked: owner
plan: containerize
---

# Finish the production deployment: auth posture, live auth-mode proof and a security review

## What

The app-only image ships: `Dockerfile`, `docker-compose.yaml` and the files under `docker/`. The default is
local auth with a generated first password. Single-user mode works only with host networking. A
trusted-peer option for single-user mode waits for the owner. The remaining steps:

1. The owner rules the production auth posture, including the trusted-peer option.
2. Prove each supported auth mode in a running container, including the external Authentik setup.
3. Get a security review of the deployed surface.

Keep source maps denied and the runtime non-root.

## Why

The image exists, but no one has proven the auth modes in a real deployment. The deployed surface has no
security review.

## Done when

A running container passes a live login in each supported auth mode. The security review is in `docs/`,
and its findings are fixed or filed. `docs/plans/containerize/design.md` matches the shipped
surface.

## Evidence

Filled at landing: what ran and where its output is.
