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
key (OpenRouter, Anthropic, …) or a model server (below), choose it for Chat under "Model roles", then pick a
character and chat. Nothing was edited to
get here; every knob is optional and lives in `docker/orbweaver.env` (the tracked defaults, commented),
overridable in `docker/orbweaver.local.env` (gitignored).

There is no published image: the checkout is the source of truth and the build is part of `up`. To update:
`git pull && docker compose up -d --build` (migrations run at boot, with a backup of the database first).

## A model server on your machine

Ollama, KoboldCpp, LM Studio, TabbyAPI, llama.cpp's server, vLLM — anything OpenAI-compatible. Add it in Settings → Connections under "Your own server", with its base URL. From inside the container your machine is `host.docker.internal`, so the URL is `http://host.docker.internal:11434/v1` (Ollama), `:5001/v1` (KoboldCpp), `:1234/v1` (LM Studio), and so on. A server elsewhere on your LAN uses its LAN address.

The app's outbound firewall refuses private addresses until the owner admits the host. Admit it in one of two ways:

- In the connection's Diagnostics, select "Admit `<host>`". This writes "Allowed private endpoints" under Admin → Multi-user.
- Set the env floor in `docker/orbweaver.local.env`. It takes hosts, IPs, CIDRs or `host:port`, and it replaces the default.

```sh
# docker/orbweaver.local.env
PRIVATE_ENDPOINT_ALLOWLIST=host.docker.internal
```

`EGRESS_ALLOWLIST` is for other private hosts, such as a proxy or a webhook.

### Your own vLLM

Add one "vLLM" connection per engine you run, with the base URL of each: for example `http://host.docker.internal:8703/v1` for chat. Search and memory use an embedding and a rerank model. Without a vLLM connection for them, the built-in CPU models serve those jobs. The app never starts or stops your vLLM.

A vLLM container on the same compose network is reached by its service name instead (`http://<service>:8000/v1`); admit that name as a private endpoint the same way.

## Claude subscription

A Claude subscription is a per-user connection, not server config. Each user adds their own:

1. Run `claude setup-token` on the machine you use Claude Code on.
2. In Settings → Connections, add "Claude subscription" under "Subscription", and paste the token.

There is no server-wide switch. An Anthropic API key is a different thing: a metered key, added as an "Anthropic" connection.

## Login modes

| `AUTH_MODE` | who gets in | needs |
| - | - | - |
| `single-user` (default) | no login; whoever reaches the app from THIS machine is the owner | the port on `127.0.0.1` (the default) |
| `local` | username + password stored by the app | nothing — the first boot generates the password and prints it once (`docker compose logs orbweaver`); or set `LOCAL_INITIAL_PASSWORD` |
| `oidc` | your identity provider (Authentik, Authelia, Keycloak, …) | the `OIDC_*` block in `docker/orbweaver.env`, HTTPS |
| `forward-header` | a forward-auth proxy | `FORWARD_AUTH_*` — prefer the signed JWT path |

Every mode except `single-user` also needs `AUTH_FALLBACK=deny` and an empty `AUTH_FALLBACK_TRUSTED_PEERS=` beside
`AUTH_MODE`: the shipped defaults grant the no-login owner, and the app refuses to boot a login mode with them.
On bare metal, leave both lines out of `.env`; the app refuses them there and resolves them from the mode.

**How the no-login default stays safe.** The owner fallback is granted only to a request whose TCP peer is
trusted, and the shipped env names docker's bridge ranges in `AUTH_FALLBACK_TRUSTED_PEERS` because a port
published from a bridge network always arrives from the docker gateway. Under docker's NAT that range means
"whoever can reach the published port", so the safety is the publication itself: the base compose publishes
on `127.0.0.1` only, which makes the set "processes on this machine" — the same boundary as running the app
on bare metal. The entrypoint refuses to boot this mode if `ORB_BIND` is not loopback, and the app itself
refuses single-user on a non-loopback listener unless `AUTH_FALLBACK_TRUSTED_PEERS` declares the peer set
(inside the container compose sets `BIND_HOST=0.0.0.0`, which the shipped ranges declare). The app logs a
security warning every boot while the knob is live, any request that announces a proxy hop is denied the
grant, and the diagnostics door's credential-free arm is closed while widened. Want other devices? Use a
login (next section).

The other no-login shape is host networking (`docker/compose.host-network.yaml`, Linux Engine / Podman):
the app binds `127.0.0.1` on your machine directly and needs no widened peer set at all. The overlay drops
the shipped ranges, so the app refuses `ORB_BIND=0.0.0.0` in this shape too.

`AUTH_FALLBACK` is what an un-credentialed request gets: `owner` for `single-user` (its only credential),
`deny` for every login mode. Never `owner` with an SSO mode in production: the app refuses to boot,
because a same-host proxy would turn every visitor into the owner.

