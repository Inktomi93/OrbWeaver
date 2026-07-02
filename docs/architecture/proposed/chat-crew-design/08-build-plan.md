# 08 — The Build Plan (independently shippable chunks) + Test Plan

> **Status: COMMITTED (D59, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** Phase 7+ work (post-Phase-5 chat; alongside/after the rpg R-chunks — the two crews
> share prerequisites, not code). Each chunk: scope → checkpoint → size (S/M/L) → hard
> dependencies. Every chunk lands green (`pnpm check` + `pnpm test`) on its own.

## Dependencies on committed work

| Dependency | Needed by | Status |
|---|---|---|
| Phase 5 chat (pipeline, ONE injection list, bus, `can()`, roster/host predicates) | everything | BUILT |
| `domain/workloads` + runner-env + the worker | CW2+ | BUILT |
| sealed `agentTurn` (`infra/providers`) + `resolveRole('agent')` | CW2+ | BUILT (buddy's seam) |
| D48 structured-output axis (`responseFormat` + `output.structured` capability) | CW2+ | Phase 5/7 item — **verify before CW2** (same gate as rpg R4's tool check) |
| `domain/world-info` `upsertEntries` bulk op (D58 satellite) | CW2 | rides the rpg R-chunks — build it in CW2 if rpg hasn't (it is world-info's, either builder lands the same op) |
| `domain/notifications` + `emit` op | CW3 | Phase 5/7 (D16 system) |
| `domain/character` (flat card + snapshots, D28) | CW3 | BUILT |
| the chat-contract `audience` field + preview redaction | CW4 | THIS design's one chat touch — land it as a tiny chat PR before CW4 |
| D46 automation Tier-1 | seam (a) only | Phase 8 — the domain-event mirror ships in CW1 regardless; nothing here blocks on D46 |
| chat injection CRUD ops (`setChatInjection`/`listChatInjections`/`deleteChatInjection`) | CW6 (guides) | BUILT (chat verbs; injected as ops) |
| `domain/rpg` | NOT a dependency | the `hasActiveGame` predicate wires to a no-op `false` until rpg exists |

## The chunks

**CW1 — Contracts + schema + domain skeleton (no model calls).** `@orb/contracts/crew` (config
schema, the 4 payload schemas, bus events, views, `CrewMember` tuple) · `@orb/db/schema/crew.ts`
(ALL 4 tables — `crew_chats`/`crew_plots`/`crew_edit_proposals`/`crew_guides`) +
`card_evolution_proposals` in `schema/character.ts` (all ride the `0000_baseline` squash — the
D58 decide-before-launch economics; later chunks add NO tables) · the 4 `crew-*` members of
`WORKLOAD_KINDS` (`@orb/contracts/workloads` tuple widening + the regenerated `workloads.kind`
CHECK — the D34 derivation, born into the baseline) with **STUB runners** keeping
`RUNNERS`/`exhaustive-dispatch` green until each chunk lands the real one (the D58
`reconcile-world-state` stub precedent) · `@orb/kit/ids` prefixes · `domain/crew`
8-slot skeleton: config verbs (incl. the game-chat refusal), `canon-reads.ts`, the bus, the tRPC
router, the `can()` matrix · `domain/character` proposal verbs (propose/list/accept/dismiss with
the pre-evolution snapshot) · the domain-event mirror members. *Checkpoint:* config CRUD +
proposal lifecycle end-to-end via tRPC against a test db; authority matrix table-tests green;
accept-takes-a-snapshot proven. **Size: M** (mechanical; the character accept flow is the only
depth). *Hard part:* none — deliberately the confidence chunk.

**CW2 — The keeper + the scheduler (the first thinking member).** `runStructuredAgentTurn`
(`@orb/server/kit`) · `members/lorebook-keeper.ts` (brief + payload shaping) ·
the real `crew-lorebook-keeper` runner (replacing its CW1 stub) + `WorkloadChatCrewEnv` · `applyKeeperResult` (caps,
span-stamp, replace-same-span, hand-edit guard, mark advance) · the book mint/attach path ·
`scheduler/` + `onTurnCompleted` (keeper arm only) + `runNow` · entry wiring. *Checkpoint:* a
scripted 80-message chat with keeper enabled produces capped, keyed, span-stamped entries that
FIRE in a later turn's WI match; re-run idempotency + hand-edit skip + failed-run-mark-unmoved
proven; a fresh chat does zero crew work. **Size: L** (the shared helper + scheduler +
first-member plumbing all land here so CW3–5 are thin). *Hard part:* keeper output quality vs
schema strictness — same instrument as rpg R6: log the bounded-retry failure shapes and iterate
the brief (prompt text is versioned constants — data commits).

**CW3 — Card evolution.** `members/card-evolution.ts` · `crew-card-evolution` kind + runner ·
roster-card input slice (host-owned, synthetic-filtered) · supersede-pending flow ·
`notifications.emit` touchpoint · scheduler arm. *Checkpoint:* a scripted chat with earned drift
files a proposal; owner accepts one change of two → snapshot exists, card updated, status
`accepted`; a second audit supersedes; empty-proposals is the no-op path. **Size: M.**

**CW4 — The director.** **Pre-build checkpoint (Nate, 2026-07-01): PLAY-TEST the director
brief before building this chunk** — run the director prompt + payload schema by hand (or via a
scratch harness) over a real roleplay transcript for 2–3 passes and judge the guidance quality;
the chunk starts only after the brief survives the playtest (prompt text is versioned constants,
so tuning is data, but the SHAPE of `guidance` is what the playtest validates). Then: the chat
`audience` field + preview redaction (the pre-chunk chat PR) ·
`crew_plots` persistence · `members/director.ts` · `crew-director` kind + runner +
`applyDirectorPass` · `gatherTurnContext` + the `ChatContext.crew` op + entry wiring · plot verbs
+ host stream events. *Checkpoint:* the canary suite — plot string present in the wire request +
host preview, ABSENT from member preview/member views/keeper entries/edit proposals; cadence
counter arms only when enabled; byte-identity for crew-off chats; a 3-pass scripted run shows
arc→completed→successor + twist retire. **Size: M.** *Hard part:* the redaction touch inside
chat's preview projections — small but it is CHAT code; keep it to the projection layer + the
contract test.

**CW5 — The prose auditor.** `members/prose-audit.ts` · `crew-prose-audit` kind + runner ·
proposal insert/replace + staleness machinery (hash, selected-variant, superseded/stale flips) ·
`acceptEditProposal` → injected `chat.editMessage` · the on-demand enqueue path + every-turn
scheduler arm. *Checkpoint:* audit → proposal → accept edits the message through chat's authority;
swipe-then-accept refuses (`superseded`); edit-then-accept refuses (`stale`); `clean` writes
nothing; every-turn mode enqueues per assistant turn. **Size: M.**

**CW6 — Persistent guides.** The `crew_guides` TABLE already exists from CW1's baseline —
this chunk lands the machinery only: the `persistence/guides.ts` query module + the guide verbs
(doc 06 §4) +
`substrate/guide-refresh.ts` + the packaged template constants + the auto-refresh arm in
`onTurnCompleted` (per-guide in-flight latch) + the chat injection-CRUD injected ops.
*Checkpoint:* add a packaged `thinking` guide → refresh returns content and the injection rides
the next assembled prompt at the configured depth/role; auto-refresh fires post-turn without
blocking; disable flushes, re-enable restores; blank completion refuses overwrite. **Size: M.**
*Hard part:* none deep — the refresh core is one completion + one injection write; the latch and
the `{{previousGuide}}` continuity are the only subtleties (doc 06 §3, §7).

**CW7 — Client (doc 07's own chunk plan, U1–U6).** The crew panel (CONTEXT tab), the director
drawer, edit-proposal chips + diff view, the card-evolution review section on the character page,
the guides tab, the notification deep-link, workload-failure surfacing. Can start after CW1
(config + views exist) and grow per capability. **Size: M–L** (doc 07 §8 sizes its pieces).

**Ordering rules:** CW1 → CW2 are strictly sequential; CW3/CW4/CW5/CW6 are independent of each
other (any order, parallelizable across agents — disjoint file sets; CW6 needs only CW1 + the
chat injection ops); CW7 trails whichever capabilities exist. Ship-with-value line: **CW1+CW2
alone is a shippable feature** (auto-lorebook upkeep); each later chunk adds one capability.

## Test plan (the full inventory; house `test-presence`/`test-layout` assumed)

1. **Schema/contract round-trips** — all 4 payload schemas + config schema, including the
   bounded-retry path (`runStructuredAgentTurn`: valid / invalid→retry→valid / invalid×2→throw,
   mocked `agentTurn`).
2. **Runner tests per kind** (mocked agentTurn, real test db): apply semantics, result shapes,
   mark/counter advancement ONLY on success.
3. **Keeper idempotency suite** — replace-same-span; cap enforcement + merge-mode flip;
   hand-edit-hash skip; book mint-once; entries fire in a real WI pool match.
4. **Ring canaries** (the doc 04 §2 suite) — fixture plot string grep'd across member
   preview/views/keeper entries/edit proposals (absent) and wire request/host preview (present);
   re-run per authority level.
5. **Proposal staleness goldens** — superseded (variant swap), stale (content edit), pending-
   replace partial index (two audits, one pending), per-change card accept + snapshot-first.
6. **Scheduler goldens** — cadence table-tests per member (due/not-due matrices); the
   `DomainConflictError` log-and-continue path; the no-crew-row fast path issues zero reads
   beyond the pre-check; concurrent turn-completion counter increments (the `sql`-increment race
   test).
7. **Byte-identity** — crew op wired + no crew row ⇒ assembled prompt byte-equals the op-absent
   build (the rpg 05 §8 pattern).
8. **Authority matrix** — the 04 §6 table as a table-driven `can()` fixture (the rpg 07 §3.1
   pattern); game-chat refusal both directions.
9. **Economics smoke** — a crew run lands a stats row under the host's ownerId via the standard
   workload path (no new stats surface).
10. **Guides suite** (doc 06 §7) — refresh-core goldens (labeled vs raw, `{{previousGuide}}`,
    blank-refusal, `guide:<key>` id convention), auto-refresh latch + never-throws-into-the-loop,
    the seven-verb host/member authority matrix, the disable/re-enable round-trip.
