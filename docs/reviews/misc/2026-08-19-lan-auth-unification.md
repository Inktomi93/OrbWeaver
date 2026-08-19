---
kind: review
status: active
updated: 2026-08-19
---

# LAN auth unification — removing the local-origin owner bypass and making OIDC work off-localhost

**Findings-first, read-only.** No code, no env, no authentik config was changed. Issue #298 (P1, Review: Owner). Every claim below carries a `path:line` receipt or a live probe; §7 lists what I did NOT verify.

## TL;DR (outcome first)

1. **The bypass is `ownerFallbackAllowed` → `isLocalOrigin` (`packages/server/src/infra/auth/dispatch.ts:47,59`), and its credential is the CLIENT-SUPPLIED `Host` header.** Live-proven on this box: an un-credentialed `GET /api/auth/me` with `Host: 10.9.9.9` (an address that exists nowhere on this machine) returns `{"authenticated":true,"handle":"inktomi93@gmail.com","role":"owner"}`. It is not a LAN check — it is a string check on attacker-controlled input, and the LAN is merely who can currently reach the port.
2. **OIDC cannot work on a LAN IP today for FOUR independent reasons**, and only one of them is config. The other three are: the redirect-URI derivation hard-defaults `proto` to `https` (`entry/http/auth-routes.ts:537-538`), the session cookie is `__Host-` + `Secure` (`auth-routes.ts:46`) which no browser will store from an `http://192.168.x.x` origin, and authentik's registered redirect URI is a single strict `https://orbweaver.inktomi.tech/...` entry. **Registering more redirect URIs alone does NOT make LAN login work** — the cookie layer defeats it.
3. **The bypass is load-bearing for exactly one thing that matters and one that doesn't:** loopback dev tooling (snap, e2e, `multi-user-seed`, un-cookied `curl` harvests — all speak `127.0.0.1`) and the owner's LAN-IP browsing. Narrowing the gate to *loopback only* costs the second and keeps the first, intact and unmodified.
4. **Recommended arm: make the fallback gate on the unspoofable TCP PEER address instead of the `Host` header, and give the LAN a real HTTPS origin through the Caddy already running on the box.** One origin, one mode, one rule across all four `AUTH_MODE`s: *an origin is not a credential; a loopback peer socket is.* Migration order in §6, break-glass included.
5. **Secondary finding, MEDIUM, worth its own line:** the CSRF belt keys on `Principal.via === "cookie"` (`transport/trpc/trpc.ts:124`, `entry/http/upload.ts:78`, `import-tree.ts:99`, `import-chat.ts:140`), so the fallback arm is CSRF-EXEMPT. On a LAN-reachable port that turns any web page the owner visits into an owner-authenticated *multipart write* against `/api/upload/*` and `/api/import/*` (no preflight required). tRPC itself is safe (415 on `text/plain`, no CORS headers — probed live).

---

## 1. The bypass, precisely

### 1.1 Mechanism

| Step | Code | What it does |
| - | - | - |
| 1 | `infra/auth/index.ts:51` | `if (config.fallback === "owner" && ownerFallbackAllowed(headers, config))` — mint an un-credentialed `ResolvedIdentity` stamped `via:"fallback"` |
| 2 | `infra/auth/dispatch.ts:47-52` | `single-user` ⇒ `true` UNCONDITIONALLY; every other mode ⇒ `isLocalOrigin(headers, …)` |
| 3 | `infra/auth/dispatch.ts:59-77` | reads `headers.get("host")`, normalizes it, and returns `true` for `localhost`, any `TRUSTED_LOCAL_HOSTS` entry, or any host that parses as an IP inside `DEFAULT_TRUSTED_RANGES` |
| 4 | `infra/network/ip-ranges.ts:177-194` | that range set is `127/8`, `10/8`, `172.16/12`, `192.168/16`, `100.64/10` (Tailscale), `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`, `0.0.0.0/8`, plus 6to4/Teredo |
| 5 | `entry/auth/seam.ts:181-187` | the seam resolves `ownerHandles()[0]`, `ensureUser`s the row, and mints a full `Principal` from `users.role` (D135 — it ADMITS, the role is read, not stamped) |

