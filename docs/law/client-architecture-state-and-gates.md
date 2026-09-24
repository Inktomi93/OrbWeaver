---
kind: law
status: active
updated: 2026-09-23
---

# Client architecture: state, data, error handling, sync spine and the gate spec

Split off [client-architecture-lockdown.md](client-architecture-lockdown.md) for the 48 KiB law cap; same precedence and audience as that doc's header.

## 9. The state model (partitioned commons)

- **Partition, not scatter, is the anti-god move.** `state/` holds small stores, the three store factory
  doors (plus `create-drill-selection-store.ts`, itself minted through a gated door), `chat-handle.ts`,
  `assemble-chrome.ts` (D73), and the registry tier. Every total or contributor registry is countable off the
  door's `createRegistry(`/`createContributorRegistry(` call sites in `compose/authed-app.tsx`, which G8
  pins to `main.tsx` or a `compose/` module and nowhere else. A registry delivered through React context
  carries a `*-registry-context.ts` + `*-registry-provider.tsx` pair (minted via
  `lib/create-registry-context.tsx`, gate `registry-context-via-mint`); one whose Def type is state-owned
  adds the `*-registry.ts` contract module beside it. Every store is minted through exactly one of the
  three doors — bare zustand `create(`/`createStore(` exists only inside them: `createGatedStore`
  (devtools, required action labels, unique-name throw), `createPersistedStore` (version, partialize,
  total migrate), `createEntityDraftStore` (frozen empty, `useShallow`, persist). Gates: `state-files`,
  `persist-partialize-and-total-migrate`, `no-raw-zustand-persist`, both selector-stability guards, the
  ESLint static-`setState` ban, `persistence-boundary` (device-local vs synced).
- **`shell-store` is one drawer for cross-cutting shell state** (activeSection, panelOverrides, openModal,
  contextTab, openOverlayPanel) — features read via narrow hooks, write via intent-named module actions;
  the handle never escapes the file. `openConfigTo` (§8) is the one settings navigation verb.
- **Feature-transient stores are feature-owned but centrally homed** (`character-selection-store`,
  `corpus-selection-store`, …) so a pointer another feature must read is never trapped behind a feature
  boundary. Durability criterion: per-device transient state gets a store; anything that must survive
  across devices is server state.
- **The write/read discipline is §5.1** (writers only write; three render-only reader shapes;
  `no-effect-on-shared-selection` gates the banned subscribe-and-effect).

## 10. The data/ tier — the whole surface, not just the factories

