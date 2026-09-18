# Orbweaver in Docker

One image, one service, your models. The app ships without any model server: paste a cloud API key in
Settings, or point it at a model server you already run.

## Quick start

Needs Docker Engine 24+ with Compose v2.24+ (or Podman 4+ with `podman compose`) and git.

```sh
git clone https://github.com/Inktomi93/orbweaver && cd orbweaver
docker compose up -d --build        # builds the image from the checkout (a few minutes the first time)
```

Open <http://localhost:8788>. You are the owner; there is no login. Settings → Connections: add an API
key (OpenRouter, Anthropic, …) or a model server (below), pick a character, chat. Nothing was edited to
get here; every knob is optional and lives in `docker/orbweaver.env` (the tracked defaults, commented),
overridable in `docker/orbweaver.local.env` (gitignored).

There is no published image: the checkout is the source of truth and the build is part of `up`. To update:
`git pull && docker compose up -d --build` (migrations run at boot, with a backup of the database first).

## A model server on your machine

Ollama, KoboldCpp, LM Studio, TabbyAPI, llama.cpp's server, vLLM — anything OpenAI-compatible. From inside the
container your machine is `host.docker.internal`, so the connection URL is `http://host.docker.internal:11434`
(Ollama), `:5001` (KoboldCpp), `:1234` (LM Studio), and so on. The app's outbound firewall blocks private
addresses by default (an SSRF belt), but a connection the OWNER saves opens its own exact host and port
automatically — so a single-user box needs no firewall edit at all, and removing the connection closes it again.

`EGRESS_ALLOWLIST` is still there for the hosts nothing saves a connection for (a proxy, a webhook), and for a
multi-user box where a non-owner needs a private host — only the owner's saved connections open themselves:

```sh
# docker/orbweaver.local.env
EGRESS_ALLOWLIST=host.docker.internal
```

**Your own vLLM, the way the app expects it** (embed `:8701`, rerank `:8702`, chat `:8703` — the same env and
ports a bare-metal install uses): `ENGINES_POSTURE=adopt-only` + `VLLM_ENGINE_HOST=host.docker.internal`.
The app adopts what is up and reports the rest down; search and memory need the embed + rerank engines, so
without them those features degrade rather than break. The app never spawns engines from a container —
there is one vLLM setup to maintain, and it is yours.

**…or run the engines as containers too**, from the official `vllm/vllm-openai` image, with an overlay that
sets the two app values for you:

```sh
docker compose -f docker-compose.yaml -f docker/compose.engines.yaml --profile gen up -d
docker compose -f docker-compose.yaml -f docker/compose.engines.yaml \
    --profile gen --profile embed --profile rerank up -d      # the whole trio
```

Needs an NVIDIA GPU with the [Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/)
installed on the host. `gen` is the base profile: embed and rerank share its network namespace (that is how
one `VLLM_ENGINE_HOST` reaches three ports), so compose refuses `--profile embed` on its own. The first boot
downloads the models into a `vllm-models` volume — tens of GB — and the first load takes minutes; the
containers are unhealthy, not broken, until they answer `/health`. What each profile asks of your cards, at
the shipped defaults: `gen` 60% of every card (tensor-parallel across all of them), `embed` 14% of card 0,
`rerank` 14% of card 1. The overlay is generated for a 2-card box — on a single card, regenerate it with
`pnpm engines compose --gpus 1` from a checkout (it rewrites `docker/compose.engines.yaml` in place).
Sleep/wake works exactly as on bare metal, over the same HTTP endpoints; the engine ports are published
nowhere, so only the app reaches them.

## Claude subscription backend (optional)

The app can drive a Claude subscription (the same login `claude` uses) as a chat backend. It is off unless
a credential is present, and it never starts the bundled runtime without one:

| `CLAUDE_BACKEND` | behaviour |
| - | - |
| `auto` (default) | registered only when a subscription credential is found; otherwise absent and the boot log says so |
| `off` | never registered, nothing spawns |
| `on` | registered on your word (a machine whose login the container cannot see, such as a macOS Keychain) |

Two ways to give it a credential, either one on every OS: a long-lived token from `claude setup-token`
(run on any machine with a browser) as `CLAUDE_CODE_OAUTH_TOKEN` in `docker/orbweaver.local.env` or as the
`claude_oauth_token` file secret; or a one-time login inside the container, kept in the data volume:

```sh
docker compose exec -it -u node orbweaver claude      # then /login, then restart once
```

`ANTHROPIC_API_KEY` is a different thing (a metered first-party key added in Settings → Connections); this
backend ignores it and the boot log says which one it saw.

## Login modes

| `AUTH_MODE` | who gets in | needs |
| - | - | - |
| `single-user` (default) | no login; whoever reaches the app from THIS machine is the owner | the port on `127.0.0.1` (the default) |
| `local` | username + password stored by the app | nothing — the first boot generates the password and prints it once (`docker compose logs orbweaver`); or set `LOCAL_INITIAL_PASSWORD` |
| `oidc` | your identity provider (Authentik, Authelia, Keycloak, …) | the `OIDC_*` block in `docker/orbweaver.env`, HTTPS |
| `forward-header` | a forward-auth proxy | `FORWARD_AUTH_*` — prefer the signed JWT path |

