# Orbweaver in Docker

One image, one service, your models. The app ships without any model server: paste a cloud API key in
Settings, or point it at a model server you already run.

## Quick start

Needs Docker Engine 24+ with Compose v2.24+ (or Podman 4+ with `podman compose`) and git.

```sh
git clone https://github.com/Inktomi93/orbweaver && cd orbweaver
docker compose up -d --build        # the first run builds the image (a few minutes); later runs reuse it
docker compose logs orbweaver       # the FIRST boot prints your login
```

Open <http://localhost:8788> and sign in as `owner` with the password from the log. Then Settings →
Connections: add an API key (OpenRouter, Anthropic, …) or a model server (below), pick a character, chat.

- Prefer to choose the password? Put `LOCAL_INITIAL_PASSWORD=…` in `docker/orbweaver.local.env` (copy
  `docker/orbweaver.local.env.example`) BEFORE the first boot. Change it later in Settings.
- Nothing was edited to get here. Every other knob is optional and lives in `docker/orbweaver.env` (the
  tracked defaults, commented) — override any of them in `docker/orbweaver.local.env` (gitignored).

When the published image exists (`ghcr.io/inktomi93/orbweaver`), `docker compose up -d` without `--build`
pulls it instead of building; `docker compose pull && docker compose up -d` updates.

## A model server on your machine

Ollama, KoboldCpp, LM Studio, TabbyAPI, llama.cpp's server, vLLM — anything OpenAI-compatible. From inside the
container your machine is `host.docker.internal`, so the connection URL is `http://host.docker.internal:11434`
(Ollama), `:5001` (KoboldCpp), `:1234` (LM Studio), and so on. The app's outbound firewall blocks private
addresses by default (an SSRF belt), so allow that host once:

```sh
# docker/orbweaver.local.env
EGRESS_ALLOWLIST=host.docker.internal
```

A server on another machine on your network: its address goes in `EGRESS_ALLOWLIST` too (host only, no port).

**Your own vLLM, the way the app expects it** (embed `:8701`, rerank `:8702`, chat `:8703` — the same env and
ports a bare-metal install uses): `ENGINES_POSTURE=adopt-only` + `VLLM_ENGINE_HOST=host.docker.internal`.
The app adopts what is up and reports the rest down; search and memory need the embed + rerank engines, so
without them those features degrade rather than break. The app never spawns engines from a container —
there is one vLLM setup to maintain, and it is yours.

## Login modes

| `AUTH_MODE` | who gets in | needs |
| - | - | - |
| `local` (default) | username + password stored by the app | nothing — the session secret and first password are generated on the first boot into the data volume (`/app/data/secrets/`) |
| `single-user` | no login; whoever reaches the process over a **loopback** socket is the owner | host networking — see below |
| `oidc` | your identity provider (Authentik, Authelia, Keycloak, …) | the `OIDC_*` block in `docker/orbweaver.env`, HTTPS |
| `forward-header` | a forward-auth proxy | `FORWARD_AUTH_*` — prefer the signed JWT path |

**Why `single-user` is not the default in a container.** The owner fallback is granted only to a request
whose TCP peer is loopback (the socket address, which cannot be forged). A port published from a bridge
network delivers the docker gateway as the peer, never loopback, so `single-user` behind `-p 8788:8788`
answers 401 to every browser. The one container shape where it works is host networking:

```sh
docker compose -f docker-compose.yaml -f docker/compose.host-network.yaml up -d --build
```

The app then binds `127.0.0.1:8788` on your machine, your browser is a loopback peer, other devices are
not (they get 401 — the bare-metal posture). Docker Engine on Linux and Podman do this natively; Docker
Desktop needs its opt-in host networking (Settings → Resources → Network, 4.34+, signed in) and proxies at
layer 4 — unverified here; if you see 401s on Desktop, use the default `local` mode.

`AUTH_FALLBACK` is what an un-credentialed request gets. It is `deny` for every login mode and must be
`owner` for `single-user` (its only credential — the overlay sets it; the app refuses the `deny` pairing at
boot rather than serving nobody). Never `owner` with an SSO mode in production: the app refuses to boot,
because a same-host proxy would turn every visitor into the owner.

## LAN and HTTPS

The port is published on `127.0.0.1` only. To reach the app from your phone or another computer:

1. `ORB_BIND=0.0.0.0` — in a `.env` file beside `docker-compose.yaml` or on the command line
   (`ORB_BIND=0.0.0.0 docker compose up -d`). Keep `AUTH_MODE=local`.
2. **HTTPS in front.** The session cookie is `Secure` + `__Host-`, so a plain-http address other than
   `localhost` cannot keep a login (the sign-in silently fails). Any TLS terminator works: Caddy (automatic
   certs, or its internal CA on a LAN), nginx, Traefik, a Tailscale `serve`. Point it at `127.0.0.1:8788` on
   this machine, or join it to this compose network and target `orbweaver:8788` (the stanza at the bottom of
   `docker-compose.yaml`). The proxy must pass `X-Forwarded-Proto/Host/For` and must not buffer SSE.
