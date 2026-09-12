---
kind: review
status: draft
updated: 2026-08-29
---

# Board re-derivation: D2 OIDC/infra rows (main @ e4d017fd8)

## #141 OIDC logout id\_token\_hint + post\_logout\_redirect\_uri

VERDICT: ⚠️ STALE-PREMISE (partial, and the title's stated goal is currently REJECTED by design, not landed)

- `packages/server/src/entry/http/auth-routes.ts:174-208` `resolveEndSessionUrl` — JSDoc + code state
  the end-session URL is sent **BARE**, deliberately WITHOUT `id_token_hint` or `post_logout_redirect_uri`.
- Commit `8446a55ce` originally added `post_logout_redirect_uri` (#141 first attempt); commit
  `d8b902fff` **reverted it** in the same PR era: "send the OIDC end-session URL BARE —
  post\_logout\_redirect\_uri without id\_token\_hint 400s". The JSDoc documents measuring this against a
  real authentik 2026.5.5 deployment: `post_logout_redirect_uri` alone raises
  `invalid_request`/`id_token_hint_missing` → 400, which is worse than sending nothing (SSO session
  survives AND user hits an error page).
- Restoring `post_logout_redirect_uri` requires an `id_token_hint`, which requires **persisting the
  OIDC id\_token** — the `sessions` table currently stores only a token hash by design. That is called
  out in the same comment as an owner-gated secret-at-rest decision, still open, tracked on #141.
- Rung: exported function, called from the logout route (`registerAuthRoutes` line 561), tested
  (`tests/server/entry/http/auth-routes.test.ts` exists per earlier grep). Behavior is real and
  intentional, but it is the OPPOSITE of "returns to Orbweaver login via post\_logout\_redirect\_uri" —
  it currently sends the IdP's own bare end-session URL, so users land on the IdP's logged-out page,
  not `/login`.

RECOMMENDATION: keep open, but re-word/re-scope the row — the "wire id\_token\_hint +
post\_logout\_redirect\_uri" work is NOT review-ready, it's blocked on an owner-gated id\_token
persistence decision. Current code is a deliberate, documented interim state (bare URL), not a bug.
Consider re-titling to track the id\_token-persistence decision directly rather than leaving it read as
"in review" for the original scope.

## #762 OIDC discovery caching — single-flight vs settled-result-only

VERDICT: 🕓 OWNER-GATED (current-behavior receipt below; no code verdict)

- `packages/server/src/entry/lifecycle.ts:189,216-219` (`buildOidcDeps`):
  ```
  let cachedConfig: Configuration | undefined;
  ...
  getConfig: async (): Promise<Configuration> => {
    cachedConfig ??= await discovery(issuerUrl, clientId, clientSecret);
    return cachedConfig;
  },
  ```
- This is **settled-result-only caching with a cold-start race**, not single-flight: `??=` only
  short-circuits AFTER the RHS promise resolves and is assigned. Two concurrent callers hitting
  `getConfig()` before the first `discovery()` call resolves will BOTH call `discovery()`
  independently (no in-flight promise is memoized) — a double dispatch to the IdP on cold start /
  concurrent early requests, not a crash, but not single-flighted either. Once one resolves,
  `cachedConfig` is permanently set (never invalidated, never retried on failure — a failed
  `discovery()` call leaves `cachedConfig` `undefined` and is retried on the next call, which is
  correct fail-open behavior but not stated as a design goal anywhere).
- Rung: declared, exported (closure captured in `OidcRoutesDeps.getConfig`), called from every login/
  callback/logout/backchannel route that touches OIDC config (`auth-routes.ts`).

RECOMMENDATION: owner decides whether to promote to true single-flight (memoize the in-flight promise,
not just the settled value) — cheap fix if wanted, but current racy-double-fetch behavior has shipped
without incident so may be an acceptable risk given `discovery()` only runs on cold boot / rare early
concurrent hits.

## #803 seeded showcase plugins are version-latched

VERDICT: 🕓 OWNER-GATED (premise CONFIRMED)

- `packages/server/src/entry/boot/seed-example-plugins.ts:80-95` (`seedOne`) — `alreadyInstalled`
  check is presence-only (`deps.alreadyInstalled(principal, slug)`); if the user already holds a row
  at that slug, `seedOne` returns `false` immediately — no version comparison, no re-install, no
  upgrade path exists anywhere in this file.
- The per-user latch (`isSeeded`/`markSeeded`, `UserSettings.onboarding.examplePluginsSeeded`) is also
  once-only and by design never re-runs (file header: "a user who removed an example must not have it
  resurrected").
- 9 slugs now seeded (`EXAMPLE_PLUGIN_SLUGS`, line 42-52) — confirms scope is bigger than "two
  showcase plugins" in the row title (aged; #774 grew the set to 9 archetypes).

RECOMMENDATION: premise fully confirmed on current main. Owner-gated on the dev-db-drop decision as
stated; no code change needed to validate the row.

## #316 baseline auto-wipe / LAUNCHED flag

VERDICT: 🕓 OWNER-GATED / PARKED (premise CONFIRMED)

- `packages/server/src/entry/boot/migrate.ts:12` — `const LAUNCHED: boolean = false;` — still in
  pre-launch/regen mode.
- Lines 50-54, 62-67: when `LAUNCHED` is false and `checkBaseline` reports `status === "regenerated"`,
  boot calls `resetDevDatabase(deps.db)` — full drop + re-migrate, explicitly commented "ALL DATA
  DROPPED, pre-launch by design". The boot-fatal branch (line 50-54) only fires when `launched` is
  true.

RECOMMENDATION: premise confirmed, box is still in "not launched" posture — row correctly stays
parked pending the owner's launch decision.

## #403 Drizzle 1.0 program

VERDICT: 🕓 OWNER-GATED / PARKED — wake condition NOT met

- `pnpm-workspace.yaml:177/425/615` and the catalog block: `drizzle-orm: ^0.45.2`, `drizzle-kit:
  ^0.31.10` — still pinned pre-1.0.
- Web check (npm/Drizzle docs, 2026-08-29): drizzle-orm v1 is at release-candidate stage
  (`1.0.0-rc.4`, dated 2026-05-20) with no stable `1.0.0` published to npm as of this check — a beta.2
  announcement exists on the Drizzle docs site but is distinct from an npm-stable tag.
  Sources: [drizzle-orm on npm](https://www.npmjs.com/package/drizzle-orm),
  [Drizzle latest releases](https://orm.drizzle.team/docs/latest-releases).

RECOMMENDATION: keep parked — wake condition (stable 1.0.0 on npm) not yet met. Row was previously
noted as "was rc.5"; current public rc is rc.4 per the docs page dated 2026-05-20, so no material
version movement since the row was filed (worth a light re-check, not urgent).

## #495 homelab IdP: unmanaged db-only stage binding

VERDICT: ⚠️ COULD NOT CORROBORATE FROM REPO SEARCH — treat as OWNER-GATED/PARKED per row text

- Searched `packages/server/src/infra/auth/**` for sso/end-session/unmanaged/db-only naming and the
  D-ledger for a matching decision row (`D95`, "homelab", "8 other providers", "unmanaged") — no
  matches. `ast-grep`/grep count: 0 files matched any of those terms under `infra/auth`; this is
  consistent with the row describing an OPERATIONAL/infra-config fact (the homelab's own IdP
  provider bindings) rather than something with a corresponding code path in this repo — i.e. "no
  matches" here is expected, not a red flag, because the row is about the box's live IdP
  configuration, not application code.
- Did not attempt to reach the actual homelab IdP (out of scope for a read-only repo scout, and the
  task explicitly restricts this row to a premise check).

RECOMMENDATION: cannot independently confirm/deny from the repo; defer entirely to the owner per the
row's own stated wake condition (owner-attended live-IdP session). No action taken, no files touched.

## #124 WATCH: interactive-card WebRTC exfil channel

VERDICT: 🕓 OWNER-GATED / PARKED (permanent watch — premise CONFIRMED still live)

- `packages/server/src/entry/http/plugin-frame.ts:29,45` — CSP comment for the plugin iframe sandbox:
  "NO `connect-src`... WebRTC, which no directive Chromium 149 recognizes can close (`webrtc 'block'`
  is reported 'Unrecognized' ...)".
- `packages/client/src/features/plugin/lib/plugin-copy.ts:139` — matching residual note: "R1:
  `webrtc 'block'` is unrecognized by Chromium, so it is not emitted."
- Both are dated/current-tree comments; no browser CSP directive for WebRTC exists as of this repo's
  target Chromium version. The watch's premise is still true.

RECOMMENDATION: keep as permanent watch, no action needed; the two receipts above corroborate the row
is describing a real, currently-unfixable browser-platform gap rather than stale text.

---

## Summary table

| Row | Verdict | Recommendation |
| - | - | - |
| #141 | ⚠️ STALE-PREMISE | keep open, re-scope to id\_token-persistence decision |
| #762 | 🕓 OWNER-GATED | current behavior = settled-result-only w/ cold-start double-fetch race, not true single-flight |
| #803 | 🕓 OWNER-GATED | premise confirmed, no code change needed |
| #316 | 🕓 OWNER-GATED/PARKED | premise confirmed (LAUNCHED=false) |
| #403 | 🕓 OWNER-GATED/PARKED | wake not met (pinned 0.45.2, npm still rc) |
| #495 | ⚠️ unconfirmable from repo | defer to owner, no repo evidence either way |
| #124 | 🕓 OWNER-GATED/PARKED (permanent) | premise confirmed live in code comments |
