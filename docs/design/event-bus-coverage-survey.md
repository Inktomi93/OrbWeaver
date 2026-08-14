---
kind: design
status: active
updated: 2026-08-14
---

# Event-bus coverage survey — inventory · audit · gate expansion · the extension contract

> **Charge (THEME B, overnight 2026-08-13→14, second stickler occupant):** "Refinery got built without
> an event bus and we need to expand our existing event bus gates … event busses are also important for
> user authored extensions and extensibility and we need to find what else needs it." The bus is PRODUCT
> SURFACE (future user-authored extensions subscribe to it), not just internal plumbing — a coverage gap
> is a product gap.
>
> **Prior-law check (done before designing):** `Core-0-Architecture-and-Structure.md` §6 carries the
> derived-data row ("canon write → ContentChanged → coalesced workload") and §8 the durable-first +
> secret-unrepresentable invariants; the D-ledger rows that bind are D38 (the in-process domain-event
> bus), D50 (bus parity + the emit-coverage ratchet + "prompt mutation is never a bus effect"), D16/D19
> (payload firewall / no caller ids), D70 §13 (the event/sync spine + belts), D72 (a machine ships WITH
> its seal), D107 (declared = wired or cited-dormant), D118 (one multiplexed socket; room
> classifications are law), D46 (automation tiers). Nothing in the ledger rules the question "must every
> mutating domain have a freshness plane" — that quantifier is the gap this survey closes.
> **Companion prior design (built on, not contradicted):** `docs/design/staleness-and-session-freshness.md`
> — its §1.2 states the axiom this survey enforces ("every server write fans a covering event; where a
> domain has no bus the axiom fails and no client design can compensate") and fences this survey as the
> lane that closes it; its W7b mints the `identityChanged` user-bus member and its §5 names
> `data/invalidation.ts`'s member maps as the client consumer — this survey agrees on both and reuses
> its E4 ritual (union → map → emit → coverage-gate green) for every new member proposed here.

## 0. Verdict in one screen

The repo has **five client-reaching event planes plus one server-internal plane, all gate-belted where
they were BORN belted — and the belts only quantify over buses that already exist.** Nothing makes "a
mutating domain with NO bus at all" RED, which is exactly how refinery shipped 22 verbs and zero emits.
The same quantifier gap let the NEWEST bus (automation) ship a declared-never-emitted member
(`rulesChanged`) invisibly, because a bus without a `*_EVENT_TYPES` belt const is invisible to every
coverage gate. Ranked findings:

| # | Hole | Class | Receipt |
| - | - | - | - |
| H1 | **refinery** — 15 mutating verbs (sessions/runs/accepts/schemas), zero emits on any plane; every non-writing tab/device frozen at `staleTime: Infinity` | uncited-at-birth; now wearing 6 STATIC citations in `query-freshness-coverage` | §2.2; grep + ast-grep zero, `scannedFileCount=1001` |
| H2 | **automation `rulesChanged`** — declared in `AutomationBusEvent`, emitted NOWHERE; the union has NO belt const, so no coverage gate can see it (the exact D50 dead-wire class the ratchets were built to kill, alive on the newest bus) | gate blind spot | §2.3; repo-wide literal sweep: 2 hits, both declaration/comment |
| H3 | **databank** — 10+ mutating verbs, no bus member, posture CITED as deliberate (`databank-surface-spec` §7) but multi-device stale | cited no-bus | §2.4 |
| H4 | **background-pass writers announce nothing** — discovery recompute passes, the refinery score sweep, embed-reindex: not even the ACTING tab has a driver (the writer is a workload, no mutation to hang `invalidates` on); the library's scoring SORT serves stale order after a sweep | the class import's #23 terminal fan already solved | §2.5 |
| H5 | identity events (`sessions.me` / role grants) | already designed — Lane-B W7b `identityChanged`; this survey only records the dependency | staleness design §4.4.3 |
| H6 | writer-local single-pane surfaces (admin lists, workload schedules, gallery, invites, app settings, connection catalog) | cited STATIC, accepted | §2.6 |

§3 designs the two gates that close the quantifier (each with its historical control + reach probe, per
the ratifying-gate two-receipts law) plus the fix wave they force. §4 states what an extension
subscribing to the bus can rely on. §5 is the owner-forks table.

## 1. Inventory — the planes as built (every claim read off the tree this session)

### 1.1 The six planes

| Plane | Contract vocab | Runtime | Transport room | Durability (D118 classification) | Producers | Consumers |
| - | - | - | - | - | - | - |
| **chat bus** | `ChatBusEvent`, 27 members (`packages/contracts/src/chat/bus.ts:203-303`) + embedded `WiBusEvent` (`contracts/src/world-info/index.ts:248-262`) | `domain/chat/bus.ts` `createChatBus` — durable-first `chat_events` INSERT then a 256-entry ring; the §3.6 member stamp rides `emit` (`bus.ts:84-119`) | `chat` (`transport/trpc/chat-events-bus.ts`, `defineBusChannel` + firehose) | resumable\|lag — durable rewind by per-chat seq | chat verbs/engine (`ast-grep '$X.emit($$$A)'`: engine.ts, turn/edit/start-chat/fork/invites/compaction/post-narrator-message/generate-image), world-info verbs via injected `emitWiEvent` (`world-info/verbs/attachments/attach-to-chat.ts:32`), compose fan `emitChatEvent` (`entry/compose/services.ts:411-420` — fans ONLY what was durably logged) | client `data/bus/use-chat-bus.ts` → reducer `apply-chat-bus-event.ts` + `BUS_FILTERS` (`data/invalidation.ts:114-193`); automation watcher via the firehose (`entry/compose/automation-watcher.ts:124`; import fence: `firehose-import-allowlist`) |
| **user bus** | `UserBusEvent`, 11 members (`contracts/src/user-bus/index.ts:31-45`) | none (live-only) | `user` (`transport/trpc/user-events-bus.ts`; `stream/sources/user.ts:19` `resumable: false`) | live-only, reconnect blanket heal | 8 domains' verbs via injected `emitUserEvent` (character · persona · preset · world-info · regex · tag · settings/themes · credentials — 87 literal call sites, repo grep this session) + the member-fan `emitChatChanged` (`entry/compose/emit-chat-changed.ts` — present-human roster fan) + import terminal (`entry/compose/portability-runner.ts:227-228`) | `USER_BUS_FILTERS` (`data/invalidation.ts:202-283`) + derived gap-heal `allUserRootFilters` (`:340-345`) |
| **rpg bus** | `RpgBusEvent`, 6 members (`contracts/src/rpg/bus.ts:34-55`) | `domain/rpg/bus.ts` — domain-minted module singleton (the sanctioned G10/O4 exclusion; header states why it cannot import `defineBusChannel`) | `rpg` (`stream/sources/rpg.ts:51` `resumable: false`) | live-only, `gapHealRpg` blanket | 16 rpg verb/flush sites via injected `emitBus` (`ast-grep '$X.emitBus($$$A)'`, list in the sweep log §6) | `RPG_BUS_FILTERS` (`data/invalidation.ts:300-323`) |
| **notifications** | `notificationEventSchema`, 7 arms (`contracts/src/notifications/index.ts:39-…`: invite · kicked · handoff-nominated · handoff-accepted · deferred-turn-dropped · automation-notice · plugin-disabled) | durable inbox rows (record = the ONE recipient chokepoint, Core-0 §8) | `notifications` | resumable\|lag — durable inbox is truth | chat verbs via injected op; automation `notifications.emit`; plugin crash policy (`domain/plugin/activation/crash-policy.ts:30`); compose durable-first wrap (`entry/compose/chat.ts:1019`, `automation-plugin.ts:259-268`) | client inbox SSE adapter (cited in `query-freshness-coverage` STATIC `notifications.list`) |
| **automation bus** | `AutomationBusEvent`, 5 members (`contracts/src/automation/index.ts:342-347`) — **NO belt const exists** | none (transient by design, 03 §1.4) | `automation` — ephemeral\|collapse; room source filters host-only events per subscriber (`transport/trpc/automation-bus.ts` header) | transient, no replay | rule engine `notify` (`domain/automation/engine/dispatch.ts:105,109,234,247`, `arm-executors.ts:143`), plugin quick-reply op (`entry/compose/automation-plugin.ts:277`) — **`rulesChanged`: zero emit sites** | **none on the client today** (`grep AutomationBusEvent\|quickReplySurfaced packages/client/src` = 0; the settings pane is `{placeholder: true}`) |
| **domain-event bus** (server-internal) | `DomainEvent`, 2 members (`contracts/src/events/index.ts:19-41`: `character.updated {contentChanged}` · `asset.created`) — plain `as const`, deliberately NOT a belt | `entry/compose/event-bus.ts` — in-process, fire-and-forget, error-isolated, ASSUMES(single-replica) | none (never leaves the process) | n/a | `ctx.emit` in character create/update/duplicate/restore (`character/verbs/*.ts`) + assets store (`assets/verbs/store.ts:29`) | THREE subscribers, all wired at compose: embeddings indexer (gated on `corpusAutoindex`, `search-discovery.ts:144-153`, `assertNever`-exhaustive), the `character.updated`→`chatUpdated` room fan (always-on, `:157-163`), the automation watcher (`automation-watcher.ts:125-131`; triggers = `DOMAIN_TRIGGER_TYPES`) |
| **workloads progress bus** (in-domain) | `WorkloadEvent`, 6 members (`contracts/src/workloads/events.ts:45-54`) | `domain/workloads/engine/progress-bus.ts` — EventEmitter + replay ring (TTL 60s, event-time clock) | `workloads` — ephemeral\|collapse; the durable `workloads.progress` COLUMN is reconnect truth (D118) | ephemeral + durable column | engine runner/reaper (`engine/runner.ts:119,138,168,200,221`, `reaper.ts:28`) | workloads feature stream adapter (STATIC citation `workloads.list`: every non-progress event invalidates the list) |

Transport unification: `defineBusChannel` (`transport/trpc/bus-channel.ts`) is the ONE transport
EventEmitter home (gate `bus-channel-primitive`); every stream rides the ONE multiplexed socket
(`STREAM_CHANNELS = ["user","notifications","chat","rpg","automation","workloads"]`,
`contracts/src/stream/index.ts:58`; gate `single-stream-transport`, exempt list = exactly
`chat.impersonateStream`, D118).

### 1.2 The gate battery over the planes — actual mechanics

**The coverage ratchets** (`bus-coverage` · `user-bus-coverage` · `rpg-bus-coverage`) are three thin
SPECs over ONE reconcile, `scripts/check/bus-coverage-lib.ts`:

- `busEventKeys` parses the member names out of the bus's `*_EVENT_TYPES` const (object-literal shape
  for chat/user, array shape for rpg) — `bus-coverage-lib.ts:40-59`.
