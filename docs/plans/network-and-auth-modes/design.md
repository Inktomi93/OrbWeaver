---
kind: plan
status: active
updated: 2026-09-24
---

# Network and auth modes on a stranger box

## Goal

Every `AUTH_MODE` works end to end on bare metal and in docker, on loopback, on a LAN over plain http, and on the public internet behind a proxy or tunnel, with the fewest knobs. Boot refuses only an exposure that hands an unauthenticated or owner-equivalent surface to a peer off the box; every other exposure gets one clear boot warning that names its fix.

## Shape

Not yet built. The rules in section 3, each with one home, replace the launch-time cookie knob and the secret knobs, and close the same-host relay hole. Sections 1 to 9 are the design; the required plan sections follow.

### 1. Premises re-derived against the tree

| Premise | Verdict | Evidence |
| - | - | - |
| Prod binds every interface; non-prod binds loopback and refuses an explicit public bind without `ALLOW_DEV_PUBLIC_BIND` | holds | `packages/server/src/foundation/env/bind.ts:113-141` |
| The owner fallback admits a loopback TCP peer only, in every mode, plus the opt-in `AUTH_FALLBACK_TRUSTED_PEERS` ranges | holds | `packages/server/src/infra/auth/dispatch.ts:70-75`, `packages/server/src/infra/auth/index.ts:67` |
| A forwarding header refuses the widened ranges but never the loopback peer | holds, and it is the hole | `packages/server/src/infra/auth/index.ts:33-35`, `packages/server/src/infra/auth/forwarded.ts:20-24` |
| The dev vite proxy sets `X-Forwarded-For`, so a loopback relay guard would log the dev owner out | refuted | `packages/client/vite.config.ts:640-652` sets only `target` and `changeOrigin`; http-proxy adds `x-forwarded-*` only under `xfwd` (installed vite 8.1.2 `dist/node/chunks/node.js:17614`, `if (!options.xfwd) return;`), and no `xfwd` exists in the repo |
| The session cookie is `__Host-` + `Secure` unless `SESSION_COOKIE_INSECURE=true`, decided once at boot | holds | the deleted foundation/env session-cookie module, `packages/server/src/infra/auth/modes/cookie-session.ts:60-67` |
| The app never terminates TLS, so the only https signal is a proxy header | holds | `packages/server/src/entry/lifecycle.ts:747` is plain `serve`; no `node:https` import under `packages/server/src/entry/` |
| `SESSION_SECRET` is boot-fatal when unset under `local` and `oidc`; docker generates it, bare metal does not | holds | `packages/server/src/foundation/env/index.ts:225-234`, docker/entrypoint.sh lines 149-157, `tooling/src/stack/lib/start-plan.ts:88-99` generates nothing |
| `CREDENTIALS_KEY` is off unless `CREDENTIALS_KEY_AUTO=true`; docker sets it, bare metal does not | holds | `packages/server/src/infra/crypto/key.ts:98-107`, docker/orbweaver.env line 43 |
| The single-user first-run password claim and its login-screen flag are loopback-gated with no header check | holds, same hole | `packages/server/src/entry/lifecycle.ts:211-213`, `packages/server/src/entry/http/auth-routes.ts:606`, `packages/server/src/entry/http/auth-meta.ts:58` |
| The single-user public-bind warning fires only on `publicBind` | holds, so a prod single-user box with `BIND_HOST=127.0.0.1` behind a same-host proxy warns about nothing | `packages/server/src/entry/lifecycle.ts:734-739` |

The critical row, proven: a tunnel daemon or reverse proxy on the same host (cloudflared, `tailscale serve`, Caddy, nginx) connects to `127.0.0.1:8788`. `peerIp` is loopback. Under `AUTH_MODE=single-user`, `AUTH_FALLBACK` resolves to `owner` (`packages/server/src/foundation/env/index.ts:263-268`), `ownerFallbackAllowed` returns true on the loopback range (`packages/server/src/infra/auth/dispatch.ts:74`), and `admissiblePeerRanges` only narrows the widened ranges (`packages/server/src/infra/auth/index.ts:33-35`). Nothing reads `X-Forwarded-For`, `Forwarded`, `X-Real-IP` or `CF-Connecting-IP` on that path. Every internet visitor is the owner, and the boot log says nothing because `publicBind` is false. The prod SSO refusal (`packages/server/src/foundation/env/index.ts:618-624`) covers `local`, `oidc` and `forward-header` only. Today orbweaver does not distinguish a local browser from a proxied request on loopback. `IP_ALLOWLIST` cannot help: `isIngressAllowed` admits every private and loopback client (`packages/server/src/infra/network/ingress.ts:62-64`).

### 2. What the field does

