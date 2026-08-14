---
kind: design
status: active
updated: 2026-08-14
---

# Staleness & session freshness — diagnosis + design + game plan

> **Charge (LANE B, overnight 2026-08-13→14, owner-authorized stickler design slot):** DOGFOOD THEME A
> ("most of our app has a staleness problem" — after the full ST import the owner had to delete
> localStorage + cache + cookies and reload before the character list rendered correctly) plus the AUTH
> row ("stale login is silently tolerated — instead of refreshing the token/cookie it just lets you
> continue") treated as ONE problem, designed for **multi-tab · multi-device · per-user · multi-human**.
> Companion condensed defect list: `docs/reviews/stickler/2026-08-14-staleness-diagnosis.md`.
>
> **Prior-law check (charge-mandated, done before designing):** `Core-0` partitioning table + the
> D-ledger carry NO ruling on client session freshness or durable-local referential integrity — this is
> new territory. The binding constraints found: **D54** (QueryClient pins are LAW — `staleTime:
> Infinity`, `refetchOnWindowFocus: false`, the bus drives freshness), **D118** (ONE multiplexed socket
> per tab), **D135** (the role verdict has one home, `users.role`), Spine-Identity invariant #8
> (sessions re-validate revoked/expired/enabled per request), and the built partial belts **#23**
> (import terminal `emitLibraryChanged`, `entry/compose/portability-runner.ts:226-229`) and **#23b**
> (the stale-session hard-redirect belt, `packages/client/src/data/stale-session.ts`). This design
> EXTENDS #23b; it re-litigates none of the above.

## 0. Verdict in one screen

The app does NOT have one staleness bug — it has **one sound freshness architecture with four specific
holes at its edges**, plus one symptom that is not staleness at all:

| # | Mechanism | Layer | Status |
| - | - | - | - |
| D1 | Persisted view-state carries server row ids with no referential integrity — a dead `tagFilter` include-id silently empties the character list and its chip is UNRENDERABLE | durable-local (localStorage) | CONFIRMED in code; the strongest single explanation of the import repro |
| D2 | All `orb:*` localStorage keys are per-ORIGIN, not per-USER — filters, drafts and composer prose survive an identity change that no event can invalidate | durable-local | CONFIRMED in code. **Re-motivated per §7's premise correction** (one human per box): the live driver is the DB RE-MINT identity split — user ids move era to era while the browser's blobs persist — not a second human. FIXED (W6) |
| D3 | A dead session is only detected on a QueryCache/MutationCache error — the SSE path's UNAUTHORIZED never reaches the belt, and a warm `staleTime: Infinity` tab can make zero such calls indefinitely = "stale login silently tolerated". Recovery, when it fires, is a state-destroying hard redirect, per tab, with no cross-tab/device coordination | session | CONFIRMED in code |
| D4 | Character tab "does not load all characters when scrolled or searched" — `maxPages: 5` head-eviction with `getPreviousPageParam: () => undefined` (evicted pages unrecoverable) + client-side-only search over the loaded window + the picker's single `limit: 100` page. **NOT staleness — a bounds class.** The board's RESUME\_WINDOW hypothesis names the wrong constant: `RESUME_WINDOW` only picks the Chat CTA's resume target | pagination bounds | CONFIRMED in code; FENCED to the character-ceiling lane (backfill #3), interface specced in §5.9 |
| D5 | Secondary: bulk import emits one `charactersChanged` per created row → invalidation storm (cancel-and-restart refetch churn) while the library is open; and NO user-bus member covers identity reads (`sessions.me` is in zero invalidation maps — a role grant never reaches a live client) | in-memory (TanStack) | CONFIRMED in code (churn + a narrow gap; not the repro cause) |

**What is verified NOT broken** (§2.6): the import DOES emit its freshness events end-to-end; the
TanStack layer's bus-driven model is sound and in-memory-only (a plain reload always resets it — which
is exactly why the owner's reload-alone did NOT fix his repro, pointing the diagnosis at localStorage +
cookies); blobs are content-addressed and cache-immutable by construction.

The design (§4) is five pieces: a written **three-class data contract** (ratifying what exists), a
**durable-local state contract** (per-user namespacing + referential integrity — new), a **cross-tab
session channel** (BroadcastChannel + Web Locks — new), a **session-freshness protocol** (proactive
probe + single-flight state-preserving recovery ladder + server-side socket eviction on revoke — new),
and **storm coalescing** in the invalidation seam. Explicit non-goals in §4.6 (no refresh tokens, no
query-cache persistence).

## 1. The freshness model as built (inventory, receipted)

Every claim here was read off the tree this session (whole-file reads unless noted).

### 1.1 Three data classes, three drivers

| Class | Home | Freshness driver | Receipt |
| - | - | - | - |
| Server truth | TanStack Query cache, keys 100% proxy-derived | `staleTime: Infinity`; the FIVE buses → the ONE invalidation seam; `refetchOnReconnect: true` for the browser-online edge; gap-heals on SSE reconnect | `packages/client/src/data/query-client.ts:47-55`; `data/invalidation.ts` (BUS\_FILTERS :114, USER\_BUS\_FILTERS :202, RPG\_BUS\_FILTERS :300, derived heal sets :325-345) |
| Client-ephemeral | zustand stores via 3 doors | render lifetime; sanitized on rehydrate where persisted | `state/create-gated-store.ts` · `create-persisted-store.ts` · `create-entity-draft-store.ts` |
| Durable-local | 7 `createPersistedStore` mints (`orb:*`); the `orb-draft:*` door exists but has ZERO call sites | `version` + TOTAL `migrate` run on EVERY rehydrate (wired as `merge`) | `create-persisted-store.ts`; mints: shell · character-library · tag-library · composer-draft · recent-models · config-group-open · home-tile-box. **TRUTH-REPAIRED 2026-08-14 (W10, lane 1):** this row originally read "+ entity-draft mints (`orb-draft:*`)". `createEntityDraftStore` has NO call site — two methods agree (ast-grep `createEntityDraftStore($$$A)` = 0 at scannedFileCount 429 ts + 502 tsx with `createPersistedStore` as the positive control; a literal sweep finds only the door, the barrel re-export, and three comments naming it as the road not taken). W6 therefore namespaced the 7 persisted mints; the draft door was namespaced too, through the SAME shared key seam, so the first draft store ever minted is born per-user |

