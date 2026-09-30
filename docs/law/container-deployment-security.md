---
kind: law
status: active
updated: 2026-09-30
---

# Container deployment security: the deployed surface and its review

This doc governs the shipped container: `Dockerfile`, `docker-compose.yaml` and the files under `docker/`. It states the auth posture each mode must keep, the controls on the deployed surface and where each one is enforced, the review findings, and how to prove it all again on a running container. The operator guide is `docker/README.md`. The identity mechanics are [Spine-Identity-and-Auth](Spine-Identity-and-Auth.md) and [Tier-3-Infra](Tier-3-Infra.md).

## The ruled auth posture

- `single-user` with the trusted-peer option ships unchanged. It gets no easier LAN door.
- `local`, `oidc` and `forward-header` serve strangers. Each runs with `AUTH_FALLBACK=deny` and HTTPS at the edge.
- `AUTH_FALLBACK=owner` beside any mode other than `single-user` is boot-fatal in production, unless `AUTH_BREAK_GLASS=true`. The refusal lives in the env schema (`packages/server/src/foundation/env/index.ts`).
- The image denies source maps and runs the app as a non-root user.

| Mode | Owner without a credential | Login | HTTPS at the edge |
| - | - | - | - |
| `single-user` | a loopback peer, or a peer in `AUTH_FALLBACK_TRUSTED_PEERS`, on a request with no forwarding header | none | no; the port stays on `127.0.0.1` |
| `local` | nobody | a handle and password; the first boot generates the password | yes |
| `oidc` | nobody | the identity provider | yes |
| `forward-header` | nobody | the auth proxy at the address in `FORWARD_AUTH_TRUSTED_PROXIES` | yes |

## The deployed surface