- `literalCorpus` concatenates EVERY string literal under `packages/server/src/(domain|transport)/`
  (comments excluded) — `:61-75`; a member is "emitted" iff the corpus contains it space-delimited.
- Reconcile: not-emitted ∧ not-DEFERRED → MISSING-red; emitted ∧ DEFERRED → STALE-red (`:80-102`).
  Self-cleaning both directions; DEFERRED rows carry citations (the sole live one:
  `user-bus-coverage.ts:23-26` `connectionsChanged`).

Mechanical honesty (for the gate-expansion work, not defects today): (a) the emit test is LITERAL
CONTAINMENT — any equal string literal in scope satisfies it, so a common-word member (`warning`)
could be false-covered by an unrelated literal; acceptable for a ratchet, worth knowing. (b)
`EMIT_SCOPE` excludes `entry/compose/` — a member whose ONLY emit is compose-side would false-MISSING
(fail-safe direction); today every member has an in-scope literal.

**The belt-existence gate** (`bus-definition-belts`) closes "a new bus ships the const but not the
enforcement": every `*_EVENT_TYPES` const in contracts shaped `satisfies Record<X["type"], true>` or
`as const satisfies readonly X["type"][]` must have BOTH (1) a `scripts/check/gates/*.ts` file naming
the const and (2) a client mapped-type total map over the union (`bus-definition-belts.ts:109-127`).
**Two deliberate exclusions define its blind spot:** a plain `as const` with no `satisfies`
(`DOMAIN_EVENT_TYPES`) is out of scope by fixture (`:162-167`), and a union with NO const at all
(`AutomationBusEvent`) never enters `findEventTypesConsts` — §2.3 is the live consequence.