| App | Setting | Default | Off-box without auth | Same-host relay | Cookie on plain http | Secrets |
| - | - | - | - | - | - | - |
| SillyTavern | `listen` | `false` (loopback only) | with `listen: true` and neither `whitelistMode`, `basicAuthMode` nor `enableUserAccounts`: refuse, `process.exit(1)`; `securityOverride: true` turns the refusal into a red warning | `whitelistMode: true` + `enableForwardedWhitelist: true` (defaults) check the socket peer AND the forwarded client; a public forwarded client behind a loopback proxy gets 403 | no `Secure` cookie by default; `ssl.enabled` is off | cookie secret generated into the data root on first run |
| SillyTavern sources | | `default/config.yaml` lines 6, 60-68, 70, 107, 182; `sso.trustedProxies` lines 136-140 | `src/users.js` `logSecurityAlert` lines 137-146 and `verifySecuritySettings` lines 152-190 | `src/middleware/whitelist.js` lines 71-100; `src/express-common.js` `getRealOrForwardedIp` lines 38-61 reads `x-real-ip`, `cf-connecting-ip` (off by default), `x-forwarded-for` | | `src/users.js` `getCookieSecret` lines 577-597 |
| Marinara Engine | `HOST`, `BASIC_AUTH_USER`/`PASS`, `IP_ALLOWLIST`, `ALLOW_UNAUTHENTICATED_PRIVATE_NETWORK`, `ALLOW_UNAUTHENTICATED_REMOTE`, `REQUIRE_AUTH_FOR_DOCKER_PROXY` | loopback, tailnet and same-host docker peers trusted; everyone else 403 until Basic Auth or an allowlist exists | never refuses boot; the request is refused with a setup page that prints the client IP and the `.env` lines | a docker peer carrying `forwarded`, `x-forwarded-for`, `x-real-ip`, `x-forwarded-host` or `x-forwarded-proto` loses its trust unless `REQUIRE_AUTH_FOR_DOCKER_PROXY=false` | Basic Auth, no session cookie; built-in TLS via `SSL_CERT`/`SSL_KEY` | not applicable |
| Marinara sources | in the Marinara repo: server middleware basic-auth.ts lines 1-46 and 318-372; server middleware ip-allowlist.ts lines 481-544; docs/REMOTE_ACCESS.md | | | | | |
| Open WebUI | `WEBUI_SESSION_COOKIE_SECURE`, `WEBUI_AUTH_COOKIE_SECURE` | `false`: a non-Secure cookie everywhere | first sign-up becomes admin, atomically after the insert; sign-up then closes | none | non-Secure by default, a knob to turn `Secure` on | `WEBUI_SECRET_KEY` |
| Open WebUI sources | `backend/open_webui/env.py` lines 769-778; `backend/open_webui/routers/auths.py` lines 858-879 | | | | | |

Tunnel facts, from the vendor sources: cloudflared sends `CF-Connecting-IP`, `X-Forwarded-For` and `X-Forwarded-Proto` to the origin (Cloudflare HTTP headers reference, "CF-Connecting-IP", "X-Forwarded-For", "X-Forwarded-Proto"). `tailscale serve` sets `X-Forwarded-Host`, `X-Forwarded-Proto: https` on a TLS listener and `X-Forwarded-For`, strips any incoming `Tailscale-User-*` header and sets `Tailscale-User-Login`/`-Name` for tailnet users; Funnel traffic gets `Tailscale-Funnel-Request: ?1` and no identity headers (tailscale `ipn/ipnlocal/serve.go` `addProxyForwardedHeaders` and `addTailscaleIdentityHeaders`). SillyTavern's own tunneling guide documents Cloudflare Zero Trust, a standalone cloudflared or ngrok tunnel, and Tailscale, and ships no compose sidecar.

### 3. The rules

**Rule A, bind by mode (the `listen` analog).** `resolveBindPosture` will take `authMode`. Under `single-user` an unset `BIND_HOST` will resolve to loopback in every `NODE_ENV`, including production. An explicit non-loopback `BIND_HOST`, or `ALLOW_DEV_PUBLIC_BIND=true`, under `single-user` will be a parse refusal unless `AUTH_FALLBACK_TRUSTED_PEERS` is set. The message: "AUTH_MODE=single-user serves this machine only. To let other devices sign in set AUTH_MODE=local (a session secret is generated for you). In a container keep the port published on loopback and the shipped AUTH_FALLBACK_TRUSTED_PEERS." The other modes keep today's posture: production every interface, non-production loopback with the dev hatch. No new override knob: `AUTH_FALLBACK_TRUSTED_PEERS` already is the SillyTavern `securityOverride` shape (launch-only, refused in `.env`, warned every boot, `packages/server/src/foundation/env/fallback-peers.ts:79-93`), it is what docker needs, and a bare-metal operator who wants "everyone on my LAN is the owner" can set it to their LAN range and read the warning. A LAN kiosk with one shared owner defeats the multi-human feature, so it earns no easier door.

