---
kind: plan
status: active
updated: 2026-09-23
---

# Production deployment: auth posture, live auth-mode proof and review

## Goal

Every supported auth mode is proven in a running container and the deployed surface has a security review.

## Shape

**Already built:** one app-only image (`Dockerfile`, target `runtime`), `docker-compose.yaml` with one service, the entrypoint that generates a first-boot password (`docker/entrypoint.sh`), and the user guide `docker/README.md`. A local model server is the deployer's own, reached through an openai-compat connection. The default is `AUTH_MODE=single-user`. `AUTH_FALLBACK_TRUSTED_PEERS` (`packages/server/src/foundation/env/index.ts`, `infra/auth/config.ts`) lets `single-user` admit a published bridge port: the entrypoint refuses to boot with the peer set on a non-loopback, non-trusted `ORB_BIND`, and the shipped `docker/orbweaver.env` sets the docker bridge CIDRs by default. The container trust model itself — the peer-gated owner fallback, the `AUTH_FALLBACK=owner` + production + SSO boot-fatal guard, and the deleted `TRUSTED_LOCAL_HOSTS` gate — is standing law in `docs/law/Tier-3-Infra.md` and `docs/law/Tier-2-Foundation.md`, not a plan-only design; this plan does not restate it.

The constraints the proof checks, per mode:

| Mode | Required secrets | Owner fallback | HTTPS at the edge |
| - | - | - | - |
| single-user | none; `AUTH_FALLBACK=owner` is required | loopback TCP peer only | no |
| local | `SESSION_SECRET`; `LOCAL_INITIAL_PASSWORD` in practice | loopback peer; production plus owner is boot-fatal | yes |
| oidc | the `OIDC_*` set and `SESSION_SECRET` | loopback peer; production plus owner is boot-fatal | yes |
| forward-header | none; the signed path needs a JWKS source | loopback peer; unsigned headers need `FORWARD_AUTH_TRUSTED_PROXIES` | recommended |

The image stays non-root and denies source maps. Publishing the port never grants LAN owner access: a LAN peer is not loopback.

## Open questions

- Which auth modes are supported for strangers, and with which fallback default?

## Rejected

- Per-mode images: the code already dispatches on `AUTH_MODE` and fails closed; per-mode images duplicate everything for no security gain.
- An all-in-one GPU image with the engine fleet inside: the owner keeps one engine setup, outside the app image.
- Alpine or distroless bases: native libSQL risk, and the healthcheck and debugging need a shell.

## Coupled sites

- `Dockerfile`, `docker-compose.yaml`, `docker/`
- `packages/server/src/foundation/env/` (the auth-mode and fallback schema)
- `packages/server/src/entry/` (the boot guards)
- `docs/law/Spine-Identity-and-Auth.md`

## Test plan

- A running-container proof per supported mode, including OIDC against an external Authentik.
- A separate adversarial pass against a running container: loopback-peer laundering through a same-host proxy, the unsigned forward-header gate, the debug gate across modes, and the CSRF content-type surface.
- The existing debug-gate suite stays green in every mode.
