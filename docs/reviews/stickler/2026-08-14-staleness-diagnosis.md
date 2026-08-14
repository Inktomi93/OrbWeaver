---
kind: review
status: active
updated: 2026-08-14
---

# Stickler — staleness + session-freshness diagnosis (condensed defect list)

> LANE B, overnight 2026-08-13→14. Full diagnosis + design + game plan:
> [`docs/design/staleness-and-session-freshness.md`](../../design/staleness-and-session-freshness.md)
> (work items W1–W10 referenced below). Every finding is CONFIRMED in code this session; the live-drive
> apportionment probes are §6 of the design doc. Severity = consequence.

## Findings

1. **P1 — Invisible dead-id tag filter empties the character library; unclearable without nuking
   localStorage.** `orb:character-library.tagFilter` persists raw `TagId`s with no existence check
   (`packages/client/src/state/character-library-store.ts:68-88` — `castId`, shape-only migrate);
   include-entries AND-veto every row (`features/character/lib/character-list-view.ts:44-53`); the
   chip for an id on zero LOADED rows cannot render (`character-library-surface.tsx:123` →
   `tagVocabulary(items)`; `character-filter-chips.tsx:93`), violating that file's own header law
   ("a filter you cannot see is a filter you cannot turn off", `character-filter-chips.tsx:12-14`).
   Scenario: import/db-remint changes tag ids → persisted include-id matches nothing → empty list,
   reload-proof, no visible cause. The strongest single explanation of the owner's
   delete-localStorage repro. Fix: design §4.2.2 / W5 (effective-filter + render-always rules).
2. **P1 — Durable-local state is origin-scoped, not user-scoped: cross-ACCOUNT leak on a multi-human
   install.** All `orb:*` / `orb-draft:*` keys carry no user and no rehydrate identity check
   (`state/create-persisted-store.ts:47`, `create-entity-draft-store.ts:46`). User A's filters, view
   state, and DRAFT PROSE (composer/entity drafts) rehydrate into user B's session on the same
   browser; no event can ever invalidate another identity's blob. Also the identity-split arm of the
   repro's cookies leg (\[\[per-user-scoped-empty-is-about-the-asker]]). Fix: §4.2.1 / W6
   (per-user namespacing + bind-on-viewer + legacy adoption).
3. **P1 — A dead session is silently tolerated in a warm tab (the AUTH row, mechanism named).** The
   only session sensors are QueryCache/MutationCache `onError` (`data/query-client.ts:63-73`); with
   the D54 pins (`staleTime: Infinity`, no focus refetch) a warm tab issues no such calls, and the
   SSE path's UNAUTHORIZED is toast-only — `use-orb-socket.ts:90-92` and `use-user-bus.ts:55-57`
   never reach `recoverIfStaleSession` (`data/stale-session.ts:32-41`). Result: cached UI renders
   indefinitely on a revoked/expired session; the death signal the client DOES receive (subscription
   reconnect 401s) is discarded. Fix: W1 (route the code) + W2 (visibility probe) + W3 (ladder).
4. **P2 — Session recovery is state-destroying and uncoordinated.** `location.assign("/login")` per
   tab, no cross-tab single-flight, no resume snapshot, and a pure waste under
   single-user/forward-header where the next request re-admits anyway (`stale-session.ts:39-40`;
   fallback re-admission `infra/auth/dispatch.ts:47-52`). Fix: W3 ladder (probe-first, rung 0 resumes
   without navigation) + W4 (BroadcastChannel + Web Locks; two-method absence receipt: zero
   BroadcastChannel/storage-listener/locks usage in `packages/client/src`, ast-grep
   scannedFileCount=429 ts + 502 tsx with positive control, plus literal grep).
