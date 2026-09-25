---
kind: work
status: open
updated: 2026-09-25
priority: P2
area: infra
plan: containerize
---

# Finish the production deployment: auth posture, live auth-mode proof and a security review

## What

The app-only image ships: `Dockerfile`, `docker-compose.yaml` and the files under `docker/`. The default is single-user on a loopback-published port, with the bridge ranges in `AUTH_FALLBACK_TRUSTED_PEERS`. `local` generates a first password on its first boot.

The production posture is ruled. The trusted-peer option ships unchanged and gets no easier LAN door. `local`, `oidc` and `forward-header` serve strangers with `AUTH_FALLBACK=deny` and HTTPS at the edge. `AUTH_FALLBACK=owner` stays boot-fatal in production cookie modes. The remaining steps:

1. Prove each supported auth mode in a running container, including the external Authentik setup.
2. Get a security review of the deployed surface.

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