**THE THREE COUPLED SITES of bus coverage** (memory lesson, restated with receipts — every new member
touches all three; the staleness design calls the full add-a-member sequence "the E4 ritual"):

1. **The contracts union arm + its `*_EVENT_TYPES` belt** — one home; the `satisfies` makes
   union↔belt drift a tsc error (`user-bus/index.ts:50-62`, `rpg/bus.ts:62-69`, `chat/bus.ts:308-336`;
   the chat belt doubles as the durable-replay guard — corrupt/legacy `chat_events` rows are filtered
   against it before re-emit).
2. **The server emit site** — held by that bus's coverage-gate ratchet (or a cited DEFERRED row).
3. **The client total-map row** — `BUS_FILTERS`/`USER_BUS_FILTERS`/`RPG_BUS_FILTERS` in
   `data/invalidation.ts` (mapped types over the union; a new member fails client tsc until it names
   its reads), located-by-shape by `bus-definition-belts`.

**The payload firewall:** `bus-payload-allowlist` (field-name smell over the five bus files, sanction
table with a stale arm — `SANCTIONED_FIELDS` = exactly `credentialId`) + the dep-cruiser
`bus-contract-no-credentials` resolve-time arm + the closed-object-literal unions themselves (D16:
secrets TYPE-LEVEL unrepresentable; contract-tests pin it). `membership-fan-guard` bans `emitUserEvent`
under `domain/chat/**` (member-visible state must fan to the roster, never one user).

**The client-side ratchet that already exists and matters here:** `query-freshness-coverage`
(`scripts/check/gates/query-freshness-coverage.ts`) — with `staleTime: Infinity`, every client-consumed
tRPC query key must be covered by a reachable invalidation-seam row OR carry a cited STATIC/DEFERRED
registry entry; self-cleaning in both directions with an orphan arm and a rename tripwire. **This gate
is why refinery/databank/discovery are not silent today — they are CITED** (`:128-160` refinery+databank
blocks, `:90-126` the discovery analytics block whose own prose says a seam row "becomes POSSIBLE only
once a corpus-recompute event exists (then these entries go stale-RED and get deleted, which is the
point)"). The citation lane is honest — and it is also the escape hatch that converted refinery's
missing bus into paperwork instead of a RED. §3 closes that.

Client discipline gates: `chat-stream-writes-in-bus-only` (turn slots driven only through
`applyChatBusEvent`; the chat-turn surface is bus-driven — memory lesson, restated),
`bus-onData-no-store-write`, `no-inline-invalidate-outside-seam`, `no-static-staletime`,
`client-cache-surgery-only-in-data`. The mutation XOR (`busDriven: true` ⊕ `invalidates`) is
compile-time in `data/create-entity-mutation.ts`.

**Doc drift found while reading the gates (truth-repair riders for the fix lane):**
`Core-Enforcement-Active-Gates.md:118` still says all five rpg members are "founding DEFERRED" — the
map has been EMPTY since W1c-b (`rpg-bus-coverage.ts:24-34`); `:120` says the client map must live in
`data/invalidation.ts` while the gate locates it client-wide by shape; `bus-definition-belts.ts:12`
names `features/rpg/hooks/use-rpg-stream.ts` as the rpg map's home — that file does not exist (the rpg
map lives in `data/invalidation.ts:300-323`).

