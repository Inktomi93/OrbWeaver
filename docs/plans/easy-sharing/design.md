---
kind: plan
status: active
updated: 2026-09-24
---

# Easy sharing: one step from a single box to friends on the internet

## Goal

A host with no shell skill, on bare metal or Docker, takes one step and friends outside the LAN join a multi-human room over a free relay, with live streaming intact and every existing security control still on.

## Shape

Not yet built. Section 1 re-derives the brief against the tree. Section 2 is the transport finding with the probe evidence. Section 3 surveys every free relay. Section 4 is what the field does. Section 5 is the security posture a share must satisfy and what the app enforces on its own. Section 6 is the UX. Section 7 is the friend's side of a relay restart. Section 8 ranks the backends. Section 9 orders the build legs. Every claim marked "unverified" was not reproduced here.

### 1. Premises re-derived against the tree

| Premise | Verdict | Evidence |
| - | - | - |
| A quick tunnel buffers SSE over GET until the connection closes; SSE over POST streams | holds, and it is wider: every GET body is buffered, whatever the content type | section 2, both origins; vendor: cloudflared issue "SSE over GET is not streamed in real-time on Quick Tunnel", maintainer: "guardrails due to it being a demo product", "works as expected with named tunnels"; Quick Tunnels page: "do not support Server-Sent Events" |
| orbweaver streams over `httpSubscriptionLink`, so an EventSource GET | holds | `packages/client/src/data/trpc.ts` `splitLink` sends every subscription to `httpSubscriptionLink`; the installed `@trpc/client` builds it on `sseStreamConsumer` with `globalThis.EventSource` and offers only an `EventSource` constructor override, no fetch or POST mode |
| The client socket bus carries something else | refuted: it is the same GET | `packages/client/src/data/bus/use-orb-socket.ts` opens `stream.connect`, the one EventSource; every live room (`user`, `notifications`, `chat`, `rpg`, `automation`, `workloads`, `packages/contracts/src/stream/index.ts`) rides it; `chat.impersonateStream` is the one other subscription (`packages/server/src/transport/trpc/routers/chat.ts`); `attach` and `detach` are POST mutations and pass a tunnel |
| The server refuses a POST subscription | holds today, one option away | the installed `@trpc/server` accepts `["GET","POST"]` for a subscription only under `allowMethodOverride`; `packages/server/src/entry/app.ts` does not set it; probe: `METHOD_NOT_SUPPORTED` |
| SillyTavern streams generation as POST with its own SSE parser | holds | in the SillyTavern repository, `public/scripts/custom-request.js` sends `method: 'POST'` and reads through `EventSourceStream` from `public/scripts/sse-stream.js` |
| `Remote-Link.cmd` is a Windows-only quick tunnel | holds | in the SillyTavern repository, it prints a warning, pauses, downloads `cloudflared.exe` and runs `cloudflared.exe tunnel --url localhost:8000` |
| The compose cloudflared overlay is a named tunnel | holds | `docker/compose.cloudflared.yaml` runs `tunnel run` with `TUNNEL_TOKEN` |
| A quick tunnel's random host must be in `ALLOWED_HOSTS` | holds, and the list is frozen at boot | `packages/server/src/entry/app.ts` calls `resolveAllowedHosts(allowedHostsInput())` once at app creation; `packages/server/src/foundation/env/allowed-hosts.ts` reads env only; `packages/kit/src/allowed-hosts/index.ts` admits `localhost`, `*.localhost` and IP literals with no entry |
| The setup wizard can write the share posture | partly: it owns `PORT`, `AUTH_MODE`, `ALLOWED_HOSTS` and nothing else | `tooling/src/stack/lib/setup-plan.ts` `SETUP_OWNED_KEYS`; audiences are `just-me` and `network` (`tooling/src/stack/contract/types.ts`) |
| Single-user refuses relayed requests | holds | `packages/server/src/infra/auth/forwarded.ts` names `forwarded`, `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`, `x-forwarded-proto`, `x-forwarded-host`; a tunnel sends them; `packages/server/src/infra/auth/relay-notice.ts` logs the refusal |
| The sharing panel can start a share | refuted: it is read-only by ruling | `packages/client/src/features/user-admin/components/sharing-posture.tsx`; the ruling is `docs/plans/network-and-auth-modes/design.md` section 7, option 3 |
| Invites exist | holds, behind two gates | `GET /join/:token` answers 404 unless `multiHumanCapable` (`packages/server/src/entry/http/join.ts`); under `local` that is the `localMultiUser` setting (`MULTI_HUMAN_CAPABLE` in `packages/server/src/entry/app.ts`); `redeemInvite` needs a signed-in principal (`packages/server/src/domain/chat/verbs/invites.ts`) |
| A friend can make an account | refuted for `local`: accounts come from `admin.createUser` (`packages/server/src/transport/trpc/routers/admin.ts`); there is no self-registration, so an invite alone does not seat a stranger | the OIDC path has `OIDC_SIGNUP`; the password path has nothing |
| A join link survives the sign-in | refuted | `requireAuthed` in `packages/client/src/features/auth/lib/route-guards.ts` redirects to `/login` with no search, and `goHome` in `packages/client/src/features/auth/surfaces/login-surface.tsx` navigates to `/` with none, and the installed `@tanstack/router-core` 1.171.13 (dist/esm/router.js line 1140, `if (!dest.search) return {};`) carries no search on such a navigation, so `/?join=<token>` loses the token |
| A quick tunnel keeps the cookie secure | holds | probe: a login through the tunnel minted `__Host-orb_session`; cloudflared sends `X-Forwarded-Proto: https` (Cloudflare request-headers reference) and `packages/server/src/infra/auth/transport.ts` keys the cookie on it |
| Docker cannot learn a sidecar's random host | refuted | cloudflared's metrics server answers `GET /quicktunnel` with `{"hostname":"…"}` (`metrics/metrics.go` in the cloudflared repository) |

