# Orbweaver — `notifications`: the per-user durable delivery surface

> **Status: planning (target spec).** A small NEW domain introduced with the unified roster/group/multi-human system
> (ledger **D16**; `domains/chat.md` Part III §3). It exists for ONE reason: **the per-chat bus cannot reach a
> non-member** (a user who isn't in a chat can't subscribe to that chat's stream), so invite / kick / host-handoff
> delivery needs a **per-user** channel. neo-tavern's group-chat plan (`docs/plans/unified-group-chat.md` §9/§10) names
> this the "invite DELIVERY surface" and corrects (twice) that it must be built on the resumable `chat.streamMessages`
> shape, **NOT `buddy.stream`** (an in-memory ramp-up ring that drops offline events). Authoritative upstream:
> `domains/chat.md` Part III §3, `core/Tier-4-Transport.md` (the subscription lives there), `core/Tier-1-DB.md`
> (`schema/notifications.ts`), `core/Spine-Identity-and-Auth.md` (the `AUTH_MODE` gate).

---

## What this domain owns

- **The durable per-user inbox** — `schema/notifications.ts` (producer = this domain): `recipientUserId` FK, `type`,
  `payload`, a monotonic `seq`, `readAt` / `dismissedAt`. The table is the source of truth (so an offline recipient
  finds the event on return); it is **NOT** a transient bus.
- **The record/read verbs** — `record` (write a notification, **durable-first** — INSERT inside the producer's
  membership-transition tx; the fan-out is the after-commit hook), `markRead`, `dismiss`, `list` (the caller's own inbox,
  cursor-paged). Every verb is scoped to `Principal.userId` — a user reads ONLY their own inbox.
- **The closed event contract** — `NotificationEvent` (`@orb/contracts/notifications`) is a **closed discriminated
  union** (`invite` / `kicked` / `handoff-nominated` / `handoff-accepted` / …) with `recipientUserId` **mandatory** and
  credentials/secrets/baseUrls **type-level-unrepresentable** (a phishing/exfil belt — neo §9). The `PresenceView` lives
  here too (presence itself is transport's; the wire shape is a contract).

This domain does **NOT** own:

- **The subscription transport** — the `authedProcedure.subscription` (filtered to the caller, `tracked()` yields,
  `lastEventId` replay — the `chat.streamMessages` resume shape) is **`transport`** (`core/Tier-4-Transport.md`). This domain
  supplies the durable backing + the verbs; transport streams them.
- **Presence** — the server-derived SSE connection ref-count is **transport** state (injected into chat as
  `presence.read`); only the `PresenceView` wire shape is a contract.
- **What to notify** — producers (chat's invite/kick/handoff verbs) decide; they call `notifications.emit` (an injected
  op), they don't reach in. No producer imports this domain's internals.

---

## 8-slot layout

```
domain/notifications/
├── index.ts        FRONT DOOR — NotificationsService, createNotificationsService, the emit op type
├── service.ts      COMPOSITION ROOT — wires the verbs; ZERO logic
├── context.ts      DI BUNDLE — explicit `interface NotificationsContext` (db)
├── contract/
│   ├── service.ts  interface NotificationsService (record/markRead/dismiss/list) + NotificationsContext
│   ├── params.ts   per-verb *Params
│   ├── results.ts  InboxView / the list page shape
│   └── views.ts    (read-models; the NotificationEvent union + PresenceView are in @orb/contracts/notifications)
├── verbs/
│   ├── record.ts       durable-first write (INSERT in the producer tx; emit after commit)
│   ├── read.ts         markRead · dismiss
│   └── list.ts         the caller's own inbox (cursor-paged, recipientUserId-scoped)
└── persistence/
    └── queries.ts  the notifications table reads/writes (recipientUserId-scoped)
```

No named subsystems; no `substrate/` (it's a thin durable surface).

---

## Cross-feature composition (the injection model)

- **As a provider:** `notifications.emit` is the injected producer-facing op — it **wraps the domain's `record`
  verb** (the durable INSERT) plus its after-commit fan-out hook (`emit` = `record` + bus fan-out; one op, the
  `record` verb is its core). It is injected (at the composition root) into **chat** (invite/kick/handoff) and any
  future producer. Producers never import this domain's internals — they receive the op. **Durable-first/fan-out-
  second:** the INSERT runs inside the producer's membership-transition tx; the per-user bus emit is the after-commit
  hook (so a crash between can't deliver an event with no durable row, and an offline recipient still gets it on return).
- **Consumed by transport:** `transport` exposes the `authedProcedure.subscription` over the caller's inbox (the
  `chat.streamMessages` resume shape) + the `list`/`markRead`/`dismiss` procedures.
- **Gated `AUTH_MODE != 'single-user'`** server-side (single-user has no peers — `spine/identity-auth-permission §2c`).

---

## Invariants (gate candidates)

1. **Durable-first** — a notification is INSERTed before any fan-out; deliverable from the table alone (kill the emit
   path → `list` still returns it). _(test: `notifications-durable-first`.)_
2. **The event union is closed + secret-free** — `NotificationEvent` cannot represent a credential/baseUrl;
   `recipientUserId` is mandatory. _(compile-time + a type-level test; `bus-payload-allowlist`.)_
3. **Recipient-scoped reads** — every read/markRead/dismiss is scoped to `Principal.userId`; no cross-user inbox read.
   _(test.)_
4. **The stream uses the resume shape, never `buddy.stream`** — `tracked()` + `lastEventId` replay from the durable
   table. _(resolve-time: the subscription is transport's, over this table.)_
5. **No agent recipient (D60)** — `record` REFUSES a `kind='agent'` recipient (agent-principal-design/06 §3 + inv 2):
   an agent principal is structurally sessionless, so a durable row addressed to it would only rot. Enforced at the ONE
   write chokepoint via the injected `isAgentRecipient` read (notifications never reads `users` itself —
   `no-direct-users-read`; the entry root supplies the `users.kind` read, the `resolveAgentEnabled` precedent). Every
   producer funnels through `record`, so all of them inherit the belt; a future MULTI-recipient producer (automation
   `post_notification`, plugin `notify`) must EXCLUDE agent participants when expanding `all_members`/`participants`, and
   this chokepoint is the loud backstop. _(test: `record` rejects an agent recipient, writes no row.)_
