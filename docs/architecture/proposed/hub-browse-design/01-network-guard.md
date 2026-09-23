---
kind: spec
status: active
updated: 2026-07-03
---

# 01 — The hardened-egress guard (B5a): `safeFetch` + `isAllowedImageBuffer`

> **Status: COMMITTED (D61, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** This doc is the `infra/network` work item that `gallery-design.md` §6 named as its
> prerequisite and explicitly deferred ("designed and sized THERE, not here"). It is
> **committed-work plumbing regardless of the browse UI**: gallery's gif import (chunk G6/G7),
> databank's scraper verbs (`databank-design`), any server-side fetch of D44 external media
> (proxy/thumbnail/import-to-CAS of `ThemeOverride`/`allowedMediaPrefixes` URLs), and this set's
> hub adapters ALL gate on it. Evidence base: marinara
> `packages/server/src/utils/security.ts` (629 LOC, dissected in full) + the six
> `bot-browser*.routes.ts` consumers; orbweaver's staged seam
> `packages/server/src/infra/network/egress.ts` (built Phase 4a, `safeFetch` currently
> zero-caller — "unwired ≠ worthless", this doc wires it).

---

## 0. What exists today (both sides, verified)

**Orbweaver** (`infra/network/egress.ts`):

- `installEgressFirewall()` — the **global** undici dispatcher with a private-IP-rejecting DNS
  lookup (resolve → validate → pass the resolved address straight to connect, closing the
  DNS-rebind TOCTOU). **Opt-in** via `env.EGRESS_FIREWALL`; hostname allowlist via
  `EGRESS_ALLOWLIST` + the always-allowed OIDC issuer. Ranges = `DEFAULT_TRUSTED_RANGES` ∪
  `TRUSTED_PRIVATE_RANGES` (`ip-ranges.ts`).
- `safeFetch()` — a **staged** response-side wrapper: manual redirects (default cap 3), byte cap
  (default 5 MB, streamed cut), content-type allowlist, single-use `bytes()` guard. Zero callers.

**Marinara** (`utils/security.ts` — the verification the residue row demanded):

- `safeFetch` is genuinely good: per-request **resolve-then-pin** undici `Agent`
  (`validateOutboundUrlForFetch` → a single-use `connect.lookup` that hands back only the
  pre-validated addresses — DNS-rebind closed per request, `security.ts:340-368`); a real
  reserved-range set (loopback + RFC1918 via `ip-allowlist`, plus v4 metadata/benchmark/doc/
  multicast/reserved CIDRs and v6 equivalents incl. v4-mapped normalization,
  `security.ts:16-26,141-208`); **manual redirects with per-hop re-validation** + cross-origin
  credential-header stripping (`authorization`/`cookie`/api-key headers dropped + the body
  dropped when the origin changes, `security.ts:542-604`); streaming + buffered **byte caps**;
  bounded decompression (`maxOutputLength` — zip-bomb-aware, `security.ts:515-532`);
  content-type allowlist; protocol allowlist.
- `isAllowedImageBuffer` — magic-byte signature table (PNG/JPEG/WebP/GIF + gated AVIF), returns
  `{ext, mimeType}`, never trusts the remote header (`security.ts:82-121`).

## 0.1 The verified soft spots (each with the orbweaver fix — "harden where it's soft")

| # | Marinara soft spot (verified) | Orbweaver hardening |
|---|---|---|
| S1 | **No host-allowlist mechanism.** `OutboundUrlPolicy` is deny-by-range only; nothing pins a fetch to the intended hub host — the hardcoded base URLs in each route file are the only "allowlist", and any code path interpolating user input into a URL path could still be steered within the public internet | `allowedHosts` is a **required** `SafeFetchOptions` field for user-influenced URLs, validated at start AND on every redirect hop (§2) |
| S2 | **The guard is applied inconsistently.** Only the avatar proxies ride `safeFetch`; the JSON search/metadata fetches AND the card **downloads** in all six hub routes use raw `fetch` (`bot-browser.routes.ts:32,161` `proxyFetch` + `/chub/download/*`; same pattern in wyvern/pygmalion/janny/datacat/chartavern) — no byte cap, default redirect-following, no range denial on the very responses that get parsed and imported | the injected op is the ONLY egress a consumer can spell — `domain/**` cannot call global `fetch` (the `no-raw-egress` gate, §5); adapters receive the op, never import undici |
| S3 | **`corsproxy.io` fallback** — janny's token/detail scrape routes user queries and upstream HTML through an unrelated third-party proxy (`bot-browser-janny.routes.ts:86,366`) | REJECTED pattern, named in the README standing decisions; it also disqualifies the jannyai adapter from v1 (doc 02 §4) |
| S4 | **No dimension caps in `isAllowedImageBuffer`.** Magic bytes only — a valid 32000×32000 PNG passes and lands in sharp (decompression bomb via pixel dimensions, not transfer bytes) | header-parsed width/height + pixel-count caps (§3) |
| S5 | **No default deadline.** Timeout is caller-`AbortSignal`-only; a forgotten signal = an unbounded hang per route | built-in `deadlineMs` default (15 s), caller-overridable, composed with any caller signal (§2) |
| S6 | *(orbweaver's own gap, found by the same review)* the staged `safeFetch`'s **SSRF posture depends on the opt-in global firewall** — with `EGRESS_FIREWALL=false` (the default), `followRedirects` runs on the default dispatcher and a user-supplied URL reaches `169.254.169.254` unchallenged | `safeFetch` becomes **self-enforcing**: it performs its own resolve→validate→pin per request (marinara's model), ALWAYS, independent of the env toggle; the global firewall remains the defense-in-depth backstop for non-`safeFetch` egress (provider calls, OIDC) |

---

## 1. Homes (the placement, each with its enforcer)

| Unit | Home | Why | Enforcer |
|---|---|---|---|
| `safeFetch` (hardened) + `SafeFetchOptions`/`SafeFetchResult` | `infra/network/egress.ts` (in place — this is a hardening of the staged seam, not a move) | external I/O adapter; already the declared seam (`Tier-3-Infra.md`) | resolve-time (infra tier) |
| magic-signature + dimension-parse tables (`sniffImageBytes`) | **`@orb/kit/image-sniff`** (NEW kit module) | pure byte inspection, zero I/O, isomorphic; needed by BOTH infra (this guard) and `domain/assets` (`sniffMime`/`isAnimated`) — **this resolves gallery-design §10 review flag 2** (the promotion trigger the committed criterion didn't name: an infra consumer). `assets/substrate/mime.ts` becomes a thin re-export/composition over it when G2 lands | `kit-purity` gate (no `node:*`, no domain imports) |
| `isAllowedImageBuffer` (sniff + caps composition) | `infra/network/image-guard.ts` (NEW) | it is a *policy* over the pure sniff (caps, allow-set) applied to *remote* bytes — an egress concern, co-located with its one caller class | resolve-time |
| the injected-op TYPES (`SafeFetchOp`, `FetchImageOp`) | each consumer's `contract/` (hub: `domain/hub/contract/service.ts`; assets gif: `domain/assets/contract/service.ts`; databank: its scraper contract) | the standard injected-op pattern — the domain declares the type, `entry/` binds the impl (the live databank scrape seam: `DatabankContext.fetchUrl` → `entry/compose/databank.ts` → `infra/network.fetchWebDocument`) | `no-inline-types` + resolve-time (domains never import `infra/network` internals) |

*Rejected:* homing `isAllowedImageBuffer` in `@orb/kit` whole — the caps/allow-set are policy
(tunable, security-load-bearing) and policy doesn't live in kit; kit gets only the pure
byte-facts. *Rejected:* a `foundation/` home — the guard is an I/O adapter, not config/observability.

---

## 2. `safeFetch` — the behavior contract (the hardened spec)

```ts
// infra/network/egress.ts — supersedes the staged shape (same file, same names; additive fields)
export interface SafeFetchOptions {
  /** REQUIRED for any user-influenced URL. Exact hostname ("api.chub.ai") or a leading-dot
   *  suffix wildcard (".charhub.io" matches any subdomain, never the bare apex). Checked
   *  case-insensitively against the PUNYCODE (ASCII) form of the URL host, at the start URL and
   *  on EVERY redirect hop. */
  readonly allowedHosts: readonly string[];
  readonly method?: "GET" | "POST";
  /** Forwarded on same-origin hops; credential-class headers (authorization, cookie,
   *  x-api-key, api-key, proxy-authorization) + the body are STRIPPED on any cross-origin
   *  redirect (marinara security.ts:542 adopted verbatim). */
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Uint8Array;
  /** Hard cap on response bytes read (post-decode — see the undici note below). Default 5 MB. */
  readonly maxBytes?: number;
  /** Max redirect hops. Default 3. 0 = redirects are an error. */
  readonly maxRedirects?: number;
  /** If set, the response content-type (major/minor, params ignored) must match one entry. */
  readonly allowedContentTypes?: readonly string[];
  /** Built-in total deadline. Default 15_000 ms — S5: a deadline ALWAYS exists. */
  readonly deadlineMs?: number;
  /** Caller cancellation, composed (AbortSignal.any) with the deadline. */
  readonly signal?: AbortSignal;
}

export interface SafeFetchResult {
  readonly status: number;
  readonly headers: Headers;
  readonly contentType: string | null;
  /** Single-use capped reader (throws on reuse; throws the moment maxBytes is exceeded). */
  readonly bytes: () => Promise<Uint8Array>;
}
```

**The enforcement sequence, per request and per redirect hop** (each step throws a typed
`EgressBlockedError` with a `reason` discriminant — never a bare `Error`; the reason feeds
`securityEvent()` observability exactly like the existing `egress_blocked` event):

1. **Parse + scheme.** `new URL()`; `https:` only (no flip in v1 — the moment a LAN/self-hosted
   hub is a real want, an explicit `allowInsecureHttp` policy field with an operator AppSetting is
   the shape, mirroring marinara's `flagName` UX; recorded, not built).
2. **Host normalization + allowlist.** Lowercase, strip one trailing dot, punycode via
   `URL.hostname` (already ASCII); **reject IP-literal hosts outright** (v4, v6, bracketed —
   the allowlist is hostnames; a hub never needs an IP literal). Match exact or leading-dot
   suffix. Userinfo (`https://good.com@evil.com`) is impossible to confuse — the check reads
   `url.hostname`, never the raw string.
3. **Resolve + validate + pin.** `dns.lookup(host, {all: true, verbatim: true})`; **every**
   returned address must pass `!isInRanges(addr, privateEgressRanges())` (the existing
   `ip-ranges.ts` set: loopback, RFC1918, link-local/metadata 169.254/16, CGNAT, v6 ULA/link-local,
   v4-mapped normalized, plus operator extras) — one private answer rejects the whole fetch (the
   connector may try any of them; matches the global firewall's existing stance). The validated
   set is **pinned** into a per-request undici `Agent` whose `connect.lookup` hands back ONLY
   those addresses and errors on reuse (marinara's single-use pin, `security.ts:350-366`) — the
   name cannot re-resolve between check and connect. **This runs unconditionally** (S6): the
   `EGRESS_FIREWALL` env toggle governs the *global* dispatcher only.
4. **Fetch** with `redirect: "manual"`, the pinned dispatcher, the composed deadline+caller
   signal.
5. **On 3xx + Location:** drain the intermediate body (socket back to the pool, existing
   behavior), close the hop's Agent, resolve the Location against the current URL, strip
   credential headers + body if the origin changed, and **re-run steps 1–4** on the new URL.
   Hop count > `maxRedirects` → throw.
6. **On the terminal response:** enforce `allowedContentTypes` BEFORE any body read; return the
   capped single-use reader.

**The undici decode note (deliberate):** Node's fetch transparently decodes
`content-encoding`, so the byte cap applies to **decoded** bytes — the cap IS the
decompression-bomb bound; no separate `maxOutputLength` dance is needed (marinara needed one
because it requests `identity` and decodes by hand for provider-body reasons orbweaver doesn't
have here). Do not add manual decoding.

**What is deliberately NOT in scope:** per-host rate limiting (transport's DB-backed limiter
already meters the verbs that call this — doc 03 §4; a second limiter inside infra would be a
doubling); response caching (the avatar proxy's LRU is the caller's concern, doc 03 §3);
non-HTTP protocols (nothing needs them).

---

## 3. `isAllowedImageBuffer` — remote image validation

```ts
// @orb/kit/image-sniff — PURE byte facts (no policy, no I/O)
export interface SniffedImage {
  readonly mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/avif";
  readonly ext: "png" | "jpg" | "webp" | "gif" | "avif";
  /** Header-parsed dimensions; null when the header is present but truncated/unparseable. */
  readonly width: number | null;
  readonly height: number | null;
  readonly animated: boolean; // the gallery-design §3 semantics (GIF ⇒ true, APNG acTL, WebP ANIM)
}
export function sniffImageBytes(bytes: Uint8Array): SniffedImage | null;
```

Signature table = marinara's, adopted (PNG 8-byte, JPEG `FF D8 FF`, `RIFF….WEBP`, `GIF87a/89a`)
plus AVIF via `ftyp` brand scan — **unconditionally** checked, not gated on an expected
extension (marinara's `expectedExt` gate exists only because its callers carry filenames; remote
fetches don't). Dimension parsing is pure header math per format: PNG IHDR (bytes 16–24), GIF
logical screen descriptor (bytes 6–10), WebP VP8/VP8L/VP8X chunk headers, JPEG SOF0/SOF2 marker
scan (bounded to the first 64 KB — a SOF deeper than that is a reject-by-null), AVIF `ispe` box
when cheaply reachable else `null`. `null` dimensions are allowed to PASS the guard only when
the caps caller opts in (`requireDimensions: true` is the default — fail-closed).

```ts
// infra/network/image-guard.ts — the POLICY composition
export interface ImageGuardCaps {
  readonly maxBytes: number;      // default 10 MB (marinara's avatar cap, adopted)
  readonly maxDimension: number;  // default 8192 px per axis  ── S4: new vs marinara
  readonly maxPixels: number;     // default 40_000_000 (≈ 8192×4884)
  readonly allowedMime?: readonly SniffedImage["mime"][]; // default: all five
  readonly requireDimensions?: boolean; // default true (null dims ⇒ reject)
}
export function isAllowedImageBuffer(bytes: Uint8Array, caps?: Partial<ImageGuardCaps>): SniffedImage;
// throws ImageRejectedError (typed reason: not-image | mime-not-allowed | too-large |
// dimensions-unknown | dimensions-exceeded) — callers branch on reason, never on message text.
```

The remote `Content-Type` header is **never consulted** — the magic bytes are the truth (the
classic failure this guards: an HTML error page served with 200 + `image/png`).

---

## 4. The injected-op shapes (what consumers receive)

Consumers declare op TYPES in their own `contract/`; `entry/` (compose) binds them over the infra
implementations **with the consumer's host allowlist + caps baked in** — a domain can neither
widen its own allowlist nor reach a host its op wasn't built for:

```ts
// the general fetch op (hub adapters via HubIo — doc 02; databank scrapers)
export type SafeFetchOp = (
  url: string,
  init?: { method?: "GET" | "POST"; headers?: Readonly<Record<string, string>>; body?: string },
) => Promise<SafeFetchResult>; // allowedHosts/maxBytes/deadline are NOT caller-suppliable — compose-bound

// the image op (avatar proxy, gif import, D44 server-side media)
export type FetchImageOp = (url: string) => Promise<{ readonly bytes: Uint8Array; readonly image: SniffedImage }>;
// = safeFetch + isAllowedImageBuffer in one bound step; throws EgressBlockedError | ImageRejectedError
```

**The consumer table (who gates on this work item):**

| Consumer | Op | Compose-bound allowlist |
|---|---|---|
| hub adapters (this set, doc 02) | `SafeFetchOp` + `FetchImageOp` per hub | that hub's API + CDN hosts (the adapter module exports them as data) |
| gallery gif search/import (G6→G7; home migrates per doc 02 §5) | `SafeFetchOp` (search) + `FetchImageOp` (import) | the gif provider's API + media hosts |
| databank scrapers | `SafeFetchOp` | the scraper target's declared host set |
| D44 server-side external media (if/when any URL is fetched server-side) | `FetchImageOp` | the chat's `allowedMediaPrefixes`-derived hosts |

---

## 5. Invariants (gate candidates)

1. **No raw egress in domains** — no `domain/**` file calls global `fetch` (or imports undici);
   all outbound HTTP from a domain goes through a compose-bound injected op.
   _Enforcement: ts-morph gate `no-raw-egress` (`tooling/src/verify/gates/`) — `fetch` call sites in
   `domain/**` are RED (test files exempt); resolve-time backstop: domains don't import
   `infra/network` internals._
2. **`safeFetch` is self-enforcing** — its resolve→validate→pin path runs with
   `EGRESS_FIREWALL=false`.
   _Enforcement: test-time — the §6 suite runs with the global firewall OFF._
3. **Every hop is re-validated** — scheme, allowlist, and IP denial run on redirect targets.
   _Enforcement: test-time (the redirect-to-private / redirect-off-allowlist cases)._
4. **Remote bytes are magic-validated before any store/decode** — no `assets.store`, no sharp
   call, no parse of hub-downloaded bytes without the guard having run.
   _Enforcement: test-time per consumer (gallery §5 tests, doc 03 tests); review._
5. **One signature table** — `@orb/kit/image-sniff` is the only magic-byte home;
   `assets/substrate/mime.ts` composes it (no duplicate table in infra OR assets).
   _Enforcement: resolve-time + the `serde-core`-style duplicate-decl lint pattern._

---

## 6. Test plan (table-driven; the suite runs with `EGRESS_FIREWALL=false` — invariant 2)

**`safeFetch` (injected `lookup` — no live DNS in tests):**
- allowlist: exact match passes; suffix `.charhub.io` passes subdomain, rejects apex + rejects
  `evilcharhub.io`; case + trailing-dot normalization; `https://api.chub.ai@evil.com/x` resolves
  to host `evil.com` → rejected; IP-literal host (v4, `[::1]`) → rejected.
- IP denial: mock lookup answering `10.0.0.5` / `169.254.169.254` / `::1` / `::ffff:192.168.1.1` /
  mixed `[public, private]` → all rejected; public-only answer passes.
- rebind pin: the connect-time lookup receives ONLY the pre-validated addresses; a second
  connect on the same pinned agent errors (single-use).
- redirects: hop-count cap; redirect to a non-allowlisted host rejected; redirect to a host that
  resolves private rejected; cross-origin hop strips `authorization`/`cookie` + drops the body
  (assert on a recording test server); same-origin hop keeps headers.
- bounds: body cut mid-stream over `maxBytes` throws (and the reader is dead); `deadlineMs`
  fires with no caller signal; caller abort composes.
- content-type: `allowedContentTypes` mismatch throws before the body is read.

**`sniffImageBytes` goldens (extends gallery-design §3's list):** each format signature + parsed
dimensions asserted exactly (PNG, JPEG SOF0 + progressive SOF2, GIF87a/89a, WebP VP8/VP8L/VP8X,
AVIF); truncated headers → `width/height: null`; garbage + HTML-with-image-content-type → `null`.

**`isAllowedImageBuffer`:** 200-status HTML error page rejected (`not-image`); over-`maxBytes`
rejected; a tiny valid PNG whose IHDR claims 30000×30000 rejected (`dimensions-exceeded`) — the
S4 case; null-dimension bytes rejected by default, pass with `requireDimensions: false`.

---

## 7. Cross-refs

- `gallery-design.md` §5/§6 (G6 = this work item; review-flag 2 resolved by the kit home) ·
  `databank-design` (scrapers) · `UI-Theming-and-Content.md` §12.3 (the D44 client/server line) ·
  `docs/law/Tier-3-Infra.md` (the staged seam this hardens) · doc 02/03 (the hub consumers) ·
  marinara `utils/security.ts` (the verified evidence base).
