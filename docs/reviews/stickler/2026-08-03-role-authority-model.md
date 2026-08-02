# Stickler design review — the ROLE/AUTHORITY model (vocabularies · chokepoints · the agents future)

**Charge (owner, near-verbatim):** "role is kinda messy and will get worse when we add agents and
such — should we unify rpg onto can() and centralize all role stuff?" Deliverable grade: the
2026-08-02 actor-state-model review form — coherent-as-is with receipts, or a spec-grade staged
reshape with owner forks. Plus the Q4 deliverable: the clause text for the two-class law's queued
close-out D-entry (the workboard's "ceremony D-ENTRY (waits for stickler's clause text)",
`docs/retro-workboard.md:369`).

**Reviewer:** stickler (fresh context). Everything below was read/evidenced this session; the
verification log is §8. The fixes already landed (the 6-verb `assertHostRole` collapse, the
`two-class-role-authority` gate, `permitsHost` wiring, `SessionToken` branding, the `viewerIsHost`
derivation move) were taken as standing and audited, not relitigated.

---

## VERDICT: COHERENT CORE — reshape-LITE, not a reshape

The role model is **not mis-shaped**. Its separation of axes is genuinely clean — cleaner than the
owner's "messy" instinct suggests — and the agents future **EXTENDS it** through seams that are
already reserved in DDL, tuples, and comments. What is real about the mess is small, enumerable,
and mostly *spelling* debt, not *shape* debt:

- **One S-sized unification is worth doing now (Q1): rpg onto `can()`** — the automation domain is
  the existing proof of the exact wiring, `Principal` is already in every rpg verb, and the gate's
  two-sided `SANCTIONED_HOMES` row was built to self-red when it lands (§2, stage R1).
- **One genuine incoherence to rule on (F1): the host-payload/strip verdict has THREE live
  spellings** across chat's read surfaces — inline `role === "host"`, `permitsHost`, and
  `viewerReadsHidden` — with same-day file comments each claiming law, and D110's "homed ONCE" text
  pulling against the SEC lane's invariant-#6 wiring at the classification boundary. The D-clause
  (§6) draws the line so a fresh agent classifies these sites deterministically; one of the two
  landed postures then yields (owner fork, recommendation given).
- **One law doc is lying (F2): `Spine-Identity-and-Auth.md` §4** claims the agent-principal
  mechanics (`canAgent`, `agent_principals`, the containment proof) are BUILT; they were purged
  2026-07-25 and none of the three exists on the tree. The §0.3 reading-set router sends every
  identity/auth task to this stale section.
- Everything else the charge asked me to suspect — the data-projection split, the clamp resolvers,
  automation's tier, workloads, sessions' mint, the client — **verified clean** (§1, §4, §8).

---

## 1. The inventory, as actually built (receipts)

### 1.1 The vocabularies — five axes, no conflation

| Axis | Members | Home | What it answers |
|---|---|---|---|
| `UserRole` | `owner\|admin\|user` | `packages/contracts/src/identity/index.ts:11` | global authority |
| `ParticipantRole` | `host\|member` | `identity/index.ts:68` (chat derives only the zod schema, `contracts/chat/roster.ts:26` — PD-59 one-home) | per-room authority |
| `UserKind` | `human` (+ dormant `agent`) | `identity/index.ts:18` | what flavor of principal |
| `ParticipantKind` | `human\|character` (+ dormant `agent`/`observer` in the DDL CHECK, `packages/db/src/schema/chat.ts:459-462`) | `contracts/chat/participants.ts:14` | what flavor of seat |
| `GlobalAction`/`ChatAction` | `admin\|owner` / `read\|host` | `identity/index.ts:59,63` | what is being demanded |

The classic conflation the owner fears (role = "who you are" fused with "what you may do") **is not
present**: kind and role are separate columns, separate tuples, separate CHECKs
(`chat_participants_kind_shape` + `chat_participants_role_check`, `db/schema/chat.ts:459-465`), and
no authority decision reads kind today. The richer per-verb demand vocabulary
(`CHAT_AUTHORITIES = member|author-or-host|host|member-card|lineage-per-ancestor|turn-owner`,
`chat/substrate/auth/matrix.ts:31`) is a *demand* table, not a second decision kernel — the
compound demands (`author-or-host`, `turn-owner`) are composed in the guards from the two-member
`ChatAction` kernel plus verb-local facts (author match, engine active-turns match).

### 1.2 The decision seams — who compares, and how

- **The kernel: `can()`** (`domain/admin/guard.ts:48-61`) — the ONLY `owner ⊇ admin` encoding
  (`ROLES_FOR_GLOBAL_ACTION`, `:14-17`, tsc-exhaustive) and the ONLY chat `role === "host"`
  enforcement compare (`decideChat`, `:35-37`). Pure, injected, never imported sideways.