Docker, resolved: the shipped default stays `single-user` with `AUTH_FALLBACK_TRUSTED_PEERS` naming the bridge ranges and the port published on `127.0.0.1` (docker/orbweaver.env lines 22-24, docker-compose.yaml line 51). The browser arrives from the bridge gateway, never loopback, so the widened set is that mode's only working credential in a container. Rule A needs one coupled change or the quick start dies: inside the container `BIND_HOST` is unset and would now resolve to loopback, so docker-compose.yaml will set `BIND_HOST: 0.0.0.0` in `environment:` beside `ORB_BIND` (a container-shape fact, not a user knob). The refusal then passes because the widened set is declared. The host-network overlay already sets `BIND_HOST` to `ORB_BIND` (docker/compose.host-network.yaml line 24); it will also reset `AUTH_FALLBACK_TRUSTED_PEERS` to empty so the app-side refusal covers `ORB_BIND=0.0.0.0` there, not only the entrypoint check (docker/entrypoint.sh lines 134-144), which stays.

**Rule B, a relayed request is never the operator.** `hasForwardingHeader` will refuse the owner fallback on every peer, loopback included, in every mode, and the header set will widen to `forwarded`, `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`, `x-forwarded-proto`, `x-forwarded-host`. The same predicate will gate the local first-run claim and the `localFirstRun` flag, which are the same owner-equivalent surface (a fresh local box behind a tunnel would otherwise offer its owner password to the internet). One rule for all modes is simpler than a single-user special case and costs nothing elsewhere: dev vite relays no forwarding header (section 1), the break-glass recovery is an on-box curl with the proxy stopped (`packages/server/src/foundation/env/index.ts:639-662`), and e2e drives loopback directly. Residual, stated plainly: a proxy that sends no forwarding header at all (bare nginx `proxy_pass` with no `proxy_set_header`) is invisible. Rule A removes the direct-LAN case and the boot disclaimer says "never put a proxy or tunnel in front of single-user"; cloudflared, `tailscale serve` and Caddy all send `X-Forwarded-For` by default, so the common accident is caught. The closed header set is a `Host` read away from catching the rest, and the spine forbids `Host` as a trust input; a deny-only `Host` read is sound (a forged loopback `Host` can only deny yourself) but nginx rewrites `Host` to the upstream by default, so it buys little. Not proposed.

**Rule C, cookie transport per request.** A pure resolver in a new `transport.ts` beside `packages/server/src/infra/auth/forwarded.ts` will answer `https` iff every value of `X-Forwarded-Proto` is `https` and the socket peer is a trusted proxy, else `http`. The trusted-proxy predicate is the one `resolveClientIp` already uses for `X-Forwarded-For` (`packages/server/src/infra/network/ingress.ts:35`): loopback or private peer, or `FORWARD_AUTH_TRUSTED_PROXIES`. It moves to one exported name in `packages/server/src/infra/network/ingress.ts` so the two reads cannot drift. The mint writes `__Host-orb_session` with `Secure` on https and `orb_session_insecure` without it on http; both names and attribute strings exist today (`packages/server/src/infra/auth/modes/cookie-session.ts:53-56`). The read is transport-keyed: an https request reads only the `__Host-` name, an http request only the insecure name; logout clears both as it does now. `SESSION_COOKIE_NAME` stops being a module constant and becomes `sessionCookieFor(transport)`.

Soundness. A browser cannot attach `X-Forwarded-Proto` to another user's request (a custom header needs a preflight, and the app mounts no CORS), so a victim's login carries only what the proxy wrote. A public peer's header is ignored by the predicate. A private or loopback peer that forges `https` on its own plain-http request receives a `Secure` cookie its own browser drops: self-denial only. A forged `http` value appended behind the proxy's `https` fails the every-value rule and downgrades only the forger's own session. An https deployment whose proxy sets `X-Forwarded-Proto` (Caddy, nginx `proxy_set_header`, Traefik, cloudflared, `tailscale serve` all do) is byte-identical to today. The one operator-side failure is a proxy that sends no `X-Forwarded-Proto`: the box then mints non-Secure cookies over https, which work but can leak if the same host also answers plain http. Boot cannot see this; the login-screen notice (Rule E) shows "plain http" on an https page, which is the tell. `deriveRedirectUri` reads the first `X-Forwarded-Proto` value (`packages/server/src/entry/http/auth-routes.ts:704`); it will read the same helper so the OIDC callback scheme and the cookie transport agree.