## 2. Domain-by-domain audit — does every state-changing verb announce itself?

Roster = constitution §6 map ∪ the live tree (28 domains under `packages/server/src/domain/`).
Method: repo-wide literal grep for every emit/publish identifier + `ast-grep` sweeps
(`$X.emit($$$A)` · `$X.emitUserEvent($$$A)` · `$X.emitBus($$$A)`, `-l ts`, `scannedFileCount=1001`,
0 skipped; `packages/server/src` has zero `.tsx`, so the ts sweep is total) + whole-file reads of every
file named below. Verb rosters enumerated per domain from `domain/<x>/verbs/`.

### 2.1 Covered domains (verified, with plane)

| Domain | Plane(s) | Evidence |
| - | - | - |
| chat | chat bus (durable) + `chatsChanged` member-fan on canon terminals/lifecycle | §1.1 row 1; `emit-chat-changed.ts` |
| character | `charactersChanged` (create/update/remove/duplicate/restore/snapshot/bulk-\*) + `character.updated` domain event (create/update/duplicate/restore, `contentChanged` flag) + the always-on room fan | emit sweep; `character/verbs/*.ts` |
| persona · preset · world-info · regex · tag · settings(+themes) · credentials | their user-bus members from every mutating verb (87 sites; the WI/regex attachment verbs emit BOTH their user-bus member and their chat-bus event) | emit sweep §6 |
| rpg | own bus, all six members emitted (gate DEFERRED map empty since W1c-b); swipe freshness deliberately rides chat's `variantSelected` | `rpg-bus-coverage.ts:24-28`; contract header |
| notifications | its own durable inbox + room; `record` is the one chokepoint | Core-0 §8 |
| workloads (RUNS) | progress bus + `workloads` room; "every state-changing event invalidates workloads.list" | `workload-row.tsx:7`; STATIC row |
| import / export | import routes through the EMITTING sibling verbs (character create port receipted in the staleness design §2.6) + the #23 terminal fan (`portability-runner.ts:226-229`); export mutates nothing | staleness design §2.6 |
| assets (store path) | `asset.created` domain event; avatar-link writes fan `charactersChanged` via the character compose ctx | `assets/verbs/store.ts:29` |
| embeddings / search | indexer is a bus CONSUMER; search is read-only | `search-discovery.ts:144-153` |
| sessions / connection | identity events designed (Lane-B W7b); `connectionsChanged` is the cited DEFERRED exemplar | staleness design; `user-bus-coverage.ts:23-26` |

### 2.2 H1 — refinery: the confirmed hole (the charge's founding instance)

- **Zero emits on any plane.** `domain/refinery/**` (38 files, all listed this session): grep for
  `emit|publish|bus` hits only 6 comment lines in two substrate files; the ast-grep emit sweeps
  (§2 method) match nothing under refinery; `RefineryContext` carries no emit op
  (`refinery/context.ts` + `contract/service.ts` — the injected ops are db/clock/summarize/prose/preset
  - four CHARACTER ops). Absence receipt: two methods, non-zero scan counts, positive controls (the
    same patterns match 19 files elsewhere).
- **The mutating verbs that announce nothing** (15 of 22): sessions `start-session` / `update-session`
  / `delete-session`; rounds `run-stage` / `iterate` / `submit-manual-rewrite`; accepts `apply-fields`
  / `apply-as-copy`; schema library `create-schema` / `update-schema` / `delete-schema`; draft verbs
  `generate-schema` / `refine-schema` / `test-schema` (persist nothing — legitimately silent); the
  score sweep (§2.5). Reads: `get-session`/`list-*`/`preflight`.
- **What IS covered transitively:** the accept verbs route through the injected
  `character.update`/`duplicate`/`snapshot` (`entry/compose/refinery.ts:56-59`), so the CHARACTER side
  of an apply fans `charactersChanged` + `character.updated` correctly. Only refinery's OWN planes
  (sessions/runs/schemas roster, verdict badges, preflight) are dark.
