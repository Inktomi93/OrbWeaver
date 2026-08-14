---
kind: design
status: parked
updated: 2026-08-14
---

# 03 — The Capability Ceiling: Two Walls, One Seam, One-Flip Containment

> **Status: COMMITTED (D60, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** The borrowed-identity model gave three safety properties for free (kill switch,
> propose/confirm, the `buddy_turns` firewall). This doc re-derives them as EXPLICIT enforcement
> for a principal that is no longer "just the owner" — without building a second auth model.

---

## 1. Wall one (structural): an agent is never a `Principal`

The deepest guarantee is an absence: **there is no request path that yields an agent
`Principal`.** All three Principal construction sites at the entry seam refuse agents (doc 01 §3
— validate's `kind='human'` join, provisionIdentity's namespace+kind refusals, the owner-only
fallback), and `Principal` deliberately does NOT gain a `kind` field.

**WHY no `Principal.kind` — the decision this whole doc hangs on:** a second Principal flavor
re-opens the exact ambiguity the transition exists to close. Under borrowed identity, "is this
caller really the owner or the owner's agent?" was unanswerable; a `kind:'agent'` Principal makes
it answerable but re-askable at EVERY one of the hundreds of `can()`/verb call sites — each a
place to forget the check. Unconstructability answers it once, for all of them, at compile time:
an agent cannot call tRPC, cannot redeem an invite, cannot read `previewAssembly`, cannot touch a
single verb that takes a `Principal` — which is every verb. *(Rejected: `Principal.kind:'agent'`
+ deny-arms in `can()` — a runtime deny at N sites vs. a type that can't exist; the enforcement
ladder (AGENTS-1 §2.2) says push it up. Rejected: a "service Principal" for agents so they can
call verbs "like anyone" — that is the second auth model the rules forbid, and it makes the
ceiling a blocklist instead of an allowlist.)*

What an agent CAN do is therefore exactly what the server does **on its behalf inside the turn
engine** — the agent acts as a **speaker**, never a caller. That surface is small, enumerable, and
enumerated in §3.

```ts
// @orb/contracts/identity — the actor type for the ONE runtime gate. NOT a Principal;
// nothing converts between them (no constructor, no cast site — compile-level separation).
export interface AgentActor {
  readonly kind: "agent";
  readonly userId: UserId;        // the agent's principal row
  readonly ownerUserId: UserId;   // from users.ownerUserId (read with the roster)
  readonly enabled: boolean;      // from users.enabled — the kill switch (§4)
}
```

## 2. Wall two (explicit): `canAgent` — a closed-union arm on the ONE `can()` seam

The rules: nothing builds a second auth model; every answer routes through the existing
`can()`/Principal spine. So the agent gate is a NEW EXPORT OF THE SAME SEAM
(`domain/admin/guard.ts` — pure, no Db, resource data passed in), not a new module:

```ts
// @orb/contracts/identity — the ceiling IS this union. An action not listed here is not
// deniable-at-runtime; it is UNSPELLABLE. Growing the ceiling = adding a member (a ledger call).
export const AGENT_ACTIONS = ["speak", "tool-propose"] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

// domain/admin/guard.ts — beside `can()`; the same pure-verdict discipline
export const canAgent = (actor: AgentActor, action: AgentAction, room: ChatRoster): void => {
  if (!actor.enabled) throw new DomainForbiddenError("agent principal disabled");   // the kill switch
  // present-membership was established by the roster load (the same loadMemberChat discipline);
  // the roster row passed in IS the seat — a kicked agent (leftSeq) never reaches here.
  switch (action) {
    case "speak":          return;  // seated + enabled ⇒ may author a turn in THIS room
    case "tool-propose":   return;  // may STASH a proposal during an agent-mode turn (never execute)
    default: assertNever(action);
  }
};
```

Callers: the chat engine gates every agent-speaker turn with `canAgent(actor,'speak',roster)`
before dispatch (belt on top of the present-predicate, which already excluded disabled/kicked/
principal-disabled agents from selection — 2-layer, the admin doctrine); the tool-use executor
gates a mutating tool's proposal stash with `'tool-propose'`.

**WHY a closed allow-union and not a deny-list:** the trio the borrowed model gave for free worked
because the agent could do *nothing except what the code explicitly did as the owner*. An
allowlist preserves that shape — new capability is a deliberate tuple member + ledger entry, and
"we forgot to deny X" is not a failure mode that exists. **WHY it lives in guard.ts:** one home
for every privilege comparison (the file's own header law); the ceiling grows in the same file the
global and chat axes live in, and the exhaustive-dispatch gate covers it.

## 3. The ceiling table (authoritative — every row names its enforcer)

| Action | Agent may? | Enforced by |
|---|---|---|
| author a message in a room it is seated in | **YES** | `canAgent('speak')` + the present-predicate (doc 02 §1.1) + the engine runs it — the only authoring path |
| be arbiter-selected / auto-mode chained | **YES** | arbitration over `isAiDriven` kinds; its turns debit the human `triggeredBy`'s COUNT budget (unchanged D17 machinery) |
| stash a tool PROPOSAL during its agent-mode turn | **YES** | `canAgent('tool-propose')`; tools return proposals, never perform writes (buddy inv 3 — carried verbatim) |
| execute/confirm a proposal | **NEVER** | `confirm` is a human verb taking a `Principal` — structurally out of reach; ownership + `agencyEnabled` + hourly rate-limit gate it (the trio, intact) |
| call ANY tRPC verb (config, invites, roster, funding, export, admin, …) | **NEVER** | wall one — no session, no Principal, no request path |
| read prompt previews / host-ring content (`previewAssembly`, `peekPrompt`, plot state) | **NEVER as a caller** | wall one. (What the MODEL sees in ITS OWN prompt is the view-builder's ring discipline — rpg-12 §3: an agent speaker gathers the table-visible ring, never `{{rpgSecrets}}`) |
| resolve credentials / fund a turn | **NEVER** | D19 — `runAsUserId` is the host; `resolveCredential` never receives an agent id (the `turn-identity` gate, unchanged); owner-delegation (doc 01 §6) passes the OWNER's id, not the agent's |
| hold `admin`/`owner` role | **NEVER** | the `users_agent_shape` CHECK (`role='user'`) + `setRole` refusal (doc 06 §1) |
| log in / hold a session / redeem an invite | **NEVER** | doc 01 §3 — DDL + the three refusal belts |

## 4. The safety trio, re-derived one-for-one

| Borrowed-identity freebie | Principal-model replacement | Delta |
|---|---|---|
| **Kill switch** (`agencyEnabled` — hands off ⇒ no tool turn) | TWO switches, two scopes: `agencyEnabled` keeps gating the HANDS (tool-mode turns, solo and room — buddy-local, unchanged); **`users.enabled=false` on the agent row is the new PRINCIPAL switch** — the agent stops existing as an actor: dropped from every present cast and arbitration pool, every `canAgent` throws, its seats stay (kick separately if wanted) but never speak | the new switch is BROADER (all rooms at once) and lives on the identity, where admin containment tooling already operates (`setEnabled` — doc 06 §1) |
| **Propose/confirm gate** (agent suggests; `buddy.confirm` executes) | carried VERBATIM — `'tool-propose'` is in the ceiling, execution is not; `confirm` requires a human `Principal` + ownership + `agencyEnabled` + the hourly rate-limit | none — the gate never depended on borrowed identity; it now has a name in the ceiling union |
| **The `buddy_turns` firewall** (no chat writes, no chatId in the request type) | inverts FOR ROOMS ONLY: room speech is chat canon authored by the engine (doc 04); the solo path keeps the compile-time no-chatId shape; buddy the DOMAIN still never writes `messages` (dep-cruiser) | doc 04 §4 — the guarantee is re-homed, not weakened |
| *(implicit)* rate limit (hourly mutation window) | carried for the hands (buddy `agency/`, `ASSUMES(single-replica)` — unchanged); room SPEECH is bounded by the existing per-member turn-COUNT budget debited to `triggeredBy` + auto-mode's dual bound (turn cap AND spend ceiling) | a per-agent speech quota is DEFERRED — *criterion: a real runaway that the auto-mode bounds + disable-flip did not contain* |

## 5. Containment — the runbook property ("one row flip")

A runaway agent principal is contained by, in escalation order:

1. **Mute** — `setParticipantDisabled` (host, per room): stays in cast, never selected.
2. **Kick** — the membership lifecycle (host, per room): `leftSeq` stamped, stream torn down in
   the kick tx, witnessing horizon closed. The invite/kick machinery works on agent seats with
   zero changes (they are roster rows).
3. **Disable the principal** — `admin.setEnabled(agentUserId, false)` (admin ∪ owner; audited):
   ONE row flip. Everything downstream reads it: the present-predicate (doc 02 §1.1) drops the
   agent from every cast; `canAgent` throws on any in-flight turn's gate; solo-buddy agent-mode
   asks keep their own switch (`agencyEnabled`) — the principal flip governs the PRINCIPAL's
   actions (rooms, seats), not the owner-scoped solo toy. *(DECIDED — RATIFIED as designed,
   Nate 2026-07-01: solo rides `agencyEnabled`; the principal flip governs rooms/seats only.
   Do not wire solo `ask` to the principal row.)*
4. **Delete the owner** — cascades the agent away entirely (doc 01 §1, referential physics).

The **containment suite** (doc 07 §4) pins: a disabled agent principal can do NOTHING — no turn
runs, no arbitration selects it, no auth mode resolves it, no verb accepts it, its GM-seat
authority (doc 05) refuses, and re-enabling restores exactly what was.

## 6. Invariants (gate candidates)

1. **No agent `Principal` can exist.** No construction site accepts an agent row; `Principal` has
   no `kind` field to smuggle one through. *(compile + the auth-matrix tests.)*
2. **`AgentActor` and `Principal` never interconvert.** No function takes one and returns the
   other. *(lint: a grep-gate on the two type names in one signature; review.)*
3. **`AGENT_ACTIONS` is the ceiling** — a new agent capability is a tuple member + a guard arm +
   a ledger entry, or `tsc` red. *(exhaustive-dispatch on `canAgent`.)*
4. **Every agent-speaker turn passes `canAgent('speak')`** before dispatch, inside the engine.
   *(test: disabled/kicked agents refuse at the gate even when force-injected past selection.)*
5. **Tools still only propose; `confirm` still requires a human Principal + the trio.** *(the
   buddy inv-3 tests, carried; a propose-then-no-confirm asserts zero side effects.)*
6. **Disable is total** — the containment suite's "can do NOTHING" matrix is green. *(test.)*