`SESSION_COOKIE_INSECURE` is deleted. The recorded ruling in the deleted foundation/env session-cookie module ("never auto-detected, not from `X-Forwarded-Proto`") is the ruling this rule reverses, on the owner's stated direction; the soundness paragraph above is the evidence that the reason behind it (a forged header asking for a cleartext cookie) does not reach a victim. The ruling that the knob carries no parse-time refusal survives unchanged: plain http is a warning, never a refusal.

**Rule D, secrets default on.** `resolveCredentialsKey` has no `CREDENTIALS_KEY_AUTO` branch: explicit `CREDENTIALS_KEY` wins, else the `credentials_key` keyfile under the data layout's `secrets/` dir (`packages/server/src/infra/crypto/key.ts`). A sibling `resolveSessionSecret` in the same file does the same for `SESSION_SECRET` with the `session_secret` keyfile (64 hex chars, mode 0600, `loadOrCreateKeyfile` reused), returning null only for a remote db URL or a filesystem fault; a keyfile that does not exist yet is generated after the db opens only when no row depends on it (`docs/adr/0253-data-dir-layout.md`). `SESSION_SECRET` leaves `AUTH_MODE_REQUIRED_ENV` for `local` and `oidc`; `lifecycle` resolves the secret once and throws before the listener binds when a cookie mode has none: "AUTH_MODE=local needs a session secret and none could be generated under <dir>; set SESSION_SECRET." The generated value never enters `process.env`, so the agent-sdk credential firewall needs no new row. Docker generates the same `secrets/session_secret` in the entrypoint: it exports an explicit value, which wins, so no existing container rotates its pepper (a rotation invalidates every local password, `docs/law/Tier-3-Infra.md` section "password.ts"). Both keyfiles are the backup unit with the db; `.gitignore` names them.