| Control | What holds | Enforced in |
| - | - | - |
| Ports and binds | Compose publishes one port, on `127.0.0.1` unless the operator changes the host bind. Inside the container the app listens on `0.0.0.0:8788`. No other listener exists in the app's network namespace except Docker's own DNS at `127.0.0.11`. | `docker-compose.yaml`; `packages/server/src/foundation/env/bind.ts` |
| Open-bind refusal | The entrypoint refuses `single-user` with trusted peers on a non-loopback host bind. The app refuses `single-user` on a non-loopback listener unless trusted peers are declared. | `docker/entrypoint.sh`; `packages/server/src/foundation/env/bind.ts` |
| Process identity | The entrypoint starts as root only to own the data dir, then drops to `PUID`/`PGID` with `setpriv`. The app, the plugin watchdog and the broker run with no effective capabilities, `no-new-privileges` and Docker's default seccomp filter. PID 1 is `tini` as root. | `docker/entrypoint.sh`; `docker-compose.yaml` |
| Root filesystem | The root filesystem is read-only. `/tmp` and `/app/.cache` are tmpfs, and `/app/data` is the one volume. | `docker-compose.yaml` |
| Data permissions | The entrypoint sets `umask 077`, so every file the app writes is `600` and every directory `700`. Generated secrets are `600`. | `docker/entrypoint.sh` |
| Headers | Every response carries the app CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Cross-Origin-Resource-Policy: same-origin`. `Cross-Origin-Opener-Policy` and `Origin-Agent-Cluster` go out on a loopback or HTTPS origin only. The app sends no HSTS; the TLS edge sets it. | `packages/server/src/entry/http/security-headers.ts` |
| Cookies | Over plain http the session cookie is `orb_session_insecure`. Behind a trusted hop that sends `X-Forwarded-Proto: https` it is `__Host-orb_session` with `Secure`. Both are `HttpOnly` and `SameSite=Lax`. | `packages/server/src/infra/auth/transport.ts`; `packages/server/src/infra/auth/modes/cookie-session.ts` |
| CSRF | A login or cookie-path mutation without `x-orb-csrf` gets 403. A tRPC POST with a CORS-simple content type gets 415. | `packages/server/src/entry/http/auth-routes.ts`; `packages/server/src/entry/app.ts` |
| Source maps | The client build emits none. The SPA registrar answers 404 for any `.map`, `.ts` or `.tsx` path before it reads the disk. A percent-encoded suffix is decoded before that test. | `packages/client/vite.config.ts`; `packages/server/src/entry/http/spa.ts` |
| Secrets | The `*_FILE` overlay mounts secrets as files, so `docker inspect` shows only paths. When unset, the session secret, credentials key and first password are generated into `data/secrets/`. The entrypoint exports secrets into the server env. No child process inherits it. | `docker/entrypoint.sh`; `docker/compose.secrets.yaml` |
| Plugin broker | The broker and its watchdog start on the first enabled plugin. Their env is `NODE_ENV` alone. They talk to the app over a UNIX socket in a `700` dir under `/tmp`, guarded by a `600` token file. Guests run in a QuickJS WASM interpreter. | `packages/server/src/infra/plugin-host/process-runtime.ts`; `packages/server/src/infra/plugin-host/broker-watchdog.ts` |
| Egress firewall | A global dispatcher blocks private, loopback and link-local destinations. The connection door refuses a literal private address. A name that resolves to a private address is blocked on the resolved address. The owner admits a private host through `PRIVATE_ENDPOINT_ALLOWLIST` or the connection's Admit action. | `packages/server/src/infra/network/egress.ts` |
| Diagnostics | `/api/_debug/*` answers 404 with no `DEBUG_TOKEN` and no admin session. The credential-free path stays closed while trusted peers are declared. | `packages/server/src/foundation/env/diagnostics.ts` |
| Compose posture | One service: `init: true`, `restart: unless-stopped`, rotated `json-file` logs, `no-new-privileges`, `cap_drop: [ALL]` plus the capabilities the entrypoint uses once as root. | `docker-compose.yaml` |

## Findings

Each finding names its severity, the case that breaks, and its status.

1. **Medium, owner decision pending: any container that reaches the app's network is the owner in the default posture.** The shipped `AUTH_FALLBACK_TRUSTED_PEERS` is `172.16.0.0/12,192.168.0.0/16,10.0.0.0/8`. A second container joined to the app's compose network requested `/api/auth/me` at the app's IP, with no header, and got `role: owner`. Case one: the operator joins the app to a shared proxy network, as the stanza at the bottom of `docker-compose.yaml` shows, and keeps `single-user`. Every container on that network is then the owner with no login. Case two: on Docker Engine before 28, or with a permissive host `FORWARD` chain, a host on the same LAN segment can route to the container IP. It arrives with its own `192.168.x.x` or `10.x.x.x` source, which the shipped ranges admit. Docker's Engine 28 hardening notes say it drops that routed traffic to ports published on loopback only. The proof host ran Engine 29, so no older engine was tested. The minimal fix narrows the default to the gateway of the container's own network at boot, or raises the platform floor to Engine 28. Both change the ruled trusted-peer option or the platform floor, and Docker Desktop's peer address is unverified, so the owner decides.
2. **Low, fixed: the data volume is world-readable without a mask.** Under the default mask the database, its WAL and every data directory are `644`/`755`. On a data directory bind-mounted from the host, every user of the host can then read the chats, the session hashes and the sealed provider keys. The entrypoint sets `umask 077`. A file that already exists keeps its mode until it is rewritten.
3. **Low, fixed in the guide: nothing sets HSTS.** The app never sends HSTS, on purpose: a name reached over both https and plain http would break. The guide in `docker/README.md` tells the operator to set it at the TLS proxy.
4. **Low, to be filed: the plugin broker shares the app's user and file access.** A guest that escapes the QuickJS WASM sandbox runs as the app user in the broker process. It can then read `data/secrets/credentials_key` and the database. The env strip and the socket permissions hold, but no file-system boundary exists. The fix starts the watchdog and broker under Node's permission model, with read access scoped to the code and the broker's socket dir.
5. **Informational, fixed: the entrypoint cited a firewall file and test that do not exist.** Its comment names the allowlist that keeps secrets out of child processes.

## Accepted residuals

- `tini` stays root as PID 1 with the capabilities compose grants, and `docker exec` defaults to root. Both need Docker access, which is root on the host.
- The first `local` password is printed once to the container log and kept at `data/secrets/initial_password` until the owner deletes it. The `oidc` owner claim URL is printed at every boot until the owner signs in. Reading either needs Docker or volume access.
- Any private-range peer counts as a trusted hop for `X-Forwarded-Proto` and `X-Forwarded-For`. A forged value changes only the sender's own cookie name or client address.
- The `oidc` proof stops at the identity provider, by owner ruling: the full browser login against the live Authentik needs a registered test callback and a test user.

## Proving it on a running container

Build once with `docker build --target runtime -t orbweaver:<tag> .`. Run one stack at a time with `docker compose -p <project> -f docker-compose.yaml -f <overlay> up -d --no-build`, with the compose image name set to that tag. Each mode's overlay sets `AUTH_MODE`, `AUTH_FALLBACK: deny` and `AUTH_FALLBACK_TRUSTED_PEERS: ""`.

| Mode | Login that must pass | Refusals that must hold | Result |
| - | - | - | - |
| `single-user` | `GET /api/auth/me` through the published port answers `owner` | the same request with `X-Forwarded-For` is unauthenticated; boot refuses a non-loopback host bind | as stated; finding 1 reproduced |
| `local` | `POST /api/auth/login` with the first-boot password from `docker compose logs` answers 200 and a session cookie | wrong password 401; unknown handle 401; no `x-orb-csrf` 403; a loopback peer inside the container is unauthenticated | as stated |
| `forward-header` | a proof proxy on the compose network at a fixed address checks HTTP Basic, strips identity headers and sets `Remote-User`; `owner` and a second user both resolve | wrong or missing proxy password 401; `Remote-User` sent straight to the app port is unauthenticated; a second container on the network forging it is unauthenticated; a forged signed-path JWT is refused | as stated; widening `FORWARD_AUTH_TRUSTED_PROXIES` to the subnet let the second container become the owner, and `/32` closed it again |
| `oidc` | boot with the full `OIDC_*` set from the secrets overlay; `GET /api/auth/oidc/login` answers 302 to the live issuer's authorize endpoint with `state`, `nonce` and an `S256` PKCE challenge | a forged `state`, the real `state` without its binding cookie, and a replayed `state` all land on `/login?authError=invalid_state`; an unlisted origin mints no transaction; an unknown `Host` gets 421 | as stated, up to the identity provider |

Every login mode also refused to boot with `AUTH_FALLBACK=owner` in production. The `umask 077` fix was proven on a bind-mounted data directory, with the changed `docker/entrypoint.sh` mounted over the image's copy: the host saw `600` files and `700` directories.