The env knobs are `AUTH_FALLBACK` (`foundation/env/index.ts:379`, default `owner`), `TRUSTED_LOCAL_HOSTS` (`:382`) and `TRUSTED_PRIVATE_RANGES` (`:385`, which *widens* the built-in set).

### 1.2 What it grants, and to whom

A full owner `Principal`. That satisfies `principal !== null` on every gated surface — `authedProcedure` (all data tRPC), `/api/blob/:hash`, `/api/card-frame`, `/api/upload/*`, `/api/export/*`, `/api/import*` — and `can(p,'owner',…)`, which is the gate on `mintMaxProSub`, `admin.setRole`, credential CRUD and every `requireOwner` surface. The single exclusion is `/api/_debug/*`: `DEBUG_GATE_CREDENTIALED.fallback === false` (`entry/auth/seam.ts:293-301`, AUTHFIX-2) keeps the debug gate shut against it. Nothing else is excluded.

**To whom: anyone who can open a TCP connection to the app port and type a `Host:` header.** Not "anyone on the LAN" — the LAN is just today's reachable set. The header is not a fact about the network; it is a field the caller writes.

### 1.3 Live proof (this box, 2026-08-19, unauthenticated GETs on loopback, no credentials sent)

`GET /api/auth/config` → `{"mode":"oidc",…}` (note: `.env` sets `AUTH_MODE=oidc` and `foundation/env/index.ts:154-180` loads `.env` with **override:true**, so the dev stack's `export AUTH_MODE=single-user` — `scripts/dev/stack.sh:207` — LOSES; `/proc/<pid>/environ` and `pnpm stack`'s "env pins" line both report `single-user` while the process actually runs `oidc`. That is its own small trap: **the stack's reported AUTH\_MODE is not the effective one.**)

`GET /api/auth/me` with a spoofed `Host`, against the same loopback listener:

| `Host:` sent | Response |
| - | - |
| `127.0.0.1` | `{"authenticated":true,"handle":"inktomi93@gmail.com","role":"owner"}` |
| `192.168.1.27:8788` | owner |
| `10.9.9.9` (not an address on this box) | owner |
| `172.18.0.1` (docker bridge) | owner |
| `orbweaver.inktomi.tech` | `{"authenticated":false,…}` |
| `evil.example.com` | `{"authenticated":false,…}` |

The `10.9.9.9` row is the finding in one line: the gate is a string comparison against a header, not a property of the connection.

### 1.4 The threat, honestly rated

- **Today: LOW-in-practice, because the port is not reachable.** `ss -ltnp` shows `127.0.0.1:8788` (the dev `node --watch` process) and `127.0.0.1:5173`. The non-production bind posture (`foundation/env/bind.ts`) forces loopback, and `https://orbweaver.inktomi.tech/healthz` currently returns **502** — Caddy (in docker, targeting `host.docker.internal:8788`, `caddy/conf/Caddyfile:395`) cannot reach a loopback-bound app. So right now nothing off-box reaches it at all.
- **The moment the port is reachable — which is exactly what "make the LAN work" means — it is HIGH.** `pnpm stack up prod` sets `NODE_ENV=production`, where `resolveBindPosture` binds every interface by design (`bind.ts:110-118`). At that point every device on 192.168.1.0/24 (guest phones, IoT, a compromised laptop) is owner with a one-line `curl`, bypassing Caddy, CrowdSec, the edge rate limit and OIDC. The Caddyfile states this as intended behavior in its own comment (`Caddyfile:364-368`: *"AUTH\_FALLBACK=owner gives SSO on this domain AND owner on the raw LAN IP (which bypasses caddy)"*). This is the same hole prior reviews logged as F3/C13 (`docs/reviews/security/2026-08-09-pre-auth-attack-surface.md:126-148, 289-301`) — nothing has changed on the tree since.
- **`single-user` is worse than the LAN case and deserves its own sentence.** `ownerFallbackAllowed` returns `true` before the origin test in that mode (`dispatch.ts:48-50`; the unit test `tests/server/infra/auth/dispatch.test.ts:41` pins `host: "chat.example.com"` → `true`). A `single-user` process behind the public proxy is world-owner. The only thing standing between that and reality is "don't do that".

### 1.5 The CSRF corollary (MEDIUM, new here)

`transport/trpc/trpc.ts:124` gates CSRF on `ctx.auth.via === "cookie"`; the ingest routes repeat that shape (`upload.ts:78`, `import-tree.ts:99`, `import-chat.ts:140`). The rationale in the spine — "header/fallback auth is CSRF-immune by construction" — holds for the *header* arm (a proxy asserts it) and **fails for the fallback arm**, because the credential is `Host`, which the browser fills in automatically on a cross-origin request.

Exploit path, concrete: the owner (or anyone on the LAN) loads any web page; that page does `fetch("http://192.168.1.27:8788/api/upload/asset", {method:"POST", mode:"no-cors", body: someFormData})`. `multipart/form-data` is a CORS *simple request* — no preflight — so it executes; the response is unreadable but the write lands as the owner (`upload.ts:92-97` → `c.req.formData()`). Same for `/api/import/tree` and `/api/import/chat`.

Probed and NOT exploitable: tRPC mutations. `POST /api/trpc/x` with `Content-Type: text/plain` → **415** `UNSUPPORTED_MEDIA_TYPE`, and the app sends no `Access-Control-Allow-*` header (no CORS middleware anywhere in `packages/server/src`), so the JSON-content-type variant dies at the preflight. Partial browser mitigation for the multipart path: Chrome's Local/Private Network Access restrictions on public→private subresource requests — real, but version-dependent and not a control we own.

### 1.6 Removal blast radius (what breaks the instant it is deleted)

**If the whole fallback is deleted (`AUTH_FALLBACK=deny` everywhere):**

| Breaks | Why | Receipt |
| - | - | - |
| the entire dev loop | `snap`, `record`, `motion-audit` drive `http://localhost:5173` with no cookie; the vite proxy forwards to `127.0.0.1:8788` | `scripts/probes/_kit/browser.ts:15`, `packages/client/vite.config.ts:18,343-346` |
| un-cookied `curl` harvests | every `curl http://127.0.0.1:8788/api/trpc/...` in the probe scripts | `scripts/probes/sse-tap.ts:17-18`, `scripts/probes/trace-render.ts:8` |
| `multi-user-seed.ts` | explicitly documents the owner seam as its authentication | `scripts/dev/multi-user-seed.ts:9-10,100` |
| e2e/CT stacks | drive `localhost:5173` / `127.0.0.1:8788` un-cookied | `tests/e2e/support/target-guard.test.ts:13` |
| `single-user` mode itself | its ONLY credential is this fallback; `AUTH_MODE=single-user` + `AUTH_FALLBACK=deny` is already boot-fatal | `foundation/env/index.ts:498-503` |
| the owner's LAN-IP browsing | no OIDC path exists on that origin (§2) | live probe, §2.4 |
| local-mode first-run | `POST /api/auth/first-run` reuses `ownerFallbackAllowed` as its origin gate | `entry/lifecycle.ts:385-388` |

**If only the LAN arm is removed (narrow `isLocalOrigin` to loopback, or gate on peer IP):** the entire first six rows above keep working unchanged — every one of them speaks loopback, and the vite proxy sets `changeOrigin: true` so the backend sees `Host: 127.0.0.1:8788` regardless of how the browser reached vite. **The only casualty is the owner's LAN-IP browsing, which is precisely what §2/§3 replace.** The ST bridge (`172.18.0.1`) is a red herring: every `172.18.0.1` hit in this repo is SillyTavern's *outbound* connection config in imported ST settings (`reports/st-import-stage/**`), not an inbound caller of orbweaver.

**Non-obvious trap:** `changeOrigin: true` means a LAN-exposed *vite* (`vite --host`, or a future `ALLOW_DEV_PUBLIC_BIND` session) would launder every LAN request into a loopback-looking `Host` and re-open the bypass even after `isLocalOrigin` is narrowed. Only a peer-IP gate (§3f) closes that; a Host-based one cannot.

---

## 2. Why OIDC fails on a LAN IP today — mechanically

Four blockers, independent, in the order a request hits them.

### 2.1 The redirect-URI allowlist (config)

`deriveRedirectUri` (`entry/http/auth-routes.ts:536-546`) builds `${proto}://${host}/api/auth/oidc/callback` and returns it **only on exact-match** against `OIDC_REDIRECT_URIS`. `.env` carries exactly one entry: `https://orbweaver.inktomi.tech/api/auth/oidc/callback`. Off-allowlist ⇒ `null` ⇒ `400` with `oidc_redirect_uri_rejected` and no transaction minted (`auth-routes.ts:551-563`). The allowlist is already a CSV parsed into a list (`entry/lifecycle.ts:409-412`), so **multi-URI support exists app-side; nothing needs building for arm (a).**

### 2.2 The proto default (CODE, not config — the one people miss)

```
const rawProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
const proto = rawProto !== undefined && rawProto !== "" ? rawProto : "https";
```

`auth-routes.ts:537-538`. A direct `http://192.168.1.27:8788` request carries no `X-Forwarded-Proto`, so the candidate is `https://192.168.1.27:8788/api/auth/oidc/callback` — even if you add the `http://` spelling to `OIDC_REDIRECT_URIS`, it can never match. The comment calls this deliberate ("never downgraded on an unknown origin; a plain-HTTP deploy with no X-Forwarded-Proto 400s by design"), and it is correct security posture — it just means *a plain-http origin cannot do OIDC without a proxy that sets the header*.

### 2.3 The cookie layer (the actual wall)

`COOKIE_ATTRS = "Path=/; HttpOnly; Secure; SameSite=Lax"` on a `__Host-`-prefixed name (`auth-routes.ts:46`, `serializeSessionCookie` at `:161-164`). Per the cookie-prefix rules (MDN / RFC 6265bis §4.1.3): **`__Host-` cookies must be set with `Secure` from a secure (HTTPS) origin**, and *"insecure sites (`http:`) cannot set cookies with the `Secure` attribute; the `https:` requirement is ignored when `Secure` is set by localhost."*

Consequences, exactly:

- `http://localhost:8788`, `http://127.0.0.1:8788` — cookie IS stored (the localhost exemption). Local login would work if a redirect URI existed.
- `http://192.168.1.27:8788` — **the browser silently discards the `Set-Cookie`.** The callback would complete, the redirect to `/` would happen, and the user would land logged-out, forever, with no error. Registering the redirect URI and forcing `X-Forwarded-Proto: http` gets you a *login loop*, not a login.
- Any `https://` origin with a trusted cert — works.

**This is why arms (a) and (d) are insufficient on their own, and why the answer has to involve TLS on the LAN.**

`SameSite=Lax` is fine for the flow: the IdP's `302` back is a top-level GET navigation, which carries Lax cookies.

### 2.4 authentik's side

The provider is blueprint-managed: `authentik/blueprints/apps/orbweaver.yaml:34-36` — `redirect_uris: [{matching_mode: strict, url: https://orbweaver.inktomi.tech/api/auth/oidc/callback}]`, plus `logout_uri` on the same host (`:28`). authentik 2026.5.5 (`inktomi-stack/docker-compose.yaml:281`) supports a list of entries with per-entry `strict` or `regex` matching (authentik docs, "Redirect URIs"). Adding a second origin = one blueprint entry + re-apply. The issuer (`https://authentik.inktomi.tech/...`) is orthogonal to the app's own origin: `jwksAllowlistFromEnv` derives the JWKS host from `OIDC_ISSUER` (`infra/auth/config.ts:31-44`), so nothing about a new app hostname touches issuer validation.

### 2.5 Live confirmation

`GET /api/auth/oidc/login` with `Host: 192.168.1.27:8788` → `400 {"error":"This origin is not an allowed OIDC callback."}`. Same with `Host: 127.0.0.1:8788`. **There is no OIDC path on any origin except the public FQDN — which is why the bypass is currently the only way in from anywhere but the FQDN, and why removing it before §3 lands would strand the owner.**

---

## 3. The unification arms, costed

### (a) Register multiple redirect URIs (LAN IP + localhost) in authentik + `OIDC_REDIRECT_URIS`

- **Fixes:** §2.1 only.
- **Cost:** \~0 (env CSV already supported; one blueprint entry per origin).
- **Does NOT fix:** §2.2 (still needs `X-Forwarded-Proto`) or §2.3 (**the cookie is never stored on an http LAN origin**). Also brittle: a DHCP lease change invalidates the entry.
- **Verdict: necessary bookkeeping for whatever origin you settle on, never a solution by itself.**

### (b) A stable LAN hostname (mDNS `.local` or local DNS)

- **Fixes:** the DHCP brittleness of (a); gives `TRUSTED_LOCAL_HOSTS` something stable to name.
- **Cost:** there is **no DNS server in the stack** (service census of `inktomi-stack/docker-compose.yaml` — no pihole/adguard/blocky/technitium), so this is a router-side override or avahi/mDNS. `.local` is worse than it looks: public CAs will not issue for it, so it forces arm (c)'s local CA.
- **Does NOT fix:** §2.3 on its own — a hostname over plain http still cannot store a `__Host-` cookie.
- **Verdict: only useful as the *name* half of a TLS answer.**

### (c) LAN HTTPS via a local CA

- **Fixes:** §2.2 + §2.3 fully.
- **Cost:** generating a CA, distributing + trusting the root on every device (phones are the painful ones — iOS needs an explicit "trust this root" toggle in two places), rotation forever. Caddy can do it (`tls internal`) but the trust distribution is the cost.
- **Verdict: correct in principle, but strictly worse than (f) on this box, which already has a publicly-trusted wildcard.**

### (d) authentik regex / wildcard redirect entries

- **Fixes:** the "one entry per origin" bookkeeping.
- **Cost:** small.
- **Residual risk, stated honestly:** a redirect-URI regex is the classic OAuth open-redirect foot-gun. A pattern like `https://192\.168\.1\..*` hands token delivery to *any* host on the subnet; a sloppier one (`.*orbweaver.*`, an unescaped `.`) hands it to the internet. Our side re-validates against our own exact-match allowlist (`auth-routes.ts:545`), which contains the blast radius *for our app* — but the IdP-side entry is what an attacker registering a lookalike would exploit against any other client of the same provider. **Only use `strict` entries here.**
- **Verdict: reject regex; the exact-match list is 1-2 entries.**

### (e) forward-header mode (trusted reverse proxy terminates auth)

- **Fixes:** would let Caddy's `forward_auth` to authentik do the login, app-side auth becomes a header read.
- **Cost:** a real rework — a `forward_auth` block per origin, `FORWARD_AUTH_TRUSTED_PROXIES` bound to the Caddy peer, and it *loses* things the app currently owns: the app's own login surface, back-channel logout wiring (`OIDC_BACKCHANNEL_LOGOUT=true` today), the `/api/auth/logout` end-session URL, and `provisionIdentity`'s JIT/approval/collision policy would move behind proxy semantics.
- **Residual risk:** the unsigned header arm is only as strong as `FORWARD_AUTH_TRUSTED_PROXIES` matched against the raw peer IP (`infra/auth/contract.ts:68-70`) — i.e. it re-introduces "a network position is a credential", just with an unspoofable input this time.
- **Verdict: NOT the cleaner unification here.** The app is a first-class OIDC client already, and the Caddyfile's own comment (`:364-365`) says forward\_auth was deliberately declined for exactly this reason. Keep it as the emergency alternative, not the plan.

### (f) RECOMMENDED — one HTTPS origin through the existing Caddy + gate the fallback on the PEER address

Two halves; the second is the security fix and does not depend on the first.

**(f1) Give the LAN the same HTTPS origin the internet gets.** Caddy already listens on `0.0.0.0:443` on this host and holds a DNS-01 Cloudflare wildcard for `*.inktomi.tech`. Two spellings, pick one:

- *Same name:* have LAN devices resolve `orbweaver.inktomi.tech` to `192.168.1.27` (router DNS override). Zero new redirect URIs, zero new Caddy blocks, zero new authentik entries. The matrix collapses to ONE cell. (Hairpin NAT already works from this box — `curl https://orbweaver.inktomi.tech/healthz` from the host reached `135.131.170.16` and got Caddy's 502 — so even *without* an override, LAN devices likely already reach the FQDN; that should be tested per-device before choosing.)
- *Second name:* an A record `orb.inktomi.tech → 192.168.1.27` (a public record answering a private address — no exposure, DNS-01 needs no inbound reachability), covered by the existing wildcard cert, plus a Caddy site block cloned from `@orbweaver` and one `strict` blueprint entry + one `OIDC_REDIRECT_URIS` CSV element. Costs \~15 minutes and survives the WAN being down.

Either way: real TLS from a publicly-trusted CA, `Secure`/`__Host-` cookies work, `X-Forwarded-Proto: https` is set by Caddy so `deriveRedirectUri` produces the right candidate, and LAN traffic finally passes through CrowdSec + the edge rate limit like everything else.

**(f2) Make the fallback gate on the TCP peer, not on `Host`.** The seam already threads the raw socket peer address for the forward-header anti-spoof gate (`entry/app.ts:192-194` → `PerRequestSeamDeps.peerIp` → `ResolveDeps.peerIp`, `infra/auth/contract.ts:68-70`). Feed the same value into `ownerFallbackAllowed` and require it to be **loopback** (`127.0.0.0/8` / `::1`, via the existing `isInRanges`), ANDed with — or replacing — the `Host` test. Properties this buys:

- The credential stops being attacker-writable. A `Host:` header can no longer grant anything.
- Every proxied request (peer = the docker bridge address, `172.18.0.x`) is denied the fallback — so SSO becomes mandatory on the FQDN, on any new LAN hostname, and on anything else Caddy fronts, *without* the deny depending on a hostname string that someone might later add to `TRUSTED_LOCAL_HOSTS`.
- All loopback dev tooling is unaffected (§1.6), including the vite-proxy `changeOrigin` path — and unlike a Host-narrowing, it stays correct even if vite is later exposed on the LAN.
- It makes ONE rule for all four modes, which is the "unify the modes" half of the issue: `single-user`'s unconditional arm (`dispatch.ts:48-50`) becomes loopback-gated too, killing the world-owner-if-proxied shape in §1.4 by construction rather than by operator discipline.
- **Cost:** small and local — `ownerFallbackAllowed` takes the peer, `resolve` passes it, `AuthConfig` unchanged. The coupled sites are `infra/auth/{dispatch,index}.ts`, the seam's `isAdmin` (which passes no `peerIp` today and would therefore fail closed — already the desired answer, since `fallback` is not a debug credential), and the pinned suites `tests/server/infra/auth/dispatch.test.ts`, `tests/server/entry/debug-gate.suite.test.ts`, `tests/server/entry/auth/seam.test.ts`, plus `entry/lifecycle.ts:385-388`'s first-run origin gate (which should follow the same rule).
- **Residual risk:** anything running *on the box* as any local user can still reach loopback and be owner. That is the accepted floor for a single-owner homelab (and is unchanged from today); if it ever isn't, the fallback goes to `deny` and the owner logs in like everyone else.
- **Also fix while in there:** `AUTH_FALLBACK=deny` on the production process, and consider making `TRUSTED_PRIVATE_RANGES` stop widening the *auth-origin* gate (it legitimately widens the egress/SSRF belt at `infra/network/egress.ts:48` — the two uses should not share one knob).

---

## 4. The modes × origins matrix

Origins: **L** = `http://localhost` / `127.0.0.1` (loopback) · **LAN** = `http://192.168.1.27:8788` direct · **LANH** = an https LAN hostname through Caddy · **FQDN** = `https://orbweaver.inktomi.tech` through Caddy.

### 4.1 TODAY (derived from code; loopback rows live-probed on this box)

| Mode | L | LAN | LANH | FQDN |
| - | - | - | - | - |
| `single-user` | **owner, no credential** (unconditional arm) | **owner, no credential** | **owner, no credential** | **owner, no credential** — the whole internet, if proxied. `multiHumanCapable:false` (`entry/app.ts:154`) |
| `local` | owner via fallback (no login needed); password login also possible, cookie stores (localhost exemption) | **owner via fallback**; password login mints a cookie the browser DISCARDS (§2.3) ⇒ login-loop if the fallback were off | owner via fallback IF the hostname is in `TRUSTED_LOCAL_HOSTS`, else password login works | password login required; works |
| `oidc` (**live config**) | **owner via fallback** (live-proven); `/api/auth/oidc/login` → **400** | **owner via fallback** (live-proven by Host spoof); OIDC → **400** | owner via fallback if the name is trusted, else OIDC 400 unless the URI is registered | fallback DENIED ⇒ OIDC mandatory ⇒ works |
| `forward-header` | owner via fallback | owner via fallback | proxy-asserted identity; fallback also fires if the name is trusted | proxy-asserted identity (not deployed — no `forward_auth` on this vhost) |

### 4.2 TARGET under arm (f)

| Mode | L | LAN (direct port) | LANH | FQDN |
| - | - | - | - | - |
| `single-user` | owner via fallback (peer=loopback) — dev/single-box only | **denied** (peer not loopback) | **denied** | **denied** |
| `local` | owner via fallback; password login also available | port not exposed; if reached, **denied** | password login over TLS, cookie stores | password login over TLS |
| `oidc` (**the deployed mode**) | owner via fallback — this is the dev-tooling door, and the only one | **denied** | **OIDC, identical to FQDN** | OIDC |
| `forward-header` | owner via fallback | **denied** | proxy-asserted | proxy-asserted |

One rule, four modes: *the un-credentialed owner arm exists only for a loopback peer; every other origin authenticates.* The LAN and the internet become the same cell.

---

## 5. Recommendation

**Take arm (f): (f1) one HTTPS origin for the LAN through the Caddy that is already running, and (f2) re-gate the owner fallback on the loopback PEER address instead of the `Host` header.** (a) and (d)-as-`strict` are folded in as the bookkeeping (f1) needs; (b) is the DNS half of (f1); (c) and (e) are rejected, with reasons above.

Why this and not "just add redirect URIs": adding URIs cannot make a `__Host-`+`Secure` cookie exist on a plain-http origin (§2.3), so it produces a silent login loop rather than a login. And why (f2) rather than narrowing `isLocalOrigin` to `localhost`: a Host-string gate stays a client-writable credential, and the vite `changeOrigin` path (§1.6) proves it can be laundered back open by a change nobody would connect to auth.

### 5.1 Migration order (the owner is never locked out at any step)

1. **Stand up the HTTPS LAN origin first, with the bypass still in place.** Add the DNS answer (router override for the existing name, or the new A record), the Caddy site block if using a new name, the `OIDC_REDIRECT_URIS` CSV entry, and the `strict` blueprint entry. Nothing is removed in this step, so a mistake costs nothing.
2. **Prove a real OIDC login on that origin from a phone** — cookie stored, `/api/auth/me` shows the OIDC identity with `via` NOT `fallback`, a reload stays logged in, and `/api/auth/logout` still works (it needs the CSRF header — `auth-routes.ts:496`). Do not proceed on a `curl`-only result: the cookie layer is exactly what a `curl` will not tell you.
3. **Close the port.** Either the containerize move (`expose: 8788` on `inktomi-net` + `reverse_proxy orbweaver:8788` — the D4 recommendation in `docs/design/containerize-prod-image-spec.md`), or the cheap interim: bind prod to the docker-bridge address only (`BIND_HOST=172.18.0.1`, reachable from containers + the host, not from the LAN), or `IP_ALLOWLIST` = loopback + the Caddy container subnet (`entry/app.ts:180-183`). This alone removes the LAN's reach and is reversible in one env edit.
4. **Land (f2)** — peer-gated fallback, red-first: a test asserting `Host: 192.168.1.27` + non-loopback peer ⇒ NO principal must fail against the unmodified source before the fix. Update the four pinned suites named in §3(f2). Keep `AUTH_FALLBACK=owner` for the dev stack (loopback peer ⇒ still works) and set `AUTH_FALLBACK=deny` on the prod process.
5. **Then, and only then, drop the LAN entries** from `TRUSTED_LOCAL_HOSTS`/`TRUSTED_PRIVATE_RANGES` if any were ever added, and re-run the §1.3 Host-spoof table expecting `authenticated:false` on every non-loopback row.
6. **Fix the CSRF asymmetry** (§1.5) in the same wave or immediately after: either require the CSRF header for the fallback arm too on the multipart ingest routes, or accept it explicitly on the record now that the arm is loopback-peer-only. My preference is to require it — the arm's CSRF-immunity claim in the spine is only true for the *header* provenance, and the doc should stop saying it about both.

### 5.2 Break-glass (how the owner gets back in if step 4 or 5 goes wrong)

- **Primary:** SSH to the box → `curl http://127.0.0.1:8788/...` — the loopback peer keeps the owner fallback under every proposed change. This is the door that stays open by design.
- **Secondary:** `AUTH_FALLBACK=owner` + revert the peer gate is a one-line env/one-commit revert; the process restarts in seconds.
- **Tertiary (if OIDC/authentik itself is down):** switch `AUTH_MODE=local` with `LOCAL_INITIAL_PASSWORD` set and log in with a password over the HTTPS origin. The owner row always exists — `entry/boot/seed-owner.ts` seeds `role=owner` for `OWNER_HANDLES` at every boot, and `entry/lifecycle.ts` refuses to listen if it resolves empty — so there is never a "no owner account" state to recover from.
- **What is NOT a break-glass:** the debug token. `/api/_debug/*` is deliberately not an auth surface, and it is 404'd at the public edge (`Caddyfile:388-389`).

---

## 6. Assumptions this rests on (check these before building)

1. **The owner wants LAN access for convenience, not for an air-gapped path.** If the requirement is "must work with the WAN down and with no DNS server", arm (f1)-second-name + a router-side static DNS entry is required, and a `.local`/local-CA variant becomes the fallback plan.
2. **Every LAN device can be made to resolve one hostname.** If some device cannot (a hard-coded IP, a guest), that device is out of scope — it gets no owner access, which is the point.
3. **A loopback peer is trusted.** Anything running as any user on this host can be owner. Accepted for a single-owner box; it is the floor arm (f2) deliberately keeps.
4. **`X-Forwarded-Proto`/`X-Forwarded-Host` from Caddy are trustworthy** because the app port is not reachable except through Caddy after step 3. `deriveRedirectUri` trusts `X-Forwarded-Host` and leans on the allowlist as the real gate (`auth-routes.ts:533-534`) — that stays sound only while the exact-match list holds no wildcard.
5. **authentik stays blueprint-managed.** A UI-side redirect-URI edit would be overwritten by the next blueprint apply; the entry belongs in `authentik/blueprints/apps/orbweaver.yaml`.

## 7. Honest floors — what I did NOT verify

- **No live login was attempted** (per the lane constraint): the cookie-storage behavior in §2.3 is from the cookie-prefix spec + MDN, not from a browser on this box. Step 2 of §5.1 exists precisely to prove it.
- **No LAN client was used.** The Host-spoof table (§1.3) was produced against the loopback listener with a forged `Host`, which is the same code path (`dispatch.ts:59` reads only the header) but not the same network position. The port is currently loopback-bound, so a genuine LAN probe was impossible without changing the deployment.
- **Hairpin NAT was verified only from the host itself**, which reached the public IP and got Caddy's 502. Whether a phone on the LAN resolves and reaches `orbweaver.inktomi.tech` was not tested.
- **The running Caddy config was read from disk**, not from its admin API; I did not confirm it was reloaded after the last edit.
- **The Chrome Local/Private Network Access mitigation** in §1.5 is asserted from general browser-policy knowledge, not measured here — treat it as unreliable, not as a control.
- **`forward_auth` for orbweaver was not prototyped**; arm (e)'s cost is read off the Caddyfile and the app's own OIDC wiring, not from an attempt.
- **I did not audit every tRPC router** for `authedProcedure` usage; the "fallback owner reaches every gated surface" claim rests on the middleware (`trpc.ts:116-131`) and the route-level `principal === null` gates, which is where the decision is made.