**Rule E, plain http from the internet.** The server can see this per request, not at boot: the resolved client address (`clientIp`, XFF-aware) is outside `DEFAULT_TRUSTED_RANGES` (`packages/server/src/infra/network/ip-ranges.ts:175-192`) and the transport is `http`. A router port-forward produces exactly that (the router rewrites the destination, the source stays the visitor's public address). Boot cannot detect a port-forward; say so in the disclaimer. Recommended: warn, not refuse. The login and first-run mints log one `security:true` line per client address per hour ("a password and session cookie were sent in clear from the public internet; put TLS or a tunnel in front") and `/api/auth/config` reports `transport` and `clientScope` so the login screen shows a red notice. The owner ruled warn (section 9). Refusing the mint is the stronger answer, but the recorded ruling in the deleted foundation/env session-cookie module ("I'm not going to limit their network choice, but the console will nag") points at warn, and SillyTavern and Marinara warn too.

**Rule F, one disclaimer block.** Section 6.

### 4. The matrix

Columns: what works today, what will happen, the rule. "Owner" means the un-credentialed owner fallback.

| Mode | Loopback | LAN, plain http | LAN or public https behind a proxy | Docker (bridge, port on 127.0.0.1) | Public: router port-forward | Public: cloudflared on the host | Public: Tailscale direct / Serve / Funnel |
| - | - | - | - | - | - | - | - |
| single-user | today: owner. Will: owner, unless the request carries a forwarding header (B) | today: prod every interface, 401 for every LAN peer. Will: loopback bind (A), LAN cannot connect; message names `AUTH_MODE=local` | today: EVERY visitor is the owner, no warning. Will: 401 (B) and the disclaimer says never to front single-user | today: owner via the bridge ranges. Will: same; compose sets `BIND_HOST=0.0.0.0` (A) | today: 401 for all. Will: loopback bind, nothing to forward | today: every visitor is the owner. Will: 401 (B) | today: direct 401, Serve and Funnel every visitor owner. Will: 401 everywhere (B) |
| local | first-run screen on loopback, cookie kept on `localhost`. Will: same; first-run refused on a relayed request (B) | today: sign-in silently fails (Secure cookie) unless `SESSION_COOKIE_INSECURE=true`; bare metal boot-fatal without a hand-made `SESSION_SECRET`. Will: secret generated (D), non-Secure cookie (C), one boot warning and a login notice (F, E) | today: works when the proxy sends `X-Forwarded-Proto`. Will: identical (C) | today: works; entrypoint prints the first password. Will: identical | today: works with the cleartext knob. Will: works; red login notice and a security log line (E) | today: works. Will: works; cloudflared sends `X-Forwarded-Proto: https`, Secure cookie (C). Cloudflare Access is a login in front of the login | direct: plain http inside WireGuard, non-Secure cookie, LAN-class warning. Serve: https, Secure cookie. Funnel: same as Serve |
| oidc | callback needs `OIDC_REDIRECT_URIS`; bare metal needs a hand-made secret. Will: secret generated (D) | today: `/api/auth/oidc/login` answers 400 without a proxy asserting `http`, and most IdPs refuse an http redirect. Will: unchanged; the warning names it | today: works. Will: identical | today: works with the generated secret. Will: identical | as local; the IdP redirect over plain http is the real block | works; Secure cookie | Serve and Funnel work; direct tailnet http hits the redirect block |
| forward-header | unsigned path needs `FORWARD_AUTH_TRUSTED_PROXIES`; no cookie minted. Will: same | a LAN peer is not a trusted proxy; rejected. Will: same | works (the owner's deployment). Will: identical; the owner fallback is `deny`, so B is inert | works with a `/32` proxy peer. Will: identical | not a meaningful shape (no proxy) | Cloudflare Access sets `Cf-Access-Jwt-Assertion`; the signed path reads only the authentik headers, so this is a future recipe, not this program | Serve: `FORWARD_AUTH_TRUSTED_PROXIES=127.0.0.1/32` + `FORWARD_AUTH_USER_HEADER=Tailscale-User-Login` works today over https with tailnet identity, because Serve strips incoming identity headers; Funnel carries none, so 401 |

Dev stack and e2e: `AUTH_MODE=single-user`, `NODE_ENV=development`, loopback bind, vite relays without forwarding headers; every rule leaves them as they are (`tooling/src/stack/stack.sh:323-338`, `tests/e2e/support/modes.ts:222-223`). The owner's deployment (production, https behind a proxy, `forward-header` or `oidc`, explicit `SESSION_SECRET`): A is single-user only, B is inert under `deny`, C is identical while the proxy sends `X-Forwarded-Proto: https`, D keeps an explicit secret. The one thing to verify before landing C is that the owner's proxy sends that header.

### 5. Refuse, warn or silent

| Case | Verdict | Why | Home |
| - | - | - | - |
| single-user + explicit non-loopback bind or the dev hatch, no `AUTH_FALLBACK_TRUSTED_PEERS` | refuse at parse | an owner-equivalent surface listening off-box | `packages/server/src/foundation/env/bind.ts` |
| single-user + `AUTH_FALLBACK_TRUSTED_PEERS` + non-loopback bind | boot, standing warning | the operator declared the peer set; the warning already names the hazard | `packages/server/src/foundation/env/fallback-peers.ts` |
| single-user + `AUTH_FALLBACK=deny` | refuse (unchanged) | a box that serves nobody | `packages/server/src/foundation/env/index.ts:574-581` |
| prod + SSO mode + explicit `AUTH_FALLBACK=owner`, no break-glass | refuse (unchanged) | same-host proxy makes everyone the owner | `packages/server/src/foundation/env/index.ts:618-624` |
| forward-header unsigned path with no `FORWARD_AUTH_TRUSTED_PROXIES` | request refused, boot warning (unchanged) | headers from any peer would be identity | `packages/server/src/infra/auth/modes/forward-header.ts:131-138` |
| `local` or `oidc` and no session secret after generation fails | refuse at boot, before the bind | a cookie mode without a pepper cannot authenticate anyone safely | `packages/server/src/entry/lifecycle.ts` |
| oidc without the `OIDC_*` set | refuse at parse (unchanged) | a half-configured SSO deploy must not degrade | `packages/server/src/foundation/env/index.ts:225-234` |
| a loopback peer carrying a forwarding header asks for the owner fallback or the first-run claim | request refused (401 / 403), one security log line | a relayed request is a stranger; this is the tunnel hole | `packages/server/src/infra/auth/index.ts`, `packages/server/src/entry/http/auth-routes.ts` |
| any cookie mode over plain http on a private network | warn once at boot, notice on the login screen | the cookie travels in clear on a network the operator owns | `packages/server/src/entry/lifecycle.ts`, login surface |
| a cookie mint over plain http from a public client | warn per client address, red login notice | the credential crosses the internet in clear; the owner ruled warn | `packages/server/src/entry/http/auth-routes.ts` |
| `AUTH_BREAK_GLASS` live | warn every boot (unchanged) | recovery flag left on | `packages/server/src/entry/lifecycle.ts:600-604` |
| non-production public bind with the dev hatch, any mode but single-user | warn (unchanged) | dev diagnostics off-box | `packages/server/src/foundation/env/bind.ts:147-156` |
| diagnostics recorders on | warn per exposure (unchanged) | prompts and transcripts behind a door | `packages/server/src/foundation/env/diagnostics.ts` |
| a cookie mode over https behind a proxy | silent | the intended shape | |
| single-user on loopback with no forwarding header | silent | the intended shape | |

### 6. The boot disclaimer

One block, logged after the bind notice and before the listener binds, replacing the scattered lines at `packages/server/src/entry/lifecycle.ts:705-739`. It names, in order: the mode and who signs in; the listen address and who can reach it; who is the owner without a credential (loopback only, or the declared ranges); the cookie transport rule (Secure over https, cleartext over plain http, and that a LAN device therefore keeps a cleartext cookie); the secrets in use and where the generated files live; then one `security:true` warning line per standing exposure from section 5, each ending with the knob or config change that removes it. There is no acknowledge or silence switch: a warning is silenced by fixing its cause, and the block is short on a healthy box. The single-user block ends with "never put a reverse proxy or tunnel in front of this mode". The public-http case is not in the boot block; boot cannot see a port-forward. The text is composed from the posture warning lists that already exist (`bindPostureWarnings`, `ownerFallbackPeerWarnings`, `diagnosticsPostureWarnings`) plus the new transport line; no test asserts the copy.

### 7. Owner decision: a UI toggle or an env var

"Let others on my network sign in" means single-user to local. Owner decision, marked as such.

Option 1, env var (today's shape): the operator sets `AUTH_MODE=local` and restarts. Cost: shell access and a restart; a phone user cannot do it. Everything else is already true: `env` is parsed once and frozen (`docs/law/Tier-2-Foundation.md` section on `env/`), the mode picks the resolver per request, the login routes register at boot (`packages/server/src/entry/lifecycle.ts:587-606`), and `multiHumanCapable` derives from the mode.

Option 2, an admin toggle at runtime: needs a mutable auth-mode setting with the same precedence as env, both route families registered at boot, a re-listen from loopback to every interface (Rule A) or a runtime bind change, the owner's first-run password claim on the switch, and an amendment to the env-freeze law and the Tier-2 ownership of the auth keys. Rule D makes it possible (a secret always exists). Cost: a cross-tier change to the one boot invariant every security rule keys on, for a switch the operator flips once.

Option 3, a UI panel that shows the current sharing posture and the exact `.env` line, and a "Copy" button. No write path. The settings page already reads the auth config (`packages/client/src/features/user-admin/lib/system-config-sections.tsx`).

Owner ruling: option 3 now, option 1 stays the mechanism. Option 2 waits for a second reason to make the auth mode mutable.

### 8. Env var ledger

| Var | Verdict | Note |
| - | - | - |
| `PORT` | keep | |
| `BIND_HOST` | keep; default derived by mode | single-user: loopback everywhere. Others: unchanged |
| `ALLOW_DEV_PUBLIC_BIND` | keep | dev-build guard, a different axis; refused under single-user without a peer set |
| `NODE_ENV` | keep | still the prod SSO discriminator |
| `AUTH_MODE` | keep | |
| `AUTH_FALLBACK` | keep (owner ruling) | already derived per mode; an explicit value only restates or is refused. Deleting it and folding `owner` into `AUTH_BREAK_GLASS` removes a knob but reverses the launch-only ruling and touches the entrypoint, the host-network overlay, `pnpm start` and the `.env` refusal table |
| `AUTH_BREAK_GLASS` | keep | |
| `AUTH_FALLBACK_TRUSTED_PEERS` | keep | the container's declared perimeter and the only override door |
| `FORWARD_AUTH_TRUSTED_PROXIES` | keep | now also the trusted-proxy predicate for `X-Forwarded-Proto`; the name understates it, a rename is churn |
| `FORWARD_AUTH_*` (headers, JWT, JWKS) | keep | |
| `IP_ALLOWLIST` | keep | |
| `TRUSTED_PRIVATE_RANGES`, `EGRESS_*` | keep | egress, out of scope |
| `SESSION_SECRET` | keep | explicit wins; generated when unset |
| `SESSION_COOKIE_INSECURE` | delete | replaced by Rule C; zod strips the unknown key, so an old `.env` line is inert and the boot block states the transport rule |
| `CREDENTIALS_KEY` | keep | explicit wins |
| `CREDENTIALS_KEY_AUTO` | delete | always on; a remote db still degrades to a disabled box |
| `LOCAL_INITIAL_PASSWORD` | keep | the docker and headless path |
| `OIDC_*`, `OWNER_*`, `DEFAULT_USER_HANDLE`, `DEBUG_TOKEN` | keep | |
| `ORB_BIND`, `ORB_PORT` (compose) | keep | |

Migration for existing deployments. Docker single-user: compose gains `BIND_HOST: 0.0.0.0`; nothing else changes. Docker local or oidc: the entrypoint's generated secret is exported, so the pepper is unchanged; `CREDENTIALS_KEY_AUTO=true` in the tracked env becomes inert and is removed. Bare-metal local with `SESSION_COOKIE_INSECURE=true`: the line becomes inert; the cookie name on plain http stays `orb_session_insecure`, so live sessions survive. Bare-metal local with an explicit `SESSION_SECRET`: unchanged. The owner's box: explicit secret, SSO mode, https proxy: unchanged, provided the proxy sends `X-Forwarded-Proto`.

### 9. Build legs, ordered

Each lands alone with its own floor.

- Leg A, secrets: `resolveCredentialsKey` without the knob, `resolveSessionSecret`, `AUTH_MODE_REQUIRED_ENV` without `SESSION_SECRET`, the lifecycle refusal, `.gitignore`, the Tier-2 and Tier-3 law edits. Closes bare-metal `pnpm start` for keys and `AUTH_MODE=local`.
- Leg B, the relay guard: the widened header set, the loopback refusal in `resolve`, the first-run and `localFirstRun` gates take headers. Closes the tunnel hole.
- Leg C, bind by mode: `resolveBindPosture` with `authMode`, the refusal, compose `BIND_HOST`, the host-network reset. Coordinate the docker files with lane cb-knobs.
- Leg D, per-request cookie transport: the transport resolver, the shared trusted-proxy predicate, `sessionCookieFor`, the seam and route and app-middleware readers, `deriveRedirectUri`, the `/api/auth/config` fields, the login notice, deletion of `SESSION_COOKIE_INSECURE`, the public-http log line.
- Leg E, the disclaimer block and the sharing panel (option 3).
- Leg F, docs and the tunnel recipes: README run-it and LAN sections, docker README, `.env.example`, a cloudflared sidecar overlay under docker/ (the `cloudflare/cloudflared` image on the project network, `tunnel run` with the operator's own token, the public hostname mapped to the service in the operator's Cloudflare dashboard, `AUTH_MODE=local` or `oidc` required and single-user answering 401 by construction), and a `tailscale serve` recipe including the forward-header identity variant. Worth shipping: the overlay is a short file, the proxy-joins-the-network stanza already exists (docker-compose.yaml lines 75-88), and it is the path most users will take instead of a port-forward. Coordinate with lanes cb-firstrun and cb-knobs.

Owner forks, every default accepted: (1) keep `AUTH_FALLBACK`; (2) warn, not refuse, a cookie mint over plain http from a public client; (3) option 3 for the sharing UI; (4) reverse the ruling in Rule C; (5) `x-forwarded-proto` and `x-forwarded-host` are relay tells.

## Rejected

- A `PUBLIC_DEPLOYMENT` or "behind a proxy" flag as the discriminator for any rule: the recorded ruling keeps `NODE_ENV`; a second flag is a source of disagreement.
- Gating the owner fallback on `Host`, even deny-only: the spine names `Host` a non-fact; nginx rewrites it to the upstream, so it catches little the forwarding headers do not.
- A launch-time `SESSION_COOKIE_SECURE=always` pin beside Rule C: the proxy contract (send `X-Forwarded-Proto`) is already documented and is the control; a pin is a second knob for a misconfigured proxy.
- Reading one cookie name on both transports: an insecure-name cookie planted by a plain-http sibling origin would then authenticate an https session (fixation); the transport-keyed read keeps the `__Host-` guarantee.
- An `ALLOW_UNAUTHENTICATED_PRIVATE_NETWORK` knob (Marinara's shape): `AUTH_FALLBACK_TRUSTED_PEERS` with a LAN CIDR is that knob, already warned and launch-only.
- Refusing boot on the tunnel case: boot cannot see the tunnel; the request can, so the refusal lives there.
- A runtime auth-mode switch (section 7, option 2): a cross-tier change for a one-time flip.
- Generating the session secret in `foundation/env`: the tier is the pure `process.env` reader and owns no I/O; the credentials keyfile precedent lives in `infra/crypto`.
- Moving the entrypoint's secret generation into the app only: existing containers would rotate their pepper and lose every local password.

## Coupled sites

- `packages/server/src/foundation/env/index.ts`: `AUTH_MODE_REQUIRED_ENV`, the bind refinement gains the mode, `SESSION_COOKIE_INSECURE` and `CREDENTIALS_KEY_AUTO` removed, `sessionCookiePostureInput` removed.
- `packages/server/src/foundation/env/bind.ts`: `authMode` input, the single-user default and refusal.
- The foundation/env session-cookie module: deleted; the transport rule moves to infra.
- `packages/server/src/infra/crypto/key.ts` and `packages/server/src/infra/crypto/index.ts`: `sessionSecretFromEnv`, the knob branch removed.
- `packages/server/src/infra/auth/forwarded.ts`, `packages/server/src/infra/auth/index.ts`, `packages/server/src/infra/auth/dispatch.ts`: the header set and the loopback refusal.
- `packages/server/src/infra/auth/modes/cookie-session.ts`: `sessionCookieFor(transport)`; a new transport resolver beside it.
- `packages/server/src/infra/network/ingress.ts`: the exported trusted-proxy predicate.
- `packages/server/src/entry/auth/seam.ts`, `packages/server/src/entry/app.ts`, `packages/server/src/entry/http/auth-routes.ts`, `packages/server/src/entry/http/auth-meta.ts`: transport-keyed cookie read and write, the first-run gate with headers, `deriveRedirectUri`, the new config fields, the public-http log line.
- `packages/server/src/entry/lifecycle.ts`: the resolved session secret, the cookie-mode refusal, the disclaimer block, `buildLocalAuthDeps` with headers.
- `packages/contracts/src/identity/index.ts`: closed tuples for the transport and client-scope vocabularies.
- `packages/client/src/data/auth-config.ts`, `packages/client/src/features/auth/components/login-local-form.tsx`, `packages/client/src/features/user-admin/lib/system-config-sections.tsx`: the notice and the sharing panel.
- docker-compose.yaml, docker/orbweaver.env, docker/compose.host-network.yaml, docker/README.md, a new cloudflared overlay: `BIND_HOST`, the removed knobs, the recipes (lane cb-knobs owns the env and README rot).
- `.env.example`, README.md run-it (lane cb-firstrun), `.gitignore`.
- `docs/law/Tier-2-Foundation.md` (the `env/` paragraph, section 7.1, the superRefine clause), `docs/law/Tier-3-Infra.md` (the cookie-session line, `key.ts`, section 7.2, the ingress paragraph), `docs/law/Spine-Identity-and-Auth.md` section 3 (the cookie write side), `.claude/rules/server-edge.md` cookie rule.
- `tests/tooling/container-security-config.int.test.ts`: the `CREDENTIALS_KEY_AUTO` and `SESSION_COOKIE_INSECURE` assertions.
- `tooling/src/stack/lib/start-plan.ts`: the banner line that says other devices need https.

## Test plan

Red first against unmodified source; each names its planted control.

- Leg A. `resolveSessionSecret` on an empty data dir reports the `secrets/session_secret` keyfile absent, and the boot then writes it at mode 0600 and returns the same value on the second call (red: the symbol does not exist). Control: an explicit `SESSION_SECRET` returns unchanged and writes no file. A corrupt keyfile returns null and is not overwritten. Env parse: `AUTH_MODE=local` with no `SESSION_SECRET` boots (`tests/server/foundation/env/index.test.ts:183` and `:111` flip). Lifecycle: a cookie mode with a remote db URL and no secret throws before `serve`. Suites: `tests/server/foundation/env/`, `tests/server/infra/crypto/`, the lifecycle boot test.
- Leg B. `resolve` with a loopback peer and `X-Forwarded-For` returns identity null under single-user (red: `tests/server/infra/auth/index.test.ts:128` asserts the opposite today). Control: the same request without the header resolves `via:"fallback"`. Each new header name is a row; `cf-connecting-ip` alone refuses. The first-run route returns 403 for a loopback peer with `Forwarded`; `/api/auth/config.localFirstRun` is false for it; control: bare loopback claims once. Suites: `tests/server/infra/auth/`, `tests/server/entry/http/auth-routes.int.test.ts`, `tests/server/entry/debug-gate.suite.test.ts`, and the single-user e2e project as the dev-relay control.
- Leg C. `resolveBindPosture({ authMode: "single-user", nodeEnv: "production", bindHost: undefined })` resolves loopback (red: today every interface). `BIND_HOST=0.0.0.0` under single-user with no peer set is a parse refusal naming `AUTH_MODE=local`; with `AUTH_FALLBACK_TRUSTED_PEERS` it boots and warns. Control: `local` in production still binds every interface. Container test: compose carries `BIND_HOST: 0.0.0.0`; the host-network overlay resets the peer set. Suites: `tests/server/foundation/env/bind.test.ts`, `tests/server/foundation/env/index.test.ts`, `tests/tooling/container-security-config.int.test.ts`.
- Leg D. Transport resolver: `X-Forwarded-Proto: https` from a public peer is `http`; from a loopback peer `https`; `http, https` is `http`; no header is `http`. Mint: a login over `http` sets `orb_session_insecure` without `Secure`; over trusted `https` sets `__Host-orb_session` with `Secure` (red: today the name is fixed at boot). Read: an https request ignores a planted `orb_session_insecure`; control: the same cookie on an http request authenticates. The parity suite (`tests/server/entry/session-cookie-parity.suite.test.ts`) runs per transport. `deriveRedirectUri` and the transport agree on a crafted header. `/api/auth/config` reports `transport` and `clientScope` per request. CT: the login form shows the notice on `http` with a private scope and nothing on `https`; no copy assertion. Suites: `tests/server/infra/auth/`, `tests/server/entry/`, the auth CT files.
- Leg E. The boot block is one contiguous log group; a healthy loopback single-user boot emits no `security:true` line (control: the widened peer set emits one).
- Leg F. `pnpm check:docs`, `pnpm check:agents`, `pnpm check:structure`; the compose-shapes test resolves the new overlay.