3. Optionally bound who may knock at all: `IP_ALLOWLIST=192.168.1.0/24`. Behind a proxy the peer is the
   proxy, so allowlist the proxy's address, not your laptop's.

Anything reachable from the internet runs an SSO mode (`oidc` / `forward-header`) with `AUTH_FALLBACK=deny`.

## Where your data lives

- `orbweaver-data` (named volume) → `/app/data`: the sqlite database (plus `-wal`/`-shm`), uploaded and
  seeded assets, import staging, and `secrets/` (the generated session secret, first password and
  credentials key). **Backup = this volume.** Losing `secrets/credentials_key` makes every stored provider
  key unreadable (the same blast radius as losing the database).
- To keep it in a directory instead: replace the volume line with `./data:/app/data`. The container starts
  as root only to make that directory owned by `PUID`/`PGID` (default 1000), then drops to that user before
  the app runs — the SillyTavern / linuxserver pattern, so no manual `chown`. Match your own user with
  `PUID=$(id -u) PGID=$(id -g) docker compose up -d`. Started non-root (`user:`, rootless podman) it skips the
  chown and refuses to boot on an unwritable data dir, saying so.
- The image itself holds no state; `docker compose down` keeps the volume, `down -v` deletes it.

## Secrets as files

Values in an env file are readable from `docker inspect`. For anything you consider a real secret use the
file overlay — the container gets files at `/run/secrets/*` and the entrypoint exports each as its env var:

```sh
ORB_SECRETS_DIR=/etc/orbweaver/secrets docker compose -f docker-compose.yaml -f docker/compose.secrets.yaml up -d
```

Which file feeds which mode, and how to create them: [`secrets/README.md`](secrets/README.md).

## Developing in a container

The development stack (watched server + vite hot reload, the dev pins, seeded demo content) from your
checkout, with node and pnpm supplied by the container — a fresh clone has no `node_modules`; the first boot
installs them into the checkout:

```sh
docker compose -f docker-compose.yaml -f docker/compose.dev.yaml up
# http://localhost:5173 (vite)   http://localhost:8788 (api)   Ctrl-C stops it
```

Host networking is required (a dev build binds loopback by design), so this is Linux Engine / Podman;
`ORB_PORT` / `ORB_VITE_PORT` move the ports when 8788/5173 are busy. It writes `node_modules` and `.cache/`
into the checkout as your uid (`PUID`/`PGID`). On a machine with node 26 + pnpm this is the same as
`pnpm install && pnpm stack up` (the root README).

## Diagnostics

`WIRE_CAPTURE` / `RPG_TRACE` (off) turn on recorders that keep the final provider request bodies — system
prompts, transcripts, persona and world text — behind `/api/_debug/*`, which opens only to `DEBUG_TOKEN`
or an admin session. Turning one on is a two-knob edit: set `IP_ALLOWLIST` in the same change. The app logs
the composed posture at boot and warns per open exposure.

## Troubleshooting

- **`docker compose up` fails to pull `ghcr.io/inktomi93/orbweaver`** — the published image is not there
  yet; `docker compose up -d --build` builds it from the checkout.
- **Everything answers 401** in `single-user` — you are on a bridge network. Use the host-network overlay or
  `AUTH_MODE=local` (the reason is under "Login modes").
- **Sign-in "does nothing" on a LAN address** — plain http; the cookie is Secure. HTTPS in front, or use
  `http://localhost` on the machine itself.
- **"blocked … private address"** when adding a local model server — `EGRESS_ALLOWLIST` (above).
- **`/app/data is not a writable directory`** — you started the container as a non-root user (`user:`,
  rootless podman) on a data dir that user cannot write. Either let the entrypoint start as root with
  `PUID`/`PGID` (the default), or make the directory writable by that user.
- **Forgot the generated password** — it is kept at `/app/data/secrets/initial_password` until you delete it:
  `docker compose exec orbweaver cat /app/data/secrets/initial_password`. If you already changed it in
  Settings, that file is stale; `docker compose exec orbweaver rm /app/data/secrets/initial_password` then
  set `LOCAL_INITIAL_PASSWORD` for the next boot only if the owner row still has no password.
- Boot refuses with a message naming an env key — that message is the fix: every mode's required values
  are checked at boot (`packages/server/src/foundation/env/index.ts`), and a misconfigured deploy never
  silently degrades.

## Building and publishing

`docker build --target runtime -t orbweaver:dev .` builds the image alone. The image is the server as
source (node 26 runs TypeScript directly), the built client, and a pruned production `node_modules`; how the
runtime file set is assembled has one home, `docker/assemble-runtime.sh`. `.github/workflows/docker-publish.yml`
pushes `ghcr.io/inktomi93/orbweaver:<version>` + `:latest` on a `v*` tag (amd64; arm64 once it has been
booted on real hardware).
