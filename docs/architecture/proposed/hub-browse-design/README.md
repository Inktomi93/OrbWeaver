# Hub-Browse Design — remote card-hub browsing + the hardened-egress guard (doc-set index)

> **Status: COMMITTED (D61, 2026-07-01).** The Marinara-Residue B5 row is CLOSED (Nate: complete the
> marinara-borrow adoption — the unpaired borrows get full designs). This doc set is the
> authoritative design (`Core-Laws-and-Precedents.md` D61 is the decision record and wins on any
> conflict); marinara's six bot-browser proxies are the evidence base
> (`neo-tavern/references/marinara-engine/packages/server/src/routes/bot-browser*.routes.ts`,
> 1,647 LOC + `utils/security.ts` — dissected fresh for this set, file:line cites inline).
> Everything here is prescriptive and self-contained: a builder with ONLY this doc set + the
> orbweaver law docs (AGENTS-1/2/3, `domains/import.md`, `domains/assets.md`,
> `core/Tier-3-Infra.md`) can build the whole system. Every decision carries its WHY + the
> rejected alternative.

## The one-paragraph design

Orbweaver gains an in-app **remote card-hub browser**: search external character-card hubs
(Chub · Wyvern · Character Tavern · Pygmalion in v1), page catalogs by downloads/rating/recency,
**preview a card fully rendered without importing it** (the import domain's pure reader, reused
read-only), and import in one click — the download **hands bytes to the EXISTING import front
door** (the same single-card driver the HTTP route uses; never a second import path), stamped
with `importedFrom`/`importHash` provenance (D37/PD-43). One **`HubAdapter` contract** replaces
marinara's six hand-written per-hub route files: each hub is a data-driven, capability-flagged
module sealed in `infra/network/hubs/` behind a mapped-type registry (the providers
sealed-executor pattern applied to hubs), and the thin **`domain/hub`** leaf owns
selection/policy/flow. Everything remote rides the **hardened egress pair** (doc 01):
`safeFetch` (scheme + host-allowlist + private-IP/DNS-rebind denial + redirect discipline +
size/time bounds — self-enforcing, not dependent on the opt-in global firewall) and
`isAllowedImageBuffer` (magic-byte + dimension caps) — committed plumbing that gallery's gif
import (G6), databank's scrapers, and any server-side D44 external-media fetch also ride,
regardless of the browse UI. NSFW/content flags from hub metadata are surfaced, never laundered.

## Reading order

| Doc | What it locks |
|---|---|
| [`01-network-guard.md`](01-network-guard.md) | **B5a — the guard, specced FIRST**: the `safeFetch` behavior contract (allowlist, redirect policy, IP denial incl. DNS-rebind posture, bounds), `isAllowedImageBuffer` (+ the `@orb/kit/image-sniff` home resolving gallery review-flag 2), the injected-op shapes, marinara verification + the named hardenings, the consumer table, tests |
| [`02-domain-and-adapters.md`](02-domain-and-adapters.md) | the domain-shape decision (`domain/hub`, rejected alternatives argued), the ONE `HubAdapter` contract + capability flags, the sealed `infra/network/hubs/` home + mapped-type registry, the six-hub liveness verdicts + the v1 roster, hub auth posture, the gif-search migration delta |
| [`03-flow-rings-and-client.md`](03-flow-rings-and-client.md) | the wire contracts (zod), the verb surface, preview-via-import-reader, the import handoff op + provenance, the avatar proxy + caching story, `can()`/rate limits/the AppSettings kill switch, NSFW passthrough, the client sketch, the H1–H6 build plan + test plan |

## Standing decisions a cold agent must not re-litigate

The guard is **self-enforcing** — `safeFetch` never relies on the opt-in `EGRESS_FIREWALL` global
dispatcher for its SSRF posture · `allowedHosts` is REQUIRED on every user-influenced fetch and
re-validated on every redirect hop · ONE adapter contract, ONE mapped-type registry — never a
per-hub route file, never a second registry · card download hands bytes to the EXISTING import
front door (never a second import path, never a second card parser — preview reuses import's pure
reader) · adapters are sealed infra (domain/hub knows hub capabilities, never wire shapes) ·
jannyai's scrape-token + `corsproxy.io` fallback is a REJECTED pattern (no orbweaver fetch ever
routes through an unrelated third-party proxy) · hub avatars are server-proxied + ephemerally
cached (never CAS rows, never `Cache-Control: public`) · hub ratings/NSFW flags are surfaced
verbatim-normalized, never stripped · v1 ships public-endpoint hubs only (per-user hub credentials
are a named flip criterion, not built).
