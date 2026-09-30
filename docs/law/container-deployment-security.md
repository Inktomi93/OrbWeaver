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

Each row names the code that holds the control and the test that pins it.

| Control | What holds | Enforced in | Pinned by |
| - | - | - | - |
| Ports and binds | Compose publishes one port, on `127.0.0.1` unless the operator changes the host bind. Inside the container the app listens on `0.0.0.0:8788`. While the Share relay is off, no other listener exists in the app's network namespace except Docker's own DNS at `127.0.0.11`. While Share runs, cloudflared also serves metrics and pprof on `localhost:20241` to `localhost:20245` inside the container. | `docker-compose.yaml`; `packages/server/src/foundation/env/bind.ts` | `tests/tooling/container-security-config.int.test.ts` |
| Open-bind refusal | The entrypoint refuses `single-user` with trusted peers on a non-loopback host bind. The app refuses `single-user` on a non-loopback listener unless trusted peers are declared. | `docker/entrypoint.sh`; `packages/server/src/foundation/env/bind.ts` | `tests/tooling/container-security-config.int.test.ts`; `tests/server/foundation/env/fallback-peers.test.ts` |
| Owner fallback | The owner fallback admits a loopback peer or a declared trusted peer, and never a request that carries a forwarding header. | `packages/server/src/infra/auth/dispatch.ts` | `tests/server/infra/auth/dispatch.test.ts`; `tests/server/foundation/env/fallback-peers.test.ts` |
| Process identity | The entrypoint starts as root only to own the data dir. It then drops to the numeric `PUID`/`PGID` with `setpriv --clear-groups --no-new-privs`, so any non-root numeric `PUID` boots on the read-only rootfs. Before that it refuses to boot, with exit 1, unless `PUID` and `PGID` are both non-zero decimal numbers: a name such as `root` or an id of 0 never reaches the drop. The app, the plugin watchdog and the broker run with no effective capabilities, `no_new_privs` and Docker's default seccomp filter. PID 1 is `tini` as root. | `docker/entrypoint.sh`; `docker-compose.yaml` | `tests/tooling/container-security-config.int.test.ts` |
| Root filesystem | The root filesystem is read-only. `/tmp` and `/app/.cache` are tmpfs, and `/app/data` is the one volume. | `docker-compose.yaml` | `tests/tooling/container-security-config.int.test.ts` |
| Data permissions | The entrypoint sets `umask 077`, so every file the app writes is `600` and every directory `700`. On every boot it closes the data root to group and other, which covers older files beneath it. Generated secrets are `600`. | `docker/entrypoint.sh` | `tests/tooling/container-security-config.int.test.ts` |
| Headers | Every app response carries the app CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Cross-Origin-Resource-Policy: same-origin`. The card-frame and plugin-frame documents carry their own, tighter policy instead. A plugin-frame asset served to its sandboxed frame gets `Cross-Origin-Resource-Policy: cross-origin`. `Cross-Origin-Opener-Policy` and `Origin-Agent-Cluster` go out on a loopback or HTTPS origin only. The app sends no HSTS; the TLS edge sets it. | `packages/server/src/entry/http/security-headers.ts` | `tests/server/entry/http/security-headers.test.ts` |
| Cookies | Over plain http the session cookie is `orb_session_insecure`. Behind a trusted hop that sends `X-Forwarded-Proto: https` it is `__Host-orb_session` with `Secure`. Both are `HttpOnly` and `SameSite=Lax`. | `packages/server/src/infra/auth/transport.ts`; `packages/server/src/infra/auth/modes/cookie-session.ts` | `tests/server/infra/auth/transport.test.ts` |
| CSRF | A login, or a tRPC mutation on the cookie path, without `x-orb-csrf` gets 403. The tRPC gate exempts the owner fallback, so on `single-user` the only guard is the mount's content-type check: a tRPC POST with a CORS-simple content type gets 415 on every path. The byte-ingest routes need `x-orb-csrf` on the cookie path and the owner fallback alike. | `packages/server/src/entry/http/auth-routes.ts`; `packages/server/src/transport/trpc/trpc.ts`; `packages/server/src/entry/app.ts`; `packages/server/src/entry/http/upload.ts`; `packages/server/src/entry/http/import.ts` | `tests/server/entry/app.test.ts` |
| Source maps | The client build emits none. The SPA registrar answers 404 for any `.map`, `.ts` or `.tsx` path before it reads the disk. A percent-encoded suffix is decoded before that test. | `packages/client/vite.config.ts`; `packages/server/src/entry/http/spa.ts` | `tests/server/entry/http/spa.test.ts` |
| Secrets | The `*_FILE` overlay mounts secrets as files, so `docker inspect` shows only paths. When unset, the session secret, credentials key and first password are generated into `data/secrets/`. The entrypoint exports secrets into the server env. Right after the env parse, the server entry deletes every app secret from `process.env`, so no child it starts inherits one: cloudflared, tar, git, and any later spawn. The agent-sdk child and the plugin broker also get an explicit env. | `docker/entrypoint.sh`; `docker/compose.secrets.yaml`; `packages/server/src/foundation/env/index.ts`; `packages/server/src/entry/index.ts`; `packages/inference/src/backends/agent-sdk/env.ts` | `tests/server/foundation/env/child-env-secrets.test.ts`; `tests/server/entry/child-env.int.test.ts`; `tests/inference/backends/agent-sdk/env.test.ts` |
| Plugin broker | The broker and its watchdog start on the first enabled plugin. Their env is `NODE_ENV` alone. They talk to the app over a UNIX socket in a `700` dir under `/tmp`, guarded by a `600` token file. Guests run in a QuickJS WASM interpreter. Both processes run under Node's permission model. They read only `packages/`, `node_modules/` and, for the broker, the container marker files and its socket dir, so the data dir, `.env` and `/proc` are denied. The broker writes only its socket dir, starts guest Workers, which inherit the limits, and cannot spawn. The watchdog can spawn only because it starts the broker. | `packages/server/src/infra/plugin-host/process-permission.ts`; `packages/server/src/infra/plugin-host/process-runtime.ts`; `packages/server/src/infra/plugin-host/broker-watchdog.ts` | `tests/server/infra/plugin-host/broker-permission.test.ts`; `tests/server/infra/plugin-host/process-runtime.test.ts`; `tests/server/infra/plugin-host/broker-supervision.suite.test.ts` |
| Ingress allowlist | With `IP_ALLOWLIST` set, a peer outside it and outside loopback gets 403 before any auth runs. | `packages/server/src/infra/network/ingress.ts` | `tests/server/infra/network/ingress.test.ts` |
| Egress firewall | A global dispatcher blocks private, loopback and link-local destinations. The connection door refuses a literal private address. A name that resolves to a private address is blocked on the resolved address. The owner admits a private host through `PRIVATE_ENDPOINT_ALLOWLIST` or the connection's Admit action. | `packages/server/src/infra/network/egress.ts` | `tests/server/infra/network/egress.test.ts`; `tests/server/infra/network/egress.int.test.ts`; `tests/server/infra/network/egress-attack.suite.int.test.ts` |
| Diagnostics | `/api/_debug/*` opens only with `DEBUG_TOKEN` or an owner principal on a credentialed path: a session cookie, a signed forward-header JWT, or the owner fallback where it counts as an operator credential. An admin is refused. The credential-free owner fallback stays closed while trusted peers are declared. | `packages/server/src/entry/auth/seam.ts`; `packages/server/src/foundation/env/diagnostics.ts` | `tests/server/entry/debug-gate.suite.test.ts` |
| Compose posture | One service: `init: true`, `restart: unless-stopped`, rotated `json-file` logs, `no-new-privileges`, `cap_drop: [ALL]` plus the capabilities the entrypoint uses once as root. | `docker-compose.yaml` | `tests/tooling/container-security-config.int.test.ts` |

## Rejected image shapes

- Per-mode images: the code already dispatches on `AUTH_MODE` and fails closed, so per-mode images duplicate everything for no security gain.
- An all-in-one GPU image with the engine fleet inside: the owner keeps one engine setup, outside the app image.
- Alpine or distroless bases: native libSQL risk, and the healthcheck and debugging need a shell.

## Findings

Each finding names its severity, the case that breaks, and its status.

1. **Medium, accepted residual by owner ruling: any container that reaches the app's network is the owner in the default posture.** The default stays, and `docker/README.md` tells operators not to join a `single-user` app to a shared network. The shipped `AUTH_FALLBACK_TRUSTED_PEERS` is `172.16.0.0/12,192.168.0.0/16,10.0.0.0/8`. A second container joined to the app's compose network requested `/api/auth/me` at the app's IP, with no header, and got `role: owner`. Case one: the operator joins the app to a shared proxy network, as the stanza at the bottom of `docker-compose.yaml` shows, and keeps `single-user`. Every container on that network is then the owner with no login. Case two: on Docker Engine before 28, or with a permissive host `FORWARD` chain, a host on the same LAN segment can route to the container IP. It arrives with its own `192.168.x.x` or `10.x.x.x` source, which the shipped ranges admit. Docker's Engine 28 hardening notes say it drops that routed traffic to ports published on loopback only. The proof host ran Engine 29, so no older engine was tested.
2. **Low, fixed: the data volume is world-readable without a mask.** Under the default mask the database, its WAL and every data directory are `644`/`755`. On a data directory bind-mounted from the host, every user of the host can then read the chats, the session hashes and the sealed provider keys. The entrypoint sets `umask 077` for new files and closes the data root on every boot, so older files are unreachable too. The backup recipe in `docker/README.md` writes its archive under the same mask.
3. **Low, fixed in the guide: nothing sets HSTS.** The app never sends HSTS, on purpose: a name reached over both https and plain http would break. The guide in `docker/README.md` tells the operator to set it at the TLS proxy.
4. **Low, fixed: the plugin broker shared the app's file access.** A guest that escaped the QuickJS WASM sandbox ran as the app user in the broker process and could read `data/secrets/credentials_key` and the database. The broker now runs under Node's permission model, so those reads are denied. The model stops JavaScript, not native code: an escape that reaches native execution in the broker still has the app user's full file access. Finding 8 names what the broker's network grant still reaches.
5. **Low, fixed: a `PUID` other than the image user refuses to boot.** Under the shipped compose the rootfs is read-only, so `groupmod` could not lock `/etc/group`. The entrypoint now passes numeric ids to `setpriv` and edits no account file.
6. **Low, fixed: `no_new_privs` came only from compose.** A bare `docker run` started the app without it. The entrypoint now sets it at the privilege drop.
7. **Low, open: a child can still read the server's original environment.** Deleting a key from `process.env` does not change the environment block the kernel exposes at `/proc/<pid>/environ`. Any child running as the app user, such as cloudflared, can read the secrets the entrypoint exported from the server's entry there. The fix is to stop exporting secrets into the server env: the app reads each `*_FILE` itself.
8. **Medium, open: the broker's network grant reaches the app.** Node 26 grants the network all or nothing, and the broker needs it for its socket. A JavaScript-level escape in the broker can send `SIGUSR1` to the app process, which opens the app's inspector on loopback, and then connect to it. That runs code in the app with every secret. Under `single-user` it can also call the app's HTTP port as a loopback peer, which is the owner. The fix is to start the app with `--disable-sigusr1` in every launcher; the loopback-owner case needs the broker off the network.

## Accepted residuals

- The entrypoint's open-bind refusal sees only the host bind that compose passes in. A bare `docker run -p 8788:8788` publishes on every interface without that check. Accepted with finding 1: `docker/README.md` tells operators to publish on `127.0.0.1` only.
- The read-only rootfs, the tmpfs mounts, `cap_drop` and the loopback publish live in compose, not in the image. A bare `docker run` gets none of them. The image itself carries only the non-root drop and `no_new_privs`.
- The Docker Engine 28 and later direct-routing opt-outs reopen case two of finding 1: `allow-direct-routing`, `gateway_mode_ipv4=routed` or `nat-unprotected`, and `trusted_host_interfaces`.
- The cloudflared overlay serves metrics and pprof on `0.0.0.0:20241` to the compose network, and its `TUNNEL_TOKEN` shows in `docker inspect`.
- Low: any private-range peer counts as a trusted hop for `X-Forwarded-Proto` and `X-Forwarded-For`. With the port published on every interface, that is every LAN client. A forged `X-Forwarded-For` picks the per-IP login throttle bucket (`packages/server/src/entry/http/auth-routes.ts`) and the `clientIp` in security events, so one client can spread its guesses across addresses. The per-handle login throttle still caps guesses against one account.
- `tini` stays root as PID 1 with the capabilities compose grants, and `docker exec` defaults to root. Both need Docker access, which is root on the host.
- The first `local` password is printed once to the container log and kept at `data/secrets/initial_password` until the owner deletes it. The `oidc` owner claim URL is printed at every boot until the owner signs in. Reading either needs Docker or volume access.
- The `oidc` proof stops at the identity provider, by owner ruling: the full browser login against the live Authentik needs a registered test callback and a test user.

## Proving it on a running container

Build once with `docker build --target runtime -t orbweaver:<tag> .`. Run one stack at a time with `docker compose -p <project> -f docker-compose.yaml -f <overlay> up -d --no-build`, with the compose image name set to that tag. Each mode's overlay sets `AUTH_MODE`, `AUTH_FALLBACK: deny` and `AUTH_FALLBACK_TRUSTED_PEERS: ""`.

| Mode | Login that must pass | Refusals that must hold | Result |
| - | - | - | - |
| `single-user` | `GET /api/auth/me` through the published port answers `owner` | the same request with `X-Forwarded-For` is unauthenticated; boot refuses a non-loopback host bind | as stated; finding 1 reproduced |
| `local` | `POST /api/auth/login` with the first-boot password from `docker compose logs` answers 200 and a session cookie | wrong password 401; unknown handle 401; no `x-orb-csrf` 403; a loopback peer inside the container is unauthenticated | as stated |
| `forward-header` | a proof proxy on the compose network at a fixed address checks HTTP Basic, strips identity headers and sets `Remote-User`; `owner` and a second user both resolve | wrong or missing proxy password 401; `Remote-User` sent straight to the app port is unauthenticated; a second container on the network forging it is unauthenticated; a forged signed-path JWT is refused | as stated; widening `FORWARD_AUTH_TRUSTED_PROXIES` to the subnet let the second container become the owner, and `/32` closed it again |
| `oidc` | boot with the full `OIDC_*` set from the secrets overlay; `GET /api/auth/oidc/login` answers 302 to the live issuer's authorize endpoint with `state`, `nonce` and an `S256` PKCE challenge | a forged `state`, the real `state` without its binding cookie, and a replayed `state` all land on `/login?authError=invalid_state`; an unlisted origin mints no transaction; an unknown `Host` gets 421 | as stated, up to the identity provider |

Every login mode also refused to boot with `AUTH_FALLBACK=owner` in production.

The adversarial checks ran live on the same image:

| Check | Result |
| - | - |
| Debug gate | Under `single-user` with trusted peers declared and no token set, `/api/_debug/info` answers 404 to the credential-free owner. Under `local` with a `DEBUG_TOKEN` set, the owner's cookie and the right `x-debug-token` open it; no credential and a wrong token get 401. Under `forward-header` an unsigned proxy header gets 404, for the owner too. |
| CSRF content type | Under `single-user`, a tRPC POST sent as `multipart/form-data` or `text/plain` gets 415, and `application/json` with no `x-orb-csrf` runs. An asset upload or bundle import with no `x-orb-csrf` gets 403. Under `local` the cookie path gets 403 without the header, 415 for `multipart/form-data` with it, and 200 for JSON with it. |
| Data permissions | On a bind mount seeded with a `644` file and `755` directories, the boot closed the data root to `700`, and another host user could no longer list it. The seeded entries kept their modes beneath the closed root. New files came out `600` and new directories `700`. |
| `PUID=1001` | With the previous entrypoint the container looped on `groupmod: cannot lock /etc/group`. With this one it booted under the shipped compose, the app ran as uid 1001, and every data entry came out owned by 1001. |
| Id refusal | Under the shipped compose, `PUID=0`, `PUID=root`, `PGID=0` and `PUID=abc` each printed one refusal and exited 1. With the previous entrypoint the first two re-ran the root branch in a loop, `PGID=0` started the app in group root, and `PUID=abc` failed inside `setpriv`. |
| Nested data dir | A `DATA_DIR` of `/app/data/a/b` that did not exist yet booted with `a` at `755` and `b` at `700` owned by the app user. With the previous entrypoint `a` came out `700` root and the app refused to boot. |
| `no_new_privs` | A bare `docker run` with the daemon's default turned off (`--security-opt no-new-privileges=false`) showed `NoNewPrivs: 0` on the app process with the previous entrypoint and `NoNewPrivs: 1` with this one. |