Under `forward-header`, end every tunnel or port-forward at your auth proxy, never at the app port: anything that reaches the app directly from a peer in `FORWARD_AUTH_TRUSTED_PROXIES` can set the identity header and sign in as anyone. For the same reason the Share card and `pnpm start --share` refuse to start a relay in this mode.

## LAN and HTTPS

The port is published on `127.0.0.1` only. To reach the app from your phone or another computer:

1. Switch to a login: add these lines to the `environment:` block of `docker-compose.yaml`. Values there
   override both env files, and the file is not hidden the way a dotfile is:

   ```yaml
       environment:
         AUTH_MODE: local
         AUTH_FALLBACK: deny
         AUTH_FALLBACK_TRUSTED_PEERS: ""
         ALLOWED_HOSTS: orb.home.lan    # only if people type a host name; an IP address needs no entry
   ```

   Then open the port: change both `127.0.0.1` defaults of `ORB_BIND` in `docker-compose.yaml` to `0.0.0.0`,
   or set it for one start (`ORB_BIND=0.0.0.0 docker compose up -d`). The entrypoint refuses the no-login
   default on a non-loopback bind, so you cannot open the LAN by accident. `pnpm start --setup` does not
   apply here: the container takes no settings from the repository's `.env`.
2. **HTTPS in front.** Over plain http the sign-in works, but the password and the session cookie travel in
   clear, and the login screen says so. Behind a TLS proxy that sends `X-Forwarded-Proto: https` the cookie
   is `Secure` + `__Host-`. Any TLS terminator works: Caddy (automatic certs, or its internal CA on a LAN),
   nginx, Traefik, a Tailscale `serve`. Point it at `127.0.0.1:8788` on
   this machine, or join it to this compose network and target `orbweaver:8788` (the stanza at the bottom of
   `docker-compose.yaml`). The proxy must pass `X-Forwarded-Proto/Host/For` and must not buffer SSE. It must
   also pass the browser's `Host` through: Caddy does by default; in nginx set `proxy_set_header Host $host`.
3. Optionally bound who may knock at all: `IP_ALLOWLIST=192.168.1.0/24`. Behind a proxy the peer is the
   proxy, so allowlist the proxy's address, not your laptop's.

**Reaching it by name.** An IP address (`http://192.168.1.20:8788`) and `localhost` always work. Any other
name people type in the browser must be in `ALLOWED_HOSTS`, in the `environment:` block of
`docker-compose.yaml` (step 1): a NAS or PC name (`nas.local`), a proxy's hostname, a tunnel hostname. In a
container the app cannot see your machine's name, so add it too. Separate names with commas; a leading dot
admits the name and every subdomain (`.example.com`), but never a whole top-level domain such as `.com` or
`.lan`. The hosts in `OIDC_REDIRECT_URIS` are added for you. The app refuses every other name with a page that
names the host and the line to add. That refusal is what stops a web page from reaching the app through your
browser by pointing its own name at your machine (DNS rebinding), so add only names you use.

```yaml
    environment:
      ALLOWED_HOSTS: nas.local,orbweaver.example.com
```

**No TLS on your LAN?** Skip step 2 and sign in at `http://192.168.1.20:8788`. The session cookie is then
`orb_session_insecure` with no `Secure` attribute, and it travels **in clear on your own network**. The cookie
is the credential: anyone who can watch that network (another device on the wi-fi, a switch or router in the
path, a hostile access point) can copy it and be you. Accept that only on a network you own.

Anything reachable from the internet runs a login mode behind real TLS. A sign-in over plain http from a
public address logs a security warning, and the login screen shows it in red.

## From the internet: a tunnel

Do not forward a router port to this app: the login would cross the internet in plain http. A tunnel dials
out from this machine and terminates TLS for you. Every tunnelled request carries forwarding headers, so
single-user is never the owner through one. Switch to a login first with the `environment:`
lines from step 1 of "LAN and HTTPS", but keep `ORB_BIND` on `127.0.0.1`: the tunnel does not need the port.

### Cloudflare Tunnel, as a sidecar

1. In the Cloudflare dashboard (Zero Trust → Networks → Tunnels), create a tunnel and copy its token.
2. Add a public hostname to the tunnel whose service is `http://orbweaver:8788`, and allow that hostname:
   `ALLOWED_HOSTS: <the public hostname>` in the `environment:` block. For a quick tunnel, add its exact
   `<random>.trycloudflare.com` name. Use a dot-led suffix only for a domain whose DNS you control.
3. Start the app with the sidecar overlay:

```sh
CLOUDFLARE_TUNNEL_TOKEN=<token> docker compose -f docker-compose.yaml -f docker/compose.cloudflared.yaml up -d --build
```