- **Chat's chokepoint**: `guard.ts` (`requireParticipant`/`requireHost`/`requireAuthorOrHost`,
  feature root, the one `loadMemberChat` I/O + the D16 floor stamp) over
  `substrate/auth/decide.ts` (`assertParticipant`/`assertHost`/`permitsHost`/`assertAuthorOrHost` —
  every verdict routed into the injected `can`; chat owns only the leak-free NOT_FOUND collapse and
  the chat-coded refusal vocabulary). The matrix (`CHAT_VERB_AUTHORITY`,
  `satisfies Record<keyof ChatService, …>`) forces every new verb to classify at tsc.
- **rpg's chokepoint**: `domain/rpg/guard.ts` — membership via the injected `getMembership` op
  (impl: chat's `loadPresentRole`, `chat/persistence/roster.ts:20-27`, wired at
  `entry/compose/chat.ts:1058`), leak-free `notFoundGame` collapse, and the ONE local privilege
  compare `assertHostRole` (`:56-60`) that six verbs + `resolveHost` route through (sweep §8:
  exactly 7 call sites, zero stragglers). `assertOwnUserRef` (`:74-81`) is the member self-write
  arm with a host BYPASS compare (`:75`). `RpgContext` carries NO `can` (`rpg/contract/service.ts:459-532` —
  read whole; confirmed absent).
- **automation**: `resolveStreamAuthority` (`domain/automation/verbs/resolve-stream-authority.ts:24-31`)
  — the model citizen: derives its `host|member` tier BY CALLING the injected `can()` and catching
  the deny. Never compares role inline.
- **workloads**: `substrate/authorize.ts:32-40` — routes through the injected `isAdmin` (the
  `can()` boolean twin, `admin/guard.ts:75-82`); leak-free not-found posture stated in the header.
- **tool-use**: the registry's `ToolCapability` ceiling is *can()-shaped by type*
  (`{scope:"chat", action: ChatAction} | {scope:"global", action: GlobalAction}`,
  `tool-use/contract/params.ts:26`). rpg's 7 state tools register `capability: null` = member
  floor; the turn runs under the HOST principal (`rpg/tools/index.ts:9-10` header — the banked
  [Chat-tools-execute-as-HOST] fact, confirmed in source).
- **sessions**: `substrate/role-policy.ts` is the MINT side only (IdP groups → `UserRole`); its one
  privilege-adjacent branch deliberately re-tests the GROUP predicate, not the role literal
  (`:102-105` comment citing the `owner-role-split` gate). Clean.