### 1.2 The event/sync spine (unchanged by this design)

Five buses on three deliberate durability tiers (chat durable-first/seq-replayed · user live-only with
reconnect heal · notifications durable inbox · rpg live-only self-healing · automation transient), ONE
multiplexed SSE socket per tab (D118) with the room registry's ref-counting, announce-retry, reconnect
barrier, and the BOOT-4X rule (gap-heal is a RE-connect instrument, never a page-load one — measured
double-fetch receipts in `data/bus/room-registry.ts:43-58`). Mutations declare their freshness source as
a compile-time XOR (`busDriven: true` ⊕ `invalidates`) in `data/create-entity-mutation.ts:75-82`, with
`echo` seeds for verbs whose response is authoritative. Server-side, the socket registry survives
reconnects with per-room cursors and epoch-guarded takeover (`transport/trpc/stream/socket-registry.ts`).

This machinery is the best-built part of the whole story. The design's axiom — **every server write
fans a covering event** — is exactly THEME B's territory; where a domain has no bus (refinery,
confirmed on the board), the axiom fails and no client design can compensate. **Fence: the event-bus
coverage survey is the next stickler occupant's lane; this design only states the dependency.**

### 1.3 The session model as built

- **Server:** DB-backed sliding session. 30-day TTL, slide throttled to 5 min
  (`domain/sessions/tokens/tokens.ts:18-21`); `sessions.validate` re-checks
  revoked/expired/`users.enabled` EVERY request and slides `expiresAt = now + ttl`
  (`domain/sessions/verbs/validate.ts:14-33`); the per-request middleware re-issues the SAME token with
  refreshed Max-Age on slide (`entry/app.ts:175-195`; cookie: `__Host-orb_session`, Max-Age form,
  `entry/http/auth-routes.ts:142-150`). Four auth modes; the un-credentialed owner fallback is
  origin-gated (`infra/auth/dispatch.ts:47-77`) — unconditional under `single-user`, local-origin-only
  under SSO modes. `/api/auth/me` is public and reports THIS request's seam verdict
  (`entry/http/auth-meta.ts:72-79`).
- **Client:** route guards run at NAVIGATION only (`features/auth/lib/route-guards.ts:41-54`, wired at
  `routes/router.tsx:16,23` — and the SPA has two routes, so effectively once per page load). The #23b
  belt hard-redirects to `/login` on the FIRST tRPC `UNAUTHORIZED` seen by the QueryCache or
  MutationCache (`data/stale-session.ts:32-41`, wired `data/query-client.ts:63-73`). Logout returns the
  IdP `endSessionUrl` (A6) and the caller does a hard redirect (`data/auth-bootstrap.ts:74-98`).
- **SSE × session:** `stream.connect` is `authedProcedure` — the Principal is minted at the connect
  REQUEST and frozen for the connection's life (`transport/trpc/routers/stream.ts:35-66`). Nothing
  server-side kills a live socket on revoke/disable; nothing client-side treats a subscription-path
  UNAUTHORIZED as a session event (`data/bus/use-orb-socket.ts:90-92` — `notify.error` only;
  `use-user-bus.ts:55-57` — same).

### 1.4 Cross-tab / cross-device as built

Cross-DEVICE and cross-TAB freshness of SERVER truth both ride the server fan: every tab holds its own
socket, every device its own session; the member-fan and per-user fan reach all of them. CORRECT and
kept. What does NOT exist (two-method absence receipt, this session: literal grep zero across
`packages/client/src`; `ast-grep` `new BroadcastChannel($$$A)` zero at scannedFileCount=429 ts + 502
tsx with a positive control matching): any BroadcastChannel, any `storage`-event listener, any Web Locks
usage. Consequences: two tabs LWW-clobber each other's persisted view-prefs/drafts; logout in tab A
leaves tab B rendering warm cache until it happens to make a failing call; a 401 burst makes every tab
independently hard-redirect.

## 2. Diagnosis — the owner repro, decomposed

The repro: import full ST library → character list wrong → **plain reload did not fix it** → deleting
localStorage + cache + cookies + reload fixed it. The reload-resistance is the key diagnostic fact: the
TanStack cache is in-memory and dies on reload, so the stale thing lived in **localStorage and/or the
cookie**, not in the query cache. Each mechanism below is code-confirmed; §6 gives the live-drive
instrumentation to apportion them.

### 2.1 D1 — the invisible dead-id tag filter (durable-local referential staleness)

The chain, every link receipted:

1. `orb:character-library` persists `tagFilter: TagFilterEntry[]` — raw `TagId`s cast with zero
   existence validation (`state/character-library-store.ts:68-88` — `castId<TagId>(raw)`; the TOTAL
   `migrate` sanitizes SHAPE only).
2. Filtering is AND-semantics on both arms: EVERY `include` entry must be present on a row
   (`features/character/lib/character-list-view.ts:44-53`). An include entry whose tag exists on ZERO
   rows (deleted tag; a pre-db-nuke tag id from a previous dev era; a foreign user's tag id under D2)
   ⇒ **every row fails ⇒ the list renders empty** (or, with `exclude`, wrongly filtered).
3. The chip for that entry CANNOT render: chips are drawn from `availableTags`, which is derived from
   the LOADED ROWS' tags only (`character-library-surface.tsx:123` → `tagVocabulary(items)`;
   `character-filter-chips.tsx:93` — the active-chip cap exemption only rescues ids that are IN
   `availableTags`). The file's own header states the law this breaks: *"a filter you cannot see is a
   filter you cannot turn off"* (`character-filter-chips.tsx:12-14`).
4. No UI exposes a reset (`__resetTagFilter` is a test seam, `character-library-store.ts:141-143`).
   Reload rehydrates the same blob. **The only user-reachable cure is deleting localStorage** — exactly
   what the owner did.

Same class, lesser severity (their chips ARE visible): persisted `favoritesOnly: true` over a
just-imported all-unstarred library renders an empty list; persisted `showArchived`/`viewMode`. Sweep
obligation for the class: §5.5's audit table covers every persisted store field carrying server ids.