- **Consequence:** all six refinery reads are `invalidates`-driven from the writing tab only
  (`use-refinery-mutations.ts` / `use-refinery-schemas.ts` — every mutation is `invalidates:`, zero
  `busDriven`); at `staleTime: Infinity` a second tab/device shows the pre-write roster/session/runs
  forever (gcTime eviction aside). The six STATIC citations in `query-freshness-coverage.ts:143-160`
  document exactly this ("`domain/refinery/**` emits nothing at all, so a seam row would have no event
  to hang on") — a declared limit wearing a receipt's clothes; the fix is the event, §3.4.

### 2.3 H2 — automation: the newest bus already has dead wire, invisibly

`rulesChanged` is declared (`contracts/src/automation/index.ts:347`) and emitted NOWHERE — repo-wide
literal sweep (packages + scripts + tests): 2 hits, the declaration and a comment in
`stream/sources/automation.ts:36`. The other four members emit
(`dispatch.ts:105,109,234,247` · `arm-executors.ts:143` · `automation-plugin.ts:277`). No gate can see
this: `AutomationBusEvent` has NO `*_EVENT_TYPES` const (contracts-wide grep: exactly four
`*_EVENT_TYPES` consts exist — chat, user, rpg, domain-events), so `bus-definition-belts` never finds
the bus and no coverage spec exists. The rule-CRUD verbs (`create-rule` / `update-rule` /
`delete-rule` / `reorder-rules` / `set-rule-enabled`, all chat-scoped) mutate rule state that the
automation room's subscribers — and the future Automation pane (today `{placeholder: true}`,
`features/settings/lib/automation-pane.tsx:14`) — would need announced. This is D50's exact
"declared, replay-guarded, and never emitted (silently dead wire)" class, on the bus built AFTER the
ratchets. The lesson generalizes: **the ratchets quantify over belts, not over buses.**

### 2.4 H3 — databank: a cited no-bus domain