### 2. The transport finding

Method. Two origins on private loopback ports, never the dev stack. Origin A: a `node:http` server with `/sse` (`text/event-stream`), `/jsonl` (`application/jsonl`) and `/text` (`text/plain`) on GET and POST, each writing one chunk every 500 ms for 20 chunks, plus a hand-rolled RFC 6455 WebSocket at `/ws` sending 20 frames on the same clock. Origin B: this checkout's server booted with `AUTH_MODE=local`, `ORB_ENV_NO_FILE=1`, a throwaway database under `.cache/`, and `ALLOWED_HOSTS` set to the tunnel host. Relay: `pnpm dlx untun@latest tunnel http://localhost:<port>`, which downloaded cloudflared 2026.7.2 to `/tmp/node-untun/` and ran it with `--no-tls-verify`. Client: a node script recording the arrival time of every body chunk; the spread is last arrival minus first. A streamed body spreads about 9.5 s; a buffered body arrives as one chunk after the server closes.

| Case | Direct | Quick tunnel, run 1 | Quick tunnel, run 2 |
| - | - | - | - |
| GET `/sse` | 20 chunks, first 542 ms, spread 9508 ms | 1 chunk at 10468 ms, spread 0 | 1 chunk at 10461 ms, spread 0 |
| POST `/sse` | 20 chunks, first 504 ms, spread 9509 ms | 28 chunks, first 597 ms, spread 9504 ms | 26 chunks, first 564 ms, spread 9507 ms |
| GET `/jsonl` | 20 chunks, first 503 ms, spread 9506 ms | 1 chunk at 10086 ms | 1 chunk at 10066 ms |
| POST `/jsonl` | 20 chunks, first 502 ms, spread 9508 ms | 20 chunks, first 570 ms, spread 9507 ms | 20 chunks, first 582 ms, spread 9505 ms |
| GET `/text` | 20 chunks, first 502 ms, spread 9505 ms | 1 chunk at 10109 ms | 1 chunk at 10102 ms |
| WebSocket `/ws` | open at 5 ms, 20 frames, spread 10005 ms | open at 288 ms, 20 frames, spread 9865 ms | open at 234 ms, 20 frames, spread 9887 ms |

Against the real server, `stream.connect` as the browser sends it (GET, `Accept: text/event-stream`, session cookie), then `stream.attach` for the `user` room after one second, reading for 35 s:

| Step | Direct | Quick tunnel |
| - | - | - |
| login | 200, cookie `orb_session_insecure` | 200, cookie `__Host-orb_session` |
| response head | 200 `text/event-stream` at 21 ms | 200 `text/event-stream` at 227 ms |
| `connected` frame | 22 ms | never |
| `attached` control frame | 1039 ms | never (the attach itself answered 200) |
| server pings | 16.0 s and 31.0 s | never |
| body bytes in 35 s | every frame | zero |
| POST `stream.connect` | `METHOD_NOT_SUPPORTED`, http 405 inside a 200 SSE body | same |

Reading. The quick tunnel holds every GET response body until the origin closes it; content type does not matter. POST bodies and WebSocket frames pass as produced. Every orbweaver live surface is a GET SSE, so through a quick tunnel a friend sees no typing, no turn, no notification and no presence. The inactivity timer that would reconnect a silent socket is client-side and is armed by the `connected` frame's `reconnectAfterInactivityMs` (the consumer in the installed `@trpc/server` stores the options when that frame arrives and applies the timeout on every later read); through a quick tunnel that frame never arrives, so the timer is never armed and the room stays frozen until the tab reloads or the relay drops the connection. Cloudflare's WebSocket page says WebSockets are proxied on every plan; the sandbox docs say quick tunnels handle upgrades; the probe agrees.

The three ways to make the streams survive, priced against this tree:

(a) POST subscriptions. Server: `fetchRequestHandler({ allowMethodOverride: true })` in `packages/server/src/entry/app.ts`. tRPC then accepts POST for subscriptions and queries and reads the input from the body on POST; GET keeps working, so the e2e instrument `tests/e2e/support/sse.ts` is untouched. Client: `httpSubscriptionLink({ url, EventSource: PostEventSource })`, where `PostEventSource` is a class in a new file post-event-source.ts beside `packages/client/src/data/bus/use-orb-socket.ts` that satisfies the consumer's `EventSourceLike.Instance` contract:

- `new (url, init)`, the instance constants `CONNECTING`, `OPEN` and `CLOSED`, `readyState`, `addEventListener` and `removeEventListener` for `open`, `error`, `message` and every named event (`connected`, `ping`, `serialized-error`, `return`), `close()`, and a `MessageEvent` carrying `data` and `lastEventId`.
- The request: it moves the `input` query parameter into a JSON body, sends `POST` with `Content-Type: application/json` (the mount's `trpcJsonOnly` middleware answers 415 to any other POST content type), `Accept: text/event-stream`, the CSRF header and same-origin credentials, and parses the body with the SSE grammar.
- Terminal answers: a non-2xx status, a 204, or a response whose content type is not `text/event-stream` sets `readyState` to `CLOSED` and fires `error` with no reconnect. The consumer turns an `error` into a stream error only when `readyState` is `CLOSED`; otherwise it reports `connecting`. The CT stub `tests/support/node/route-trpc.ts` answers a subscription with a 204, so this rule is what keeps every existing CT quiet.
- Reconnect: when the body ends or the fetch fails, it fires a plain `Event` named `error` with `readyState` at `CONNECTING`, waits the last `retry:` value or the browser default, and reopens. The event carries no `data`, because `packages/client/src/features/chat/hooks/use-guided-actions.ts` treats a `connecting` error that carries a tRPC error shape as a server fault and rejects. It never reconnects after `close()` or after the `return` event, which the consumer answers by closing the source.
- Resume: a native EventSource sends `Last-Event-ID` on its own reconnect and the consumer also re-sends the last id through the input; no procedure here resumes by it. `stream.connect` resumes each room from the cursor `stream.attach` carries in `sinceSeq`, and `chat.impersonateStream` is one-shot. The class therefore carries no resume state.

Cost: one class, one link option, one server option, and the mirrors named in the test plan. Security: a POST subscription carries the CSRF header for free; the procedure middleware in `packages/server/src/transport/trpc/trpc.ts` checks the header for mutations only, so nothing tightens or loosens. A POST from a page cannot be cached or logged as a query string, which also takes the `socketId` out of proxy logs.

(b) tRPC `wsLink` over a WebSocket. The probe says a quick tunnel passes frames, so it would work. Cost: a `ws` dependency and `@trpc/server/adapters/ws`, an upgrade hook on `@hono/node-server`, a second authentication seam at the upgrade (cookie read, `Origin` check, no CSRF header), a second stub shape for every client CT, and the reconnect and cursor code kept for SSE anyway. `docs/adr/0118-all-server-client-streaming-rides-one-multiplexed-sse.md` rejects `wsLink` for the same reasons. Rejected.

(c) Detect a tunnel host and switch transport only there. `location.hostname` ending in `.trycloudflare.com` picks (a), everything else stays native. Two transports mean two CT stub shapes and a class of defects that appear only on the shared link. The POST class also lets a subscription carry a header, which the ngrok interstitial bypass wants. Rejected as the default; the fallback if the always-on CT blast radius is refused.

Decision: (a), always on. Leg T in section 9. It lands before any share surface, because a share that ships a frozen room is worse than none.

### 3. The free relays

| Option | Account | Cost | Stable URL | GET SSE streams | WebSocket | Node-native | OS | Limits | Terms and notes |
| - | - | - | - | - | - | - | - | - | - |
| Cloudflare quick tunnel: `cloudflared tunnel --url`, the `cloudflared` npm package, `untun` | none | free | no, a random `*.trycloudflare.com` per run | no (probe) | yes (probe) | binary; the npm packages download it on first use (`cloudflared` package: "automatically install the latest version"; `untun` into `/tmp/node-untun/`) | Linux, macOS, Windows binaries on the downloads page | 200 in-flight requests then 429; no SLA; "meant for testing and development" | running cloudflared is acceptance of the Cloudflare license and terms (printed on start); the application-services terms let Cloudflare limit the CDN for video and "a disproportionate percentage of pictures, audio files, or other large files" outside paid products, so a room that streams video through it is at risk; chat text and images are the normal case |
| Cloudflare named tunnel (the shipped overlay) | free account plus a domain on Cloudflare DNS (the dashboard route needs a domain from the drop-down) | the domain | yes | yes per the maintainer's comment on the SSE issue (unverified here) | yes | binary or the `cloudflare/cloudflared` image | all | Zero Trust free plan | same terms; Cloudflare Access optional in front |
| Tailscale Serve | free Personal plan, up to 6 users; friends must be tailnet members or receive a node share | free | yes, `https://<machine>.<tailnet>.ts.net` | expected (a Go reverse proxy on the device; unverified) | expected (unverified) | needs the Tailscale client on the host | all; macOS port proxying works on the App Store variant, file serving only on the open-source one | tailnet size | identity headers make `forward-header` mode work (`docker/README.md`) |
| Tailscale Funnel | same account; friends need nothing | free | yes, same name | unverified | unverified | same client | same; macOS needs the open-source variant | ports 443, 8443, 10000 only; "non-configurable bandwidth limits", no number published; needs MagicDNS, HTTPS certificates and the `funnel` node attribute, which the CLI prompts to enable; DNS can take 10 minutes | TLS terminates on the device; the relay cannot read traffic |
| ngrok, `@ngrok/ngrok` SDK | account and authtoken | free | yes, one assigned `*.ngrok-free.app` dev domain | unverified | unverified | yes, "requires no binaries" | all | 3 online endpoints, 1 GB transfer and 20k HTTP requests a month; an interstitial on HTML browser traffic once per 7 days per domain, skipped by the `ngrok-skip-browser-warning` header or a custom `User-Agent` | free endpoints publish the origin IP in the URL and in an `ngrok-agent-ips` header (abuse page), so the host's home address is public; the interstitial cookie should cover the EventSource after the first click (unverified) |
| zrok | account at myzrok.io | free tier: 5 GB a day, 25 environments, 50 shares | reserved shares, yes | unverified | unverified | binary | all | interstitial until a card is on file | self-hostable |
| Pinggy | none for `ssh -p 443 -R0:localhost:<port> free.pinggy.io`; a Node SDK exists | free tier | no | unverified | unverified | SDK yes, CLI otherwise | ssh everywhere | the pricing page did not load; the free tunnel lifetime is unverified | |
| localtunnel | none | free | no, `*.loca.lt` | unverified | unverified | npm | all | the first browser visit asks for a "tunnel password", which is the host's public IP (issue "Tunnel Consent page now requires a password") | the password step publishes the host's address; an open dependency-vulnerability issue |
| bore | none | free | `bore.pub:<random port>` | plain TCP, so yes | yes | binary (Rust) | all | no TLS: the password and cookie cross the internet in clear | refused on that alone |
| VS Code dev tunnels | Microsoft, Entra or GitHub account for the host | free | yes, persistent tunnels | unverified | unverified | CLI | Windows, Linux, macOS | public preview, "not for production"; anonymous access is opt-in with an expiry from 1 h to 30 d | |
| IPv6 direct, UPnP or NAT-PMP mapping | none | free | the home address | yes | yes | node can map a port | all | no certificate for a bare address, so plain http: the password and cookie travel in clear (`docker/README.md` already refuses a port-forward); the home address is published; UPnP opens the router to any LAN device that asks; CGNAT and ISP filtering make it fail silently | refused |

### 4. What the field does

| App | The switch | Relay paid by | Security default |
| - | - | - | - |
| Gradio | `launch(share=True)` makes `https://<id>.gradio.live` through Gradio's share servers; links expire after one week; a self-hosted share server is possible | Gradio | public to anyone with the link; `auth=` adds a password; the docs say not to expose anything sensitive |
| Home Assistant, Nabu Casa | a remote-access switch in the cloud settings; end-to-end encrypted SniTun relay | the subscriber, after a trial | off until the owner enables it |
| Plex | Relay is the automatic fallback when a direct connection fails | Plex | needs Secure connections preferred or required; 2 Mbps per stream; remote playback itself is a paid feature |
| Open WebUI | none built in; the docs point at Tailscale, Cloudflare Tunnel with Access, or ngrok | the user's account | first sign-up is admin, later sign-ups wait in a pending queue |
| Marinara Engine | none built in; its remote-access guide (REMOTE_ACCESS.md in that repository) trusts Tailscale and same-host Docker peers and points at a reverse proxy or Cloudflare Tunnel | the user's account | forwarding headers cancel the Docker bypass |
| SillyTavern | `Remote-Link.cmd` on Windows: warning, pause, download, quick tunnel; the docs describe whitelist, basic auth and a host whitelist with `.trycloudflare.com` as the example suffix | Cloudflare | the script tells the user to set a password first |

The common shape: one switch, a public random URL, a warning that anyone with the link reaches the sign-in page, and a login in front of the app. Nobody free gives a stable URL without an account.

### 5. Security posture

What must be true before a link goes out, each with its home:

| Condition | Why | Home |
| - | - | - |
| a login mode, `local` or `oidc` | a relayed request is never the owner, so single-user answers 401 to every visitor | `packages/server/src/infra/auth/forwarded.ts` |
| `BIND_HOST=127.0.0.1` when the box switches from `just-me` | in production `local` binds every interface (`packages/server/src/foundation/env/bind.ts`), which would open the LAN over plain http beside the relay; a box that already answers to its network keeps its bind | the key writer (leg R) owns the key and gains a delete value, because today `null` in `tooling/src/stack/lib/setup-plan.ts` means "leave the line as it is"; the wizard's `network` answer deletes `BIND_HOST`; the wizard derives its audience from `AUTH_MODE` alone, so it cannot see the pin; the launcher restates the key on the child env |
| the owner holds a password | the first-run claim is loopback-only, so it can never be taken over the link; without a password the owner cannot sign in through it either | `packages/server/src/entry/http/auth-routes.ts`, `LOCAL_INITIAL_PASSWORD` |
| `localMultiUser` on | invites and `/join/:token` are 404 without it | `MULTI_HUMAN_CAPABLE` in `packages/server/src/entry/app.ts` |
| `discreetLogin` on | the sign-in page otherwise shows the default handle `owner` (`defaultHandle` in `packages/server/src/entry/http/auth-meta.ts`), and hiding it turns one unknown into two | the `discreetLogin` app setting (`packages/contracts/src/settings/index.ts`) |
| the relay host allowed | the Host check refuses every unknown name and has no off switch | `packages/server/src/entry/http/host-allowlist.ts`, the relay registry of leg H |
| an account per friend | `redeemInvite` needs a principal; `local` has no self-registration | `packages/server/src/transport/trpc/routers/admin.ts`, leg J |
| the session cookie is `Secure` | the relay sends `X-Forwarded-Proto: https` from a loopback hop, which is the trusted-hop rule | `packages/server/src/infra/auth/transport.ts` |
| per-visitor rate limits | `clientIp` reads `X-Forwarded-For` behind a trusted hop, so the login throttle and the anonymous bucket key on the visitor, not on the tunnel | `packages/server/src/infra/network/ingress.ts`, `packages/server/src/entry/rate-limit-gate.ts` |
| diagnostics recorders off | prompts and transcripts must not sit behind a public link | the boot disclaimer's warnings |

What the share surface enforces on its own, in order: refuse to start under single-user and name the fix; refuse when the owner has no password and open the password step; turn `localMultiUser` and `discreetLogin` on with one confirmation; register the relay host the moment the relay reports it and drop it when the relay stops; show the URL beside the sentence "anyone with this link reaches your sign-in page"; on relay death show "down" and restart, and say when the URL changed. Stopping a share ends the relay; sessions minted through it stay valid until they expire, so the panel offers "sign everyone out", which calls `admin.revokeUserSessions` (`packages/server/src/transport/trpc/routers/admin.ts`) per member; that ends the sessions, and the socket eviction follows from it.

The residual risk to state in the panel: a quick-tunnel URL is public and unguessable, the sign-in page is the only thing a stranger reaches, the login throttle is per visitor address, and the per-handle throttle (`packages/server/src/entry/http/auth-routes.ts`, the `login-handle` scope at three times the per-address cap) is the real ceiling against a guesser who rotates IPv6 addresses.

### 6. The UX

Bare metal, `pnpm start --share` (with `pnpm share` as an alias script). The launcher already owns the child env and refuses to write launch-only keys to `.env` (`tooling/src/stack/lib/start-plan.ts`, `portOverrideEnv`, `singleUserFallbackEnv`). The share flag adds three steps before the spawn: ask for an owner password when the database has none and pass it as `LOCAL_INITIAL_PASSWORD`; restate every `.env` value on the child env with `ORB_ENV_NO_OVERRIDE=1`, the `portOverrideEnv` shape, then set `AUTH_MODE=local`, `SHARE_RELAY=quick` and, when the file says `just-me`, `BIND_HOST=127.0.0.1`; spawn the server. The server starts the relay itself at boot (leg S), registers the host in its relay registry (leg H) and prints the URL with the warning sentence and "invite friends from a room's invite dialog". Every respawn of the server starts the relay again under a new quick-tunnel name (section 7). `ALLOWED_HOSTS` is never written for a relay, so a relay restart with a new name cannot hit a 421. Ctrl-C ends both processes, as it ends the server today. A box whose `.env` says `just-me` stays `just-me` on the next plain `pnpm start`. `localMultiUser` and `discreetLogin` are settings, not env, so the launcher cannot flip them; the panel does, once.

In-app, the Share card in Admin > Multi-user beside the read-only posture panel (`packages/client/src/features/user-admin/components/governance-sections.tsx`). Owner-only. It shows the preconditions as rows with a fix on each: "sign-in mode: single-user, switch to sharing", "owner password: not set, set it", "multi-user seating: off, turn on", "discreet login: off, turn on". The mode row writes `AUTH_MODE=local`, and `BIND_HOST=127.0.0.1` when the box was `just-me`, through the key writer (leg R), then restarts the server through the launcher supervisor. The page reconnects in `local` mode, so the mode stays an env var and the owner never opens a terminal. Under an unsupervised launch, the row shows `pnpm start --share` instead; in a container, it shows the two lines to add to `docker/orbweaver.local.env` and the `docker compose up -d` that applies them. When every row is green, "Start sharing" calls `share.start`; the server spawns the relay, registers the host, and the card shows the URL, a copy button, the relay kind, the count of live sockets from `liveSocketCount`, "Stop sharing" and "sign everyone out". An in-app share is not persisted: a server restart ends it, the card returns to `off`, and the owner starts it again; only the launcher's `SHARE_RELAY=quick` restarts a relay on its own. The URL is also shown inside the invite dialog (`packages/client/src/features/chat/components/invite-dialog.tsx`) so the copied invite is `https://<host>/join/<token>`, never a `localhost` link. Invites are per room and are made there, not from the admin section.

The friend. Opens the URL, sees the sign-in page, signs in with the handle and password the host made, lands on `/?join=<token>` and runs the preview-then-confirm invite flow. Today the token does not survive the sign-in (section 1); leg J carries it. That is three secrets to hand over (URL, handle, password) and one host action in Admin > Users first. The one-step version is an invite that provisions the account: `/join/<token>` for a signed-out visitor offers "pick a handle and a password" and mints the user in the same transaction that consumes the invite, under `localMultiUser` and a per-invite `allowSignup` flag the host sets on the invite. Leg J, owner fork 4.

Docker. A quick-tunnel overlay `docker/compose.quick-tunnel.yaml` runs the `cloudflare/cloudflared` image with `tunnel --url http://orbweaver:8788 --metrics 0.0.0.0:2000` and no token. The app reads `http://cloudflared:2000/quicktunnel` when `SHARE_RELAY=sidecar` and `SHARE_TUNNEL_METRICS_URL` are set, retries until the sidecar answers, and registers the hostname in the same relay registry; the sidecar is a compose sibling, trusted as the named-tunnel sidecar is. The login mode and password lines are the existing recipe in `docker/README.md`. In-app "Start sharing" in a container shows the compose command instead of spawning, because the image ships no relay binary and a container must not download one.

Relay death. A quick tunnel restarts with a new random name, so every sent link dies; the card says so and shows the new URL. A named tunnel or a Funnel keeps its name. The state machine is `off`, `starting`, `up(url)`, `down(reason)`, with a bounded restart.

### 7. The friend's side of a relay restart

When a quick tunnel restarts, the hostname changes, and every friend pays for it. The triggers: the relay process dies, the host stops and starts sharing, or the server restarts (a supervised respawn, the admin `restart`, a crash), because the relay is the server's child and starts again with the server:

| Effect | Cause | What the design does |
| - | - | - |
| every friend is signed out | the `__Host-` cookie is bound to the old host, so the new origin has no cookie | say it on the host's card; the friend signs in again at the new URL; nothing else can carry a cookie across origins |
| every friend's local state is gone | per-origin storage (appearance choices, drafts, the persisted stores) belongs to the old host | say it on the card; a friend's server-side settings survive, only the per-origin cache is lost |
| open tabs stop with "Lost the live connection" | the dead host answers a non-2xx, which the `PostEventSource` class treats as terminal, so the socket fault notice of `packages/client/src/data/bus/use-orb-socket.ts` shows with its "Try again"; the tab retries on its own only while the name fails to resolve | the old tab must be closed; the app cannot redirect a page it no longer serves |
| the new URL must reach friends out of band | the relay name is not knowable in advance, and the old host cannot answer | the card shows a large "the link changed" notice with the new URL and a copy button; an invite stores only its token hash and the host is `location.origin` at copy time (`packages/server/src/domain/chat/verbs/invites.ts`, `packages/client/src/features/chat/components/invite-dialog.tsx`), so the card says "old links still work if you replace the host with the new one" and offers revoke and re-mint |
| in-flight turns are lost on the friend's screen | the socket that carried them is gone | the turn itself finished on the server; the friend's next load shows it |

The card carries one standing sentence above the URL: for anything longer than a session, use a Funnel or a named tunnel, whose names survive a restart. A named relay never triggers this table.

### 8. Ranked recommendation

1. Zero-account default: a Cloudflare quick tunnel through the `cloudflared` npm package (`Tunnel.quick()`, `url` and `connected` events, `bin` for the binary path, MIT; its `install` and its postinstall are not used, because both take the unpinned latest release). Preferred over `untun`: it is the same fork underneath, exposes the process and its events rather than a CLI, and does not add `--no-tls-verify` by default. Cost: a binary download from GitHub releases on first share, with the license line printed as cloudflared prints it. The upstream installer takes the unpinned latest release with no checksum, so the server's controller pins a cloudflared version and verifies a checksum before it runs the file. Precondition: leg T.
2. Best robust free option: Tailscale Funnel. Stable name, TLS on the device, no media clause, free for personal use, friends need nothing, and none of section 7 applies. Cost: the host installs Tailscale and enables Funnel once through the CLI's consent page; ports fixed to 443, 8443 or 10000; streaming unverified, so leg F starts with a probe on a Tailscale account.
3. A named Cloudflare Tunnel stays the documented path for a host with a domain; the overlay exists.
4. ngrok's SDK is the only binary-free path and would be the simplest code, but the interstitial, the 1 GB month and the published origin IP keep it off the default list; it fits as a later backend behind the same state machine.

The backend order the share surface tries: Funnel when the `tailscale` CLI is present and logged in and the owner picked it, else the quick tunnel. Owner fork 3.

### 9. Build legs

- Leg T, transport: `allowMethodOverride` on the mount, `PostEventSource`, the link option. Lands first and alone.
- Leg L, launcher: `--share` on `pnpm start` and the `share` script; the child env of section 6; the password question. The relay itself is the server's (leg S).
- Leg H, the relay registry: `hostAllowlist` takes a reader that unions the env list with a server-owned set that only the relay controller writes; exact names, cleared on stop. It is the one owner of a relay host on every path: the launcher, the in-app card and the Docker sidecar all feed it, and none of them writes `ALLOWED_HOSTS`. Owner fork 2.
- Leg R, restart and key writer, not yet built. `pnpm start` becomes a supervisor. On every respawn it re-reads `.env` and rebuilds the whole spawn plan, because two overlays are computed from the file: `singleUserFallbackEnv` in `tooling/src/stack/lib/start-plan.ts` adds `AUTH_FALLBACK=owner` under single-user, which `packages/server/src/foundation/env/index.ts` refuses at boot once the mode is `local`, and `portOverrideEnv` restates the file's values with `ORB_ENV_NO_OVERRIDE`, which would keep the old mode. The loop wraps only the server run; the setup pass runs once, before the loop. Signal handlers are registered once and forward to the current child, because `forwardSignalsTo` in `tooling/src/_shared/proc.ts` adds a listener per call. The admin `restart` procedure is owner-only, needs an explicit confirm, is rate limited and single-flight, refuses when no supervisor started the server, closes the app and exits with the restart code. In Docker there is no restart path: the root filesystem is read-only and the env comes from the host files in `docker-compose.yaml`, so the mode row shows the `docker/orbweaver.local.env` edit and the compose command. The key writer is a pure text-to-text module in `@orb/kit`, the `applySetupValues` shape (a record of key to string or null over the file text); the file write stays in the server's restart verb and in the tooling ops, because the `packages-no-tooling` gate forbids a server import from tooling. The server writes only the keys the setup wizard owns plus `BIND_HOST`. Every respawn also restarts the relay under a new quick-tunnel name when `SHARE_RELAY=quick` is set, and ends an in-app share (section 6). There is no `.env` hot reload: a setting an admin changes while the server runs belongs in the Admin config (DB-backed and live), and `.env` keeps boot-time keys that apply on restart.
- Leg S, in-app share: a `share` router (`start`, `stop`, `status`), the relay controller composed at entry, the `SHARE_RELAY` boot read, the auth-config fields, the Share card and the invite dialog URL. The relay is the server's first long-lived child: it spawns in the server's process group and is killed on shutdown, so a server restart always restarts it, under a new quick-tunnel name; an in-app share ends on a restart. The `cloudflared` dependency lives in the server package with `allowBuilds.cloudflared: false` in `pnpm-workspace.yaml`, because approving its build runs a postinstall that downloads the unpinned latest release on every install; the controller downloads the pinned version itself and checks its checksum before it runs the file.
- Leg D, Docker: the quick-tunnel overlay and the `/quicktunnel` read into the relay registry.
- Leg J, invite-provisioned accounts and the carried token. One transaction inserts the user and consumes the invite (`redeemInviteAtomic` in `packages/server/src/domain/chat/verbs/invites.ts` covers only the seat today), with a race test of two concurrent mints on the last use. `allowSignup` needs a finite expiry and a finite `maxUses`, and is refused on a targeted invite. The signed-out mint route takes the login route's guards in the same order: the CSRF header, the body cap, the per-address and per-handle throttles before any hashing. It reuses `createUser`'s handle validation and refuses the owner seed handle and every `OWNER_HANDLES` name (`packages/server/src/entry/boot/seed-owner.ts`). The card states the cost of a leaked link: every minted account owns an AI-turn bucket, so uses and expiry are the spend cap. The token survives the sign-in: the `/login` redirect carries `join`, and `goHome` returns to `/?join=<token>`.
- Leg F, Funnel backend: probe first, then `tailscale funnel --bg <port>` and the URL read.
- Docs: README run-it, `docker/README.md`, the sharing panel copy.

Owner forks, each with the default this plan takes: (1) ruled by the owner: the Share card switches the mode through the key writer and a supervised restart (leg R), not in-process, which keeps option 3 of `docs/plans/network-and-auth-modes/design.md` section 7 (the mode stays an env var); (2) the Host allowlist gains one server-owned relay registry, exact names only, no operator off switch, and it is the only home of a relay host on the launcher, in-app and Docker paths; (3) the quick tunnel is tried first, Funnel only when the CLI is present and chosen; (4) leg J ships, because without it the friend's first step is three secrets and a host chore; (5) POST subscriptions are always on, not tunnel-only; (6) the server's relay controller downloads a pinned cloudflared and verifies its checksum on first share, rather than asking the host to install cloudflared; the npm package supplies the path and the process wrapper, never the download.

## Rejected

- WebSocket transport (`wsLink`): a second auth seam, a second CT stub shape, and the SSE lifecycle code kept anyway; the ADR already rejects it.
- A tunnel-only transport switch: two transports and defects that appear only on the shared link.
- An in-process auth-mode switch behind the Share button: the mode stays env, and a supervised restart re-validates the whole config at one boundary.
- `.env` hot reload in the style of Marinara's env watcher: it creates two sources of truth beside the DB-backed Admin config, and security keys (auth mode, trusted proxies, allowed hosts, secrets) would change under live sessions. The env is parsed and validated once at boot, and every read would need a getter.
- The launcher writing the relay host into `ALLOWED_HOSTS`: the list is frozen at boot, so a relay restart answers 421 until the next restart; the relay registry owns the host instead.
- Widening the Host check to a `.trycloudflare.com` suffix in env: it admits every quick tunnel anyone runs and it needs a restart; the relay registry admits one.
- A Docker restart verb: the root filesystem is read-only and the env is the host's files, so there is nothing the server could write.
- `untun` as the dependency: a CLI wrapper over the same fork with `--no-tls-verify` added by default and no process handle.
- The upstream installer's unpinned download: no version pin and no checksum for a binary the server executes.
- ngrok as the default: the interstitial, the 1 GB month, and the host's IP in the URL.
- localtunnel, bore, Pinggy's ssh form, port mapping: a password page that publishes the host's IP, no TLS, or no library path.
- Asking the friend for an account the host made by hand as the final shape: three secrets and an admin chore per friend.
- A relay binary inside the Docker image: the sidecar overlay is the container-native shape and keeps the image small.

## Coupled sites

- `packages/server/src/entry/app.ts`: `allowMethodOverride` on `fetchRequestHandler`; `hostAllowlist` takes a reader; the share controller on `AppDeps`; the `trpcJsonOnly` comment says the mount grants no method override and that GET alone carries subscriptions, which becomes false.
- `packages/server/src/transport/trpc/trpc.ts`: the auth middleware comment says subscriptions are exempt because they ride GET, which becomes false.
- `packages/client/src/data/trpc.ts`: the `EventSource` option on `httpSubscriptionLink`; the wire-client comment says subscriptions ride a native EventSource and are CSRF-exempt by design, which becomes false.
- a new post-event-source.ts beside `packages/client/src/data/bus/use-orb-socket.ts`: the class.
- `packages/server/src/entry/http/host-allowlist.ts`, `packages/server/src/infra/auth/host-allowlist.ts`: the relay registry beside the env list.
- `packages/server/src/transport/trpc/routers/` and `packages/server/src/transport/trpc/context.ts`, `packages/server/src/transport/trpc/router.ts`, `tests/server/entry/compose/services.test.ts`: the `share` router and its three coupled sites per `.claude/rules/server-edge.md`.
- `tests/server/transport/cross-tenant-sweep.suite.int.test.ts`: rows for the new procedures.
- `packages/server/src/entry/http/auth-meta.ts`, `packages/contracts/src/identity/index.ts`, `packages/client/src/data/auth-config.ts`: the share state on `/api/auth/config`.
- `packages/client/src/features/user-admin/components/governance-sections.tsx`, `packages/client/src/features/user-admin/components/sharing-posture.tsx`: the Share card.
- `packages/client/src/features/chat/components/invite-dialog.tsx`, `packages/client/src/features/chat/lib/join-token.ts`: the shared URL in the copied invite.
- `packages/client/src/features/auth/lib/route-guards.ts`, `packages/client/src/features/auth/surfaces/login-surface.tsx`: the carried `join` parameter.
- `packages/server/src/entry/http/join.ts`, `packages/server/src/transport/trpc/routers/invites.ts`, `packages/server/src/domain/chat/verbs/invites.ts`, `packages/contracts/src/chat/roster.ts`, `packages/server/src/entry/boot/seed-owner.ts`: leg J.
- `tooling/src/stack/lib/start-plan.ts`, `tooling/src/stack/ops/start.ts`, `tooling/src/stack/contract/types.ts`, `tooling/src/_shared/proc.ts`, `package.json` scripts: the launcher flag, the alias, the supervisor loop and the once-registered signal forwarding.
- `tooling/src/stack/lib/setup-plan.ts`: `applySetupValues` moves to a new `@orb/kit` module; the setup op and the server's restart verb call it.
- `packages/server/package.json`, `pnpm-workspace.yaml`: the `cloudflared` dependency and its `allowBuilds` row set to `false`.
- `docker/compose.quick-tunnel.yaml` (new), `docker/README.md`, `README.md`.
- `tests/support/node/route-trpc.ts`: answers a subscription with a 204 by the accept header; the class treats that as terminal, and the stub's input decoder must read a POST body.
- `tests/support/node/route-orb-socket.ts`, `tests/support/node/route-impersonate-stream.ts`: the stubs match on the URL and the accept header, not the method, and must read the input from a POST body where they read it from the query.
- `tests/client/data/trpc.test.ts`: the subscription request shape.

## Test plan

Red first against unmodified source; each names its planted control.

- Leg T. `tests/client/data/trpc.test.ts`: a subscription sends `POST` with `Content-Type: application/json`, the CSRF header and the input in the body, no `input` query parameter (red: the link constructs an EventSource and the stubbed fetch never sees the request); control: a query still sends `GET` with `input` in the query. `PostEventSource` unit: parses `event:`, `data:`, `id:`, `retry:` and multi-line data per the SSE grammar; fires named events; a 204, a 401 and a JSON body each end in `CLOSED` with one `error` and no second fetch; a body that ends fires a data-less `error` at `CONNECTING` and refetches after the `retry:` value; `close()` and the `return` event stop every refetch (red: the module does not exist); control: `removeEventListener` silences a listener before the next event. Server: `tests/server/entry/` drives `stream.connect` over POST and reads the `connected` frame (red: `METHOD_NOT_SUPPORTED`); control: a batched POST subscription still answers "Cannot batch subscription calls", and a POST with a form content type still answers 415. CT: `tests/client/data/bus/use-orb-socket.ct.tsx` and `tests/client/features/chat/components/composer-guided-cluster.ct.tsx` green through the updated stubs. Suites: `tests/client/data/`, `tests/server/entry/`, `tests/server/transport/trpc/`, the two CT files by path.
- Leg L. `tests/tooling/stack/`: `parseStartArgv` accepts `--share`; the spawn plan restates every `.env` value with `ORB_ENV_NO_OVERRIDE=1`, sets `AUTH_MODE=local` and `SHARE_RELAY=quick`, sets `BIND_HOST=127.0.0.1` only for a `just-me` file, never touches `ALLOWED_HOSTS`, and writes nothing to `.env` (red: the flag is unknown); control: a plain start leaves the env untouched and `.env` bytes identical, and a `network` file keeps its `BIND_HOST`. Key writer: the delete value removes a `BIND_HOST` line and `null` leaves it.
- Leg H. `tests/server/infra/auth/host-allowlist.test.ts`: a name in the relay registry passes while the env list is empty; removing it refuses the next request (red: the reader does not exist); control: a name never registered is refused with the same throttled line.
- Leg R. `tests/tooling/stack/`: the supervisor rebuilds the plan from a re-read file, so a file switched from single-user to `local` between two runs yields a child env without `AUTH_FALLBACK` (red: the plan is built once); the setup pass runs once across two respawns; one signal handler per signal across two respawns (control: two children, one listener count). Key writer: a pure unit in `tests/kit/` proves the moved `applySetupValues` byte-for-byte against the existing setup-plan cases. Server: `restart` refuses without a supervisor, without the confirm, and for a non-owner; a second call while one is in flight refuses.
- Leg S. The `share` router: `start` under single-user refuses with a coded error; `start` with no owner password refuses; `status` reports `up` with the URL after the controller reports it; `stop` clears the host (red: no router); control: a non-owner admin gets the leak-free refusal. The controller refuses a binary whose checksum does not match the pin. CT for the card: precondition rows render with their fixes, the URL and copy button appear on `up`, the "link changed" notice appears on a second `up` with a new URL, no copy assertion.
- Leg D. `tests/tooling/container-security-config.int.test.ts`: the overlay resolves, publishes no port and sets the metrics flag; a unit for the `/quicktunnel` reader tolerates the sidecar not answering yet.
- Leg J. `tests/server/transport/cross-tenant-sweep.suite.int.test.ts` rows; the mint-and-redeem verb refuses a used or revoked token, an invite without `allowSignup`, an invite with no expiry or no `maxUses`, a targeted invite, an owner handle and an `OWNER_HANDLES` name; two concurrent mints on the last use yield one user and one refusal (red: no verb); the route refuses without the CSRF header and throttles by address and by handle before hashing; control: a signed-in member redeems as today. Client: a signed-out visit to `/?join=<token>` returns to it after the sign-in (red: `goHome` lands on `/`).
- Docs: `pnpm check:docs`, `pnpm check:agents`, `pnpm check:structure`.