### 2.2 D2 — durable-local state is origin-scoped, not user-scoped (and the cookies leg)

Every persisted key is `orb:<name>` / `orb-draft:<name>` with no user in the key and no user check in
`migrate` (`create-persisted-store.ts:47`, `create-entity-draft-store.ts:46`). On a multi-HUMAN install
(hard constraint): user A's tag filters, library view state, **composer drafts and entity drafts —
i.e. PROSE** — rehydrate into user B's session on the same browser. That is both a staleness defect
(state that no event can ever invalidate, because it belongs to another identity) and a privacy defect.

The cookies leg of the repro fits here as the **identity-split hypothesis**
(\[\[per-user-scoped-empty-is-about-the-asker]]): the dev latch re-mints the dev db (board: "dev db
re-mints on next boot"), so user rows and their ids change era to era while the browser's cookie and
localStorage persist. A session (or an `orb:*` blob) pointing at a previous era's identity makes
per-user-scoped reads return the OTHER user's (empty) world — which looks exactly like staleness.
Deleting cookies forces a fresh identity resolution onto the current-era row. #23b was built for the
wiped-row arm of this (its own header says so); the surviving arms are D2 (blobs) + D3 (the belt's
blind spots). §6's instrumentation separates "stale filter" from "wrong asker" in one console dump.

### 2.3 D3 — the dead session is silently tolerated (the AUTH row)

The server model is right (validate-per-request, instant revocation semantics, sliding TTL). The
CLIENT's detection and recovery have four structural holes:

1. **The belt's only sensors are QueryCache/MutationCache `onError`** (`query-client.ts:63-73`). With
   `staleTime: Infinity` + `refetchOnWindowFocus: false` (D54 law) a warm tab issues NO reads unless an
   invalidation lands — and a dead session gets no bus events, so no invalidations land. The cache
   renders stale data indefinitely; nothing errors; nothing redirects. This is the owner's "it just
   lets you continue", verbatim, in cookie modes.
2. **The subscription path never reaches the belt.** `stream.connect`'s UNAUTHORIZED (on the tRPC SSE
   link's reconnect attempts after expiry/revoke) surfaces as `useSubscription onError → notify.error`
   (`use-orb-socket.ts:90-92`) and as `roomRegistry.failed → onError → notify.error`
   (`use-user-bus.ts:55-57`). Toasts, retry loops — never `recoverIfStaleSession`. So even the
   session-death signal the app DOES receive is discarded.
3. **Recovery is destructive and uncoordinated.** `location.assign("/login")`
   (`stale-session.ts:39-40`) drops all in-memory state with no return-target snapshot; each tab fires
   independently (the module-level `recovering` latch is per-tab); there is no "another tab already
   recovered" path; under `single-user`/`forward-header` a full reload is pure waste because the next
   request would re-admit seamlessly anyway.
4. **No propagation edges:** logout in one tab/device does not reach the others (no client channel; no
   server socket-kill on revoke — the frozen-principal socket lives until natural death,
   `stream.ts:35-66` + `socket-registry.ts` having no eviction-by-user API). And **no user-bus member
   covers identity reads**: `USER_BUS_FILTERS` has no arm that invalidates `sessions.me`/the viewer
   triple (`invalidation.ts:202-283` — map inspected member-by-member), so an `admin.setRole` grant
   reaches a live client only on full reload.

On the owner's two deployment shapes: under `single-user`/LAN the fallback arm re-admits every request
by design (`dispatch.ts:47-52`) — "continuing" there is correct and this design leaves it; under
`oidc` on the FQDN, holes 1–3 are the live defect. Note what is NOT a defect: the orb session
outliving the IdP session is the standard RP-session model, and A5 back-channel logout already covers
IdP-initiated LOGOUT; IdP-side idle-expiry not propagating is industry-normal and stays.

### 2.4 D4 — the character-tab ceiling is a BOUNDS class, not staleness (charge-mandated distinction)

- The library window: `maxPages: 5` (`character-library-surface.tsx:57,75`) × `library.pageSize`
  (default 30, max 100 — `contracts/settings/index.ts:649-654`) ⇒ **at most 150–500 rows ever held**.
  Past 5 pages TanStack EVICTS the head page, and `getPreviousPageParam: () => undefined`
  (`character-library-surface.tsx:74`) makes evicted pages **unrecoverable for the session** — rows
  vanish from the top as you scroll deep.
- Search is `filterCharacters(items, deferredQuery)` — client-side over the loaded window ONLY
  (`character-library-surface.tsx:124`); `character.list` has NO search/filter input at the contract
  (sort + cursor + limit only, `transport/trpc/routers/character.ts:36-55`). The favorites strip and
  the tag vocabulary are window-derived the same way (`:122-123`).
- The board row's hypothesis names `RESUME_WINDOW=100` — wrong constant: that bounds only the
  resume-or-new map for the Chat CTA (`character-library-surface.tsx:60,118`;
  `CHAT_LIST_MAX_LIMIT = 100`, `contracts/chat/listing.ts:20`). The character the owner "found in the
  new-chat window" appeared there because the picker fetches ONE `limit: 100` recency page
  (`components/character-picker.tsx:29,97`) — itself a bounds ceiling that merely happened to include
  that character.
- **Fence:** the fix is backfill-queue lane #3's (#45-class keyset treatment for characters). §5.9
  records the interface this design assumes so the two lanes compose.

### 2.5 D5 — storms and the identity-read gap (in-memory layer)

Bulk import emits `charactersChanged` per created row (`domain/character/verbs/create.ts:116` — correct
per-verb behavior) plus the #23 terminal fan (`portability-runner.ts:226-229`,
`domain/import/workload-contributions.ts:43,150-152`). While the library section is visible, each event
path-invalidates `trpc.character.*`; `invalidateQueries` CANCELS and RESTARTS in-flight fetches (the
seam's own measured note, `invalidation.ts:57-60`), so an N-hundred-card import churns the visible list
continuously. Correctness survives (the terminal fan settles it); the cost is wire churn and a
flickering library during exactly the operation the owner was performing — worth fixing (§5.7), and
plausibly a contributor to "rendered incorrectly" *while* the import ran.

### 2.6 Verified clean (what the diagnosis rules OUT, with method)

- **Import freshness wiring exists end-to-end:** the import context's `createCharacter` port is the
  emitting `CharacterService.create` (wiring: `entry/compose/portability-runner.ts:135` →
  `entry/compose/portability.ts:74-98` → `entry/import/build-import-context.ts:94-101`; emit at
  `character/verbs/create.ts:116`), and both workload kinds fan `emitLibraryChanged` at terminal.
  Presets/themes/personas/world-info/regex/tags ride their own domains' emitting import verbs (grep
  receipt: `emitUserEvent` present in every one of those domains' verbs).
- **The TanStack layer cannot be the reload-resistant stale thing:** in-memory only; no persister
  anywhere (grep `persistQueryClient|createSyncStoragePersister` — zero; corroborated by
  `query-client.ts` whole-file read).
- **Blob/HTTP cache:** content-addressed asset ids, `Cache-Control: private, immutable`
  (`entry/http/blob.ts:20-21,139`) — a byte-new avatar is a new asset id, so browser-cache staleness
  cannot survive an id change. (Residual to confirm live: no mutable-URL image path exists — §6.)
- **The user-bus heal set derivation** (`allUserRootFilters`, `invalidation.ts:340-345`) cannot drift
  from the map — derived, not hand-listed. BOOT-4X gating verified in `room-registry.ts:229-240`.

## 3. Constraints the design must hold (from law + hardware)

1. **D54 pins stay.** `staleTime: Infinity`, `refetchOnWindowFocus: false` are law; the bus drives data
   freshness. The session probe (§4.4) is a SESSION check, not a data refetch — it does not touch the pins.
2. **D118: zero new sockets.** One multiplexed SSE per tab stays the whole socket budget
   (\[\[sse-per-origin-connection-budget]]). BroadcastChannel and Web Locks cost no connections.
3. **Multi-human:** no design may assume the browser ⇔ one user, or the tab ⇔ the session owner.
4. **One-directional flow:** domain/sessions may not import transport — the revoke→socket-kill edge
   composes at ENTRY (§5.6). Client: the session channel is tier-4 `lib/`, importing nothing above it.
5. **Server truth never rides the client channel.** BroadcastChannel carries SESSION lifecycle and
   durable-local rehydration pokes ONLY — a data payload on it would fork the invalidation seam (§13's
   one-router law).
6. **No new always-on polling.** Freshness stays event-driven; the probe fires on real edges
   (visibility, socket error) with a floor interval.

## 4. The design

### 4.1 The three-class data contract (ratified, now written)

One sentence per class, to be landed in `client-architecture-lockdown.md` §10 (W10):

- **Server truth** lives ONLY in the query cache; its freshness drivers are the buses + the mutation
  XOR + the gap-heals. It is never persisted (no query-cache persister — a persisted query cache is a
  SECOND durable staleness layer and is hereby explicitly banned).
- **Client-ephemeral** state dies with the tab and needs no invalidation.
- **Durable-local** state is device-scoped VIEW/DRAFT state and must satisfy the durable-local
  contract (§4.2): per-user key, total migrate, and referential integrity for any server id it carries.

### 4.2 The durable-local state contract (new law)

1. **Per-user namespacing (D2 fix).** Every persisted key becomes `orb:u/<userId>/<name>` (drafts
   `orb-draft:u/<userId>/<name>`). Stores mint on a boot namespace, and `app-root` — once the viewer
   resolves — calls one `bindDurableLocalToUser(userId)` seam in the store doors (zustand `persist`
   supports `setOptions({name}) + rehydrate()`); a one-time migration adopts legacy un-namespaced blobs
   into the first user bound on that browser, then deletes them. Identity CHANGE (different user logs
   in) keeps the existing hard-reload boundary, which makes rebinding trivial and leak-free.
2. **Referential integrity (D1 fix).** A persisted field carrying server row ids obeys two rules,
   both pure-render (no effects — `no-effect-on-shared-selection` stays intact):
   - **Effective-filter rule:** an entry whose id is unknown to its authority read (for tag filters:
     the cached `trpc.tag` library list, cache-first per §12 row 2) is EXCLUDED from filtering — a
     reference that can never match must never veto rows.
   - **Render-always rule:** an ACTIVE entry always renders its chip — named from the authority read
     when resolvable, else as an explicit "deleted tag" chip — clearable either way. This is the
     existing chip-cap exemption's own law, extended to ids the loaded rows don't carry.
     No auto-prune: visible + inert + clearable makes the state harmless without a write-on-render.
3. **Total migrate stays** (already law in the door) and gains nothing — identity and referential
   validity are handled by 1 and 2, not by smarter migrates.

### 4.3 The cross-tab channel (new)

One tier-4 module, `client/src/lib/session-channel.ts`: a typed BroadcastChannel (`orb:session`)
carrying exactly three message kinds — `signed-out`, `session-recovering`, `session-recovered {userId}`
— plus a `durable-local-written {storeName}` poke that lets sibling tabs `persist.rehydrate()` a store
a peer just wrote (fixing LWW clobber for drafts without syncing state through the channel).
Single-flight is `navigator.locks.request("orb:session-recovery", …)`: one tab runs the recovery ladder
(§4.4); the others await its broadcast verdict. Enforcer (the §12 channel-matrix discipline): a new
gate arm — `new BroadcastChannel` outside `lib/session-channel.ts` is RED (the client twin of G10's
rogue-EventEmitter rule).

### 4.4 The session-freshness protocol (D3 fix — "the most full and proper way", argued)

**What "modern sites" actually do for a first-party cookie BFF** — and what this is NOT: refresh-token
rotation is an OAuth-public-client pattern; orbweaver's DB-backed sliding session with per-request
revalidation is strictly stronger (instant revocation, no bearer artifact to rotate). The modern bar
for THIS shape is: sliding server session (✓ built) + **proactive client freshness check** + **reactive
single-flight, state-preserving recovery** + **cross-tab session sync** + **back-channel logout** (✓
built, A5) + **live socket eviction on revoke**. The missing four are this section.

1. **Sensors (three, all cheap):**
   - the existing QueryCache/MutationCache belt (kept);
   - the subscription path: `use-orb-socket`'s `onError` and the `__subscriptionError` terminal frame
     route an `UNAUTHORIZED` code into the same recovery entry point (W1) — today's toast-only handling
     stays for every other code;
   - a **visibility probe**: on `visibilitychange → visible`, if the last confirmed-fresh timestamp is
     older than a floor (proposal: 5 min — the slide throttle, so a probe also refreshes the cookie),
     `fetchAuthMe()` once. No hidden-tab polling, no data refetch, D54 untouched.
2. **The recovery ladder** (single-flight via §4.3; replaces the bare hard redirect in
   `recoverIfStaleSession`):
   - **Rung 0 — probe.** `GET /api/auth/me`. If `authenticated: true` (single-user/forward-header
     re-admission; or another tab already recovered; or the 401 was a blip): NO navigation — invalidate
     all user roots + the identity triple (`sessions.me` + viewer composites), force-re-announce the
     socket rooms, broadcast `session-recovered`. The warm tab resumes seamlessly. This rung alone
     converts the majority of today's hard reloads into invisible recoveries.
   - **Rung 1 — same-user re-auth, in place.** Cookie modes, `authenticated: false`:
     - `local`: an auth-feature-owned re-auth MODAL (registered via the modal registry like every
       modal) over the frozen shell — password → `/api/auth/login` → on success as the SAME handle:
       rung 0's invalidate-and-resume, no reload. A DIFFERENT handle: hard reload (identity boundary,
       §4.2.1).
     - `oidc`: full-page redirect to the existing OIDC start route with a `sessionStorage` resume
       snapshot (activeSection + active chat id) written first; authentik holding a live IdP session
       makes the round-trip near-silent, and the snapshot restores the surface. (`prompt=none` iframe
       machinery is deliberately NOT proposed — CSP/frame-ancestors friction against authentik for
       marginal gain over the redirect bounce; owner fork F3.)
   - **Rung 2 — signed out.** Interactive login (today's behavior), but broadcast so every tab lands
     once, coordinated, instead of N independent stampedes.
3. **Propagation edges:**
   - Logout (user-initiated or back-channel): server revokes (built) **and evicts the user's live
     sockets** (W7) — surviving devices' sockets reconnect, re-auth with their own still-valid
     cookies, and resume via the existing cell/gap-heal machinery; the revoked device's reconnect 401s
     into the ladder. Eviction is deliberately per-USER, not per-session (owner fork F4): valid
     sessions self-heal in one round-trip, and per-session eviction would require threading a
     sessionId through the Principal mint — D135 territory this design refuses to touch for hygiene.
   - Client-side: logout broadcasts `signed-out` (§4.3) so sibling TABS tear down immediately.
   - **Identity events:** a new user-bus member `identityChanged` emitted by `admin.setRole` /
     `admin.setEnabled` (target-user fan), mapped to invalidate `sessions.me` + the viewer triple —
     closing D5's role-grant gap through the EXISTING bus machinery (E4 ritual, coverage-gated).

### 4.5 Invalidation storm coalescing (D5 fix)

`invalidateFilters` gains a trailing coalescing window (\~250 ms, per filter-key): N same-key
invalidations in a burst collapse to one `invalidateQueries` call. Idempotent by construction
(invalidation is level-triggered, not edge-triggered — the seam's own header calls the calls
fire-and-forget), imperceptible latency, and it turns the import storm into a periodic list refresh.
The dev `[bus]` log keeps logging per-event so instrumentation fidelity survives. Server-side quiet-mode
emits during bulk were considered and rejected (owner fork F5): they special-case one producer while
the client fix contains every storm class, including future ones.

### 4.6 Explicit non-goals (each a rejected alternative, recorded)

- **No refresh tokens / JWT sessions** — weaker than the built model (revocation latency, bearer
  artifacts); "seamless refresh" is delivered by the ladder, not by token machinery.
- **No TanStack query-cache persistence** — it would ADD a durable staleness layer to a system whose
  durable layers are the problem surface.
- **No per-surface staleTime tuning, no `refetchOnWindowFocus` flip** — D54.
- **No data payloads on BroadcastChannel** — server truth has one router (§13 law).
- **No polling** — all sensors are edge-triggered with a floor.

## 5. Implementation game plan (numbered; each item names files · contracts · tests)

> Ordering: W1→W3 are one executor lane (session recovery, client-side); W4+W6 a second (durable-local
> contract); W5 rides W4; W7 is a server lane; W2, W8 are small riders; W9 is FENCED (sibling lane);
> W10 lands with each. Every lane: scoped floor per §L (its own suites + scoped tsc + biome/eslint +
> `check:structure` + knip + depcruise where files move), red-first proofs where a defect is being
> fixed.

- **W1 — route subscription-path 401s into the belt. BUILT 2026-08-14 (lane 1).**
  Files: `packages/client/src/data/bus/use-orb-socket.ts` (both `onError` and the
  `__subscriptionError` frame in `routeFrame`), `packages/client/src/data/stale-session.ts` (export a
  code-based entry `recoverIfUnauthorizedCode(code: string)` beside the error-shape one).
  Contracts: none (the `SubscriptionErrorFrame` already carries `code`,
  `transport/trpc/subscriptions.ts:19-23`).
  Tests: extend `tests/client/data/stale-session.test.ts`; new unit over `routeFrame` proving an
  UNAUTHORIZED terminal frame triggers recovery and a non-auth code still only toasts. **Red-first:**
  assert today's behavior (toast, no recovery) before the change.
- **W2 — visibility probe. BUILT 2026-08-14 (lane 1).**
  Files: new `packages/client/src/data/session-freshness.ts` (module: last-confirmed timestamp, the
  `visibilitychange` listener, the 5-min floor, calls the W3 ladder); mount in
  `packages/client/src/routes/app-root.tsx`.
  Tests: unit with injected clock + visibility stub (fires once past floor; never while hidden; never
  under floor). No CT needed (no rendered surface).
- **W3 — the recovery ladder. BUILT 2026-08-14 (lane 1).**
  Files: `packages/client/src/data/stale-session.ts` (the ladder; keep the one-shot latch semantics per
  ATTEMPT, released on verdict), `packages/client/src/data/invalidation.ts` (add
  `invalidateIdentity()`: `sessions.me` + the viewer-composite keys — NOT in the user-bus map, it has
  no event yet; W7b adds one), `packages/client/src/data/bus/room-registry.ts` (expose a
  `reannounceAll()` — the forced-announce arm `socketLive` already uses), `features/auth` (the local
  re-auth modal: `features/auth/lib/reauth-modal.tsx` + registry row at the door;
  `modal-registry-completeness` co-location rules apply), oidc resume snapshot in
  `features/auth/lib/sso-redirect.ts`.
  Tests: ladder unit (each rung, mode-forked); CT for the modal (open on demand, success path
  invalidates without navigation — assert `location.assign` NOT called); the snapshot round-trip unit.
  **Verification note:** the recovery ladder is exactly the class where a green unit proves little —
  name a live-drive step in the lane report (kill the session server-side via `sessions.revoke`, watch
  a warm tab recover without reload).
- **W4 — session channel + single-flight. BUILT 2026-08-14 (lane 1).**
  Files: new `packages/client/src/lib/session-channel.ts` (typed channel + Web Locks helper; tier-4,
  imports nothing above `#lib`); consumed by `stale-session.ts` (ladder single-flight) and the auth
  feature's logout flow (broadcast `signed-out`).
  Gate: new arm banning `new BroadcastChannel` outside this module (ts-morph, trivial; register per
  `GATE-AUTHORING.md`, with mustFlag/mustPass conformance rows).
  Tests: unit with a fake BroadcastChannel + fake locks (single-flight: two contenders, one ladder
  run, both settle on the broadcast verdict).
- **W5 — referential integrity for the tag filter (the repro fix). BUILT 2026-08-14 (lane 2).**
  Files (as built — see §5b.1 for why they differ from this row's original targets):
  `packages/client/src/features/character/lib/character-library-lens.ts` (`knownTagIds` +
  `effectiveTagFilter`, pure; `tagVocabulary` pins an ACTIVE hidden-on-card tag),
  `character-library-surface.tsx` (the authority read hoisted above the collection, its result narrowing
  the query INPUT and `filtersActive`). `character-filter-chips.tsx` needed nothing: the render-always
  "Deleted tag" arm already shipped with the character-lens merge.
  Tests: `tests/client/features/character/lib/character-library-lens.test.ts` (4 new units) +
  `character-library-surface.ct.tsx` (the poisoned-blob CT, red-first — see §5b.2).
- **W6 — per-user namespacing of durable-local state. BUILT 2026-08-14 (lane 1).**
  Files: `packages/client/src/state/create-persisted-store.ts` + `create-entity-draft-store.ts` (the
  key scheme, the store registry, `bindDurableLocalToUser(userId)`, the legacy-blob adoption);
  `routes/app-root.tsx` (bind once viewer resolves). Check `scripts/check/gates/persistence-boundary.ts`
  for literal key-prefix assumptions (the gate's DEVICE\_LOCAL\_REGISTRY is name-keyed — verify, adjust
  its fixture if it asserts the raw prefix).
  Tests: door units (rebind rehydrates from the user key; legacy adoption moves-then-deletes; two
  users on one storage never read each other's blobs); update any CT that seeds `orb:*` keys directly
  (grep obligation: `tests/**` for `orb:` literals — a coupled-fixture sweep per
  \[\[shared-value-change-owes-a-battery-not-static]]).
- **W7 — server: socket eviction on revoke + the identity event.**
  - **W7a eviction: BUILT 2026-08-14 (lane 2), per-SESSION for logout + per-USER for admin revoke (F4).**
    `transport/trpc/stream/socket-registry.ts` gains a `sessionId` on the cell (stamped by `stream.connect`
    from a new `Context.sessionId`, itself from a new `SeamResult.sessionId` — BESIDE the Principal, never
    on it) plus `evictSession(sessionId)` / `evictUser(userId)`, both firing the existing `onEvicted`.
    Composed at ENTRY: `entry/http/auth-routes.ts` (logout → `evictSession`; back-channel logout →
    `evictUser` per revoked owner) and `entry/compose/admin.ts` (every admin revoke → `evictUser`).
    Tests: `socket-registry.test.ts` (8 units — the two granularities, the sessionless arm, the re-stamp,
    rooms preserved), `socket.test.ts` (the COMPOSED pin: the evicted device's generator completes while
    the sibling device keeps streaming), `auth-routes.test.ts` (5 route pins),
    `entry/compose/services.test.ts` (the admin-revoke wire), `sessions/verbs/revoke.int.test.ts`.
  - **W7b `identityChanged`:** contracts `user-bus` union + types-const member; emit in
    `admin.setRole`/`setEnabled` (target-user fan); map row in `invalidation.ts` → `sessions.me` +
    viewer keys. The FULL E4 ritual (union → map → emit → `user-bus-coverage` green) — the belt makes
    a half-registration RED.
- **W8 — coalescing in the seam.**
  Files: `packages/client/src/data/invalidation.ts` (`invalidateFilters` trailing window per
  filter-key; flush on timer + on `flushSync`-adjacent edges none — keep it simple).
  Tests: unit with fake timers — N same-key calls in-window = one `invalidateQueries`; distinct keys
  independent; the dev log still logs per event.
- **W9 — FENCED (character-ceiling lane, backfill #3) — the interface this design assumes:**
  `character.list` gains server-side `q` (name search) + `starred` params; search-mode runs as its own
  query key WITHOUT `maxPages`; the picker searches server-side or paginates; a batch reverse-read
  `characterIds → resume chatId` replaces the `RESUME_WINDOW` recents scan (named as "a new server
  capability, not this lane's" in the surface's own comment, `character-library-surface.tsx:113-117`).
  Freshness needs nothing new: `charactersChanged`/`chatsChanged` already cover the new reads' roots.
- **W10 — law landings (ride each lane's commit):** the three-class contract + durable-local contract
  into `client-architecture-lockdown.md` (§10/§12 — the session channel is a NEW channel-matrix row
  with its gate as enforcer; §13 gains the "server truth never rides BroadcastChannel" line);
  Spine-Identity gains a §"client session freshness" pointer; a D-ledger entry minting the contract
  (draft clause: *"Durable-local client state is per-user-namespaced and referentially self-healing;
  session recovery is single-flight, state-preserving, and cross-tab-coordinated; server truth rides
  only the SSE bus"*); board rows updated (THEME A → designed, AUTH → designed, character-tab row
  corrected to the bounds class).

## 5a. AS-BUILT deltas — W1·W2·W3·W4·W6 (lane 1, 2026-08-14)

Where the implementation deviated from §5's letter, and why. Each was forced by the tree, not chosen.

1. **The cross-tab `session-recovered` message carries `handle`, not `userId`.** §4.3 specified a userId.
   The recovery ladder's only identity read is `/api/auth/me` (the sole PUBLIC one — `sessions.me` is an
   `authedProcedure` and 401s on exactly the state being recovered from), and it reports `handle`. The
   userId-scoped half of the design lives where a userId genuinely exists: the durable-local rebind, off
   `sessions.me` in `data/use-session-recovery.ts`.
2. **The durable-local key is chosen at MINT time from a boot pointer.** §4.2.1's "stores mint on a boot
   namespace, then rebind" is a flash on every load as written: zustand rehydrates a persisted store
   SYNCHRONOUSLY at module scope, long before any query can name the viewer, so a store minted on a
   placeholder renders defaults until the rebind lands. The door therefore records the last-bound userId
   under one pointer key (`orb:active-user`) and mints against it, so the common case — the same human
   returning — costs zero rehydrates and zero flash; only a genuine identity CHANGE pays one.
3. **The legacy-blob adoption moves through each store's OWN persist storage**, never a raw
   `localStorage` write, so an injected test storage adopts identically and a store on a different
   backend is never bypassed. `packages/client/src/state/durable-local.ts` is on `persistence-boundary`'s
   raw-storage allowlist for the POINTER only.
4. **A storage-less store is skipped, not crashed on.** zustand's `persist` EARLY-RETURNS without ever
   assigning `api.persist` when the resolved storage is falsy (verified in the installed
   `zustand/esm/middleware.mjs`) — a node lane, or a browser that refuses storage. Such a store persists
   nothing, so there is no key to re-key; the alternative was a boot crash on a storage-refusing browser.
5. **The modal body is a `components/` file, not the `lib/*-modal.tsx`.** `useComponentExportOnlyModules`
   requires a module that exports a non-component (the `ModalDefinition`) to export no component, so the
   body lives at `features/auth/components/reauth-form.tsx` — the `accountModal`→`AccountSurface` shape.
6. **The OIDC resume snapshot records ONE field, the open chat id.** The active SECTION already survives
   a bounce on its own (durable-local `orb:shell`), and server truth re-fetches by construction; a second
   restore protocol for a value that already persists would be pure surface. `data/session-resume.ts`.
7. **The "mutations frozen" clause of §4.4 rung 1 is delivered by the DIALOG, not a mutation gate.** The
   re-auth modal is a real dialog over the shell: while it is open no control is reachable, so no mutation
   can be issued against a dead cookie. A cross-cutting freeze flag was considered and rejected — it is a
   flag every future call site has to remember to check, guarding a window the modal already closes.
8. **The `session-channel-boundary` gate ships with the ladder** (Core-Enforcement-Active-Gates.md): `new
   BroadcastChannel` outside `lib/session-channel.ts` is RED, plus a §4.6 blindness tripwire (the home
   loaded and constructing nothing is RED, so a rename cannot turn the fence into a permanent false green).
9. **`invalidateIdentity()` gave `sessions.me` its first freshness driver**, so its
   `query-freshness-coverage` STATIC exemption ("no in-session writer exists to hang a row on") is deleted
   — the gate's own two-sided ratchet demanded it in the same change.

## 5b. AS-BUILT deltas — W5 · W7a (lane 2, 2026-08-14)

1. **W5's file targets in §5 were STALE, and so was §2.1's mechanism.** The row named
   `character-list-view.ts`'s `filterByChips` as the place the AND-veto happens. That function is GONE
   (owner ruling 2026-08-13, recorded in the file's own header): every library lens is a `character.list`
   query PARAM now, so the veto happens in SQL and the fix belongs in the QUERY INPUT, not in a client
   predicate. Same defect, same severity, different seam — the effective filter is computed in
   `character-library-lens.ts` and narrows what the surface ASKS FOR.
2. **The red-first proof, receipted.** The poisoned-blob CT ("a persisted include-filter for a DELETED tag
   does NOT empty the library") FAILED against the pre-fix source — `element(s) not found` for the only row
   in the library — while its sibling control ("a LIVE tag filter still filters") passed in the same run.
   The chip half of the class was already fixed by the character-lens merge; what was still broken, and is
   what the owner's repro actually suffered, was the SILENT VETO.
3. **The authority is the SETTLED read, and an unresolved read passes the blob through.** Treating
   "the tag library has not answered yet" as "no id is known" would drop every LIVE filter on first paint,
   flash the unfiltered library, and re-key the collection query on every boot. So the drop applies only on
   `isSuccess`. The cost is one extra fetch in the poisoned case (the first request still carries the dead
   id, then re-keys) — paid by the broken state, not the healthy one.
4. **A hidden-on-card tag counts as EXISTING.** `knownTagIds` includes it (hiding is a display decision
   about the card, not a claim the tag is gone), so `tagVocabulary` had to be amended to pin an ACTIVE
   hidden tag into the chip row. Otherwise an id that is still narrowing the list would render as
   "Deleted tag" — the invisible-filter defect wearing a label. Known ⟺ named, one authority.
5. **Sweep of the other persisted mints (the §2.1 class obligation), all clear.** Seven
   `createPersistedStore` mints; only `character-library.tagFilter` carries server row ids that VETO.
   `recent-models.bySource` carries model ids but already drops unknown ones at CONSUMPTION
   (`credentials/lib/model-picker-model.ts` `resolveRecentEntries` — the house pattern this generalizes);
   `composer-draft.drafts` is KEYED by chat/draft ids but only ever read BY key, so an orphan is never
   consulted (and the MRU cap bounds it); `shell` (registry section + panel modes), `tag-library`
   (sort mode), `config-group-open` (host-opaque kinds), `home-tile-box` (tile ids) carry no server row ids.
6. **W7a threads the session id BESIDE the Principal, in three hops, and touches no role.** `ValidatedSession`
   gains the `sessionId` the verb already had in hand → `SeamResult.sessionId` (cookie arm only; `null` on
   the owner-fallback and SSO-header arms, which mint no session row) → `Context.sessionId` → the socket
   cell's stamp. D135 is untouched: nothing about `users.role` moved, and no procedure authorizes on the
   session id — its ONE consumer is `evictSession`.
7. **`attach` may NOT re-stamp the cell.** `attach` can mint the cell (order-independent creation) and
   carries no session, so it goes through a create-or-return that leaves the stamp alone; only `connect`
   stamps. Overwriting it there would silently unhook logout from every announcing tab — pinned.
8. **Eviction is a STOP signal, not a state edit.** It fires `onEvicted` and lets the generator's own
   `finally` run the ownership-checked `goDark`; darking the cell from outside would race a takeover and
   corrupt `liveSocketCount`. Rooms are left in place so a still-valid sibling device resumes through the
   existing barrier.
9. **Three verbs now report WHO/WHICH, because the caller cannot know it:** `revokeByToken → SessionId | null`
   (the logout route holds a token, and a token is not an identity), `revoke → UserId | null`, and
   `revokeByExternalId → { revoked, userIds }` (one IdP subject can be bound to more than one row). Each
   `null`/empty case is the already-revoked one, so an idempotent re-revoke evicts nothing.
10. **The single-device admin kick (`admin.revokeSession`) evicts PER USER, as ruled** — even though the
    exact session id is in hand. F4's "admin REVOKE stays per-user" is followed literally: the other devices
    hold valid cookies and resume in one reconnect, and per-user is the only arm that also reaches sockets
    admitted with NO session row (owner fallback / forward-header SSO), which no session id can name.
11. **`PrincipalEnv` had FIVE local re-spellings** (`import.ts`, `auth-meta.ts`, `upload.ts`, `export.ts`,
    `import-tree.ts`) despite `blob.ts`'s docblock claiming it was declared once. Hono's env generic is
    INVARIANT, so adding the `sessionId` var made the app instance unassignable to those registrars: they
    now import the one home. Six `suppressions.baseline.json` rows were hand-ratcheted down (each copy
    carried one `biome-ignore`), rather than regenerated — a full regen on a shared tree would spend other
    lanes' debt.

## 6. Instrumentation directives (confirm the live apportionment before W5/W6 land)

The mechanisms are code-confirmed; ONE live dump apportions the owner's specific repro among them.
At the next occurrence (or on the current FQDN profile, now):

1. `Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith("orb")))` — capture
   `orb:character-library` (`tagFilter` ids, `favoritesOnly`, `showArchived`, `viewMode`).
2. `await fetch("/api/auth/me").then(r => r.json())` — the asker's handle/role vs the identity that
   owns the imported rows (the D2/identity-split discriminator).
3. `window.__orb` query-cache dump for `character.list` keys (row count actually cached) +
   `/api/_debug/stream/sockets` (socket alive?).
4. Server-side: tag ids on the imported rows vs the persisted `tagFilter` ids (one SQL against the
   live db READ-ONLY — never bare `sqlite3` on a live db, \[\[sqlite3-wal-danger-on-live-db]]).
5. Positive control for D1 (CT-able, also the W5 fixture): seed one dead include-id into
   `orb:character-library`, reload → list renders EMPTY with no corresponding chip. Plant, observe,
   remove.

## 7. Owner forks — RULED 2026-08-14 (owner, via question tool, overnight sitting)

> **PREMISE CORRECTION carried into every ruling (owner, verbatim intent):** multi-HUMAN-on-one-box is
> NOT a scenario — one human per box. The binding requirement is ONE user, many tabs, many devices.
> This doc's earlier "multi-human install" phrasing is superseded; the W-items survive re-motivated
> (W6 by db-remint identity splits, W7 by multi-device propagation).

| # | Fork | RULING | Notes |
| - | - | - | - |
| F1 | Durable-local identity scoping (W6) | **(a) per-user key rebind** | as recommended |
| F2 | Local-mode re-auth UX (W3) | **(a) in-app modal, cache preserved** | as recommended; hard redirect survives as rung 2 |
| F3 | OIDC silent path | **(a) redirect bounce + resume snapshot** | taken on this doc's rec as a stated orchestrator assumption (reversible); owner did not rule it directly |
| F4 | Socket eviction granularity (W7a) | **(b) per-SESSION** — logout on the phone must not kill the desktop | ⚠ RULED AGAINST this doc's rec, and honestly: the orchestrator's question framed per-session as recommended (product semantics under the one-human correction) WITHOUT surfacing this doc's cost note — per-session threads a sessionId into the Principal mint (a D135 surface). **CONFIRMED same sitting with the D135 cost explicitly on the table** — per-session stands; admin REVOKE stays per-user (back-channel precedent). |
| F5 | Import-storm containment (W8) | **(b) server quiet-mode bulk emits** (the #23 terminal-fan generalized) | ⚠ RULED AGAINST this doc's rec under the same framing caveat — the doc's counter-argument (a client window contains EVERY storm class, not one producer) was not surfaced in the question. **CONFIRMED same sitting with the every-storm-class counter-argument explicitly on the table** — server quiet-mode stands; a thin client debounce may still ride later as a belt if a non-bulk storm class materializes. |

## 8. Regions not read (scope honesty)

`use-chat-bus.ts`/`chat-event-seq-guard.ts` internals (durable replay mechanics — taken from their own
headers + the lockdown §13 table; nothing in this design touches them), the OIDC route handlers'
bodies (`entry/http/auth-routes.ts` read in part: cookie serialization + structure; the oidc start/callback
internals are W3-implementation reading), `infra/auth/modes/*` bodies, the workloads engine internals,
and `docs/architecture/core/UI-Architecture-and-Layout.md` beyond its header (layout law — not this
lane's surface). None of these can change the diagnosis mechanics receipted above; each is named where
its lane must read it.