10+ mutating verbs (`create-from-text`, `upload`, three scrapers, `rename`, `remove`, `reindex`,
global/chat/character attach·detach). No user-bus member ("`USER_BUS_EVENT_TYPES` has ten members and
none is databank" — the feature's own header, `use-databank-mutations.ts:3-6`); all freshness is
mutation-`invalidates` + a bounded ingest `refetchInterval`, cited in `query-freshness-coverage.ts:128-141`
per `databank-surface-spec` §7. Partial cover: the per-chat rack rides `chatUpdated`
(`invalidation.ts:181-191`). Same consequence class as refinery (multi-device/tab staleness), lower
severity (posture was cited at birth, and the rack — the shared-surface half — is covered).

### 2.5 H4 — background passes that rewrite user-visible projections and announce nothing

The writer is a WORKLOAD, so not even the acting tab has a driver (no mutation to hang `invalidates`
on); `import` already solved this shape with its #23 terminal fan (`portability-runner.ts:226-229`).

- **Refinery score sweep** → `characters.refinery` via the character-owned stamp op
  (`character/persistence/refinery-ops.ts:60-79`, header: "SILENT by design: no audit entry, no
  user-bus event … (F6)"). But the library projects `refineryScore` as a SORT axis
  (`character/persistence/queries.ts:106-113`; `character-library-toolbar.tsx:32-33`) — after a sweep,
  the scoring sort serves stale order on every device until an unrelated `charactersChanged` lands.
  The F6 silence ruling governs the per-card stamp; a ONE-event-per-sweep terminal fan (the #23 shape)
  does not contradict it — owner fork F2. `refinery/workload-contributions.ts` has no terminal fan
  today.
- **Discovery recompute passes** (distill / themes / projection / hub-scores / image-embed /
  embed-reindex) → 27 `discovery.*`+`search.similarArt` STATIC rows
  (`query-freshness-coverage.ts:90-126`) whose own prose asks for the event. The Corpus section
  freezes per cache-key until gcTime eviction.
- **Embeddings indexer per-write path** is fine as-is (event-DRIVEN already; a per-embed client fan
  would be a storm; no client read projects raw vectors).

### 2.6 Verified-accepted (cited writer-local; no action recommended)

`admin.listUsers`/`listSessions` (writes land on OTHER users' rows; the target-user edge is Lane-B
W7b), `settings.getAppSettings(+WithOverrides)`, `workloads.listSchedules`, `assets.listGallery`,
`invites.listInvites`, `rpg.listCheckpoints`, `chat.checkSendAvailability` (own 15s staleTime),
`admin.vllmEngines` (polls) — each carries a reasoned STATIC row (`query-freshness-coverage.ts:63-88`)
naming its real driver; all are single-pane, per-user or admin-only surfaces. Also accepted: the
stats chatless-imagery residual (documented at `invalidation.ts:273-276`; closing it needs a
stats-grain producer event — tracked, low). `plugin` install/enable verbs are silent but the ONLY
live consumer surface is the plugin log/list (writer-local class; `plugin-disabled` already rides the
durable inbox, `crash-policy.ts:30`); classify in the §3.1 table rather than mint a member now.
`tool-use` registry writes are compose-time registrations, not user verbs. `discovery`'s own verbs
are reads over derived tables (the writers are the §2.5 passes). `admin.embed`/`vllm` are ops
surfaces. `export` mutates nothing. `stats` writes ride the chat batch + `chatsChanged` fan
(`invalidation.ts:259-271`).

## 3. The gate expansion — making the next refinery RED at birth

Two structural rules close the two quantifier gaps found above, then one fix wave that the new gates
force (landing on a FIXED tree, per the gates-land-on-a-fixed-tree law: wire the emits; citations only
for genuinely-deliberate silence). Both gates follow `GATE-AUTHORING.md` (descriptor + mustFlag /
mustPass + registration in `Core-Enforcement-Active-Gates.md` + the `__g_` fixture in
`check-gates.int.test.ts`), and each carries the ratifying-gate TWO RECEIPTS: a historical control
(red on the pre-fix tree exactly where this survey found the hole) and a planted reach probe.

### 3.1 G-A `domain-freshness-plane` — every mutating domain declares its plane

**Rule:** derive the set of domains whose `verbs/**` contain at least one WRITE (a drizzle
`.insert(`/`.update(`/`.delete(`/`db.batch(` in the verb or in a persistence function the domain owns —
the `owner-scoped-writes` gate already recognizes these shapes; reuse its detection). Every derived
domain must have a row in the gate's own `DOMAIN_FRESHNESS` table:
`{ plane: "chat-bus" | "user-bus:<member>" | "own-bus:<name>" | "domain-events" | "workload-events" | "none", cite }`.
Reconcile, self-cleaning in all directions (the D107 / knob-wire discipline):

- mutating domain with no row → **MISSING-red** (the refinery arm);
- a `none` row for a domain that HAS an in-scope emit → **STALE-red**;
- a row naming a domain with no mutating verbs → **ORPHAN-red**;
- derivation returns zero domains on a tree that has `domain/chat` → **tripwire-red** (blindness
  guard, the anchor pattern).

`none` rows are the rare, owner-cited lane (founding candidates: `export` — no writes; `tool-use` —
compose-time registry; `admin`/`plugin` — writer-local cited; `stats` — rides the chat batch;
`discovery` — writers are workloads, resolved by §3.4's event, after which its row flips). The table
is the ONE home for the no-bus verdict; the `query-freshness-coverage` STATIC rows of the "no bus
event exists" class cite the G-A row so the two registries cannot drift.

**Granularity honesty (a declared limit with a real reason, not a convenience):** per-DOMAIN, not
per-verb — a domain with one emitting verb and one silent one passes G-A. The per-verb quantifier is
already held from the CLIENT side: any read a silent verb feeds is caught by `query-freshness-coverage`
(no seam row, no citation → RED at the consumption site), and the pairing is the design — G-A forces
the domain to HAVE a plane; the client ratchet forces every READ onto a driver. A per-verb server
marker gate (`@freshness-exempt(<verb>): reason`) is the escalation if the pairing ever leaks; carrying
it now would cost a marker on every read-only verb for no found defect.

**Receipts:** historical control — the §2 audit table IS the founding classification; running the
derivation on today's tree REDs exactly `refinery` (MISSING) and forces the databank/plugin/admin
citations into one home. Reach probe — plant `domain/__probe/verbs/write-thing.ts` containing a
`db.insert`, no table row → RED; add a `none` row without a cite → malformed-red; rm. Six-case probe
per the marker-gate laws where the exemption grammar is used.

### 3.2 G-B belt-existence closure — a BusEvent union without a belt is RED

**Rule (amends `bus-definition-belts`):** any exported type alias in `@orb/contracts` matching
`/BusEvent$/u` (plus `DomainEvent` by name — rename tripwire on both) MUST have a sibling
`*_EVENT_TYPES` belt const `satisfies`-anchored over `X["type"]` (either recognized shape). The
existing gate then already demands the coverage-gate file; amend its client-map arm with a declared
**reach lane**: a bus in the `SERVER_INTERNAL` set (founding member: `DomainEvent`) satisfies the
consumer belt with a server-side exhaustive dispatch home (`assertNever` subscriber — the live
exemplar is `search-discovery.ts:144-153`) instead of a client total map. Without the reach lane,
belting `DomainEvent` would falsely demand a client map — which is precisely why `DOMAIN_EVENT_TYPES`
was left un-`satisfies`'d and invisible (`bus-definition-belts.ts:162-167` blesses it today).

**Receipts:** historical control — today's tree REDs `AutomationBusEvent` (no belt const,
contracts-wide grep receipt in §2.3), and the moment the belt + `automation-bus-coverage` spec (one
more `BusCoverageSpec` on the shared lib) land, the reconcile REDs `rulesChanged` (zero in-scope emit
literals) — the gate catches on day one the dead wire this survey caught by hand. Reach probe — the
existing mustFlag fixture family plus a beltless `export type PBusEvent = { type: "a" }` fixture
expecting the new arm's message. Note for the spec: the plugin-side `quickReplySurfaced` emit lives at
`entry/compose/automation-plugin.ts:277` (outside `EMIT_SCOPE`); the rule-side emit
(`arm-executors.ts:143`, domain scope) keeps the member covered — document the scope subtlety in the
gate header rather than widening `EMIT_SCOPE` to entry (compose is wiring, not a producer home).

### 3.3 Belting the domain-event bus (rides G-B)

`DOMAIN_EVENT_TYPES` gains `satisfies readonly DomainEvent["type"][]` + a `domain-events-coverage`
spec (array shape, shared lib). Producer side: both members have live in-scope emits today (§1.1) —
the belt guards the NEXT member (the header itself plans `crew.*`/`rpg.*` grafts back onto this
union). Consumer side rides the G-B server-internal lane. `DOMAIN_TRIGGER_TYPES ⊆ DOMAIN_EVENT_TYPES`
is already `satisfies`-anchored (`contracts/src/automation/index.ts:43-48`), so the automation trigger
surface tracks the union by tsc.

### 3.4 The fix wave the gates force (each new member = the full E4 ritual)

1. **Refinery** — user-bus member `refineryChanged { sessionId? }` (owner fork F1 on the plane
   choice; recommendation: user-bus — refinery sessions/schemas are single-owned per-user rows, the
   exact "an entity you own changed" posture; a feature bus is for per-chat scoping refinery lacks).
   Emit from the 11 persisting verbs (sessions/rounds/accepts/schema CRUD) after their durable
   writes; map row → `trpc.refinery.pathFilter()`. The six refinery STATIC rows then go STALE-red and
   get deleted — the self-cleaning direction proving the machinery, and the refinery mutations flip
   `invalidates` → `busDriven`.
2. **Automation** — belt + coverage spec (§3.2); wire `rulesChanged` in the five rule-CRUD verbs
   through the existing `notify` sink (chat-scoped; the room's host-only filter already classifies
   it), or DEFER with a citation if the owner prefers waiting for the pane — recommendation: wire now
   (the bus is product surface; the pane lands later against a working plane).
3. **Databank** — user-bus member `databankChanged { documentId? }` from the CRUD/scrape/reindex
   verbs + the upload/ingest terminal; deletes the four databank STATIC rows; amends
   `databank-surface-spec` §7 (truth-repair rider).
4. **Sweep terminals** (the #23 shape, one event per pass): refinery score sweep →
   `charactersChanged` at terminal (fork F2 — F6's per-card stamp silence unchanged); the discovery
   recompute passes → user-bus member `corpusRecomputed` (or ride a single coarse
   `discoveryChanged`) emitted at each bulk pass terminal, mapping to `trpc.discovery.pathFilter()` +
   `trpc.search.similarArt.pathFilter()` — the 27 discovery STATIC rows then self-clean exactly as
   their own prose predicts.
5. **Identity** — Lane-B W7b `identityChanged` lands unchanged (this survey adds nothing to it;
   listed for the one-list view of user-bus growth: 11 → 14 members).
6. **Truth-repair riders:** the three doc drifts in §1.2, and the G-A/`query-freshness-coverage`
   cross-reference rows.

**Emit-shape law for every new emit (memory lesson, restated):** an emit on a rejectable write path
must be TOTAL — `void emit()` on a rejecting promise is an unhandled rejection, i.e. a process kill
(it happened: the delete-mid-turn `chat_events` FK trip; the built answer is chat `bus.ts`
FLAG\[emit-is-total] `:18-27` — classify-and-drop, never throw). The user/rpg emits dodge this by
construction (synchronous fire-and-forget `void` publish AFTER the durable commit) — every §3.4
member keeps that shape: emit after commit, emit is `void`-returning and non-throwing, and deletes
stop emits at the source rather than racing them.

## 4. The extension-facing contract — what a subscriber may rely on

What exists TODAY for foreign code (automation rules are the live user-authored consumers; plugins ride
the membrane; a future extension API subscribes to the same planes):

- **Reachable vocabularies.** Server-side triggers: `CHAT_TRIGGER_TYPES` (12 wired members, tail
  reserved — "criterion: first real rule request") and `DOMAIN_TRIGGER_TYPES`, both `satisfies`-anchored
  SUBSETS of their source unions (`contracts/src/automation/index.ts:12-48`) — a trigger can never name
  a nonexistent event, and a union member removal fails tsc at the subset. Client-side: the six
  `STREAM_CHANNELS` over the one socket (D118), consumed through the ONE invalidation seam.
- **Vocabulary stability tiers.** The chat bus is "frozen-ish public surface" with a 5-site coupling
  cost per member (`contracts/src/rpg/bus.ts:9-11`) — new features get FEATURE buses (rpg/automation
  precedent), so extension code keyed on chat members enjoys the strongest stability; feature buses are
  additive (rpg's Full graft plan is explicitly additive members); D50 rules NO deletion events ever
  (FK CASCADE is the eviction mechanism) and prompt mutation is NEVER a bus effect (`PromptTransform`
  is the synchronous seam — an extension that wants to rewrite a turn registers a transform, it does
  not subscribe).
- **Payload contract (D16/D19/D38).** Every member is a closed object literal of branded ids, enum
  literals, and plain scalars; secrets/credentials/baseUrls are type-level unrepresentable
  (`bus-payload-allowlist` + dep-cruiser + the contract tests); NO member carries a caller id — turn
  attribution rides the turn path, never the public bus. The subscriber discipline is **id-only
  re-read**: treat event-carried data as a hint, re-read canon by id (`events/index.ts:9-10` states it
  for the domain bus; the user/rpg "targeting hint" fields state it for the client planes). Events are
  droppable-by-contract on the live-only planes: the reconnect blanket heal is the correctness
  backstop, so an extension must be level-triggered, not edge-triggered.
- **Delivery semantics per plane** (§1.1 table): chat = durable-first, seq-cursored, replayable
  (`chat_events` + ring 256), member-visibility PRODUCER-stamped fail-closed (`memberText`,
  D110 §3.6/D118); notifications = durable inbox truth; user/rpg = live-only fire-and-forget after
  durable commit; automation = transient, host-only members filtered per subscriber AT THE ROOM (a
  member-tier subscriber sees only `quickReplySurfaced`); workloads = ephemeral collapse + the durable
  progress column. Domain bus = in-process only, fire-and-forget, error-isolated (a throwing subscriber
  is logged and never breaks the write path — `event-bus.ts:19-25` — so an extension CANNOT veto a
  write by subscribing), boot-lifetime subscriptions (no unsubscribe; `automation-watcher.ts:127-130`).
- **What an extension may NOT rely on:** cross-replica delivery (every plane is
  ASSUMES(single-replica) module/process state), replay on the live-only planes, event ORDER across
  different planes, or the bus as an authorization surface (rooms authorize at ATTACH —
  `resolveStreamAuthority`, membership seams — never per-event on the emit side; publishing to a
  channel is safe only because attach is gated).
- **Binding rows for future API work:** D38 (closed union, injected emit, no direct bus reach),
  D50 (member cost + the no-deletion/no-prompt-mutation rules), D72 (a new bus ships WITH its seal —
  §3.2 makes that structural), D107 (declared = wired or cited), D118 (one socket; classifications are
  runtime-pinned law), D70 §13 (the contributor registry is the client-side foreign-extension seam).

## 5. Owner forks (each with a recommendation; none blocks G-A/G-B landing)

| # | Fork | Options | Recommendation |
| - | - | - | - |
| F1 | Refinery plane | (a) user-bus member `refineryChanged` · (b) own feature bus | **(a)** — single-owned per-user rows, no per-chat scoping to justify a bus; mirrors the databank fix; an own bus re-pays the 5-site cost for zero scoping gain |
| F2 | Score-sweep terminal fan vs F6 silence | (a) one `charactersChanged` at sweep terminal · (b) keep full silence | **(a)** — F6 governs the per-card stamp (unchanged); the #23 import precedent is exactly this shape; (b) leaves a library SORT axis stale on every device |
| F3 | G-A table home | (a) gate-file table (the coverage-gate idiom) · (b) a contracts-homed registry | **(a)** — every existing ratchet homes its allowlist in the gate file; a contracts home would put gate policy on the wire package |
| F4 | Belt `DOMAIN_EVENT_TYPES` now vs at the third member | (a) now, with G-B's server-internal lane · (b) defer | **(a)** — the lane must exist for G-B anyway; the header already plans graft-back members; cost is one `satisfies` + one spec |
| F5 | `rulesChanged` | (a) wire the emit in the five rule-CRUD verbs now · (b) DEFERRED citation until the Automation pane lands | **(a)** — the bus is product surface; a cited deferral on a member the newest bus already declared is the exact posture that let it go dead |
| F6 | Discovery event grain | (a) one coarse member (`corpusRecomputed`) fanned at every bulk-pass terminal · (b) per-pass members | **(a)** — the client maps every discovery read to the domain root anyway; per-pass grain buys nothing until a surface wants partial refresh |

## 6. Verification log (what this survey's silence covers)

- **Whole-file reads:** all six gate files named in §1.2 + `bus-coverage-lib.ts` (508+267+181+…),
  `contracts` bus vocabularies (chat/user/rpg/events; automation/world-info/workloads/notifications in
  relevant part), `domain/chat/bus.ts`, `domain/rpg/bus.ts`, `progress-bus.ts`, all five transport bus
  files + `bus-channel.ts`, `entry/compose/event-bus.ts` / `emit-chat-changed.ts` /
  `automation-watcher.ts` / `refinery.ts` (wiring region) / `services.ts` (emit regions) /
  `search-discovery.ts:130-170`, `client/src/data/invalidation.ts`, refinery `context.ts` /
  `workload-contributions.ts` / `character/persistence/refinery-ops.ts`,
  `use-databank-mutations.ts` (header+reads), `automation-pane.tsx`, the constitution + `Core-0` +
  `Core-Laws-and-Precedents.md` + `Core-Path-Registry.md` (D1–D70 pages + D118/D137 rows) + the
  staleness design (whole).
- **Sweeps (command + count):** `emitUserEvent` literal grep server-wide (87 lines, attributed);
  `ast-grep '$X.emit($$$A)'` / `'$X.emitUserEvent($$$A)'` / `'$X.emitBus($$$A)'` over `domain/`
  (`scannedFileCount=1001`, 0 skipped; `.tsx` count in server = 0); publish/subscribe literal sweep for
  all seven transport functions; `rulesChanged` repo-wide (2 hits); `AutomationBusEvent|quickReplySurfaced`
  client-wide (0); `_EVENT_TYPES` contracts-wide (4 consts); `busDriven|invalidates:` client-wide
  (attributed per feature); `trpc.discovery` client-wide (8 files, 0 invalidation rows);
  refinery `emit|publish|bus` grep (6 comment hits, each inspected).
- **Regions NOT read (scope honesty):** the chat engine's per-emit internals beyond the emit sites
  (`engine/engine.ts` bodies), `stream/socket.ts`/`socket-registry.ts` internals (taken from D118 + the
  staleness design's receipted reads), the rpg verb bodies beyond their `emitBus` lines, scraper/upload
  verb bodies (their SILENCE is the finding; their logic is not this lane's), `Documentation-Law.md`
  beyond the ledger-entry style section, and the parked `../proposed/` sets. None can change an
  absence claim receipted above.
- **Unconfirmed, low priority:** none. (Every suspicion raised during the audit either graduated to a
  receipted finding or was verified clean and listed in §2.6.)