- **`trpc.ts`** — the typed client + `useTRPC`; queryKeys are 100% proxy-derived (`no-array-literal-querykey`, LIVE).
- **`query-client.ts`** — the §6.1 QueryClient pins have ONE home here (verified header): `staleTime: Infinity` (the bus drives freshness — never `'static'`), `refetchOnReconnect: true` (SSE-gap catch-up), `refetchOnWindowFocus: false`, mutations `retry: 0`, global error toasts via `QueryCache`/`MutationCache` `onError` reading `meta.errorToast`. Do not re-tune these per-surface.
- **The HTTP-route fetch-fn pattern:** endpoints that are Hono routes, not tRPC (multipart/binary), get ONE `data/` fetch fn each — `upload-asset.ts` (the one client seam for persisting a picked file), `import-tree.ts` (folder import → `202 {workloadId}`), `import-bundle.ts`, `import-characters.ts`, sharing `http-error.ts` (`throwHttpError`) + the `CSRF_HEADER`. Rule: tRPC for everything except multipart/binary/streaming-HTTP; an HTTP route consumed anywhere gets a `data/` fetch fn — a feature never hand-writes `fetch()` (R5).
- **One canonical "who am I" composer** owns identity: it composes the already-cached `sessions.me` + settings + persona-list reads so every caller dedupes on the shared cache. A scattered `trpc.sessions.me` read for identity is the wrong move (the settings host's plain role read is the sanctioned exception class: a non-suspense probe that must never block its shell).
- **The rest:** `invalidation.ts` (§13.5) · `query-error-state.tsx` (§11) · `bus/` (§13) · `skeleton-rows.tsx` (shape-matched loading rows) · `use-gated-query.ts` (`skipToken` — kills `castId("")`).

### 10a. The three-class data contract + the durable-local contract (D138)

Every piece of client state is exactly one of three classes — the blunt "cross-feature → trpc" rule in
§12 is this contract's corollary, not a separate rule:

- **Server truth** lives ONLY in the query cache; freshness rides the buses (§13) + the mutation XOR +
  the gap-heals. Never persisted — a query-cache persister would be a second durable staleness layer, and
  is banned.
- **Client-ephemeral** state dies with the tab; needs no invalidation. Home: §12 row 1 (`state/*`).
- **Durable-local** state is device-scoped VIEW/DRAFT state and MUST satisfy the durable-local contract:
  1. **Per-user namespacing.** Every persisted key is `orb:u/<userId>/<name>` (drafts
     `orb-draft:u/<userId>/<name>`); `state/create-persisted-store.ts` mints against a boot pointer
     (`orb:active-user`) and `bindDurableLocalToUser(userId)` rebinds once the viewer resolves, adopting
     any legacy un-namespaced blob into the first bound user then deleting it. A genuine identity CHANGE
     keeps the existing hard-reload boundary; a merely STALE session recovers in place instead
     (`data/stale-session.ts`).
  2. **Referential integrity for any server row id a persisted field carries** — two pure-render rules
     (no effects; `no-effect-on-shared-selection` stays intact): an id unknown to its authority read is
     EXCLUDED from filtering (a dead reference can never veto rows), and an ACTIVE entry always renders
     its chip (named when resolvable, else an explicit "deleted" chip, clearable either way) — no
     auto-prune, no write-on-render.
  3. **Total migrate** (pre-existing law) stays; identity/referential validity are 1 and 2's job, not a
     smarter migrate.

Enforcer: `persistence-boundary` (raw-storage-outside-the-doors guard, §9) plus `state-files`/
`persist-partialize-and-total-migrate`. Design of record + the as-built deltas (why store rebind reads a
boot pointer rather than minting fresh, why legacy adoption goes through each store's own persist
storage): D138.

## 11. The error-handling battery + the three-states law

The stack, outermost-in:

1. **`AppErrorBoundary`** (`lib/error-boundary.tsx`) — the app-level render-throw catch. No retry (a stale state that threw once will throw again); fallback offers reload only. Wired once in `main.tsx` with `onError: reportClientError`.
2. **`reportClientError`** (`lib/client-error-report.ts`) — fire-and-forget telemetry via `trpcClient.clientError.mutate`; a failed report must never itself throw.
3. **`QueryBoundary`** (`components/query-boundary.tsx`) — the per-surface suspense + error battery. It bakes the `QueryErrorResetBoundary` → error-boundary `onReset` handshake: without it, "Try again" re-renders while the query is still errored and throws again; `retry` resets both so the refetch is real. Every suspending read mounts inside one.
4. **`QueryErrorState`** (`data/query-error-state.tsx`) — the one read-error block (muted label + Retry wired to the handshake's `retry`).
5. **Toasts** — mutation failures surface via `meta.errorToast` → the global `MutationCache.onError` → `notify`. One error slot per mutation (`no-multiplexed-mutation-error`).

**The three-states law:** every surface ships all three designed states — empty teaches (an `EmptyState`
with an action — `empty-state-has-action`), loading is a shape-matched skeleton (never a centered
spinner, never layout shift on arrival), error is `QueryErrorState` with a real retry.

## 12. Inter-feature communication — the channel matrix

The blunt rule "cross-feature reads → trpc" is wrong for client-ephemeral state (there is no row to fetch). This matrix is the law; each row carries its home and its enforcer. A `trpc.*` read is cache-first — TanStack Query dedupes and caches per key, so reading another feature's server entity (a persona's name while the persona list is loaded) is a cache hit, not a network round-trip; `staleTime: Infinity` plus the bus means it refetches only on invalidation. The anti-pattern is only using trpc for ephemeral client state, or a store for server rows.

Twelve rows, one per mechanism that exists on the tree, each with its home, its enforcer, and the one
question that selects it.

| # | Channel | Home | Enforced by | When it is the choice |
| - | - | - | - | - |
| 1 | state commons — narrow hooks + intent-named module actions | `state/*` | `state-files`, both selector guards, `no-effect-on-shared-selection`, `client-state-below-data` | client-ephemeral cross-cutting state: selection, panel modes, drafts, filters |
| 2 | tRPC query cache, cache-first | `trpc.*` queryOptions; `staleTime: Infinity` + bus freshness | `no-array-literal-querykey`, `no-static-staletime`, G9 seals | another feature's server-persisted entity — the router IS the cross-feature contract (D43(3)) |
| 2b | `peekQueryData` — hookless sync cache peek | `data/peek-query.ts` | its own header law + `client-cache-surgery-only-in-data` | a pure resolve-time predicate that cannot run a hook — never a substitute for a hook read |
| 2c | door-injected `trpcProxy` into a contributor factory | `main.tsx` `createTrpcProxy(trpcClient, queryClient)` | convention + the door's comments | a contributor whose `when`/resolve logic needs the cache outside render |
| 3 | total registries (closed vocabulary, tsc-total) | sections · modals · config-groups | G1/G2/G4/G8/G13 + the `Record<Id, Def>` assembly | a member of a closed shell vocabulary |
| 4 | contributor registries (open) | chrome · settings-sections · chat-context tabs · chat-context regions · chat-surface anchors · tool-renderers · message-tools-renderers · slash-commands · character-detail · home-tiles, assembled in `main.tsx` | G3 · G8 · the matching `*-registry-completeness` gate (settings-sections: `settings-section-anchored` + the door's `assertSettingsKeyPartition`) · duplicate-id throws at mint | a foreign feature extending a host surface — the graft channel |
| 5 | door-threaded render-prop projection | `makeCharactersSection(characterDetailContributors, (view) => …)` | `section-factory-contribution-bundle` (the arity wall: >1 render-prop or >1 `ContributorRegistry` param is RED) + `client-features-no-cross` | one foreign pane projected into a host, host controls placement; ≥2 foreign panes mint a contribution seam instead |
| 6 | shared derivations at tier 4 | a pure predicate/vocabulary module in `lib/` | `client-lib-floor`, `client-lib-below-components` | one pure predicate/vocabulary both sides must agree on |
| 7 | tier-2 composites | `components/` | G5 trio, G6/G7 | domain-aware UI ≥2 features need |
| 8 | event/sync spine → one invalidation seam | `data/bus/*` + `data/invalidation.ts` | `bus-producer-coverage`, G10/G11/G12, `no-inline-invalidate-outside-seam`, `bus-on-data-no-store-write` | server truth changed; freshness fan-out (§13) |
| 9 | editor-bridge | `forms/create-form-handle-bridge.ts` | intra-feature only, by its own header | a feature's own content ↔ its own context inspector — not an inter-feature channel |
| 10 | type-only cross-feature imports | `@orb/contracts` shapes | `client-features-no-cross`'s `dependencyTypesNot: ["type-only"]` | a shape wired at the composition root |
| 11 | readiness + agent observer split | `lib/app-ready-signal.ts` + dev-only `lib/agent-bridge.ts` and composition-tier handles (§3) | `agent-bridge-lock` + `client-composition-tier-door-only` | one shared readiness state; tooling never enters the production boot graph |
| 12 | session channel — typed cross-tab BroadcastChannel + Web Locks single-flight | `lib/session-channel.ts` (imports nothing above `#lib`) | `session-channel-boundary` | session lifecycle coordination across tabs/devices, or a durable-local rehydrate poke — never a server-truth payload |

Cross-section navigation is row 1; shared domain-agnostic parts are `@orb/ui` (§3), not a cross-feature
seam.

A cross-feature read never mirrors server rows into a store, never round-trips trpc for a client-ephemeral
pointer, and never bypasses a registry with a parallel map or a rogue event channel.

**The tier-4 bar for `lib/`** is "cross-cutting seam, reaches up to nothing": dev/observability modules
stay observer-shaped with zero feature imports; display/util seams and shared-vocabulary modules stay
pure. `client-lib-floor` plus G5's lib→components / components→features cases keep a disguised
feature-to-feature coupling from forming here.

## 13. The event/sync spine (multi-tab · multi-device · multi-human)

The same disease-class as the slot registries, highest stakes: a mis-wired or under-fanned event means two humans (or two of one person's devices) seeing different truth. Inventory — chat · user · notifications · rpg · automation, on three deliberate durability tiers:

| Bus | Scope | Durability | Producer gate |
| - | - | - | - |
| chat | per-chat, member-scoped | **durable-first**: `emit` awaits the `chat_events` INSERT (assigns `seq`) before the ring push; 256-entry ring + durable replay, member-gated; `on()` pre-buffers so the replay/live gap dedupes by `seq` | `bus-producer-coverage` |
| user | per-person, all devices | **live-only, fire-and-forget by design** — gap-heal = `invalidateAllUserRoots()` on every connect/reconnect | `bus-producer-coverage`; every declared member has a producer |
| notifications | per-person durable inbox | **durable-first**: entry composes the INSERT before `publishNotification` | none (rides the inbox contract) |
| rpg | per-chat game state | **live-only, self-healing** — a domain-minted `EventEmitter` singleton; a verb publishes AFTER its durable write; the client blanket-invalidates on every (re)connect | `bus-producer-coverage` |
| automation | per-chat, over the `domain/automation` `notify` sink | **transient by design** — rides `defineBusChannel`; the `automation` room (`transport/trpc/stream/sources/automation.ts`) tails it rather than a standalone subscription | none |

Presence rides none of these buses: it is process-local, and single-replica is the current stance.

Every client-side apply is a pure switch ending `assertNever` or an exhaustive mapped-type Record — a new
member fails tsc. Plus `presence-registry.ts`: presence is a ref-count per userId over open SSE
connections plus a 15s grace window — server-derived, never a client-asserted heartbeat.

**The laws (each names its enforcer; gates in §16):**

1. **Durable-first, fan-out-second** for any bus carrying truth someone can miss: the durable INSERT assigns `seq` before the live publish; resume/replay reads the durable log. `tests/server/domain/chat/bus.int.test.ts` and `bus-golden.suite.int.test.ts` pin it.
2. **Fan scope follows visibility.** A shared-chat event fans to every present member's every device; a per-person event fans to all that person's connected devices. An event mutating state visible to others must fan beyond the actor. `server/src/entry/compose/emit-chat-changed.ts` derives its recipients from the live roster (present, kind `human`, not yet left) plus any pre-captured `extraUserIds` (a member removed in the same request) — never a non-member. Enforcers: G12 mechanically for membership-scoped domains; R3 for new visibility classes.
3. **Consumer exhaustiveness is compile-time.** Every bus union ends in `assertNever` or a mapped-type-total Record on the client.
4. **Producer coverage is ratcheted (D50/D108).** Every declared event type has a real server emit site; an owner deferral is typed warning-debt with a work item, and reds the day the member gains a producer.
5. **One client-side event→cache router.** `data/invalidation.ts` is the one seam for every client-consumed bus; a new bus's client half must land in this same file, and G11 checks it. `no-inline-invalidate-outside-seam` gates every other `.invalidateQueries`; `bus-on-data-no-store-write` keeps `onData` from becoming a second store.
6. **Presence is server-derived only.** A client-asserted presence write is banned — the contract declares no inbound presence schema. The read discloses one bit per asked user id through the single gating seam `transport/trpc/presence-disclosure.ts` — any authenticated caller may ask about any user id in v1, with no per-room membership filter; tightening the audience touches that file plus its one call site. A client read exists at `trpc.notifications.presence`.
7. **Server truth never rides BroadcastChannel (D138).** The session channel (§12 row 12) carries session lifecycle plus durable-local rehydration pokes only. Enforcer: `session-channel-boundary`.
8. **A delete announces after the row is gone.** Pick the order by the plane the event rides: live-only (run `DELETE … RETURNING` first, then emit once per returned row — an emit before a conditional delete can announce a row that survives); durable (write an event row that has an FK to the deleted row before the delete, because the cascade removes it); a junction the delete cascades or nulls (resolve the audience before the delete, then fan after — `entry/compose/room-reach.ts` gives this snapshot-then-fan op). Read any value the emit needs before the delete, and do not nest that read in a later branch the delete's own result can skip. Keep the fan unconditional over the returned rows. Homes: `packages/server/src/domain/chat/verbs/chat-lifecycle.ts`, `packages/server/src/domain/refinery/verbs/delete-session.ts`.

**The transport unification.** `chat-events-bus.ts`, `user-events-bus.ts`, `notifications-bus.ts` each
compose the one `defineBusChannel` primitive: `defineBusChannel<Key, Event>(channelFor, opts?: {
firehose: true })` (home `server/src/transport/trpc/bus-channel.ts`) rather than hand-rolling an
`EventEmitter`; durability stays per-bus policy composed in front of `publish`. The `{firehose: true}`
overload returns a bus with an extra `subscribeAll` — only chat declares it; calling it on user or
notifications is a compile error. G10 seals it: `new EventEmitter()` under `transport/` outside
`bus-channel.ts` is RED.

## 14. The reuse-primitive law — gate what §13 already says

- **Rows.** An entity-in-a-list row is `@orb/ui/list-row` or the tier-2 `LibraryRow` (the gate accepts both). In list-region surface files, a `.map()` callback returning interactive JSX not rooted in one of these or an allowlisted composite is RED (G6). Filename `*-row.tsx` is not the predicate — message anatomy, facet rows, and `setting-row`/`Field` rows are different species; residual anatomy judgment is R1.
- **Destructive confirms.** `ConfirmDialog` is the only feature-tier confirm. `features/**` importing `@orb/ui/alert-dialog` is RED (G7).
- **Mutations.** Importing `useMutation` from `@tanstack/react-query` outside `data/` is RED — a hard seal, no ratchet (G9).
- **Browse.** `createCollectionSurface` owns unbounded/paginated browse; `useInfiniteQuery` appears only inside the factory (G9). A small bounded owner list fetched whole in one `useSuspenseQuery` legally uses `LibrarySurfaceShell` + `LibraryListLayout` (tier 2) instead — the boundary is the query shape, paginated implies the factory.
- **Forms / virtualization / charts / markdown** — `form-factory-for-multifield`, `no-direct-useform`, `no-form-reset-in-autosave`, resolver physics, `ui-satellite-seals`.

## 15. Doc↔code precedence

Code is truth for shape; this doc is truth for the rule and the why. Every field list in §5/§6a/§6b/§8 is
illustrative, not exhaustive — read the current, complete shape off its code header:

| Shape | The law lives at |
| - | - |
| `SectionDefinition` · `RailEntry` · `SectionPlaceholderCopy` · `SectionPanelAvailability` | `client/src/state/section-registry.ts` |
| `ContextDefinition` · `ContextTabDef<S>` · `ResolvedContextTab(s)` · `ContextRegionDef<S>` · `ContextRegionView` · every published `S` projection | `client/src/lib/registry-contracts.ts` (path is critical — G3 case 3 resolves projections against it) |
| `ConfigGroupDefinition` · `SettingsViewerView` | `client/src/state/config-group-registry.ts` |

What is fixed law regardless of the sketch's exact fields: the non-generic shell seam, the
`defineContextTabs<S>` mint as the only tabs minter, `S` contravariant-only, and `{kind:"none"}` /
`{planned}` as explicit decisions rather than absences.

**The `.shell-panel-header` band clause.** "The band always renders" holds for the list panel and for a
`single`/`none` context panel. A `kind:"tabs"` context panel renders no shell band in any mode:
`SectionContextHeader` returns null and shell.css collapses the empty band element; the context bracket
owns the pane's head — its band slot (the section's `header` or a claimant's band), the 2px ember
content↔context binding it paints itself from the primary token, and, while the pane floats, its own
dismiss inside the band's corner.

## 16. THE GATE SPEC

The gate is the wall; prose is the why. Every ts-morph gate lands as a `tooling/src/verify/gates/*.ts`
descriptor (loader-discovered, `mustFlag`/`mustPass` self-tested per the house contract). Review-only rows
state why machine-checking fails and carry the exact checklist.

| # | Gate | Mechanism | RED condition |
| - | - | - | - |
| G1 | `section-registry-completeness` | ts-morph | a `SECTION_IDS` member with no `SectionDefinition` in the door assembly; a definition not co-located under a feature (`features/*/lib/*-section.*`); two definitions for one id; a planned case with an empty reason, or one that also wires a real body — any `context` initializer that is not the literal `{ kind: "none" }`, including a `defineContextTabs(…)` call, counts as a real body; an anti-god-map case (a `sections={{…}}`/`modals={{…}}` map in `routes/**`, or a feature front-door import outside the two sanctioned composition seams). |
| G2 | `no-parallel-section-map` | ts-morph | an object literal / `Record<Id, …>` type / array whose keys or `id` members cover ≥2 members of `SectionId`/`ModalSlotId`/`ConfigGroupId`, outside the allowlist {the vocabulary tuple file, the door assembly, definition files}. |
| G3 | `context-definition-shape` | ts-morph, incremental-safe | a hand-rolled tabs renderer outside `lib/registry-contracts.ts`; a zero-tab mint with no contributors; a `defineContextTabs`/`ContextTabDef<…>` type arg that is not `void` and not an identifier import-resolving to a type exported from `lib/registry-contracts.ts`; a resurrected `bodies: Record<string, ReactNode>` shape. Same gate for region claims: a hand-rolled region def outside `registry-contracts.ts`; a second `defineContextRegion(` call site; a feature painting shell chrome classes outside `app-shell/**`; a second writer of the `data-context-region` probe attribute. Declared blind spot: cases 5–8 read literal shapes, so a CT is the required second check. |
| G4 | `config-group-completeness` | ts-morph | a `CONFIG_GROUP_IDS` member with no registered group; a group definition not co-located with its owner, or a collection body outside `*-collection`; two defs for one id; the config host importing a feature's internals; a file stamping `configAnchorId` that no `ConfigSectionContribution` renders; a `{kind:"sections"}` pane that still declares its own `subcategories`. |
| G5 | `client-components-tier` | dep-cruiser, the rule set in `.dependency-cruiser.cjs` | `components/` → `features/`/`routes/`/`main.tsx`; `lib/` → `components/`; `state/` → `components/`. |
| G6 | `list-row-adoption` | ts-morph, both-ways allowlist ratchet | in a list-region surface file (one using `LibrarySurfaceShell`/`LibraryListLayout`/`createCollectionSurface`), a `.map()` callback or a `renderItem`/`renderRow` prop callback returning interactive JSX not rooted in `ListRow`/`LibraryRow`/an allowlisted composite. R1 is the judgment half (cards vs rows). |
| G7 | `confirm-uses-composite` | dep-cruiser | `from: features/**` `to: @orb/ui/alert-dialog` is RED. The composite (`ConfirmDialog`, tier-2 `components/`) lives outside features — no exemption. |
| G8 | `registry-assembly-at-door-only` | ts-morph | a `createRegistry(`/`createContributorRegistry(` call outside `main.tsx`/`compose/`; any mutating `register(` API existing at all. |
| G9 | `query-machine-seals` | ts-morph (import-specifier) | `useMutation` imported from `@tanstack/react-query` outside `data/`; `useInfiniteQuery` outside `data/create-collection-surface.ts`. |
| G10 | `bus-channel-primitive` | ts-morph | `new EventEmitter(` under `packages/server/src/transport/` outside `bus-channel.ts`. |
| G11 | `bus-definition-belts` | ts-morph | a `*_EVENT_TYPES` `satisfies Record<X["type"], true>` const in `@orb/contracts` with no matching coverage gate file, or no client-side total map in `data/invalidation.ts` — a new bus cannot ship missing the chat bus's guard set. |
| G12 | `membership-fan-guard` | ts-morph | under `domain/chat/**` (the membership-scoped domain list, registry-driven), a single-user emit identifier (`emitUserEvent`) — member-visible state rides the member-fan op (`emitChatChanged`) or the chat bus, never an actor-only channel. |
| G13 | `modal-registry-completeness` · `modal-body-not-placeholder` · `placeholder-copy-registry` | ts-morph | `modal-registry-completeness` mirrors G1: co-location (`features/*/lib/*-modal.tsx`), uniqueness, planned-case honesty, the singleton-placement case (one modal per `avatar`/`topbar-command`/`mobile-tab`), and the anti-god-map case. `modal-body-not-placeholder` reds a function-case `body` rendering a placeholder component instead of `{planned}`. `placeholder-copy-registry` reads `SectionDefinition.placeholder`. |
| G14 | `sanctioned-css-homes` | fs check (standalone `fsBacked` gate) | a repository-owned product `.css` file under `packages/**` outside the five CSS paths in §4, or any of the six homes (including the DTCG token source) missing. `playwright/index.css` is harness-owned, not a product home. |
| G15 | one-directional client tiers | dep-cruiser | `client-feature-front-door` · `client-features-no-cross` (type-only exempt) · `client-lib-floor` · `client-state-below-data` · `client-data-direction` · `client-forms-direction` · `client-features-below-routes` · `client-nothing-imports-main`. |
| G16 | compose, never paint | ESLint keystone | `className`/`style` on a raw intrinsic in `packages/client/src` (3 exact exemptions, §4). |
| G17 | token/value discipline | ts-morph | `no-color-literals` family · `no-arbitrary-tw-values` · `no-off-token-radius-shadow` · `no-off-token-inline-style` · `motion-token-purity`. |
| G18 | state discipline | ts-morph + eslint | `state-files` · `persist-partialize-and-total-migrate` · `no-raw-zustand-persist` · selector-stability pair · `no-effect-on-shared-selection` · static-`setState` ban · `persistence-boundary`. |
| G19 | data/query discipline | ts-morph | `no-array-literal-querykey` · `no-inline-invalidate-outside-seam` · `bus-on-data-no-store-write` · `no-fake-disabled-id` · `no-static-staletime` · `no-multiplexed-mutation-error`. |
| G20 | forms discipline | ts-morph | `form-factory-for-multifield` · `no-direct-useform` · `no-form-reset-in-autosave` · `no-form-state-in-useeffect`. |
| G21 | bus producer coverage | ts-morph | `bus-producer-coverage` — one policy quantified over every guarded bus union. |
| G22 | structure/size/a11y | ts-morph | `client-structure` · `component-size` · `surface-a11y-focus` · `surface-in-a-container` · `no-raw-interactive-intrinsics` · `empty-state-has-action` · `no-interactive-role-in-features` · `test-presence-client`. |
| G23 | `feature-owns-definition` | fs check (standalone `fsBacked` gate) | a `packages/client/src/features/*` dir co-locating no registered definition (`lib/*-{section,modal,group,chrome}.tsx`) — a feature owns a rail section, a modal, a settings group, or a chrome widget, or it is deleted. No exemption exists — `notifications` owns a chrome def. |
| R1 | row/field anatomy choice (ListRow vs setting-row vs Field vs message anatomy) | review | Why ungateable: the correct primitive follows the value type and interaction shape, not a syntactic signature. Checklist: entity-in-a-collection → ListRow/LibraryRow · label+control settings line → setting-row · editable labeled input → Field · chat turn → the message-row-skin machine · a repeated interactive row in a list surface matching none of these → reject. |
| R2 | composite promotion (≥2-feature duplication → `components/`) | review + jscpd | Why ungateable: semantic near-duplicates (same anatomy, different fields) defeat textual clone detection; jscpd (tsx, 5%) is the tripwire, the hoist is judgment. Checklist: same anatomy in 2+ features and changing together → tier 2; 3+ repeats of wiring → tier 3 factory; a genuine one-off → leave. |
| R3 | fan-scope completeness for new multi-visibility features | review | Why ungateable in general: whether state is "visible to others" is a domain-semantic fact the AST can't derive outside the known membership domains (G12 covers chat mechanically). Checklist at contract review: who can see this state? every seer's channel gets the event (member-fan for rooms, per-person for owned) · durable-first if a miss diverges canon (else document the heal path) · the event type joins the union and coverage-deferred before the emit lands. |
| R4 | three-states completeness (§11) | review | Why ungateable fully: `empty-state-has-action` covers empty mechanically; loading shape-match and error-copy quality are visual judgments. Checklist: skeleton matches final shape (no layout shift) · error = `QueryErrorState` with real retry · empty names the next step. |
| R5 | HTTP fetch-fn discipline (§10) | ts-morph, gate `fetch-fn-in-features` | a client feature hand-writes a global `fetch(`. Checklist: multipart/binary → a `data/` fetch fn beside the existing four; everything else → tRPC. |
