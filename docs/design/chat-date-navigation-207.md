---
kind: design
status: active
updated: 2026-08-20
---

# Chat date navigation — displayed-recency lens

## Re-verified premises

The chat library already had the correct large-list machinery: `useChatListCollection` owns one TanStack infinite query (`packages/client/src/features/chat/hooks/use-chat-list-collection.ts:46`), and `ChatRows` renders those pages through the sealed `VirtualList` (`packages/client/src/features/chat/surfaces/chat-list-surface.tsx:405`). At the pinned foundation, the missing operation was navigation, not another list implementation: old rows were reached only through the virtual-list end-approach callback (retained at `packages/client/src/features/chat/surfaces/chat-list-surface.tsx:414`), while the client query exposed only character and search axes.

The server already has one displayed-recency expression, `coalesce(newest selected-message time, chat updated time)` (`packages/server/src/domain/chat/persistence/queries.ts:378`), and a deterministic descending keyset over `(recencyAt, id)` (`packages/server/src/domain/chat/persistence/queries.ts:395`). D18 membership and every existing visibility/filter predicate share `memberChatScope` (`packages/server/src/domain/chat/persistence/queries.ts:333`), which is also shared by the page and census reads (`packages/server/src/domain/chat/persistence/queries.ts:405`, `packages/server/src/domain/chat/persistence/queries.ts:419`). The new lens belongs in that scope.

An AST property-read sweep over 3,745 tracked TypeScript files and 1,124 tracked TSX files found no dot, optional-chain, or bracket read of `beforeRecencyAt`; a literal `rg` sweep over `packages/` and `tests/` also found none. Positive-control sweeps found 34 server TypeScript and 15 client TSX `.search` reads, so both language scans were live.

## Chosen architecture

`beforeRecencyAt?: number` is the one explicit wire/domain/persistence lens. Its semantics are an **exclusive upper bound on the displayed-recency clock**. The persistence scope adds `chatRecencySql(db) < beforeRecencyAt`; the existing descending `(recencyAt, id)` keyset remains unchanged inside that bounded set. Exact-boundary rows are excluded, tied rows below the boundary retain the `id DESC` tie-break, and `countMemberChats` sees the identical bound.

The UI exposes a native, labelled month input. A selected `YYYY-MM` becomes the first UTC instant of the following month, so selecting March includes all displayed recencies in March without a locale-dependent local-midnight edge. The selected month remains visible as an active scope until cleared. Native month editing provides the segmented keyboard contract; a real button provides a keyboard- and pointer-reachable clear path. Both use house `Field`/`Input`/`Button` primitives and semantic tokens, so the control inherits light/dark themes, density, coarse-pointer tap floors, and remains outside all five immersive transcript-style branches.

The month-derived bound joins `characterId` and debounced `search` in `useChatListCollection`'s query input. TanStack therefore gives each date scope its own infinite-query key and cannot append new-date pages to old-date pages. `VirtualList` is keyed by the bound so a date change remounts only the existing virtualizer and lands at scroll-top; no paging, cache, row, or virtualization subsystem is replaced.

The unfiltered face-strip query stays unbounded. It is the escape/selection affordance above the scoped collection, not a consumer of the date lens. Empty and no-search-results copy names the active month scope and offers the relevant clear action, so the date lens cannot create a dead-end or make a whole-library claim about a bounded result.

## Rejected alternatives

1. **Client-side date filtering.** Rejected because a client predicate can inspect only fetched pages, lies about empty results, and recreates the exact pre-paging search/projection defect.
2. **A parallel calendar/index browser.** Rejected because it duplicates list state, membership/filter semantics, and navigation. The existing collection needs one contract field and one control.
3. **Offset paging or a synthetic cursor.** Rejected because offsets drift under writes and a fabricated `(timestamp, id)` cursor cannot express “newest row before this time” without sentinel-id policy. A scope bound followed by the existing first-page query is exact.
4. **An inclusive `atOrBefore` bound.** Rejected because the month UI naturally supplies the first instant of the following month. An exclusive bound makes exact boundary behavior unambiguous and composes directly with SQL `lt`.
5. **Evicting cached pages or replacing virtualization.** Rejected because virtualized DOM cost is already bounded and the no-eviction ruling protects scroll-back. Query-key isolation plus a virtualizer remount resets only the changed lens.

## Coupled-site inventory

- Domain contract and verb: `ListChatsParams`, verb destructuring, shared filter object, page and census calls.
- Persistence: `MemberChatFilter` and `memberChatScope`; the cursor and ordering stay byte-for-byte on `(recencyAt, id)`.
- Transport: tRPC input validation and forwarding.
- Client data: collection params and infinite-query input.
- Client surface: month state/boundary conversion, labelled control/clear action, scoped empty states, keyed virtual list.
- Server behavioral tests: tied timestamps, exclusive boundary, archive/character/search composition, census agreement, router validation/forwarding.
- Client CT: date request, page reset, scroll-top old-row landing, keyboard clear path, coarse-pointer tap floor.
- Shared-value checks: `beforeRecencyAt` literal sweep across `tests/`, both server and client program imports, and the root all-three-program typecheck.

## Red-first and verification plan

Red-first server tests will fail because the contract does not accept the field, the router strips it, and persistence does not bound recency. They will assert an exact-boundary exclusion, complete traversal of tied rows below it, and one result surviving the combined membership/archive/character/search/date scope with the same `totalCount`.

Red-first CT will fail because no labelled month control or dated request exists. Its planted control first loads more than one latest page, then changes the month and asserts that a matching old row lands without a deep wheel walk while the previously loaded page is gone. It also clears the scope with keyboard activation and asserts the native input plus clear button meet the resolved coarse-pointer target token.

The behavioral tier is the focused chat read integration suite, focused chat router unit suite, and focused chat-list component suite. Graduation also runs the three TypeScript programs; touched Biome/ESLint; docs formatting/catalog after the implementation commit; structure, knip, and dependency-cruiser because a transport field crosses package boundaries; and both TS/TSX AST plus literal coupled-site sweeps with scanned counts. A later side-eye pass must live-drive narrow/wide panes in light and dark, exercise the five transcript appearance presets for non-interference, and verify keyboard/focus and coarse-pointer containment; this lane does not self-graduate visible UX.

## Forks

No owner-sacred prose, persona, or push-word decision is required. No architecture fork remains: D18, the displayed-recency clock, the existing keyset, and the collection/virtual-list laws all select the same narrow lens.
