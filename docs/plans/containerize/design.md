---
kind: plan
status: active
updated: 2026-09-23
---

# Production deployment: auth posture, live auth-mode proof and review

## Goal

Every supported auth mode is proven in a running container and the deployed surface has a security review.

## Shape

**Already built:** one app-only image (`Dockerfile`, target `runtime`), `docker-compose.yaml` with one service, the entrypoint that generates a first-boot password (`docker/entrypoint.sh`), and the user guide `docker/README.md`. Local engines are the deployer's own server in every setup (`ENGINES_POSTURE=adopt-only` with `VLLM_ENGINE_HOST`). The default is `AUTH_MODE=local`; `single-user` works only with host networking, because a bridge-published port never delivers a loopback peer.

The constraints the proof checks, per mode:

| Mode | Required secrets | Owner fallback | HTTPS at the edge |
| - | - | - | - |
| single-user | none; `AUTH_FALLBACK=owner` is required | loopback TCP peer only | no |
| local | `SESSION_SECRET`; `LOCAL_INITIAL_PASSWORD` in practice | loopback peer; production plus owner is boot-fatal | yes |
| oidc | the `OIDC_*` set and `SESSION_SECRET` | loopback peer; production plus owner is boot-fatal | yes |
| forward-header | none; the signed path needs a JWKS source | loopback peer; unsigned headers need `FORWARD_AUTH_TRUSTED_PROXIES` | recommended |

The image stays non-root and denies source maps. Publishing the port never grants LAN owner access: a LAN peer is not loopback.

## Open questions

- Does single-user mode get a trusted-peer opt-in for a published port, or stay host-network only? Tracked in `docs/work/0053-finish-the-production-deployment-auth-posture-live-auth.md`.
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