The sidecar sends `X-Forwarded-Proto: https` from its address on this project's network, so the session
cookie is `Secure`. The token rides in the environment; the overlay's header shows how to keep it in a file.
Cloudflare Access in front is optional and adds its own login before the app's.

### Tailscale serve

With Tailscale on this machine, `tailscale serve --bg 8788` publishes `https://<machine>.<tailnet>.ts.net`
to your tailnet and proxies it to `127.0.0.1:8788`. Serve sends `X-Forwarded-Proto: https`, so a login mode
gets a `Secure` cookie. `tailscale funnel --bg 8788` publishes the same address to the internet, and
`tailscale serve reset` removes it. Allow the name in the `environment:` block:
`ALLOWED_HOSTS: <machine>.<tailnet>.ts.net`, or `.<tailnet>.ts.net` for every machine in your tailnet. A tailnet
address (`100.x.y.z`) needs no entry.

**Tailnet identity instead of passwords.** Serve removes any incoming `Tailscale-User-*` header and sets
`Tailscale-User-Login` for a tailnet user, so `forward-header` mode can take the identity from it:

```sh
# docker/orbweaver.local.env
AUTH_MODE=forward-header
AUTH_FALLBACK=deny
AUTH_FALLBACK_TRUSTED_PEERS=
FORWARD_AUTH_USER_HEADER=Tailscale-User-Login
FORWARD_AUTH_TRUSTED_PROXIES=172.18.0.1/32
OWNER_HANDLES=you@example.com
```

`FORWARD_AUTH_TRUSTED_PROXIES` is the one peer the app sees Serve's requests from: the gateway of this
project's network (`docker network inspect orbweaver_default`), or `127.0.0.1/32` on bare metal.
`OWNER_HANDLES` is your tailnet login. Two limits:

- Any process on this machine can reach the app from that peer and send the header, so use this only on a
  machine whose local users you trust.
- Every tailnet user who can reach the address gets an account; your tailnet's access rules are the gate.
  Funnel traffic carries no identity header and answers 401.

## Where your data lives

- `orbweaver-data` (named volume) → `/app/data`, laid out as `db/` (the sqlite database plus `-wal`/`-shm`),
  `backups/` (the pre-migration copies), `assets/` (uploaded and seeded blobs), `users/` (per-user runtime
  state), `secrets/` (the generated session secret, first password and credentials key), `reports/` (import
  reports) and `cache/` (everything the app regenerates: model weights, image variants, import staging).
  **Backup = this volume minus `cache/`.** Losing `secrets/credentials_key` makes every stored provider key
  unreadable, and losing `secrets/session_secret` invalidates every local password and sign-in (the same
  blast radius as losing the database); a boot that finds either file missing while the database still
  depends on it refuses to start and names the file. A volume from an older image is moved into this
  layout on the first boot, in place, and the log says what moved; a boot that cannot move an entry (a
  mount at its new place) refuses and names the entry and its way out, such as `DATA_LAYOUT_SKIP`.
- The built-in CPU model tier keeps its weights in `cache/models/transformers/` in the same volume: ~3.5 GB
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
  boot that will CHANGE the database it copies the file aside first (`backups/orbweaver.db.backup-<timestamp>`,
  with a retention sweep; `touch` a `.keep` beside a copy to exempt it), then migrates, then verifies
  referential integrity; a boot that changes nothing makes no copy. There are no "down" migrations: to roll
  back, stop the container, put the backup file back in place of `db/orbweaver.db` (remove any
  `-wal`/`-shm` beside it), and start the OLDER checkout again. Back up the whole volume before a big update:
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
  Through a proxy or tunnel, single-user always answers 401: a relayed request is never the owner. Use a login
  mode there ("From the internet: a tunnel").
- **"This address is not allowed" (HTTP 421)** — you reached the app by a name it does not know. If the name
  is yours, add it to `ALLOWED_HOSTS` in the `environment:` block and restart ("Reaching it by name").
  Behind a proxy that rewrites `Host` to its upstream (`orbweaver`), pass the browser's `Host` through instead.
- **"REFUSING to boot … published on ORB_BIND="** — you opened the port to your network in the no-login
  mode; switch to `AUTH_MODE=local` as described under "LAN and HTTPS".
- **The login screen says "plain http" on an https page** — the TLS proxy sends no `X-Forwarded-Proto: https`,
  or its address is outside the private ranges and `FORWARD_AUTH_TRUSTED_PROXIES`, so the session cookie is not
  `Secure`. Fix the proxy ("LAN and HTTPS").
- **"blocked … private address"** when adding a local model server — the host is not admitted. The owner admits it from the connection's Diagnostics or with `PRIVATE_ENDPOINT_ALLOWLIST` ("A model server on your machine").
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