- **Data projections (class 2)**: `chat/substrate/member-visibility.ts::viewerHoldsHost` (`:106-108`)
  is THE one spelling for the projection class; `viewerReadsHidden` (`:116-118`) is its named lens;
  `chat-detail.ts:78` consumes it (the owner's 08-03 ruling (2), landed in `3e677c0e`).
- **Entry-tier payloads (outside `domain/`)**: `entry/compose/automation-plugin.ts:354,:390` build
  `canWrite: role === "host"` plugin-realm payloads off `loadPresentRole` — class 2, the gate's
  declared blind spot, confirmed payload-only (read in context).
- **Transport**: `stream/sources/automation.ts:54` compares `authority === "host"` — a
  `StreamAuthority` TIER string (itself can()-derived upstream), not a `ParticipantRole`. Confirmed
  a different axis sharing a lexeme, as the gate header declares.

### 1.3 The classes the tree ACTUALLY holds — five, not two

The two-class ruling partitions the *gate-relevant* space correctly, but the tree holds five
distinct role-read shapes. The D-clause must name them or a fix-all pass will "repair" legal code:

1. **ENFORCEMENT** (verdict gates a throw) → the kernel via a chokepoint. Gated
   (`two-class-role-authority` + `owner-role-split`).
2. **DATA PROJECTION** (payload/view field) → `viewerHoldsHost` home. Gate-immune by the
   throw-position test.
3. **POLICY RESOLUTION** (role → policy VALUE): `clamp.ts:60` (`role === "host"` ⇒ floor 0 — D106's
   "authority implies visibility") and `clamp.ts:123` (`host` ⇒ card visibility `full`, D22). Not
   enforcement (no throw), not a payload field (a resolver input). Legal, but currently spelled
   inline rather than composed from `viewerHoldsHost`.
4. **HOST LOOKUP** (role → identity, D19 "the host resolves by ROLE"): ~14 inline spellings of
   `roster.find((r) => r.role === "host"…)` across chat (`service.ts:78`, `backfill.ts:71,198`,
   `extract-quiet.ts:26`, `post-narrator-message.ts:37`, `read.ts:340,545,637`, `turn.ts:211`,
   `edit.ts:228,336`, `resolve-rpg-roster.ts:49`, `resolve-rpg-card-corpus.ts:44`,
   `invites.ts:163`; the gate's mustPass row blesses the shape). TWO variants exist — with and
   without the `&& r.userId !== null` belt — see F3.
5. **TIER DERIVATION** (kernel verdict → data tier): automation's `StreamAuthority`. The correct
   template for any future derived tier.

### 1.4 The client — no twin of the mess

Swept `packages/client` in both `ts` and `tsx` (§8): every authority-derived affordance threads the
server-resolved `ChatDetail.viewerIsHost` (rpg context tabs, persona re-pin, options menu, header,
cast bar — all `viewerIsHost` consumers; `use-chat-persona.ts:21` states the client hide is
cosmetic and the server re-gates). Exactly two literal role reads exist, both display-only:
`chat-cast-bar.tsx:80` (host crown icon) and `committed-members-tab.tsx:31` →
`member-rows.ts:75` (an `isHost ? "host" : "member"` display label re-mint). No client-side
authority derivation. **Verified clean.**

---

## 2. Q1 — two chokepoints: transitional debt, and the unification is SMALL

**Verdict: transitional debt, worth retiring now (stage R1).** The gate itself already says so
("unifying rpg onto the chat spine is a compose-seam change, queued as its own item",
`two-class-role-authority.ts:17-19`), and built its `SANCTIONED_HOMES` row two-sided specifically
so the unification self-verifies ("rpg's row goes stale-RED by itself when the can()-unification
lands", `docs/retro-workboard.md:347-348`).

Why it is debt and not a coherent end-state: with `PARTICIPANT_ROLES` frozen at two members,
`role !== "host"` and `can(…, "host", …)` are extensionally identical — but the moment the axis
widens (a co-host, an agent-narrator tier, an admin-override-on-chat policy), **the kernel updates
in one place and rpg's inline compare silently diverges**. That divergence is exactly the drift
spine invariant #6 exists to kill, and the agents future (§3) is precisely the event that ends the
two-member era. Retire the second site before the axis moves.

**What the injected authority op looks like — the automation shape, not a new op shape:**

- `RpgContext` gains `readonly can: Can` (`Can` lives at the DAG root,
  `contracts/identity/index.ts:90-93` — rpg already imports `ParticipantRole`/`Principal` from
  there; zero flow violation; `AutomationContext.can` at
  `automation/contract/service.ts:44` is the identical precedent).
- **`Principal` already belongs in rpg's verbs** — it is already there. Every verb takes
  `params.principal` and `resolveMember(ctx, principal, chatId)` consumes it
  (`rpg/guard.ts:32`, `verbs/patch-actor.ts:36`). The charge's worry ("verbs are keyed on
  membership today") dissolves: membership resolution stays exactly as-is (the injected
  `getMembership` op — never a chat-table read, D23); only the *verdict over the resolved role*
  moves into the kernel.
- `guard.ts` REMAINS rpg's cited chokepoint file. `assertHostRole(role, reason)` becomes
  `assertHostRole(can, principal, role, reason)` and routes through the kernel with the
  catch-and-reword pattern chat's `permits()` already uses (`decide.ts:38-48`): catch the kernel's
  `DomainForbiddenError`, rethrow with the verb's own refusal sentence — **byte-identical refusals
  preserved**, so `tests/server/domain/rpg/authority.suite.int.test.ts` (the 15-case
  host/member-own/member-foreign/non-member grid — read, real assertions against the real verbs +
  seeded db) passes unmodified. `assertOwnUserRef`'s host BYPASS (`:75`) routes through the same
  boolean (`permits`-style), keeping its grant-never-deny shape.
- The leak-free `notFoundGame` collapse, `resolveMember`'s game+membership bundling, and
  `resolveHost` are untouched — they were never the debt; the comparison was.
- **Caller-gate law compliance**: `can` is pure and takes the principal explicitly per call —
  no caller can be dropped; no credential resolution rides it. The one rpg op that DOES carry
  caller-gate risk (`promoteToRoster`'s `hostUserId` threading) was audited and is compliant
  (`rpg/contract/service.ts:204-213`, `compose/rpg.ts:145-182` — host resolved by role at the
  verb, threaded explicitly, card minted under that user).

**A narrower "verdict op" (the D106 `resolveViewerVisibility` data-threading pattern) is the WRONG
shape here**: that pattern exists for *visibility data* a foreign domain must not re-derive. An
authority *decision* seam that is pure and Principal-explicit is exactly what `can` already is —
minting a second, rpg-flavored wrapper op would be a new one-off vocabulary for the same verdict
(the two-homes defect the collapse just cleaned up).

Sizing: **S** — ~6 files (`rpg/contract/service.ts` +1 member · `guard.ts` ~15 lines ·
`compose/rpg.ts` deps+wire (compose already imports `can` from `#domain/admin` in five sibling
files — `services.ts:29`, `automation-plugin.ts:27`, `admin.ts:11`, `databank.ts:10`,
`search-discovery.ts:22`) · the gate row deletion · the test harness passes the REAL `can` (it is
pure — no fake needed)). Gate change: delete the rpg `SANCTIONED_HOMES` row **in the same commit**
(the both-ways ratchet self-reds otherwise — which is the receipt the ratchet works) and reword the
gate header/FIX text; `Core-Enforcement-Active-Gates.md:182` row updates to match.

---

## 3. Q2 — the AGENTS future: the model EXTENDS; two seams to hold, one constraint to write down

### 3.1 Extend, not break — the receipts

Every widening the owner is worried about already has a reserved seat:

- **Seat kind**: `chat_participants_kind_shape` carries dormant `agent` (userId-backed) and
  `observer` (both-null) arms as DDL *today* (`db/schema/chat.ts:452-462` — "kept as DDL now so the
  rebuild doesn't need a second migration"). `rosterMemberSpecSchema` documents where the
  `agent`/`observer` arms graft back (`contracts/chat/roster.ts:96-98`).
- **Principal kind**: `USER_KINDS` is "a tuple, never an `isAgent` boolean, so it can grow a third
  flavor without if-branching" (`contracts/identity/index.ts:16-18`); `users_agent_shape` CHECK
  survives dormant (`db/schema/users.ts:77` — agent ⇒ loginless, `role='user'` forced, owned).
- **The deny seam is pre-named**: "this is the seam where a future `observer` participant kind will
  deny" (`admin/guard.ts:31-32` + `chat/guard.ts:50-51`) — the *place* is agreed; only the payload
  is missing (§3.2).
- **Authority tier ≠ identity**: an agent seat holds a `users` row whose GLOBAL role is DDL-forced
  `user` and whose ROOM role would be `member` — the axes stay orthogonal; "narrator" is a kind (or
  a synthetic character, the `mintSyntheticGroupCharacter` pattern —
  `character/verbs/mint-synthetic-group-character.ts:1-7`: identity-plane synthetic, no authority
  plane at all), never a role.

So the answer to "is authority a function of (kind × role × context) that should have ONE
kernel?": **yes, and the kernel already exists and already sits in the right place** —
vocabularies + the `Can` type at the DAG root (`contracts/identity`), the implementation at
`domain/admin/guard.ts`, injection everywhere else (chat, automation, plugin, tool-use ceiling,
workloads via `isAdmin`). Do NOT mint a new "authority substrate every domain injects from" — that
package exists and is called `can()`. The spine's own formula ("permission = global-role ×
resource-role × capability", `Spine-Identity-and-Auth.md:33-39`) is the (kind × role × context)
kernel under its house name; **capability is the kind-keyed factor**, and it is the purged piece.

### 3.2 Seam ONE — `ChatRoster` is role-only; kind joins the verdict input at the seat wave

`ChatRoster` is `{ readonly role: ParticipantRole }` (`contracts/identity/index.ts:73-75`). The
pre-named observer/agent deny is **unrepresentable** until it carries `kind`. Owner fork:

- **(a) Widen now** (`{role, kind}`) — locks the extensible shape early ([lock-the-extensible-shape]),
  but the field is genuinely dead: every live `Principal` is human, character seats never call
  verbs, and no arm of `decideChat` could read it. Cost: 4 construction sites + one extra column in
  `loadPresentRole`.
- **(b) Widen at the seat wave** — **recommended**, because the forcing mechanism is already
  structural: adding a required `kind` to `ChatRoster` fails `tsc` at every construction site
  (`decide.ts:44`, `chat/guard.ts:51`, `resolve-stream-authority.ts:25`, the tool-use ceiling
  check), and `decideChat`'s `assertNever` + the matrix's `satisfies Record<keyof ChatService,…>`
  force the new arms. A dead input now buys nothing the compile-forcing doesn't already guarantee;
  the doctrine's no-phantom-arms posture (the 2026-07-25 purge narrowed the live tuples on
  purpose) points the same way. The D-clause names the seam so it cannot be forgotten (§6).

### 3.3 Seam TWO — the capability ceiling re-lands as the third factor (and its doc is currently a lie)

The agent ceiling (`canAgent` over `AGENT_ACTIONS = ["speak","tool-propose"]`) is the purged third
factor. **F2 (confirmed):** `Spine-Identity-and-Auth.md:69` (§4) claims it is BUILT with a
containment proof — the tree has **zero `canAgent` declarations** (ast-grep function + assignment
sweeps: empty; literal hits are 3 comments — `admin/index.ts:2`, `admin/verbs/set-enabled.ts:63`,
`chat/engine/engine.ts:172`), **no `agent_principals` table** (schema dir listed), and
`tests/server/domain/admin/containment.suite.int.test.ts` **does not exist** (dir listed:
`guard.test.ts`, `persistence/`, `verbs/`, `_support.ts`). `admin/index.ts:2`'s header also still
claims to re-export `canAgent` while the export list doesn't. The doc is dated 2026-07-13
(pre-purge) and the §0.3 router sends every identity task to it. Fix: truth-repair §4 to the
dormant-doorway posture the db comments already use (an S doc edit; the re-land itself is the seat
wave's).

### 3.4 The constraint to write down NOW: agent authority is NEVER inherited host authority

Two banked facts collide at the seat wave: **chat tools execute as HOST** (rpg's 7 state tools:
`capability: null` member floor + "the turn runs under the host principal",
`rpg/tools/index.ts:9-10`; the turn's `runAsUserId` triple, `matrix.ts:76`) and **the injected-op
caller gate** (params dropping the caller = cross-tenant hole). Today this is sound *because every
turn initiator is a human who cleared `requireParticipant`* (`send: "member"`). The moment an agent
seat can initiate a turn, the host-principal execution context would hand the agent the host's full
tool ceiling by inheritance — the exact containment problem `canAgent` existed to solve. The
doorway sentence for the D-clause rider: *an agent initiator's ceiling derives from its OWN
capability factor at the point of initiation; it never inherits the host principal's authority
through the turn execution context.* (Design constraint, not a today-defect — named so the seat
wave cannot improvise it away.)

---

## 4. Q3 — the neighboring permission planes: which are IN, which stay BESIDE

| Plane | Verdict | Why (receipts) |
|---|---|---|
| member-visibility payload split (hidden-span strip) | **BESIDE, by ruling** — but see F1 | D106-F1/D110: the verdict is a projection threaded as data; the home is deliberately Principal-free (`member-visibility.ts:100-105`) |
| hidden-span mid-stream scrubbing | BESIDE | mechanism, not authority — producer-side stamper (`member-visibility.ts:236-301`) |
| D22 member-card tiers | BESIDE (policy class 3), parked | `clamp.ts:122-124` resolves role→level; the enforcement half is the matrix's `member-card` row + `requireParticipant`; setter needs multi-user (workboard) |
| D16 history floor | BESIDE (policy class 3) | `clamp.ts:55-64` — "authority implies visibility" (D106): role is an INPUT to a visibility policy, not a gate |
| CSP / render-policy trust tiers | BESIDE, different axis entirely | `resolveRenderPolicy` (`contracts/chat/roster.ts:140-145`) keys on deployment × character trust — no caller role anywhere in it |
| workloads / automation / plugin principals | **IN — already routed** | workloads → injected `isAdmin` (`authorize.ts:32-40`); automation → injected `can` (`resolve-stream-authority.ts`); plugin ceiling runs as the INSTALLING principal (`tool-use/contract/params.ts:73-75`), event scope reads `loadPresentRole` as payload |
| sessions role governance (IdP groups) | BESIDE — the MINT side | `role-policy.ts` derives, never compares the lattice (`:102-105`); `owner-role-split` guards the boundary |
| `SessionToken` brand | BESIDE — authn provenance, not authz | brand = provenance, authenticity stays the peppered-HMAC lookup (SEC merge note, workboard:406-409) |

The unified model's membrane is therefore: **the kernel decides; chokepoints shape refusals;
projections and policies CONSUME role as data**. Nothing on the beside-list should move in.

---

## 5. The findings (severity-ranked)

1. **[F1 — CONFIRMED incoherence, needs a ruling] The host-payload/strip verdict has three live
   spellings, and two same-day comment regimes contradict at the boundary.** The SAME verdict class
   ("does this viewer receive host-plane bytes / the host payload flag?") resolves as:
   (a) inline `membership.role === "host"` — `chat/verbs/read.ts:716-717` (`listMessages`' strip
   fork); (b) `permitsHost(ctx.can, …)` — `read.ts:1127` (`replayChatEvents`) and `read.ts:1167`
   (`chatEventBounds`, whose result feeds BOTH strip behavior AND the `viewerIsHost` payload field
   at `:1169`); (c) `viewerReadsHidden(viewer)` — `member-visibility.ts:129,:311,:356` (turn
   returns, stream replay, durable replay). The comments at `read.ts:1125-1126` claim invariant #6
   makes (b) mandatory ("never an inline `role === 'host'`"), while `chat-detail.ts:73-78`,
   `decide.ts:70-77`, and `member-visibility.ts:100-105` claim routing a payload verdict through
   `can()` is itself the defect — and D110's ratified text says the verdict is "homed ONCE
   (`viewerReadsHidden` …) — no consumer re-derives `role==='host'`". No behavioral divergence
   exists TODAY (all three reduce to the same compare), but this is the exact three-spellings drift
   the owner smelled, sitting on a security boundary, and the next widening of host semantics
   splits them. **Fork (§6 resolves it):** rule which class byte-selection verdicts belong to. My
   recommendation: the PROJECTION class — the throw-position test (the gate's own mechanical line)
   already classifies all of (a)/(b) as class 2, D110 is ledger-ranked, and `viewerReadsHidden`
   exists precisely as the named lens that could legitimately diverge from operation-authority
   later (a hypothetical co-gm who commands the room but must NOT read deception truth). Under
   that ruling, `read.ts:716,717,1127,1167` all become one `viewerHoldsHost`/`viewerReadsHidden`
   call (S-sized; un-does half of the SEC lane's permitsHost wiring — that lane's OTHER deliverable,
   the brand + cross-cites, stands). The opposite ruling (byte-selection = enforcement) is
   defensible but must then rewrite D110's one-home sentence and thread `permitsHost` through
   `listMessages` + both member-visibility fast-paths.
2. **[F2 — CONFIRMED, law-doc rot] `Spine-Identity-and-Auth.md` §4 describes purged machinery as
   BUILT** (detail §3.3: no `canAgent`, no `agent_principals`, no containment suite;
   `admin/index.ts:2` stale re-export claim). Consequence: the identity reading-set misleads every
   cold agent on exactly the surface this review governs. Fix: S truth-repair to dormant-doorway
   posture; ride the close-out D-entry commit.
3. **[F3 — CONFIRMED, minor] The host-LOOKUP class (~14 spellings) has no home and two variants.**
   Sites in §1.3(4). Most spell `find((r) => r.role === "host" && r.userId !== null)`; three drop
   the userId belt (`service.ts:78`, `resolve-rpg-roster.ts:49`, `resolve-rpg-card-corpus.ts:44`).
   No live bug (no write path grants `host` to a non-human seat: `startChat` mints the caller host,
   `redeemInvite`/`acceptInvite` server-force `member` — `matrix.ts:44,135-136`; handoff swaps
   between humans, `roster.ts:672`), but two spellings of one lookup = the drift class D19 warns
   about, and it is the single biggest contributor to the "role is everywhere" feel. Fix: one
   `hostUserIdOf(roster)` helper in a chat substrate home, ~14 sites collapse (S; stage R2).
4. **[F4 — DESIGN SEAM, not a defect] `ChatRoster` is role-only; the pre-named observer/agent deny
   is unrepresentable until it widens** (§3.2). Forcing mechanism verified; recommend widen-at-seat-wave
   with the clause naming the seam.
5. **[F5 — NO-ACTION, named constraint] Agent-initiated turns must not inherit host authority
   through the tool execution context** (§3.4). Sound today; write the constraint into the clause
   rider so the seat wave inherits it.
6. **[F6 — OPTIONAL, low] `clamp.ts:60,:123` spell `role === "host"` inline in the policy class**
   — legal, gate-immune, but composing `viewerHoldsHost` makes "one spelling of the host bit" true
   across all non-kernel classes (trivial; fold into R2 or skip).
7. **[F7 — OPTIONAL, low] Transport's `StreamAuthority` tier reuses the `host|member` lexemes**
   (`automation.ts:54`) — a permanent gate blind spot by axis collision. Renaming the tier
   vocabulary (e.g. `full|chips`) would delexicalize it; cosmetic, only worth it if the tier ever
   grows a third member.

**Verified clean (what my silence covers):** the 6-verb collapse is complete (sweep: 7
`assertHostRole` sites, all in guard/verbs; zero inline `role !== "host"` outside the two
chokepoints in `domain/**`); `owner-role-split` holds (zero owner/admin literal compares outside
`admin/guard.ts` — gate + sweep); the authority suite asserts the real verbs against a seeded db
across the host/member-own/member-foreign/non-member grid (assert-the-real, not a recording stub);
`membership-enforcer` bans owner-equality resurrection in chat; automation/workloads/plugin/tool-use
all route through injected kernel seams; sessions' mint never compares the lattice; the client has
no authority derivation (§1.4); `promoteToRoster`/`runResyncExtraction`/`runPopulateExtraction`
thread the role-resolved host explicitly per the caller-gate law (`compose/rpg.ts:145-182,
996-1006, 1076-1084`); the matrix is tsc-exhaustive over `ChatService` and default-deny for
non-verb surfaces (`authorityForSurface`, `matrix.ts:178-180`). The matrix's per-verb TRUTH
(row says `host` ⇔ the verb actually calls `requireHost`) is enforced by the probe suites +
new-router sweep classification, not structurally — a matrix→guard-call conformance gate is a
possible future hardening, not proposed here (the probe posture is the standing ruling).

---

## 6. Q4 — the D-ledger clause (the deliverable the ceremony D-entry is waiting on)

Drafted to be TRUE in the current state, true after every stage of §7, and self-retiring where
transitional. Number is the orchestrator's to mint; cross-cites assume the close-out entry also
records the LENS/SEC landings.

> **D1xx — The role-authority law: one kernel, cited chokepoints, and the two comparison classes.**
> Authority derives from two role axes with one home each (`UserRole` and `ParticipantRole`,
> `@orb/contracts/identity` — D17/D18) and is decided in ONE kernel: the injected `can()`
> (`domain/admin/guard.ts`; spine invariant #6). `owner ⊇ admin` and the chat `host` verdict are
> encoded there and nowhere else. Every read of a role vocabulary falls in exactly one of two
> classes, split by a MECHANICAL test — what the verdict DOES:
> **(1) ENFORCEMENT** — the verdict gates whether an operation proceeds (it throws, or selects a
> refusal). The comparison lives in the kernel; a domain reaches it only through its own CITED
> chokepoint file (chat: `substrate/auth/decide.ts` `assertHost`/`permitsHost`/`assertAuthorOrHost`
> under `guard.ts` `requireParticipant`/`requireHost`; rpg: `guard.ts`
> `resolveMember`/`resolveHost`/`assertHostRole`/`assertOwnUserRef`), which owns the domain-coded,
> leak-free refusal shape (not-found vs forbidden — the chokepoint's, never the verb's) but never
> the comparison. \[Transitional rider — DELETE at the rpg `can`-seam landing: until `RpgContext`
> carries the injected `can`, rpg's `guard.ts` holds the comparison locally as the ONE sanctioned
> second site; the `two-class-role-authority` gate's two-sided `SANCTIONED_HOMES` row self-reds the
> commit that changes this.\]
> **(2) DATA PROJECTION** — the verdict produces a payload/view field, selects a viewer's bytes, or
> resolves a role-conditioned policy VALUE. Deliberately Principal-free and kernel-free BY DESIGN:
> the host-bit has ONE spelling (`substrate/member-visibility.ts::viewerHoldsHost`; the payload
> boundary asks through its named lens `viewerReadsHidden` — D106-F1/D110), and the policy
> resolvers (`substrate/auth/clamp.ts` — the D106 history floor, the D22 card level) compose it.
> Wiring a projection through `can()` threads a Principal into pure code for zero behavior change
> and is itself a defect.
> Two shapes are in NEITHER class and stay legal: a roster host-LOOKUP (role → identity, D19 — one
> helper, never N inline spellings) and the role MINT (`sessions` group governance, D65 — it
> derives the axis and never compares the lattice). Enforcers: `two-class-role-authority` (the
> throw-position test IS the class line), `owner-role-split` (the global lattice),
> `membership-enforcer` (no owner-equality resurrection in chat).
> **The agents rider (the extension contract):** a new participant kind or authority tier lands as
> (a) a tuple member at the vocabulary home, (b) a kernel decision row — `ChatRoster` widens to
> carry `kind` the moment a verdict needs it (the construction sites are the compile-forced update
> set), and (c) a capability ceiling as the third permission factor (spine §2), decided at the
> kernel — never as a scattered compare, and NEVER by inheriting the host principal's authority
> through a turn's execution context: an initiator's ceiling derives from its own factors at the
> point of initiation.

---

## 7. The staged program (Q5 — R-form, per-stage cost / breakage / gate delta)

**R0 — mint the law (XS, docs+gate-text only, ride the queued close-out D-entry).** The §6 clause
into `Core-Path-Registry.md`; truth-repair `Spine-Identity-and-Auth.md` §4 + `admin/index.ts:2`
(F2); the F1 ruling recorded in the clause's class-2 sentence. Breaks: nothing.
Gate delta: none (text row in `Core-Enforcement-Active-Gates.md` cites the D-number).

**R1 — rpg onto the kernel (S).** Per §2: `RpgContext.can` + compose wire + `guard.ts` reroute
(catch-and-reword keeps refusals byte-identical) + harness passes the real `can`. Breaks: the gate
self-reds unless the rpg `SANCTIONED_HOMES` row is deleted in the SAME commit — that red is the
ratchet's proof; capture it as the probe receipt. Delete the clause's transitional rider in the
same commit. Gate delta: `SANCTIONED_HOMES` loses the rpg row; header/`MESSAGE`/`FIX` text updates;
`Core-Enforcement-Active-Gates.md:182` row updates.

**R2 — the one-spelling sweep (S).** F3: mint `hostUserIdOf(roster)` (userId-guarded spelling),
collapse ~14 sites. F1 (per the ruling): collapse `read.ts:716,717,1127,1167` onto the class-2
lens (or, under the opposite ruling, thread `permitsHost` the other way — either direction is
S-sized). F6 optional: `clamp.ts` composes `viewerHoldsHost`. Breaks: nothing behavioral; the
member-strip suites + authority suites pin the surfaces. Gate delta: none (lookup shape stays
legal; a follow-up gate arm banning NEW inline host-lookups outside the helper is possible but not
proposed — the helper's existence plus review is proportionate).

**R3 — the seat-wave seams (deferred to the agent-principal rebuild; sized here for honesty).**
`ChatRoster` widens `{role, kind}` (M across ~4 construction sites + `loadPresentRole` column +
`decideChat` arms); the capability factor re-lands (`canAgent` successor + containment suite —
M-L, the AP3/AP4 wave's own scope); the F5 initiator-ceiling constraint implemented at the turn
door. Breaks (by design): `tsc` at every roster construction site and every kernel dispatch — the
compile-forced update set is the mechanism. Gate delta: none required (the kernel stays the one
sanctioned home); the `two-class` gate's `isRoleRead` may need a `kind` sibling only if kind ever
becomes an enforcement-compared axis outside the kernel (it should not).

**R4 — doorways, parked:** D22 setter (needs multi-user) · rpg member-own-volatile arm
(`assertOwnUserRef` doorway kept honest at `patch-actor.ts:20-24`) · matrix→guard conformance gate
(optional hardening) · F7 tier-lexeme rename (cosmetic).

Recommended order: **R0+R1 as one wave** (the clause is simplest if its transitional rider dies
young), R2 behind it, R3/R4 parked on their owning programs.

---

## 8. Verification log

**Read IN FULL this session:** `.claude/agent-doctrine.md` · `docs/architecture/core/AGENTS.md` ·
`Core-Laws-and-Precedents.md` (whole) · `Spine-Identity-and-Auth.md` (whole) · D-ledger rows D106,
D110, D111, D22 (`Core-Path-Registry.md` regions) · the form template
`docs/reviews/stickler/2026-08-02-actor-state-model.md` (whole) ·
`scripts/check/gates/two-class-role-authority.ts` (whole) + its
`Core-Enforcement-Active-Gates.md:182` row · `scripts/check/gates/owner-role-split.ts` (whole) ·
`membership-enforcer.ts` (header+arms) · `domain/admin/guard.ts` (whole) ·
`contracts/identity/index.ts` (whole) · `contracts/chat/roster.ts` (whole) ·
`chat/substrate/auth/matrix.ts` + `decide.ts` + `clamp.ts` (whole) · `chat/guard.ts` (whole) ·
`chat/substrate/member-visibility.ts` (whole) · `chat/substrate/chat-detail.ts` (whole) ·
`domain/rpg/guard.ts` (whole) · `rpg/contract/service.ts` (whole, 709 lines) ·
`entry/compose/rpg.ts` (whole, 1342 lines) · rpg verbs `patch-actor.ts` + `edit-snapshot.ts`
(whole) · `sessions/substrate/role-policy.ts` (whole) ·
`automation/verbs/resolve-stream-authority.ts` (whole) ·
`transport/trpc/stream/sources/automation.ts` (whole region) · `workloads/substrate/authorize.ts`
(head+predicates) · `chat/persistence/roster.ts` (role-read region) ·
`rpg/tools/index.ts` (header+resolve region) · `tool-use/contract/params.ts` (capability region) ·
`character/verbs/mint-synthetic-group-character.ts` (header+adopt) · `db/schema/chat.ts`
(participant CHECK region) · `db/schema/users.ts` (kind/CHECK region) ·
`tests/server/domain/rpg/authority.suite.int.test.ts` (head + grid structure) · workboard regions:
AGENT-1 scope block (`:1779-1791`), the LENS/SEC landing + owner rulings (`:330-419`), the stickler
dispatch + D-entry queue (`:357-373`).

**Regions NOT read whole:** `chat/verbs/read.ts` (targeted: `:340,545,637,710-720,1118-1170` — the
role-read sites; the file is ~1200 lines), `chat/verbs/edit.ts`/`turn.ts`/`fork.ts`/`roster.ts`
(targeted role-read/permitsHost sites with context), `entry/compose/chat.ts` (rpgChatOps wiring
region), `entry/compose/automation-plugin.ts` (`:330-395`), `entry/compose/services.ts` (imports +
buildRpg call), the remaining rpg verbs (authority lines only via sweep), client components (sweep +
targeted reads). No claim in this report rests on an unread region.

**Sweeps (ast-grep v0.44 + `/usr/bin/grep -a` for literals, per doctrine):**
- `$A.role === "host"` / `role === "host"` / `$A.role !== "host"` / `role !== "host"` over
  `packages` in `-l ts` AND `-l tsx` — the complete comparison census in §1.3 derives from these
  (enforcement: 2 chokepoints only; the automation-plugin payloads; the transport tier; ~14
  lookups; the read.ts/clamp.ts value positions; 2 client display reads).
- `assertHostRole($$$)` → 7 sites; `resolveHost($$$)` in rpg → 12 verb sites; `assertOwnUserRef` →
  1 live site (patch-sheet) + the patch-actor doorway comment.
- `canAgent` declaration sweep (`function canAgent` + `canAgent = $A` patterns, whole `packages`):
  ZERO; literal sweep: 3 comment hits — the two-method absence check behind F2. `agent_principals`
  literal: zero files; schema dir listed. Containment suite: dir listed, absent.
- `viewerIsHost` literal over client+server+contracts (consumers enumerated §1.4);
  `permitsHost` (3 call sites + docs); `getMembership` impl chain
  (compose/chat.ts:1058 → `createGetMembership` → `loadPresentRole`).
- `ParticipantRole` importer census over `domain/**`: chat(9) · rpg(2) · automation(1) — no other
  domain touches the axis.
- `SessionToken` (brand landed, mint/validate/revoke narrowed); `StreamAuthority`;
  `mintSyntheticGroupCharacter`; `ToolCapability`.

**Gates/tests:** `pnpm check` run this session on the quiesced tree (main; only a stale snap png
modified): VERDICT PASS, exit 0, all 13 stages green (biome · eslint · types×5 ·
tests:execution-membership · structure:db-baseline · structure:full · depcruise · knip ·
docs:format) — full harness output read, authoritative result in `reports/verify.json`. No repo source was modified by this review (this
report file is the sole write). The rpg authority suite was READ for assert-the-real quality
(drives the real service against `freshDb`, asserts refusal classes per caller tier), not re-run in
isolation — it is in the standing battery.

**Unconfirmed suspicions (explicitly NOT findings):**
- Whether every matrix `host`-classified verb actually calls `requireHost` (the matrix-truth
  question) — spot-checked several, relied on the probe-suite posture for the rest; a full
  matrix→guard conformance sweep was not performed.
- `loadMemberChat`'s selected columns (whether `kind` already rides it) — not verified; affects
  only the R3 cost estimate by one column.
- The e2e/multi-user behavior of D22 clamps — needs the multi-user stack (parked per the board);
  design-level only here.