**How the no-login default stays safe.** The owner fallback is granted only to a request whose TCP peer is
trusted, and the shipped env names docker's bridge ranges in `AUTH_FALLBACK_TRUSTED_PEERS` because a port
published from a bridge network always arrives from the docker gateway. Under docker's NAT that range means
"whoever can reach the published port", so the safety is the publication itself: the base compose publishes
on `127.0.0.1` only, which makes the set "processes on this machine" — the same boundary as running the app
on bare metal. The entrypoint refuses to boot this mode if `ORB_BIND` is not loopback, the app logs a
security warning every boot while the knob is live, any request that announces a proxy hop is denied the
grant, and the diagnostics door's credential-free arm is closed while widened. Want other devices? Use a
login (next section).

The other no-login shape is host networking (`docker/compose.host-network.yaml`, Linux Engine / Podman):
the app binds `127.0.0.1` on your machine directly and needs no widened peer set at all.

`AUTH_FALLBACK` is what an un-credentialed request gets: `owner` for `single-user` (its only credential),
`deny` for every login mode. Never `owner` with an SSO mode in production: the app refuses to boot,
because a same-host proxy would turn every visitor into the owner.

## LAN and HTTPS

The port is published on `127.0.0.1` only. To reach the app from your phone or another computer:

1. Switch to a login in `docker/orbweaver.local.env`: `AUTH_MODE=local`, `AUTH_FALLBACK=deny`,
   `AUTH_FALLBACK_TRUSTED_PEERS=` (empty). Then `ORB_BIND=0.0.0.0` in a `.env` file beside
   `docker-compose.yaml` or on the command line (`ORB_BIND=0.0.0.0 docker compose up -d`). The entrypoint
   refuses the no-login default on a non-loopback bind, so you cannot open the LAN by accident.
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
- The built-in CPU model tier keeps its weights in `models/transformers/` in the same volume: ~3.5 GB
  embedder, ~92 MB reranker, ~176 MB background-removal. They download in the background shortly after the
  server starts answering, smallest first, and only for the jobs this box actually serves on the CPU tier;
  `LOCAL_LIGHT_PREFETCH=off` leaves them to download on first use instead, and `LOCAL_LIGHT_CACHE_DIR`
  moves the directory elsewhere. It must stay writable — the rest of the image is read-only, which is why
  the weights cannot live beside the code.
- To keep it in a directory instead: replace the volume line with `./data:/app/data`. The container starts
  as root only to make that directory owned by `PUID`/`PGID` (default 1000), then drops to that user before
  the app runs — the SillyTavern / linuxserver pattern, so no manual `chown`. Match your own user with
  `PUID=$(id -u) PGID=$(id -g) docker compose up -d`. Started non-root (`user:`, rootless podman) it skips the
  chown and refuses to boot on an unwritable data dir, saying so.
- The image itself holds no state; `docker compose down` keeps the volume, `down -v` deletes it.
- **Updates and the database.** Migrations run at boot, from the SQL that ships inside the image. Before a
  boot that will CHANGE the database it copies the file aside first (`orbweaver.db.backup-<timestamp>`
  in the same directory, with a retention sweep), then migrates, then verifies referential integrity; a
  boot that changes nothing makes no copy. There are no "down" migrations: to roll back, stop the
  container, put the backup file back in place of `orbweaver.db` (remove any `-wal`/`-shm` beside it),
  and start the OLDER checkout again. Back up the whole volume before a big update:
  `docker run --rm -v orbweaver_orbweaver-data:/data -v "$PWD":/out alpine tar czf /out/orbweaver-data.tgz -C /data .`

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

- **`docker compose up` tries to pull `orbweaver:local` and fails** — you left off `--build`; the image is
  built from the checkout, never pulled.
- **Everything answers 401** in `single-user` — `AUTH_FALLBACK_TRUSTED_PEERS` was emptied or your docker
  network uses a range outside the shipped list (`docker network inspect` → add it), or you are on a custom
  network outside the shipped ranges (`10.0.0.0/8` covers Podman's default `10.88.0.0/16`). The reason is under "Login modes".
- **"REFUSING to boot … published on ORB_BIND="** — you opened the port to your network in the no-login
  mode; switch to `AUTH_MODE=local` as described under "LAN and HTTPS".
- **Sign-in "does nothing" on a LAN address** — plain http; the cookie is Secure. HTTPS in front, or use
  `http://localhost` on the machine itself.
- **"blocked … private address"** when adding a local model server — an owner-saved connection opens its own host:port, so this means the connection is not saved (test it after saving) or the saver is not the owner; `EGRESS_ALLOWLIST` (above) is the manual door.
- **`/app/data is not a writable directory`** — you started the container as a non-root user (`user:`,
  rootless podman) on a data dir that user cannot write. Either let the entrypoint start as root with
  `PUID`/`PGID` (the default), or make the directory writable by that user.
- **Forgot the generated password** (`local` mode) — it is kept at `/app/data/secrets/initial_password` until you delete it:
  `docker compose exec orbweaver cat /app/data/secrets/initial_password`. If you already changed it in
  Settings, that file is stale; `docker compose exec orbweaver rm /app/data/secrets/initial_password` then
  set `LOCAL_INITIAL_PASSWORD` for the next boot only if the owner row still has no password.
- Boot refuses with a message naming an env key — that message is the fix: every mode's required values
  are checked at boot (`packages/server/src/foundation/env/index.ts`), and a misconfigured deploy never
  silently degrades.

## Building

`docker build --target runtime -t orbweaver:local .` builds the image alone. The image is the server as
source (node 26 runs TypeScript directly), the built client, and a pruned production `node_modules`; how the
runtime file set is assembled has one home, `docker/assemble-runtime.sh`.
