# 07 — Migration + Build Plan: Baseline Riders, Chunks AP1–AP4, and the Containment Suite

> **Status: COMMITTED (D60, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** What is born-compliant NOW versus genuinely additive later, the chunk order
> (identity spine → buddy adoption → seats), sizes, checkpoints, and the test plan.

---

## 1. What rides `0000_baseline` (born-compliant — the D58/D59 decide-before-launch precedent)

Schema is the part that gets expensive after launch; behavior is the part that doesn't. The
baseline squash gains, NOW, with default-safe values so nothing else changes:

| Rider | Shape | Why now |
|---|---|---|
| `users.kind` | NOT NULL default `'human'` + `users_kind_check` + the two shape CHECKs (doc 01 §1) | every existing row is a valid human; no backfill; the CHECKs are free at creation and impossible to retrofit cheaply on a populated identity root |
| `users.ownerUserId` | nullable self-FK CASCADE | NULL for all existing rows; the CASCADE physics must be born, not migrated (a later ADD + FK on SQLite is a 12-step table rebuild of the root everything FKs) |
| `@orb/db/schema/agent-principals.ts` | the satellite (doc 01 §2) | an empty table costs nothing; its FK web is baseline-cheap |
| `PARTICIPANT_KINDS` += `'agent'` + the kind-shape CHECK REPLACING `chat_participants_actor_xor` (doc 02 §1) | tuple + CHECK swap | the CHECK swap is THE retrofit-hostile item — a populated roster table rebuild; the widened tuple with no insert path is inert (the D58 stub-runner precedent: tuple green, behavior later) |
| contracts one-homes | `USER_KINDS`, `AGENT_SOURCE_KINDS`, `AGENT_ACTIONS`, `AgentActor`, `AgentSpeakerIdentity`, `isReservedAgentHandle`, the derived kind-sets (doc 02 §1.1) | types are free; downstream code (parseParticipant's agent arm, the `satisfies` belts) keeps `exhaustive-dispatch` green from day one |
| `parseParticipant` agent arm + the sessions refusal belts (validate kind-join, namespace refusals) | small code, not schema — but they are SAFETY, so they ride with the schema, not with the feature | the moment the columns exist, the belts must exist: a `kind` column without the auth refusals is a loaded gun in the baseline |

**Genuinely additive later (no baseline debt):** the mint verb, `seatAgent`, `canAgent`, the
speaker-source registry, attribution arms, stats arms, admin verb changes, the seats. All are new
verbs/ops/arms on stable schema — the definition of additive.

## 2. The chunks

### AP0 — baseline riders + belts (S; part of the current pre-launch schema window)

Everything in §1. **Checkpoint:** `pnpm check` + `pnpm test` green; the auth-refusal matrix
passes (every mode × a hand-inserted agent row → refusal); a solo chat and a group chat assemble
byte-identically to pre-AP0 (the `no-if(hasAgent)` contract test); the roster CHECK-swap
insert-matrix passes (all four kind shapes, the cross-kind refusals).

### AP1 — the identity spine (M)

`provisionAgentPrincipal` (mint + race test + audit) · `canAgent` in `guard.ts` + the
`AGENT_ACTIONS` union · admin ripples (`listUsers` kind axis, `setRole`/`resetPassword` refusals
+ atomic backstops, `setEnabled` on agents, `AdminUserView.kind/ownerHandle`) · the
notifications recipient refusal · the invite targeted-handle refusal.
**Checkpoint:** the FULL containment suite (§4) green against a minted-but-unseated agent; the
admin verb × agent-target matrix green; mint idempotency under race pinned.

### AP2 — roster + attribution (M/L)

The seating chokepoint's kind-verification · the present-and-contributing agent arm (incl. the
principal-enabled read) · arbitration over `AI_DRIVEN_KINDS` · the speaker→attribution map +
live `authorUserId` for agent speakers · the stats live-delta + reconcile agent arms (the PD-21
suite row) · witnessing horizons for agent rows + the content-hash speaker-id arm · MessageView/
render-chrome arm · the D22 `AgentCardView` · export provenance + import degradation.
**Checkpoint:** an integration turn driven with a hand-seated agent participant persists
`{authorUserId: agent, characterId: null}`; live-vs-reconcile stats byte-equal over it; a mixed
room's digest build includes the agent's lines in the shared bucket; export→import round-trip
degrades per doc 06 §6. (AP2 tests may seat via test fixture — `seatAgent` itself is AP3.)

### AP3 — buddy adoption (L)

`chat.seatAgent` (+ the owner-request notification member + the two-party flow) ·
`buddy.resolveSpeakerIdentity` (front-door op) · the `AGENT_SPEAKER_SOURCES` registry +
`ChatContext.resolveAgentSpeaker` wiring at compose · the room turn end-to-end (RESOLVE via the
registry, `resolveRole('agent')`, host funding, self-attributed persist) · the observer
self-event drop (doc 04 §6, if PD-45 has landed) · client: seat flow + agent badge + admin tab.
**Checkpoint:** the demo: hatch → solo chat (byte-identical to pre-AP0) → seat buddy in a group
room → it is arbiter-selected, speaks in-soul, self-attributed, host-funded → kick it → disable
its principal → re-run the containment suite against the LIVE seated topology (not just the
unseated one) → re-enable → it speaks again. Solo-byte-identity re-pinned LAST.

### AP4 — seats (S–M, two independent sub-chunks)

**AP4a (rpg):** the agent party seat (`joinParty` agent arm + auto-resolve checks) · the three
GM-seat re-keys (`requireGmSeat` widened sentinel, gather-by-holder, director/GM-eyes by holder
kind) · the spoiler tests extended (doc 05 inv 2). **AP4b (crew):** NO CODE — the bright-line
criterion is recorded (doc 05 §3) and the compose-table review confirms no runner holds a
canon-write op. **Checkpoint (AP4a):** an agent-held campaign plays a session end-to-end; the
rpg-12 §9 seat-movement tests pass with the third holder state in the matrix.

**Dependency notes:** AP0 must land inside the pre-launch baseline window (it is the only
calendar-coupled chunk). AP1→AP2→AP3 are strictly ordered. AP4a needs AP3 (the speaker machinery)
+ the rpg R-chunks it amends (R1/R3/R4 shipped). Nothing here blocks, or is blocked by, the crew
CW-chunks. PD-17's registry row re-points at this set and flips `blocked:v2 → blocked:AP1` once
AP0 lands (the burn agent owns the registry file — see the D60 entry).

## 3. Sizes and the hard parts (honest)

| Chunk | Size | The hard part |
|---|---|---|
| AP0 | S | none — schema + belts + tests; the discipline is not skipping the belts |
| AP1 | M | the refusal matrices are wide (every surface × every mode); resist collapsing them into "one representative test" |
| AP2 | M/L | the attribution/stats twin-path equality — the drift suite must gain the agent row on BOTH writers in the same commit, or the gate lies |
| AP3 | L | the two-party seating UX + keeping the room turn on the ONE path while injecting a speaker source chat can't name; the solo-byte-identity re-pin catches the likeliest regression |
| AP4a | S–M | the GM-eyes/director re-keys touch spoiler surfaces — the canary tests are the safety net, run per holder state |

## 4. The containment suite (the named deliverable: a disabled agent principal can do NOTHING)

One test module, run at AP1 (unseated) and re-run at AP3 (live seated topology), parameterized
over `enabled: false` (and, where marked ⊘, over the agent's mere existence):

1. **Auth:** every auth mode × the agent row → no session, no Principal, 401-shaped refusal. ⊘
   (holds regardless of enabled — wall one is unconditional.)
2. **Namespace:** ensureUser/provisionIdentity/createUser/targeted-invite × `__agent__…` → refuse,
   zero rows written. ⊘
3. **Turns:** arbitration never selects it; `forceCharacterTurn`-adjacent paths refuse; a
   force-injected speaker fails `canAgent('speak')` at the engine gate.
4. **Casts:** absent from `{{group}}`/`{{groupNotMuted}}`/WI name-sets/present cast the round
   after the flip (the presence-pin-per-round rule honored).
5. **Tools:** an in-flight proposal cannot be confirmed into effect on its behalf (the trio
   tests); no new proposals stash.
6. **Verbs:** the admin matrix (`setRole`/`resetPassword` refuse ⊘; `setEnabled` works);
   `seatAgent` refuses a disabled agent; notifications refuse it as recipient ⊘.
7. **Seats:** (AP4a) `requireGmSeat` denies the disabled holder's turns; the pending-check
   auto-resolve for its party seat refuses.
8. **Reversibility:** `setEnabled(true)` restores every row above to its enabled expectation —
   containment is a flip, not a teardown.
9. **Cascade:** delete the owner → agent users row, satellite, roster rows gone;
   `messages.authorUserId` SET NULL; zero orphans (`PRAGMA foreign_key_check` clean).

Plus the standing per-chunk gates: `test-presence`/`test-layout` mirrors for every new verb/
persistence module/contract schema; determinism (injected clock/ids); the solo/`no-if(hasAgent)`
byte-identity contract tests; `exhaustive-dispatch` on every widened union
(`USER_KINDS`/`PARTICIPANT_KINDS`/`AGENT_ACTIONS`/`AGENT_SOURCE_KINDS`); Stryker over
`guard.ts` + the attribution map once the mutation gate lands (the D55 precedent — prove the
ceiling's tests aren't lying).