5. **P2 — No propagation on logout/revoke: live sockets outlive the session, sibling tabs/devices
   never hear it.** `stream.connect` freezes the Principal for the connection's life
   (`transport/trpc/routers/stream.ts:35-66`); the socket registry has no eviction-by-user
   (`stream/socket-registry.ts` — whole-file read); logout revokes the row only
   (`entry/http/auth-routes.ts`). A revoked device streams until natural death; other tabs render
   warm cache until a call happens to fail. Fix: W7a (`evictUser` composed at ENTRY — the cake
   holds) + W4 (`signed-out` broadcast).
6. **P2 — No user-bus member covers identity reads: a role grant never reaches a live client.**
   `USER_BUS_FILTERS` has no arm invalidating `sessions.me`/the viewer triple
   (`data/invalidation.ts:202-283`, map inspected member-by-member); `admin.setRole`/`setEnabled`
   fan nothing to the target. Server-side authority is correct next-request; the client's
   admin-gated UI (settings panes `when`) stays stale until reload. Fix: W7b (`identityChanged`
   member, full E4 ritual under the existing coverage belts).
7. **P2 — BOUNDS, not staleness (board-row correction): the character tab's missing characters are a
   windowing class.** `maxPages: 5` × `library.pageSize` (default 30 — `contracts/settings/index.ts:
   649-654`) with `getPreviousPageParam: () => undefined` makes evicted head pages UNRECOVERABLE
   (`character-library-surface.tsx:57,67-80`); search/favorites/tag-chips are client-side over the
   loaded window only (`:122-124`; `character.list` has no search param —
   `transport/trpc/routers/character.ts:36-55`); the new-chat picker is a single `limit: 100` page
   (`components/character-picker.tsx:29,97`). The board's `RESUME_WINDOW=100` hypothesis names the
   wrong constant — it bounds only the Chat-CTA resume map (`character-library-surface.tsx:60,118`).
   FENCED to backfill lane #3; the interface the freshness design assumes is design §5.9.
8. **P3 — Bulk-import invalidation storm.** One `charactersChanged` per created card
   (`domain/character/verbs/create.ts:116`) → per-event path-invalidation → cancel-and-restart
   refetch churn on the open library for the whole import (the seam's own measured note,
   `data/invalidation.ts:57-60`). Correctness settles via the #23 terminal fan
   (`entry/compose/portability-runner.ts:226-229`; `domain/import/workload-contributions.ts:43,
   150-152`) — the cost is churn during exactly the owner's repro window. Fix: W8 (seam coalescing).

## Verified clean (silence coverage)

- **Import freshness wiring is complete:** import writes ride the emitting domain verbs
  (`build-import-context.ts:94-101` → `CharacterService.create`; sibling domains' import verbs all
  carry `emitUserEvent`, grep receipt) + the terminal `emitLibraryChanged` fan. The repro is NOT a
  missing-event bug.
- **TanStack layer:** in-memory only (no persister — grep zero), bus-driven model sound, heal sets
  DERIVED from the maps (`invalidation.ts:325-345`), BOOT-4X gap-heal gating intact
  (`room-registry.ts:229-240`). Cannot be the reload-resistant stale thing.
- **Blob/HTTP cache:** content-addressed ids + `Cache-Control: private, immutable`
  (`entry/http/blob.ts:20-21,139`).
- **Server session model:** validate-per-request with slide + cookie Max-Age refresh
  (`domain/sessions/verbs/validate.ts:14-33`, `entry/app.ts:175-195`, 30d/5min
  `tokens/tokens.ts:18-21`) — right shape; the defects are client detection/recovery + propagation.
- **Prior-law check:** no D-entry or Core-0 partition row owns this territory; D54/D118/D135/#23/#23b
  bind and are honored (design §"prior-law check").

## Unconfirmed, low priority

- Which mechanism(s) the owner's specific repro apportion to (D1 vs D2 vs both) — code-confirmed
  mechanisms, live dump pending (design §6 probes).
- Whether any image path uses a mutable (non-content-addressed) URL — none found, not exhaustively
  swept (design §6.4 note).
- `persistence-boundary` gate's tolerance of the W6 key-scheme change — named as a W6 check
  obligation, not verified this session.
